// Avaliação Sociofamiliar — perguntas padronizadas sobre a realidade da
// família. O indicador social é experimental e separado do escore clínico:
// não entra na fila de espera. Benefício social, renda, CID ou deficiência
// não pontuam. Alertas aparecem independentemente da pontuação.

export type AvsfOpcao = { valor: string; label: string; pontos: number; alerta?: string };

export type AvsfPergunta = {
  key: string;
  titulo: string;
  texto: string;
  opcoes: readonly AvsfOpcao[];
};

export const AVSF_NAO_INFORMADO = "nao_informado";

export const AVSF_PERGUNTAS: readonly AvsfPergunta[] = [
  {
    key: "transporte",
    titulo: "Transporte e deslocamento",
    texto: "Como a família chega até a unidade?",
    opcoes: [
      { valor: "proprio", label: "Transporte próprio ou carona, sem dificuldade", pontos: 0 },
      { valor: "publico", label: "Ônibus / transporte da prefeitura, sem dificuldade", pontos: 1 },
      { valor: "dificuldade", label: "Com dificuldade (custo, distância, horários)", pontos: 2 },
      { valor: "nao_consegue", label: "Não consegue vir sem apoio de transporte", pontos: 3, alerta: "Risco de faltar por falta de transporte" },
    ],
  },
  {
    key: "cuidados",
    titulo: "Composição familiar e cuidados",
    texto: "Quem cuida do paciente no dia a dia?",
    opcoes: [
      { valor: "compartilhado", label: "Dois ou mais adultos dividem os cuidados", pontos: 0 },
      { valor: "um_com_ajuda", label: "Um adulto, com ajuda de vez em quando", pontos: 1 },
      { valor: "um_sozinho", label: "Um adulto sozinho, sem ajuda", pontos: 2 },
      { valor: "sem_cuidador", label: "Sem adulto responsável fixo / cuidado por outra criança", pontos: 3, alerta: "Criança sem cuidador adequado" },
    ],
  },
  {
    key: "rede_apoio",
    titulo: "Rede de apoio",
    texto: "A família conta com parentes, vizinhos, igreja ou serviços que ajudam?",
    opcoes: [
      { valor: "boa", label: "Sim, tem com quem contar", pontos: 0 },
      { valor: "pouca", label: "Pouca ajuda", pontos: 1 },
      { valor: "nenhuma", label: "Nenhuma ajuda", pontos: 2 },
    ],
  },
  {
    key: "sobrecarga",
    titulo: "Sobrecarga do cuidador",
    texto: "Como está o cansaço e o estado emocional de quem cuida?",
    opcoes: [
      { valor: "sem", label: "Sem sobrecarga", pontos: 0 },
      { valor: "moderada", label: "Cansaço moderado", pontos: 1 },
      { valor: "intensa", label: "Sobrecarga intensa", pontos: 2 },
      { valor: "esgotamento", label: "Esgotamento ou sofrimento intenso", pontos: 3, alerta: "Cuidador em sofrimento intenso" },
    ],
  },
  {
    key: "alimentacao",
    titulo: "Alimentação",
    texto: "Nos últimos meses, faltou comida em casa?",
    opcoes: [
      { valor: "nunca", label: "Não, sempre teve comida suficiente", pontos: 0 },
      { valor: "as_vezes", label: "Às vezes faltou", pontos: 2 },
      { valor: "frequente", label: "Falta com frequência / passaram fome", pontos: 3, alerta: "Insegurança alimentar grave" },
    ],
  },
  {
    key: "moradia",
    titulo: "Condições de moradia",
    texto: "Como é a moradia da família?",
    opcoes: [
      { valor: "adequada", label: "Adequada", pontos: 0 },
      { valor: "precaria", label: "Precária (umidade, sem saneamento, muita gente no mesmo cômodo)", pontos: 2 },
      { valor: "sem_moradia", label: "Sem moradia fixa / risco de despejo / situação de rua", pontos: 3, alerta: "Sem moradia ou risco de despejo" },
    ],
  },
  {
    key: "acesso_saude",
    titulo: "Barreiras de acesso à saúde",
    texto: "A família tem dificuldade para conseguir atendimento de saúde?",
    opcoes: [
      { valor: "nenhuma", label: "Não", pontos: 0 },
      { valor: "horario", label: "Dificuldade com horários / trabalho", pontos: 1 },
      { valor: "varias", label: "Várias dificuldades (documentos, marcação, acesso)", pontos: 2 },
    ],
  },
  {
    key: "interrupcao",
    titulo: "Interrupção de terapias",
    texto: "O paciente já parou alguma terapia antes de terminar?",
    opcoes: [
      { valor: "nunca", label: "Nunca", pontos: 0 },
      { valor: "uma_vez", label: "Uma vez", pontos: 1 },
      { valor: "varias", label: "Várias vezes / desligado por faltas", pontos: 2 },
    ],
  },
];

