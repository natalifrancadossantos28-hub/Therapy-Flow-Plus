// Profissionais que atendem no horário de almoço (12:10), sem o bloqueio
// padrão de "Almoço — Pausa". Comparação por substring, minúsculas.
const LUNCH_WORKERS = ["paula", "karla"];

export function worksThroughLunch(name: string | null | undefined): boolean {
  const n = (name || "").toLowerCase();
  return LUNCH_WORKERS.some((w) => n.includes(w));
}
