// Profissionais que atendem no horário de almoço (12:10), sem o bloqueio
// padrão de "Almoço — Pausa". Comparação por substring, minúsculas.
const LUNCH_WORKERS = ["paula", "karla"];

// Especialidades que podem coincidir com o horário de terapia do paciente sem
// ser duplicidade: Parental/Oficina (mãe/responsável atendida no mesmo horário)
// e Motorista (só transporta, não faz atendimento — agenda livre).
const SAME_SLOT_SPECIALTIES = ["parental", "oficina", "motorista", "transporte"];

export function allowsSameSlotAsPatient(specialty: string | null | undefined): boolean {
  const s = (specialty || "").toLowerCase();
  return SAME_SLOT_SPECIALTIES.some((w) => s.includes(w));
}

export function worksThroughLunch(name: string | null | undefined): boolean {
  const n = (name || "").toLowerCase();
  return LUNCH_WORKERS.some((w) => n.includes(w));
}

// Status do PACIENTE que tiram o agendamento das grades (agenda, mensal,
// recepção). Óbito/Desistência escondem sempre; Alta (paciente sem nenhuma
// área ativa) esconde só de hoje em diante — o histórico continua visível.
const PATIENT_CLOSED_ALWAYS = ["desistência", "desistencia", "óbito", "obito"];
const PATIENT_CLOSED_FUTURE = ["alta"];

export function isHiddenByPatientStatus(
  patientStatus: string | null | undefined,
  date: string,
  today: string,
): boolean {
  const s = (patientStatus || "").trim().toLowerCase();
  if (!s) return false;
  if (PATIENT_CLOSED_ALWAYS.includes(s)) return true;
  return PATIENT_CLOSED_FUTURE.includes(s) && date >= today;
}