/** Situações de proteção social: cada uma marcada vira um alerta, sem somar pontos. */
export const AVSF_PROTECAO: readonly { valor: string; label: string }[] = [
  { valor: "violencia", label: "Suspeita de violência, negligência ou abuso" },
  { valor: "conselho_tutelar", label: "Acompanhado pelo Conselho Tutelar" },
  { valor: "cras_creas", label: "Acompanhado pelo CRAS / CREAS" },
  { valor: "trabalho_infantil", label: "Suspeita de trabalho infantil" },
  { valor: "uso_substancias", label: "Uso abusivo de álcool/drogas na família" },
  { valor: "fora_escola", label: "Criança fora da escola" },
];

export const AVSF_PROTECAO_ALERTA = new Set(["violencia", "trabalho_infantil", "uso_substancias", "fora_escola"]);

export type AvsfRespostas = Record<string, string | string[]>;

export const AVSF_SCORE_MAX = AVSF_PERGUNTAS.reduce((s, p) => s + Math.max(...p.opcoes.map(o => o.pontos)), 0);

export function avsfCalcular(respostas: AvsfRespostas): { score: number; scoreMax: number; alertas: string[] } {
  let score = 0;
  let scoreMax = 0;
  const alertas: string[] = [];
  for (const p of AVSF_PERGUNTAS) {
    const v = respostas[p.key];
    if (typeof v !== "string" || v === AVSF_NAO_INFORMADO) continue;
    const op = p.opcoes.find(o => o.valor === v);
    if (!op) continue;
    score += op.pontos;
    scoreMax += Math.max(...p.opcoes.map(o => o.pontos));
    if (op.alerta) alertas.push(op.alerta);
  }
  const prot = respostas.protecao;
  if (Array.isArray(prot)) {
    for (const v of prot) {
      if (!AVSF_PROTECAO_ALERTA.has(v)) continue;
      const item = AVSF_PROTECAO.find(x => x.valor === v);
      if (item) alertas.push(item.label);
    }
  }
  return { score, scoreMax, alertas };
}

export function avsfFaixa(score: number, scoreMax: number) {
  const pct = scoreMax > 0 ? score / scoreMax : 0;
  if (pct >= 0.5) return { label: "Vulnerabilidade alta", short: "Alta", color: "#ef4444", bg: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.4)" };
  if (pct >= 0.25) return { label: "Vulnerabilidade moderada", short: "Moderada", color: "#f59e0b", bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.4)" };
  return { label: "Vulnerabilidade baixa", short: "Baixa", color: "#22c55e", bg: "rgba(34,197,94,0.10)", border: "rgba(34,197,94,0.4)" };
}

export function avsfRespostaLabel(key: string, valor: string | string[] | undefined): string {
  if (key === "protecao") {
    const arr = Array.isArray(valor) ? valor : [];
    if (arr.length === 0) return "Nenhuma situação identificada";
    return arr.map(v => AVSF_PROTECAO.find(x => x.valor === v)?.label ?? v).join("; ");
  }
  if (typeof valor !== "string" || valor === AVSF_NAO_INFORMADO) return "Não informado";
  const p = AVSF_PERGUNTAS.find(q => q.key === key);
  return p?.opcoes.find(o => o.valor === valor)?.label ?? valor;
}
