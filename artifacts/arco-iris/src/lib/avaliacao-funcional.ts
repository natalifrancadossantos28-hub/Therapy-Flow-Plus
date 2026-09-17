// Avaliação Funcional Multidisciplinar — questionário padrão de 5 perguntas
// (Likert 1–5) que serve para qualquer especialidade, preenchido na entrada
// e na alta. Pontuação total de 5 a 25; quanto maior, melhor o quadro.

export type AvfPergunta = {
  key: string;
  titulo: string;
  texto: string;
  dica: string;
};

export const AVF_PERGUNTAS: readonly AvfPergunta[] = [
  {
    key: "independencia",
    titulo: "Independência / Funcionalidade nas Atividades",
    texto: "Qual o nível de independência e autonomia do paciente para realizar as atividades propostas ou cotidianas relacionadas a esta especialidade?",
    dica: "1 = totalmente dependente · 5 = plenamente independente",
  },
  {
    key: "sintomas",
    titulo: "Severidade dos Sintomas / Queixas Principais",
    texto: "Como você avalia a intensidade e a frequência dos sintomas ou dificuldades que motivaram o início do atendimento?",
    dica: "1 = sintomas muito intensos/frequentes · 5 = sintomas ausentes/controlados",
  },
  {
    key: "engajamento",
    titulo: "Engajamento e Resposta ao Tratamento",
    texto: "Qual tem sido o nível de aproveitamento, resposta aos estímulos e engajamento do paciente/família frente às intervenções da especialidade?",
    dica: "1 = sem resposta/engajamento · 5 = excelente aproveitamento",
  },
  {
    key: "rotina",
    titulo: "Impacto na Rotina e Qualidade de Vida",
    texto: "Em que medida as dificuldades atuais impactam negativamente o bem-estar e a rotina diária do paciente e da família?",
    dica: "1 = impacto máximo · 5 = nenhum impacto",
  },
  {
    key: "evolucao",
    titulo: "Evolução Geral na Especialidade",
    texto: "Considerando o quadro geral na entrada da especialidade até o momento atual (alta), como você classifica a evolução clínica do paciente?",
    dica: "1 = piora/crítico · 5 = evolução excelente",
  },
];

export const AVF_ESCALA: readonly { valor: 1 | 2 | 3 | 4 | 5; label: string; color: string }[] = [
  { valor: 1, label: "Muito Baixo / Incapaz / Crítico",             color: "#ef4444" },
  { valor: 2, label: "Baixo / Dificuldade acentuada",               color: "#f97316" },
  { valor: 3, label: "Moderado / Parcialmente independente",        color: "#eab308" },
  { valor: 4, label: "Bom / Desenvolvido com leve apoio",           color: "#84cc16" },
  { valor: 5, label: "Excelente / Plenamente desenvolvido ou adequado", color: "#22c55e" },
];

export const AVF_MIN = AVF_PERGUNTAS.length;      // 5
export const AVF_MAX = AVF_PERGUNTAS.length * 5;  // 25

export type AvfFaixa = {
  label: string;
  short: string;
  color: string;
  bg: string;
  border: string;
};

/** Faixa qualitativa do total (5–25). Cores no padrão vermelho/amarelo/verde. */
export function avfFaixa(total: number): AvfFaixa {
  if (total <= 10) return { label: "Comprometimento alto",   short: "Alto",     color: "#ef4444", bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.45)" };
  if (total <= 17) return { label: "Comprometimento moderado", short: "Moderado", color: "#eab308", bg: "rgba(234,179,8,0.12)",  border: "rgba(234,179,8,0.45)" };
  return             { label: "Bom desempenho funcional",  short: "Bom",      color: "#22c55e", bg: "rgba(34,197,94,0.12)",  border: "rgba(34,197,94,0.45)" };
}

export function avfCompleta(respostas: ReadonlyArray<number | null>): respostas is number[] {
  return respostas.length === AVF_PERGUNTAS.length && respostas.every(r => typeof r === "number" && r >= 1 && r <= 5);
}

export function avfTotal(respostas: ReadonlyArray<number | null>): number {
  return respostas.reduce<number>((acc, r) => acc + (r ?? 0), 0);
}

/** Variação entrada → alta em pontos e em % do máximo possível de ganho. */
export function avfEvolucao(entrada: number, alta: number): { delta: number; pct: number; tendencia: "melhora" | "estavel" | "piora" } {
  const delta = alta - entrada;
  const pct = Math.round((delta / (AVF_MAX - AVF_MIN)) * 100);
  return { delta, pct, tendencia: delta > 0 ? "melhora" : delta < 0 ? "piora" : "estavel" };
}
