import { listAppointments } from "@/lib/arco-rpc";
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
