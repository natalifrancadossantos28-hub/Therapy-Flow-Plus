// Regras únicas dos indicadores (Painel de Gestão e Prestação de Contas).
// "Atendimento realizado" aqui = presença registrada na agenda/recepção do NFS;
// não é o registro assistencial do e-SUS.
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, addDays, addMonths, addWeeks, subWeeks, subMonths, subYears } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { AppointmentListItem, ProfessionalCapacity } from "@/lib/arco-rpc";

export const ST_REALIZADO = new Set(["atendimento", "em_atendimento", "em atendimento", "presente", "alta"]);
export const ST_FALTA = new Set(["ausente", "falta_nao_justificada"]);
export const ST_JUSTIFICADA = new Set(["falta_justificada", "justificado", "abonado"]);
export const ST_CANCELADO = new Set(["cancelado", "desmarcado"]);
export const ST_AGENDA_ATIVA = new Set(["agendado", "atendimento", "em_atendimento", "em atendimento", "presente", "ativo", "remanejado", "remarcado"]);
export const ST_PACIENTE_ENCERRADO = new Set(["óbito", "obito", "desistência", "desistencia"]);
export const ST_PACIENTE_VINCULO = new Set(["atendimento", "em atendimento", "em_atendimento", "ativo"]);

export const NAO_AVALIADO = "não avaliado";

export const hojeISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
export const statusOf = (a: { status?: string | null }) => (a.status || "agendado").toLowerCase();

/** Mesmo paciente + profissional + data + hora conta uma vez (evita a dupla do Multi). */
export function dedupeApts<T extends { patientId: number; professionalId: number; date: string; time: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((a) => {
    const k = `${a.professionalId}-${a.patientId}-${a.date}-${a.time}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Regra da clínica: todo profissional atende de 30 (meta mínima) a 35 pacientes (máximo), seja 20h ou 30h. */
export const CAPACIDADE_META = 30;
export const CAPACIDADE_MAX = 35;
/** Capacidade usada nas vagas/ocupação. Ignora o antigo padrão do banco (25 p/ 20h). */
export const capacidadeMax = (_c?: Pick<ProfessionalCapacity, "maxPatients" | "cargaHoraria">) => CAPACIDADE_MAX;
export const abaixoDaMeta = (cs: Pick<ProfessionalCapacity, "currentPatients">[]) =>
  cs.filter((c) => c.currentPatients < CAPACIDADE_META).length;

export type PeriodKind = "semana" | "mes" | "ano";
export type Bucket = { key: string; label: string; from: string; to: string };

export function periodRange(kind: PeriodKind, ref: Date): { from: string; to: string; label: string; buckets: Bucket[] } {
  const f = (d: Date) => format(d, "yyyy-MM-dd");
  if (kind === "semana") {
    const s = startOfWeek(ref, { weekStartsOn: 1 });
    const e = endOfWeek(ref, { weekStartsOn: 1 });
    const buckets = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(s, i);
      return { key: f(d), label: format(d, "EEE dd", { locale: ptBR }), from: f(d), to: f(d) };
    });
    return { from: f(s), to: f(e), label: `${format(s, "dd/MM")} a ${format(e, "dd/MM/yyyy")}`, buckets };
  }
  if (kind === "mes") {
    const s = startOfMonth(ref);
    const e = endOfMonth(ref);
    const buckets: Bucket[] = [];
    let ws = s;
    let i = 1;
    while (ws <= e) {
      const we = endOfWeek(ws, { weekStartsOn: 1 }) > e ? e : endOfWeek(ws, { weekStartsOn: 1 });
      buckets.push({ key: f(ws), label: `Sem ${i} (${format(ws, "dd")}–${format(we, "dd")})`, from: f(ws), to: f(we) });
      ws = addDays(we, 1);
      i++;
    }
    return { from: f(s), to: f(e), label: format(s, "MMMM 'de' yyyy", { locale: ptBR }), buckets };
  }
  const s = startOfYear(ref);
  const e = endOfYear(ref);
  const buckets = Array.from({ length: 12 }, (_, i) => {
    const m = addMonths(s, i);
    return { key: format(m, "yyyy-MM"), label: format(m, "MMM", { locale: ptBR }), from: f(m), to: f(endOfMonth(m)) };
  });
  return { from: f(s), to: f(e), label: format(s, "yyyy"), buckets };
}

export function shiftPeriod(kind: PeriodKind, ref: Date, dir: 1 | -1): Date {
  if (kind === "semana") return dir > 0 ? addWeeks(ref, 1) : subWeeks(ref, 1);
  if (kind === "mes") return dir > 0 ? addMonths(ref, 1) : subMonths(ref, 1);
  return dir > 0 ? addMonths(ref, 12) : subYears(ref, 1);
}

export type ResumoAgenda = {
  realizados: number;
  faltas: number;
  justificadas: number;
  cancelados: number;
  pacientesAtendidos: number;
  /** null = não há atendimentos fechados (realizado/falta) no período → "não avaliado". */
  taxaPresenca: number | null;
};

/** Resumo de agenda até hoje (datas futuras não contam como realizadas/faltas). */
export function resumoAgenda(apts: AppointmentListItem[]): ResumoAgenda {
  const hoje = hojeISO();
  let realizados = 0, faltas = 0, justificadas = 0, cancelados = 0;
  const atendidos = new Set<number>();
  for (const a of dedupeApts(apts)) {
    if ((a.date || "") > hoje) continue;
    const st = statusOf(a);
    if (ST_REALIZADO.has(st)) { realizados++; atendidos.add(a.patientId); }
    else if (ST_FALTA.has(st)) faltas++;
    else if (ST_JUSTIFICADA.has(st)) justificadas++;
    else if (ST_CANCELADO.has(st)) cancelados++;
  }
  const fechados = realizados + faltas;
  return {
    realizados, faltas, justificadas, cancelados,
    pacientesAtendidos: atendidos.size,
    taxaPresenca: fechados > 0 ? Math.round((realizados / fechados) * 100) : null,
  };
}

export const fmtPct = (v: number | null | undefined) => (v == null ? NAO_AVALIADO : `${v}%`);
export const fmtDias = (v: number | null | undefined) => (v == null ? NAO_AVALIADO : `${v} dias`);
export const diasDesde = (iso: string) => Math.max(0, Math.round((Date.parse(hojeISO()) - Date.parse(iso.slice(0, 10))) / 86_400_000));
export const media = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
