/**
 * Aniversários e datas comemorativas dos profissionais.
 *
 * As datas de categoria são indexadas pela mesma chave estável de
 * `specialtyKey`, então variações do nome no cadastro ("T.O.", "Terapia
 * Ocupacional", "Fono"…) caem na mesma comemoração. Para incluir uma nova
 * categoria basta acrescentar a chave em `CATEGORY_DAYS`.
 */
import { specialtyKey } from "@/lib/specialty-colors";

export type CategoryDay = {
  /** Chave de `specialtyKey`. */
  key: string;
  /** Título da data ("Dia do Nutricionista"). */
  title: string;
  /** Como chamar o profissional na mensagem ("Nutricionista"). */
  role: string;
  month: number; // 1-12
  day: number; // 1-31
};

export const CATEGORY_DAYS: CategoryDay[] = [
  { key: "psicologia", title: "Dia do Psicólogo", role: "Psicólogo(a)", month: 8, day: 27 },
  { key: "parental", title: "Dia do Psicólogo", role: "Psicólogo(a)", month: 8, day: 27 },
  { key: "nutricao", title: "Dia do Nutricionista", role: "Nutricionista", month: 8, day: 31 },
  { key: "edfisica", title: "Dia do Profissional de Educação Física", role: "Profissional de Educação Física", month: 9, day: 1 },
  { key: "fisio", title: "Dia do Fisioterapeuta", role: "Fisioterapeuta", month: 10, day: 13 },
  { key: "to", title: "Dia do Terapeuta Ocupacional", role: "Terapeuta Ocupacional", month: 10, day: 13 },
  { key: "psicoped", title: "Dia do Psicopedagogo", role: "Psicopedagogo(a)", month: 11, day: 10 },
  { key: "fono", title: "Dia do Fonoaudiólogo", role: "Fonoaudiólogo(a)", month: 12, day: 9 },
  { key: "psicomotricidade", title: "Dia do Psicomotricista", role: "Psicomotricista", month: 8, day: 19 },
  { key: "motorista", title: "Dia do Motorista", role: "Motorista", month: 7, day: 25 },
];

export const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** Data de hoje em Brasília no formato YYYY-MM-DD (mesmo padrão da agenda). */
export function todayISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export function categoryDayFor(specialty: string | null | undefined): CategoryDay | null {
  const key = specialtyKey(specialty);
  return CATEGORY_DAYS.find((d) => d.key === key) ?? null;
}

/** Primeiro nome, com a capitalização preservada do cadastro. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function monthDay(iso: string): { month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  return { month: Number(m[2]), day: Number(m[3]) };
}

/** Aniversário hoje? Compara só mês/dia, sem converter para UTC. */
export function isBirthdayToday(birthDate: string | null | undefined, today = todayISO()): boolean {
  if (!birthDate) return false;
  const b = monthDay(birthDate);
  const t = monthDay(today);
  if (!b || !t) return false;
  return b.month === t.month && b.day === t.day;
}

export function isCategoryDayToday(specialty: string | null | undefined, today = todayISO()): CategoryDay | null {
  const cat = categoryDayFor(specialty);
  const t = monthDay(today);
  if (!cat || !t) return null;
  return cat.month === t.month && cat.day === t.day ? cat : null;
}

/** Idade que a pessoa completa no aniversário deste ano (null se sem data). */
export function birthdayAge(birthDate: string | null | undefined, today = todayISO()): number | null {
  if (!birthDate) return null;
  const year = Number(birthDate.slice(0, 4));
  const currentYear = Number(today.slice(0, 4));
  if (!year || !currentYear || year >= currentYear) return null;
  return currentYear - year;
}

export function dateLabel(month: number, day: number): string {
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
}

/**
 * Dias até a próxima ocorrência de mês/dia (0 = hoje), no calendário local.
 */
export function daysUntil(month: number, day: number, today = todayISO()): number {
  const t = monthDay(today);
  const year = Number(today.slice(0, 4));
  if (!t || !year) return 0;
  const base = Date.UTC(year, t.month - 1, t.day);
  let target = Date.UTC(year, month - 1, day);
  if (target < base) target = Date.UTC(year + 1, month - 1, day);
  return Math.round((target - base) / 86_400_000);
}

// ── Modelos de mensagem ─────────────────────────────────────────────────────
// `{nome}` = primeiro nome, `{categoria}` = como chamar o profissional.

export const BIRTHDAY_TEMPLATES: string[] = [
  "Feliz aniversário, {nome}! 🎉 Que este novo ano de vida venha cheio de saúde, alegria e conquistas. Obrigado por fazer parte da nossa equipe!\nEquipe Núcleo de Atendimento Novo Arco-íris 🌈",
  "Parabéns, {nome}! 🥳 Hoje é dia de comemorar você — a sua dedicação com as nossas crianças faz toda a diferença. Um dia maravilhoso!\nEquipe Núcleo de Atendimento Novo Arco-íris 🌈",
  "{nome}, felicidades! 🎂 Desejamos um ano novo de vida repleto de realizações, paz e muitos motivos para sorrir. Conte sempre com a gente!\nEquipe Núcleo de Atendimento Novo Arco-íris 🌈",
  "Feliz aniversário, {nome}! 🎈 Que Deus abençoe cada passo do seu caminho e retribua todo o cuidado que você dedica às nossas famílias.\nEquipe Núcleo de Atendimento Novo Arco-íris 🌈",
  "Hoje o dia é seu, {nome}! 🎁 Que a alegria que você leva para os atendimentos volte multiplicada para você. Parabéns!\nEquipe Núcleo de Atendimento Novo Arco-íris 🌈",
  "Parabéns pelo seu dia, {nome}! ✨ Que venham muitos anos de saúde, sucesso e boas histórias ao lado da nossa equipe.\nEquipe Núcleo de Atendimento Novo Arco-íris 🌈",
];

export const CATEGORY_TEMPLATES: string[] = [
  "Parabéns pelo seu dia, {nome}! 🎉 Hoje é o {titulo} e queremos agradecer por todo o cuidado que você dedica às nossas crianças.\nEquipe Núcleo de Atendimento Novo Arco-íris 🌈",
  "{nome}, feliz {titulo}! 👏 Sua atuação como {categoria} transforma a vida das nossas famílias todos os dias. Obrigado!\nEquipe Núcleo de Atendimento Novo Arco-íris 🌈",
  "Hoje celebramos você, {nome}! 💙 Feliz {titulo} — que a sua profissão continue sendo motivo de orgulho e realização.\nEquipe Núcleo de Atendimento Novo Arco-íris 🌈",
  "Feliz {titulo}, {nome}! 🌟 Ser {categoria} é cuidar, ensinar e acolher — e você faz isso com maestria. Parabéns!\nEquipe Núcleo de Atendimento Novo Arco-íris 🌈",
  "Parabéns, {nome}! 🎊 No {titulo}, nosso reconhecimento por cada atendimento, cada evolução conquistada e cada família acolhida.\nEquipe Núcleo de Atendimento Novo Arco-íris 🌈",
];

export function fillTemplate(
  template: string,
  vars: { nome: string; categoria?: string; titulo?: string },
): string {
  return template
    .replaceAll("{nome}", vars.nome)
    .replaceAll("{categoria}", vars.categoria ?? "profissional")
    .replaceAll("{titulo}", vars.titulo ?? "seu dia");
}

/** Copia para a área de transferência, com fallback para navegadores antigos. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // cai no fallback abaixo
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}
