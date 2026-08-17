// Helpers compartilhados entre a Agenda Geral e a agenda do Portal/Profissionais.

export type SlotAppointment = { patientId: number; patientName?: string | null };

/** Horário candidato para remanejar/remarcar: livre (group vazio) ou grupo existente. */
export type SlotOption = { date: string; time: string; group: string[] };

/**
 * Monta os horários oferecidos no remanejamento. Inclui os slots ocupados para
 * que o paciente possa ser transferido direto para um grupo já existente.
 */
export function buildSlotOptions(opts: {
  dates: string[];
  times: string[];
  aptsAt: (date: string, time: string) => SlotAppointment[];
  patientId: number;
  origin?: { date: string; time: string } | null;
}): SlotOption[] {
  const out: SlotOption[] = [];
  for (const date of opts.dates) {
    for (const time of opts.times) {
      if (opts.origin && opts.origin.date === date && opts.origin.time === time) continue;
      const apts = opts.aptsAt(date, time);
      if (apts.some(a => a.patientId === opts.patientId)) continue;
      out.push({
        date,
        time,
        group: apts.map(a => (a.patientName?.trim() ? a.patientName.trim() : `#${a.patientId}`)),
      });
    }
  }
  return out;
}

/**
 * Ordem de chamada dentro de um slot em grupo: quem foi agendado primeiro vem
 * primeiro. Ocorrências virtuais (id negativo) usam o id da linha real de origem.
 */
export function callOrder(apt: { id: number; sourceId?: number | null }): number {
  if (apt.id > 0) return apt.id;
  return apt.sourceId ?? Number.MAX_SAFE_INTEGER;
}
