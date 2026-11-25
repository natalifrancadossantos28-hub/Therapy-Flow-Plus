// Comando de voz sem IA: texto do reconhecimento do navegador → regras.
// As palavras ficam em voz-dicionario.json (fácil de editar); aqui só a lógica.
import DIC from "./voz-dicionario.json";

export const DICIONARIO = DIC;

const ISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const isoData = ISO;
export const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// ── 1) Normalização ────────────────────────────────────────────────────────
const UNIDADES: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
  dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezasseis: 16,
  dezessete: 17, dezoito: 18, dezenove: 19,
};
const DEZENAS: Record<string, number> = { vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50 };

/** Minúsculas, sem acento/pontuação e números por extenso viram dígitos ("sete e cinquenta" → "7 e 50"). */
export function normalizar(frase: string): string {
  let t = semAcento(frase)
    .replace(/(\d)\s*h\s*(\d)/g, "$1h$2")
    .replace(/[“”"'`´!?;,()[\]{}]/g, " ")
    .replace(/(\d)\.(\d)/g, "$1:$2")
    .replace(/\./g, " ")
    .replace(/(?<=[a-z])-(?=[a-z])/g, " ")
    .replace(/\s+/g, " ").trim();
  // "vinte e cinco" → 25 (só dezena + unidade; "sete e cinquenta" continua hora e minuto).
  t = t.replace(/\b(vinte|trinta|quarenta|cinquenta)\s+e\s+(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove)\b/g,
    (_, d: string, u: string) => String(DEZENAS[d] + UNIDADES[u]));
  t = t.replace(/\b(vinte|trinta|quarenta|cinquenta)\b/g, (_, d: string) => String(DEZENAS[d]));
  // "uma"/"um" só viram número perto de hora/data, para não estragar "uma vez" etc.
  t = t.replace(/\b(zero|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezasseis|dezessete|dezoito|dezenove)\b/g,
    (_, u: string) => String(UNIDADES[u]));
  t = t.replace(/\b(?:a|as|à|uma|um)\s+(?=e\s+\d|da tarde|hora)/g, (m) => m.replace(/\b(uma|um)\b/, "1"));
  t = t.replace(/\b(as|a|pelas)\s+(uma|um)\b/g, "$1 1");
  t = t.replace(/\b(uma|um)\s+e\s+(\d{1,2}|meia)\b/g, "1 e $2");
  t = t.replace(/\b(uma|um)\s+(vez|x)\s+por\b/g, "1 $2 por");
  t = t.replace(/\bdia\s+primeiro\b/g, "dia 1");
  return t.replace(/\s+/g, " ").trim();
}

// ── Frases do dicionário ───────────────────────────────────────────────────
type Achado = { chave: string; inicio: number; fim: number; tam: number };
const cacheRe = new Map<string, RegExp>();
function reFrase(frase: string): RegExp {
  let r = cacheRe.get(frase);
  if (!r) {
    const inteira = frase.startsWith("=");
    const f = inteira ? frase.slice(1) : frase;
    const corpo = f.split(" ").map((w) => w.endsWith("*") ? w.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\w*" : w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
    r = new RegExp(inteira ? `^${corpo}$` : `(?:^|\\s)(${corpo})(?=\\s|$)`);
    cacheRe.set(frase, r);
  }
  return r;
}
/** Acha a frase mais comprida do grupo (ex.: "falta nao justificada" vence "falta"). */
export function acharFrase(t: string, grupo: Record<string, string[]>): Achado | null {
  let melhor: Achado | null = null;
  for (const [chave, frases] of Object.entries(grupo)) {
    for (const f of frases) {
      const m = reFrase(f).exec(t);
      if (!m) continue;
      const trecho = m[1] ?? m[0];
      const inicio = m.index + m[0].indexOf(trecho);
      const tam = trecho.length + (f.startsWith("=") ? 100 : 0);
      if (!melhor || tam > melhor.tam) melhor = { chave, inicio, fim: inicio + trecho.length, tam };
    }
  }
  return melhor;
}
export const temFrase = (t: string, frases: string[]) => frases.some((f) => reFrase(f).test(t));
const apagar = (t: string, ini: number, fim: number) => t.slice(0, ini) + " ".repeat(fim - ini) + t.slice(fim);

// ── 3) Datas ───────────────────────────────────────────────────────────────
const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SEMANA = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
const RE_MES = MESES.join("|");
const segundaDe = (d: Date) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const mais = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export type DataAchada = {
  data: string | null;
  /** Só "semana que vem" sem o dia: a semana (segunda) citada. */
  semana: string | null;
  fimDeSemana: boolean;
  /** "dia 6" sem mês: mês assumido, confirmar. */
  mesAssumido: boolean;
  resto: string;
};

/** Hoje no fuso de Brasília (o celular pode estar em outro fuso). */
export function hojeBrasilia(agora = new Date()): Date {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
  const [y, m, d] = p.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function diaMes(dia: number, mes: number | null, ano: number | null, hoje: Date): { d: Date | null; assumido: boolean } {
  if (dia < 1 || dia > 31 || (mes != null && (mes < 0 || mes > 11))) return { d: null, assumido: false };
  const x = new Date(ano ?? hoje.getFullYear(), mes ?? hoje.getMonth(), dia);
  if (x.getDate() !== dia) return { d: null, assumido: false };
  if (x < hoje && ano == null) { if (mes == null) x.setMonth(x.getMonth() + 1); else x.setFullYear(x.getFullYear() + 1); }
  return { d: x, assumido: mes == null };
}

export function acharData(t0: string, hoje: Date): DataAchada {
  let t = t0;
  let d: Date | null = null, semana: Date | null = null, assumido = false;
  const tira = (m: RegExpExecArray) => { t = apagar(t, m.index, m.index + m[0].length); };
  let m: RegExpExecArray | null;
  // Semana citada: "semana que vem", "proxima semana", "daqui a 2 semanas", "essa semana".
  let semanas: number | null = null;
  if ((m = /\b(?:da |na |a )?(?:semana que vem|proxima semana)\b/.exec(t))) { semanas = 1; tira(m); }
  else if ((m = /\bdaqui a (\d+) semanas?\b/.exec(t))) { semanas = +m[1]; tira(m); }
  else if ((m = /\b(?:dessa|desta|nessa|nesta|essa|esta) semana\b/.exec(t))) { semanas = 0; tira(m); }
  else if ((m = /\b(?:da |na )?semana passada\b/.exec(t))) { semanas = -1; tira(m); }

  if ((m = /\bdepois de amanha\b/.exec(t))) { d = mais(hoje, 2); tira(m); }
  else if ((m = /\bamanha\b/.exec(t))) { d = mais(hoje, 1); tira(m); }
  else if ((m = /\bontem\b/.exec(t))) { d = mais(hoje, -1); tira(m); }
  else if ((m = /\bhoje\b/.exec(t))) { d = hoje; tira(m); }
  else if ((m = /\bdaqui a (\d+) dias?\b/.exec(t))) { d = mais(hoje, +m[1]); tira(m); }
  else if ((m = /\b(?:no |o )?(?:dia )?(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?\b/.exec(t))) {
    const r = diaMes(+m[1], +m[2] - 1, m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null, hoje); d = r.d; tira(m);
  } else if ((m = new RegExp(`\\b(?:no |o )?(?:dia )?(\\d{1,2}) de (${RE_MES})(?: de (\\d{4}))?\\b`).exec(t))) {
    const r = diaMes(+m[1], MESES.indexOf(m[2]), m[3] ? +m[3] : null, hoje); d = r.d; tira(m);
  } else if ((m = /\b(?:no |o )?(?:dia )?(\d{1,2}) do (\d{1,2})\b/.exec(t))) {
    const r = diaMes(+m[1], +m[2] - 1, null, hoje); d = r.d; tira(m);
  } else if ((m = /\b(?:no |o |pro |para o |pra o )?dia (\d{1,2})\b(?!\s*(?:h|:|horas?)\b)/.exec(t))) {
    const r = diaMes(+m[1], null, null, hoje); d = r.d; assumido = r.assumido; tira(m);
  } else if ((m = /\b(?:(proxima|proximo|na|no|nesta|neste|nessa|nesse|essa|esta|de|da|para|pra)\s+)?(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:\s+feira)?(\s+que vem)?\b/.exec(t))) {
    const alvo = SEMANA.indexOf(m[2]);
    if (semanas != null) d = mais(segundaDe(hoje), semanas * 7 + ((alvo + 6) % 7));
    else {
      let n = (alvo - hoje.getDay() + 7) % 7;
      if ((m[1] === "proxima" || m[1] === "proximo" || m[3]) && n === 0) n = 7;
      d = mais(hoje, n);
    }
    semanas = null; tira(m);
  }
  if (!d && semanas != null) semana = mais(segundaDe(hoje), semanas * 7);
  const dow = d?.getDay();
  return { data: d ? ISO(d) : null, semana: semana ? ISO(semana) : null, fimDeSemana: dow === 0 || dow === 6, mesAssumido: assumido, resto: t };
}

/** "de 10 a 20 de dezembro", "do dia 3 ao dia 5", "de 10/12 a 20/12". */
export function acharPeriodo(t: string, hoje: Date): { inicio: string; fim: string } | null {
  const m = new RegExp(`\\b(?:de|do dia|dia)\\s+(\\d{1,2})(?:\\s*\\/\\s*(\\d{1,2}))?(?:\\s+de\\s+(${RE_MES}))?\\s+(?:a|ao|ate)\\s+(?:o\\s+)?(?:dia\\s+)?(\\d{1,2})(?:\\s*\\/\\s*(\\d{1,2})|\\s+de\\s+(${RE_MES}))?\\b`).exec(t);
  if (!m) return null;
  const mesFim = m[5] ? +m[5] - 1 : m[6] ? MESES.indexOf(m[6]) : null;
  const mesIni = m[2] ? +m[2] - 1 : m[3] ? MESES.indexOf(m[3]) : mesFim;
  const ini = diaMes(+m[1], mesIni, null, hoje).d;
  if (!ini) return null;
  let fim = new Date(ini.getFullYear(), mesFim ?? ini.getMonth(), +m[4]);
  if (fim.getDate() !== +m[4]) return null;
  if (fim < ini) fim = mesFim == null ? new Date(ini.getFullYear(), ini.getMonth() + 1, +m[4]) : new Date(ini.getFullYear() + 1, mesFim, +m[4]);
  return { inicio: ISO(ini), fim: ISO(fim) };
}

// ── 4) Horários ────────────────────────────────────────────────────────────
export const GRADE = ["07:10", "08:00", "08:50", "09:40", "10:30", "11:20", "12:10", "13:10", "14:00", "14:50", "15:40", "16:30"];

/** "sete e dez", "7h10", "10 e meia", "1 e 10 da tarde", "2 da tarde", "meio dia". Sem período: 7–11 manhã, 12–6 tarde. */
export function acharHora(t: string): { hora: string | null; resto: string } {
  const regras: RegExp[] = [
    /\b(?:as |a |ao )?meio dia(?: e (\d{1,2}|meia))?\b()(?:\s+(?:da|de)\s+(manha|tarde|noite))?/,
    /\b(?:as |a |pelas |pras |para as |por volta das )?(\d{1,2})\s*(?:h|:)\s*(\d{2})?(?:\s*(?:min|minutos))?(?:\s+(?:da|de)\s+(manha|tarde|noite))?(?=\s|$)/,
    /\b(?:as |a |pelas |pras |para as )?(\d{1,2})\s+horas?(?:\s+e\s+(\d{1,2}|meia))?(?:\s+minutos)?(?:\s+(?:da|de)\s+(manha|tarde|noite))?\b/,
    /\b(?:as|pelas|pras|para as|a)\s+(\d{1,2})(?:\s+e\s+(\d{1,2}|meia))?(?:\s+minutos)?(?:\s+(?:da|de)\s+(manha|tarde|noite))?(?=\s|$)/,
    /\b(\d{1,2})\s+e\s+(\d{1,2}|meia)(?:\s+minutos)?(?:\s+(?:da|de)\s+(manha|tarde|noite))?(?=\s|$)/,
    /\b(\d{1,2})\s+(?:da|de)\s+(manha|tarde|noite)\b()/,
  ];
  for (let i = 0; i < regras.length; i++) {
    const m = regras[i].exec(t);
    if (!m) continue;
    let h: number, min: number, periodo: string | undefined;
    if (i === 0) { h = 12; min = m[1] === "meia" ? 30 : m[1] ? +m[1] : 0; periodo = undefined; }
    else if (i === 5) { h = +m[1]; min = 0; periodo = m[2]; }
    else { h = +m[1]; min = m[2] === "meia" ? 30 : m[2] ? +m[2] : 0; periodo = m[3]; }
    if (periodo === "tarde" || periodo === "noite") { if (h < 12) h += 12; }
    else if (!periodo && h >= 1 && h <= 6) h += 12;
    if (h > 23 || min > 59) continue;
    return { hora: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`, resto: apagar(t, m.index, m.index + m[0].length) };
  }
  return { hora: null, resto: t };
}

/** Encaixa na grade: se não existe, devolve os vizinhos para perguntar. */
export function encaixarGrade(hora: string, grade: string[]): { ok: true } | { ok: false; antes: string | null; depois: string | null } {
  if (grade.includes(hora)) return { ok: true };
  const ord = [...grade].sort();
  return { ok: false, antes: [...ord].reverse().find((g) => g < hora) ?? null, depois: ord.find((g) => g > hora) ?? null };
}

// ── 1) Pacientes (busca aproximada, nada decorado) ─────────────────────────
export type PacienteVoz = { patientId: number; patientName: string; prontuario?: string | null };

const LIGACAO = new Set(DIC.ligacao);
const VOCAB = (() => {
  const s = new Set<string>();
  const add = (f: string) => f.replace(/^=/, "").split(" ").forEach((w) => s.add(w.replace(/\*$/, "")));
  for (const g of [DIC.acoes, DIC.destinos, DIC.impressao, DIC.cores, DIC.escopo, DIC.motivosAusencia]) Object.values(g as Record<string, string[]>).flat().forEach(add);
  [...DIC.sim, ...DIC.nao, ...MESES, ...SEMANA, "feira", "dia", "dias", "semana", "semanas", "horas", "hora", "horario", "manha", "tarde", "noite", "paciente", "prontuario", "pront", "atendimento", "agendamento", "vem", "que", "por", "favor", "quero", "preciso", "pode", "marcar", "marca", "coloca", "colocar", "botar", "bota", "seu", "sua", "nosso", "menino", "menina", "crianca", "observacao", "obs", "ate", "ao", "aos", "nas", "nos", "pelas", "daqui", "proxima", "proximo", "vez", "minutos"].forEach((w) => s.add(w));
  return s;
})();

const simples = (w: string) => w.replace(/y/g, "i").replace(/w/g, "v").replace(/ph/g, "f").replace(/th/g, "t").replace(/h/g, "").replace(/k/g, "c").replace(/z/g, "s").replace(/(.)\1+/g, "$1").replace(/[ei]$/, "i").replace(/[ou]$/, "o");
function distancia(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let ant = dp[0]; dp[0] = i;
    for (let j = 1; j <= b.length; j++) { const tmp = dp[j]; dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, ant + (a[i - 1] === b[j - 1] ? 0 : 1)); ant = tmp; }
  }
  return dp[b.length];
}
function parecido(falado: string, nome: string): number {
  if (falado === nome) return 1;
  if (falado.length >= 4 && nome.length >= 4 && (nome.startsWith(falado) || falado.startsWith(nome))) return 0.9;
  const a = simples(falado), b = simples(nome);
  if (a === b) return 0.9;
  const lim = Math.max(a.length, b.length) >= 7 ? 2 : Math.min(a.length, b.length) >= 4 ? 1 : 0;
  return lim && distancia(a, b) <= lim ? 0.8 : 0;
}

export type PacienteAchado = { paciente: PacienteVoz | null; opcoes: PacienteVoz[]; falouNome: boolean };

/** Paciente pelo nome (primeiro nome, parcial, com erro de fala) ou "prontuario 511". Empate = perguntar. */
export function acharPaciente(t: string, pacientes: PacienteVoz[], prioridade?: (p: PacienteVoz) => boolean): PacienteAchado {
  const pront = /\b(?:prontuario|pront|prt)\s*(?:numero |n )?(\d+)\b/.exec(t);
  if (pront) {
    const p = pacientes.find((x) => String(x.prontuario ?? "").replace(/^0+/, "") === pront[1].replace(/^0+/, ""));
    return { paciente: p ?? null, opcoes: [], falouNome: true };
  }
  const falados = t.split(" ").filter((w) => w.length > 2 && !/\d/.test(w) && !LIGACAO.has(w) && !VOCAB.has(w));
  if (!falados.length) return { paciente: null, opcoes: [], falouNome: false };
  const notas: { p: PacienteVoz; n: number }[] = [];
  const vistos = new Set<number>();
  for (const p of pacientes) {
    if (vistos.has(p.patientId)) continue; vistos.add(p.patientId);
    const partes = semAcento(p.patientName).split(/\s+/).filter((w) => w.length > 1 && !LIGACAO.has(w));
    let n = 0, primeiro = false, outros = 0;
    partes.forEach((w, i) => {
      const s = Math.max(0, ...falados.map((f) => parecido(f, w)));
      if (s < 0.8) return;
      n += (i === 0 ? 3 : 1) * s;
      if (i === 0) primeiro = true; else outros++;
    });
    if (primeiro || outros >= 2) notas.push({ p, n });
  }
  if (!notas.length) return { paciente: null, opcoes: [], falouNome: true };
  const topo = Math.max(...notas.map((x) => x.n));
  let empate = notas.filter((x) => x.n >= topo - 0.05).map((x) => x.p);
  if (empate.length > 1 && prioridade) { const pr = empate.filter(prioridade); if (pr.length === 1) empate = pr; }
  if (empate.length === 1) return { paciente: empate[0], opcoes: [], falouNome: true };
  const ord = [...empate].sort((a, b) => Number(prioridade?.(b) ?? 0) - Number(prioridade?.(a) ?? 0) || a.patientName.localeCompare(b.patientName));
  return { paciente: null, opcoes: ord.slice(0, 6), falouNome: true };
}

// ── Log dos comandos não entendidos ────────────────────────────────────────
const LOG_KEY = "nfs_voz_nao_entendidos";
export type LogVoz = { frase: string; tela: string; quando: string };
export function lerNaoEntendidos(): LogVoz[] {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || "[]") as LogVoz[]; } catch { return []; }
}
/** Guarda no aparelho e, se der, no banco (para a administração ver e eu acrescentar palavras). */
export function registrarNaoEntendido(frase: string, tela: string, professionalId?: number | null) {
  const f = frase.trim().slice(0, 300);
  if (!f) return;
  try {
    const l = [{ frase: f, tela, quando: new Date().toISOString() }, ...lerNaoEntendidos()].slice(0, 200);
    localStorage.setItem(LOG_KEY, JSON.stringify(l));
  } catch { /* sem espaço */ }
  try {
    const slug = JSON.parse(sessionStorage.getItem("nfs_ponto_session") || "null")?.companySlug ?? null;
    if (slug) void import("./supabase").then(({ supabase }) => supabase?.rpc("registrar_voz_nao_entendida", {
      p_slug: slug, p_frase: f, p_tela: tela, p_professional_id: professionalId ?? null,
    })).then(() => {}, () => {});
  } catch { /* sem sessão */ }
}
