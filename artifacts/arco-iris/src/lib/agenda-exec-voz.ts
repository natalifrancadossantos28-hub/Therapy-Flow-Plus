// Entende frases simples ditas ou digitadas: "amanhã às 9 horas reunião na Prefeitura".
// Não inventa nada: se faltar a data ou o horário, avisa o que falta.
import type { Categoria } from "./agenda-exec-rpc";

export type Interpretacao = {
  titulo: string;
  data: string | null;
  hora: string | null;
  diaTodo: boolean;
  local: string | null;
  categoria: Categoria;
  falta: ("data" | "hora")[];
};

const sem = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const ISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const NUM: Record<string, number> = {
  zero: 0, uma: 1, um: 1, duas: 2, dois: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
  treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20,
};
for (const [nome, valor] of [["vinte", 20], ["trinta", 30], ["quarenta", 40], ["cinquenta", 50]] as const) {
  NUM[nome] = valor;
  for (const unidade of ["um", "dois", "tres", "quatro", "cinco", "seis", "sete", "oito", "nove"]) NUM[`${nome} e ${unidade}`] = valor + NUM[unidade];
}

export type ComandoVoz = "salvar" | "corrigir" | "cancelar";
/** Só frases de comando completas: mencionar salvar/cancelar em um título não confirma nada. */
export function comandoVoz(frase: string): ComandoVoz | null {
  const t = sem(frase).replace(/[.,!?;:]/g, "").trim().replace(/\s+/g, " ").replace(/ por favor$/, "");
  if (/^(?:pode |quero )?(?:salvar|salva|salve|confirmar|confirma|confirmo)(?: o compromisso)?$/.test(t)) return "salvar";
  if (/^(?:pode |quero )?(?:cancelar|cancela|cancele)(?: o compromisso)?$/.test(t)) return "cancelar";
  if (/^(?:pode |quero )?(?:corrigir|corrige|corrija|corrigir o compromisso)$/.test(t)) return "corrigir";
  return null;
}

const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SEMANA = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];

// Trechos de data/hora; são removidos do texto antes de achar título e local.
const RE_DATA = [
  /\bdepois de amanha\b/, /\bamanha\b/, /\bhoje\b/, /\bagora\b/,
  /\b(?:(?:na|no|nesta|neste|nessa|nesse|proxima|proximo)\s+)?(?:domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:[\s-]*feira)?(?:\s+que vem)?\b/,
  /\b(?:no\s+)?dia\s+\d{1,2}(?:\s*(?:\/|de)\s*(?:\d{1,2}|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro))?\b/,
  /\b\d{1,2}\s*\/\s*\d{1,2}(?:\s*\/\s*\d{2,4})?\b/,
  /\b\d{1,2}\s+de\s+(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/,
  /\b(?:o\s+)?dia (?:todo|inteiro)\b/,
];
const PAL_NUM = Object.keys(NUM).sort((a,b) => b.length-a.length).join("|");
const VALOR = `(?:\\d{1,2}|${PAL_NUM})`;
const MINUTO = `(?:meia|${VALOR})`;
const PERIODO = `(?:\\s+(?:da|de)\\s+(manha|tarde|noite|madrugada))?`;
const RE_ESPECIAL = new RegExp(`\\b(?:(?:a|as|ao)\\s+)?(meia[\\s-]+noite|meio[\\s-]+dia)(?:\\s+(?:e\\s+)?(${MINUTO})(?:\\s+minutos?)?)?\\b`);
const RE_HORA = [
  new RegExp(`\\b(?:as|a partir das|pelas|por volta das)?\\s*(${VALOR})\\s*(?:h|:|horas?)\\s*(?:e\\s+)?(${MINUTO})?(?:\\s*(?:minutos?|min))?${PERIODO}\\b`),
  new RegExp(`\\b(?:as|pelas)\\s+(${VALOR})(?:\\s+e\\s+(${MINUTO}))?${PERIODO}\\b`),
  RE_ESPECIAL,
];

function numero(s: string | undefined): number | null {
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  return NUM[s] ?? null;
}

function acharData(t: string, hoje: Date): Date | null {
  const d = (n: number) => { const x = new Date(hoje); x.setDate(x.getDate() + n); return x; };
  if (/\bdepois de amanha\b/.test(t)) return d(2);
  if (/\bamanha\b/.test(t)) return d(1);
  if (/\b(?:hoje|agora)\b/.test(t)) return d(0);
  const sem = t.match(/\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)\b/);
  if (sem) {
    let n = (SEMANA.indexOf(sem[1]) - hoje.getDay() + 7) % 7;
    if (n === 0) n = 7;
    return d(n);
  }
  let dia: number | null = null, mes: number | null = null, ano: number | null = null;
  const m1 = t.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?\b/);
  const m2 = t.match(/\b(\d{1,2})\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/);
  const m3 = t.match(/\bdia\s+(\d{1,2})\b/);
  if (m1) { dia = +m1[1]; mes = +m1[2] - 1; ano = m1[3] ? (m1[3].length === 2 ? 2000 + +m1[3] : +m1[3]) : null; }
  else if (m2) { dia = +m2[1]; mes = MESES.indexOf(m2[2]); }
  else if (m3) { dia = +m3[1]; }
  if (dia == null || dia < 1 || dia > 31 || (mes != null && (mes < 0 || mes > 11))) return null;
  const x = new Date(ano ?? hoje.getFullYear(), mes ?? hoje.getMonth(), dia);
  if (x.getDate() !== dia) return null;
  if (x < hoje && ano == null) { if (mes == null) x.setMonth(x.getMonth() + 1); else x.setFullYear(x.getFullYear() + 1); }
  return x;
}

