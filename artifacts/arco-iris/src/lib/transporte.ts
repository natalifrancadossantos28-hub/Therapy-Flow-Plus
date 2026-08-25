import {
  listAppointments,
  type AppointmentListItem,
  type Ausencia,
  type Feriado,
} from "@/lib/arco-rpc";
import { isBlocked } from "@/lib/blocked-dates";
import { isTransportSpecialty } from "@/lib/specialty-colors";

/** Forma mínima compartilhada pelas telas de agenda (algumas usam um tipo local). */
export type DriverLike = { id: number; name: string; specialty?: string | null };

/** Chave `pacienteId|data` → nomes dos motoristas que buscam a criança naquele dia. */
export type TransportMap = Map<string, string[]>;

const IGNORED_STATUSES = ["desmarcado", "cancelado", "remanejado", "remarcado"];

export function transportKey(patientId: number, date: string): string {
  return `${patientId}|${date}`;
}

export function transportDrivers(map: TransportMap, patientId: number, date: string): string[] {
  return map.get(transportKey(patientId, date)) ?? [];
}

export function listDrivers<T extends DriverLike>(professionals: T[]): T[] {
  return professionals.filter((p) => isTransportSpecialty(p.specialty));
}

/** Agendamento clínico, na forma mínima usada para decidir se o transporte é necessário. */
export type ClinicalLike = {
  patientId: number;
  professionalId: number;
  date: string;
  status: string;
};

/**
 * Dias (`pacienteId|data`) em que o paciente ainda tem pelo menos um atendimento
 * de pé: profissional presente, sem feriado e com status ativo. Nos dias fora
 * deste conjunto o motorista não precisa buscar a criança.
 *
 * Deve receber os atendimentos já expandidos (recorrências projetadas), senão
 * uma semana sem linha real no banco pareceria um dia sem atendimento.
 */
export function activeCareDays(
  clinical: ClinicalLike[],
  feriados: Feriado[],
  ausencias: Ausencia[],
  driverIds: Set<number>,
): Set<string> {
  const days = new Set<string>();
  for (const a of clinical) {
    if (driverIds.has(a.professionalId)) continue;
    if (IGNORED_STATUSES.includes((a.status || "").toLowerCase())) continue;
    if (isBlocked(a.date, a.professionalId, feriados, ausencias)) continue;
    days.add(transportKey(a.patientId, a.date));
  }
  return days;
}

/** Busca os atendimentos clínicos (sem transporte) do período, de todos os profissionais. */
export async function fetchClinicalAppointments(
  dateFrom: string,
  dateTo: string,
  driverIds: Set<number>,
): Promise<AppointmentListItem[]> {
  const rows = await listAppointments({ dateFrom, dateTo }).catch(() => []);
  return rows.filter((r) => !driverIds.has(r.professionalId));
}

/**
 * Monta o mapa de transporte do período: os agendamentos dos motoristas não são
 * atendimentos, servem só para a Recepção saber quem busca cada criança.
 */
export async function fetchTransportMap(
  professionals: DriverLike[],
  dateFrom: string,
  dateTo: string,
): Promise<TransportMap> {
  const drivers = listDrivers(professionals);
  const map: TransportMap = new Map();
  if (drivers.length === 0) return map;

  const perDriver = await Promise.all(
    drivers.map((d) =>
      listAppointments({ professionalId: d.id, dateFrom, dateTo }).catch(() => []),
    ),
  );

  perDriver.forEach((rows, i) => {
    const name = drivers[i].name;
    for (const r of rows) {
      if (IGNORED_STATUSES.includes((r.status || "").toLowerCase())) continue;
      const key = transportKey(r.patientId, r.date);
      const names = map.get(key) ?? [];
      if (!names.includes(name)) names.push(name);
      map.set(key, names);
    }
  });

  return map;
}
