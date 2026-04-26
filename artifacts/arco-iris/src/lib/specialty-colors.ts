/**
 * Paleta neon-suave por especialidade.
 *
 * Cada especialidade tem uma "aura" própria pra Recepção/Admin baterem o
 * olho na agenda e identificarem o tipo de atendimento em milissegundos.
 *
 * Fonoaudiologia → ciano
 * Terapia Ocupacional (TO) → roxo
 * Psicologia → rosa
 * Fisioterapia → amarelo
 * Psicopedagogia → verde-azulado
 * Educação Física → laranja
 * Nutrição → verde
 * Psicomotricidade → âmbar
 *
 * Cores são valores rgb em string pra permitir composição via `rgb(... / α)`
 * (Tailwind moderno) ou conversão para `rgba()`.
 */
export type SpecialtyTone = {
  /** Código da especialidade (slug interno). */
  key: string;
  /** Cor "core" neon para texto/borda em fundo escuro. */
  fg: string;
  /** Cor "fill" suave (background do badge). */
  bg: string;
  /** Cor da borda do badge / barra lateral. */
  border: string;
  /** Cor para glow (box-shadow). */
  glow: string;
};

const NEUTRAL: SpecialtyTone = {
  key: "default",
  fg: "#cbd5e1",
  bg: "rgba(148,163,184,0.14)",
  border: "rgba(148,163,184,0.45)",
  glow: "rgba(148,163,184,0.25)",
};

const PALETTE: SpecialtyTone[] = [
  // Fonoaudiologia → ciano
  {
    key: "fono",
    fg: "#67e8f9",
    bg: "rgba(34,211,238,0.14)",
    border: "rgba(34,211,238,0.55)",
    glow: "rgba(34,211,238,0.4)",
  },
  // TO → roxo
  {
    key: "to",
    fg: "#c4b5fd",
    bg: "rgba(168,85,247,0.16)",
    border: "rgba(168,85,247,0.55)",
    glow: "rgba(168,85,247,0.4)",
  },
  // Psicologia → rosa
  {
    key: "psicologia",
    fg: "#f9a8d4",
    bg: "rgba(236,72,153,0.16)",
    border: "rgba(236,72,153,0.55)",
    glow: "rgba(236,72,153,0.4)",
  },
  // Fisioterapia → amarelo neon
  {
    key: "fisio",
    fg: "#fde68a",
    bg: "rgba(250,204,21,0.16)",
    border: "rgba(250,204,21,0.55)",
    glow: "rgba(250,204,21,0.4)",
  },
  // Psicopedagogia → verde-azulado (teal)
  {
    key: "psicoped",
    fg: "#5eead4",
    bg: "rgba(20,184,166,0.16)",
    border: "rgba(20,184,166,0.55)",
    glow: "rgba(20,184,166,0.4)",
  },
  // Educação Física → laranja
  {
    key: "edfisica",
    fg: "#fdba74",
    bg: "rgba(249,115,22,0.16)",
    border: "rgba(249,115,22,0.55)",
    glow: "rgba(249,115,22,0.4)",
  },
  // Nutrição → verde
  {
    key: "nutricao",
    fg: "#86efac",
    bg: "rgba(34,197,94,0.16)",
    border: "rgba(34,197,94,0.55)",
    glow: "rgba(34,197,94,0.4)",
  },
  // Psicomotricidade → âmbar
  {
    key: "psicomotricidade",
    fg: "#fbbf24",
    bg: "rgba(251,191,36,0.16)",
    border: "rgba(251,191,36,0.55)",
    glow: "rgba(251,191,36,0.4)",
  },
];

const TONE_BY_KEY: Record<string, SpecialtyTone> = Object.fromEntries(
  PALETTE.map((p) => [p.key, p])
);

function normalize(raw: string | null | undefined): string {
  return (raw ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Mapeia o nome livre da especialidade (vindo do banco) para uma chave
 * estável de paleta. Aceita variações ("T.O.", "Terapia Ocupacional",
 * "Fonoaudiologia", "Fono", "Psico", etc.).
 */
export function specialtyKey(specialty: string | null | undefined): string {
  const s = normalize(specialty);
  if (!s) return "default";
  if (/(^|\s)t\s*o(\s|$)|terapia ocupacional/.test(s)) return "to";
  if (s.includes("fono")) return "fono";
  if (s.includes("psicop")) return "psicoped";
  if (s.includes("psicomot")) return "psicomotricidade";
  if (s.includes("psico")) return "psicologia";
  if (s.includes("fisio")) return "fisio";
  if (s.includes("ed fisica") || s.includes("educacao fisica") || /(^|\s)ef(\s|$)/.test(s)) return "edfisica";
  if (s.includes("nutri")) return "nutricao";
  return "default";
}

export function specialtyTone(specialty: string | null | undefined): SpecialtyTone {
  const k = specialtyKey(specialty);
  return TONE_BY_KEY[k] ?? NEUTRAL;
}

export function specialtyShortLabel(specialty: string | null | undefined): string {
  const k = specialtyKey(specialty);
  switch (k) {
    case "fono":               return "Fono";
    case "to":                 return "TO";
    case "psicologia":         return "Psicologia";
    case "fisio":              return "Fisio";
    case "psicoped":           return "Psicoped.";
    case "psicomotricidade":   return "Psicomotr.";
    case "edfisica":           return "Ed. Física";
    case "nutricao":           return "Nutrição";
    default:                   return (specialty ?? "—").trim() || "—";
  }
}
