/**
 * Atendimento Multi: o vínculo entre os dois profissionais é gravado como uma
 * linha de appointment para cada um, ambas com a etiqueta
 * "Atendimento Multi com <parceiro> (<especialidade>)".
 *
 * Como a etiqueta é a única ligação, séries que divergem (parceiro criado sem
 * recorrência, série do principal renovada depois, linha do convidado apagada)
 * deixavam o horário aparecendo como LIVRE na grade do convidado. Estas funções
 * projetam essas ocorrências na agenda de quem foi convidado, para que o horário
 * apareça ocupado nas duas agendas mesmo quando falta a linha real.
 */

export const MULTI_PREFIX = "Atendimento Multi com ";

export type MultiPartner = { name: string; specialty: string | null };

export function isMultiNote(notes: string | null | undefined): boolean {
  return !!notes && notes.startsWith(MULTI_PREFIX);
}

export function parseMultiPartner(notes: string | null | undefined): MultiPartner | null {
  if (!isMultiNote(notes)) return null;
  const rest = notes!.slice(MULTI_PREFIX.length);
  const specialty = (rest.match(/\(([^)]+)\)\s*$/) || [])[1] ?? null;
  const name = rest.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return { name, specialty: specialty && specialty !== "—" ? specialty : null };
}

export function multiNote(prof: { name: string; specialty?: string | null }): string {
  return `${MULTI_PREFIX}${prof.name} (${prof.specialty || "—"})`;
}

const normalizeName = (v: string) =>
  v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

export function isPartnerOf(notes: string | null | undefined, professionalName: string): boolean {
  const p = parseMultiPartner(notes);
  return !!p && normalizeName(p.name) === normalizeName(professionalName);
}

/** ID negativo estável para o card projetado (mantém o React key entre renders). */
function guestId(date: string, time: string, patientId: number, hostProfId: number): number {
  let h = 7;
  const s = `multi|${date}|${time}|${patientId}|${hostProfId}`;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return h < 0 ? h : -(h || 1);
}

export type MultiGuestFlags = {
  /** Card projetado a partir do agendamento do parceiro (não existe linha própria). */
  multiGuest?: boolean;
  /** Profissional dono da linha real (o que criou o Multi). */
  multiHostName?: string | null;
  multiHostProfessionalId?: number;
};

type BaseApt = {
  id: number;
  patientId: number;
  professionalId: number;
  professionalName?: string | null;
  date: string;
  time: string;
  notes?: string | null;
};

/**
 * Converte as linhas de OUTROS profissionais que citam `professional` como
 * parceiro de Multi em cards da agenda dele, ignorando os horários em que ele
 * já tem linha própria (`ownRows` deve vir com a recorrência já expandida).
 */
export function buildMultiGuestAppointments<T extends BaseApt>(
  partnerRows: T[],
  ownRows: T[],
  professional: { id: number; name: string; specialty?: string | null },
  roster?: { id: number; specialty?: string | null }[],
): (T & MultiGuestFlags)[] {
  const own = new Set(ownRows.map(a => `${a.date}|${a.time}|${a.patientId}`));
  const seen = new Set<string>();
  const guests: (T & MultiGuestFlags)[] = [];
  for (const row of partnerRows) {
    if (row.professionalId === professional.id) continue;
    if (!isPartnerOf(row.notes, professional.name)) continue;
    const key = `${row.date}|${row.time}|${row.patientId}`;
    if (own.has(key) || seen.has(key)) continue;
    seen.add(key);
    const hostSpecialty = roster?.find(p => p.id === row.professionalId)?.specialty ?? null;
    guests.push({
      ...row,
      id: guestId(row.date, row.time, row.patientId, row.professionalId),
      professionalId: professional.id,
      professionalName: professional.name,
      notes: multiNote({ name: row.professionalName || "", specialty: hostSpecialty }),
      multiGuest: true,
      multiHostName: row.professionalName ?? null,
      multiHostProfessionalId: row.professionalId,
    });
  }
  return guests;
}
