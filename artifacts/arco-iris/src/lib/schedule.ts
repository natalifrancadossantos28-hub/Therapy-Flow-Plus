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
