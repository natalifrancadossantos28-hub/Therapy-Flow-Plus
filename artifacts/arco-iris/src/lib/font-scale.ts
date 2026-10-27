// Tamanho das letras escolhido por aparelho (A+ / A−). Tudo no sistema usa rem,
// então mudar o font-size do <html> aumenta textos, botões e espaçamentos juntos.
const KEY = "nfs_font_scale";
export const ESCALAS = [100, 112, 125, 140] as const;

export function escalaAtual(): number {
  const v = Number(localStorage.getItem(KEY));
  return (ESCALAS as readonly number[]).includes(v) ? v : 0;
}

export function aplicarEscala(v = escalaAtual()) {
  document.documentElement.style.fontSize = v ? `${v}%` : "";
}

export function mudarEscala(delta: 1 | -1): number {
  const padrao = window.matchMedia("(max-width: 767px)").matches ? 112 : 100;
  const atual = escalaAtual() || padrao;
  const i = Math.max(0, Math.min(ESCALAS.length - 1, ESCALAS.indexOf(atual as (typeof ESCALAS)[number]) + delta));
  const v = ESCALAS[i];
  localStorage.setItem(KEY, String(v));
  aplicarEscala(v);
  return v;
}