function acharHora(t: string): string | null {
  const especial = t.match(RE_ESPECIAL);
  if (especial) {
    const min = especial[2] === "meia" ? 30 : numero(especial[2]) ?? 0;
    if (min > 59) return null;
    return `${especial[1].startsWith("meia") ? "00" : "12"}:${String(min).padStart(2,"0")}`;
  }
  for (const re of RE_HORA.slice(0, 2)) {
    const m = t.match(re);
    if (!m) continue;
    let h = numero(m[1]);
    if (h == null) continue;
    const min = m[2] === "meia" ? 30 : numero(m[2]) ?? 0;
    const periodo = m[3];
    if ((periodo === "tarde" || periodo === "noite") && h < 12) h += 12;
    if (periodo === "madrugada" && h === 12) h = 0;
    if (h > 23 || min > 59) continue;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }
  return null;
}

function categoriaDe(t: string): Categoria {
  if (/urgente/.test(t)) return "urgente";
  if (/palestra|capacita|curso|treinamento|oficina/.test(t)) return "palestra";
  if (/visita/.test(t)) return "visita";
  if (/evento|conferencia|inaugura|audiencia|cerimonia|festa/.test(t)) return "evento";
  if (/medico|dentista|exame|consulta|pessoal|aniversario/.test(t)) return "pessoal";
  if (/reuniao|encontro|conversa|alinhamento/.test(t)) return "reuniao";
  return "outro";
}

const cap = (s: string) => s.replace(/(^|\s)(\p{L})/gu, (_, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos|E)\b/g, (w) => w.toLowerCase());

export function interpretarFrase(frase: string, hoje = new Date()): Interpretacao {
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const original = frase.trim().replace(/\s+/g, " ");
  const t = sem(original);
  const data = acharData(t, base);
  const diaTodo = /\bdia (?:todo|inteiro)\b/.test(t);
  const hora = diaTodo ? null : acharHora(t);

  // Remove data/hora mantendo as posições (o texto sem acento tem o mesmo tamanho).
  let resto = original;
  let rt = t;
  for (const re of [...RE_DATA, ...RE_HORA]) {
    const g = new RegExp(re.source, "g");
    rt = rt.replace(g, (m) => " ".repeat(m.length));
  }
  resto = [...original].map((c, i) => (rt[i] === " " && t[i] !== " " ? " " : c)).join("");
  resto = resto.replace(/\s+/g, " ").replace(/\s+([.,;!?])/g, "$1").replace(/^[\s,.;]+|[\s,.;!?]+$/g, "");
  resto = resto.replace(/^(?:eu\s+)?(?:tenho|vou ter|vou|preciso ir|preciso|quero agendar|quero marcar|agendar|agende|marcar|marque|anota|anote|lembrar de|me lembra de|lembre-me de)\s+(?:uma?\s+)?/i, "");

  let titulo = resto, local: string | null = null;
  const m = resto.match(/^(.*\S)\s+(?:na|no|nas|nos|em)\s+(.+)$/i);
  if (m && m[1].length >= 3) { titulo = m[1]; local = cap(m[2].replace(/[.,;!?]+$/, "")); }
  titulo = titulo.replace(/\s+(?:de|da|do|para|pra)$/i, "").trim();
  titulo = titulo ? titulo[0].toUpperCase() + titulo.slice(1) : "Compromisso";

  const falta: ("data" | "hora")[] = [];
  if (!data) falta.push("data");
  if (!hora && !diaTodo) falta.push("hora");
  return { titulo, data: data ? ISO(data) : null, hora, diaTodo, local, categoria: categoriaDe(t), falta };
}
