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
  /** Cor "core" escura para texto legível em fundo claro (modo claro). */
  fgLight: string;
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
  fgLight: "#475569",
  bg: "rgba(148,163,184,0.14)",
  border: "rgba(148,163,184,0.45)",
  glow: "rgba(148,163,184,0.25)",
};

const PALETTE: SpecialtyTone[] = [
  // Fonoaudiologia → ciano
  {
    key: "fono",
    fg: "#67e8f9",
    fgLight: "#0e7490",
    bg: "rgba(34,211,238,0.14)",
    border: "rgba(34,211,238,0.55)",
    glow: "rgba(34,211,238,0.4)",
  },
  // TO → roxo
  {
    key: "to",
    fg: "#c4b5fd",
    fgLight: "#6d28d9",
    bg: "rgba(168,85,247,0.16)",
    border: "rgba(168,85,247,0.55)",
    glow: "rgba(168,85,247,0.4)",
  },
  // Psicologia → rosa
  {
    key: "psicologia",
    fg: "#f9a8d4",
    fgLight: "#be185d",
    bg: "rgba(236,72,153,0.16)",
    border: "rgba(236,72,153,0.55)",
    glow: "rgba(236,72,153,0.4)",
  },
  // Fisioterapia → amarelo neon
  {
    key: "fisio",
    fg: "#fde68a",
    fgLight: "#a16207",
    bg: "rgba(250,204,21,0.16)",
    border: "rgba(250,204,21,0.55)",
    glow: "rgba(250,204,21,0.4)",
  },
  // Psicopedagogia → verde-azulado (teal)
  {
    key: "psicoped",
    fg: "#5eead4",
    fgLight: "#0f766e",
    bg: "rgba(20,184,166,0.16)",
    border: "rgba(20,184,166,0.55)",
    glow: "rgba(20,184,166,0.4)",
  },
  // Educação Física → laranja
  {
    key: "edfisica",
    fg: "#fdba74",
    fgLight: "#c2410c",
    bg: "rgba(249,115,22,0.16)",
    border: "rgba(249,115,22,0.55)",
    glow: "rgba(249,115,22,0.4)",
  },
  // Nutrição → verde
  {
    key: "nutricao",
    fg: "#86efac",
    fgLight: "#15803d",
    bg: "rgba(34,197,94,0.16)",
    border: "rgba(34,197,94,0.55)",
    glow: "rgba(34,197,94,0.4)",
  },
  // Psicomotricidade → âmbar
  {
    key: "psicomotricidade",
    fg: "#fbbf24",
    fgLight: "#b45309",
    bg: "rgba(251,191,36,0.16)",
    border: "rgba(251,191,36,0.55)",
    glow: "rgba(251,191,36,0.4)",
  },
  // Psicologia Parental → magenta rosado
  {
    key: "parental",
    fg: "#f0abfc",
    fgLight: "#a21caf",
    bg: "rgba(217,70,239,0.16)",
    border: "rgba(217,70,239,0.55)",
    glow: "rgba(217,70,239,0.4)",
  },
];

const TONE_BY_KEY: Record<string, SpecialtyTone> = Object.fromEntries(
  PALETTE.map((p) => [p.key, p])
);

/**
 * Lista oficial de especialidades para o cadastro de profissionais.
 * Esses são os ÚNICOS valores aceitos no `select` da UI — texto livre fica
 * proibido pra evitar variações ("Fono" vs "Fonoaudiologia") que quebram
 * filtros, relatórios e o pareamento da Triagem com a Fila.
 *
 * A ordem aqui é a ordem que aparece no dropdown.
 */
export const SPECIALTIES = [
  "Psicologia",
  "Psicologia Parental",
  "Fonoaudiologia",
  "Terapia Ocupacional",
  "Fisioterapia",
  "Psicopedagogia",
  "Nutrição",
  "Psicomotricidade",
  "Educação Física (Oficina)",
] as const;

export type SpecialtyOfficial = typeof SPECIALTIES[number];

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
  if (s.includes("parental")) return "parental";
  if (s.includes("psico")) return "psicologia";
  if (s.includes("fisio")) return "fisio";
  if (s.includes("ed fisica") || s.includes("educacao fisica") || /(^|\s)ef(\s|$)/.test(s)) return "edfisica";
  if (s.includes("nutri")) return "nutricao";
  return "default";
}

function isLightTheme(): boolean {
  return typeof document !== "undefined" && document.documentElement.classList.contains("light");
}

export function specialtyTone(specialty: string | null | undefined): SpecialtyTone {
  const k = specialtyKey(specialty);
  const base = TONE_BY_KEY[k] ?? NEUTRAL;
  // No modo claro o `fg` neon (feito p/ fundo escuro) some no branco;
  // usa a variante escura pra manter os rótulos legíveis.
  if (isLightTheme()) return { ...base, fg: base.fgLight };
  return base;
}

export function specialtyShortLabel(specialty: string | null | undefined): string {
  const k = specialtyKey(specialty);
  switch (k) {
    case "fono":               return "Fono";
    case "to":                 return "TO";
    case "psicologia":         return "Psicologia";
    case "parental":           return "Psic. Parental";
    case "fisio":              return "Fisio";
    case "psicoped":           return "Psicoped.";
    case "psicomotricidade":   return "Psicomotr.";
    case "edfisica":           return "Ed. Física";
    case "nutricao":           return "Nutrição";
    default:                   return (specialty ?? "—").trim() || "—";
  }
}
