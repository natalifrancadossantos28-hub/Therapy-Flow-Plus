// Profissionais que atendem no horário de almoço (12:10), sem o bloqueio
// padrão de "Almoço — Pausa". Comparação por substring, minúsculas.
const LUNCH_WORKERS = ["paula", "karla"];

// Especialidades em que a mãe/responsável é atendida no MESMO horário em que a
// criança está em terapia com outro profissional: o mesmo prontuário pode
// ocupar dois horários iguais sem ser duplicidade.
const SAME_SLOT_SPECIALTIES = ["parental", "oficina"];

export function allowsSameSlotAsPatient(specialty: string | null | undefined): boolean {
  const s = (specialty || "").toLowerCase();
  return SAME_SLOT_SPECIALTIES.some((w) => s.includes(w));
}

export function worksThroughLunch(name: string | null | undefined): boolean {
  const n = (name || "").toLowerCase();
  return LUNCH_WORKERS.some((w) => n.includes(w));
}
