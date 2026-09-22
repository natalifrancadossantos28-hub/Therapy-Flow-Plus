// Avaliação Funcional Multidisciplinar — questionário padrão de 5 perguntas
// (Likert 1–5) que serve para qualquer especialidade, preenchido na entrada
// e na alta. Pontuação total de 5 a 25; quanto maior, melhor o quadro.

import { isCaregiverSpecialty } from "@/lib/specialty-colors";

export type AvfPergunta = {
  key: string;
  titulo: string;
  curto: string;
  texto: string;
  dica: string;
};

export const AVF_PERGUNTAS: readonly AvfPergunta[] = [
  {
    key: "autonomia",
    titulo: "Autonomia e Desempenho Funcional",
    curto: "Autonomia",
    texto: "Qual o nível de independência e funcionalidade do paciente para realizar as atividades e demandas da rotina relacionadas a esta área (seja motora, de comunicação, alimentar, sensorial ou emocional)?",
    dica: "1 = Totalmente dependente / com grande dificuldade · 5 = Plenamente autônomo / adequado para a idade",
  },
  {
    key: "desafios",
    titulo: "Intensidade das Dificuldades / Desafios",
    curto: "Desafios",
    texto: "Como você avalia a frequência e a intensidade dos desafios apresentados pelo paciente que motivaram o acompanhamento nesta especialidade?",
    dica: "1 = Desafios constantes e de alto impacto · 5 = Desafios ausentes ou totalmente controlados",
  },
  {
    key: "engajamento",
    titulo: "Engajamento e Resposta ao Processo Terapêutico",
    curto: "Engajamento",
    texto: "Como tem sido a adesão, a participação ativa e a resposta do paciente (e da família, quando aplicável) frente aos estímulos e propostas da intervenção?",
    dica: "1 = Sem engajamento / resistência acentuada · 5 = Excelente engajamento e evolução rápida",
  },
  {
    key: "rotina",
    titulo: "Impacto na Rotina e Qualidade de Vida (Dinâmica Familiar/Pessoal)",
    curto: "Rotina",
    texto: "Em que medida as dificuldades atuais afetam o bem-estar, a participação social e a rotina diária do paciente e de sua família?",
    dica: "1 = Impacto máximo, prejuízo severo na rotina · 5 = Nenhum impacto / rotina harmoniosa e funcional",
  },
  {
    key: "objetivos",
    titulo: "Atingimento dos Objetivos Terapêuticos",
    curto: "Objetivos",
    texto: "Considerando as metas traçadas para este acompanhamento, qual é o grau de alcance dos objetivos propostos para o desenvolvimento do paciente?",
    dica: "1 = Metas não alcançadas · 5 = Metas integralmente alcançadas / Conclusão com sucesso",
  },
];

/**
 * Psicologia Parental atende o responsável, não a criança. As perguntas são
 * as mesmas cinco dimensões, curtas e diretas, voltadas para quem está em
 * acompanhamento.
 */
export const AVF_PERGUNTAS_PARENTAL: readonly AvfPergunta[] = [
  {
    key: "autonomia",
    titulo: "Autonomia",
    curto: "Autonomia",
    texto: "Como está a autonomia do responsável para lidar com a rotina e o dia a dia?",
    dica: "1 = Precisa de muito apoio · 5 = Conduz com total segurança",
  },
  {
    key: "emocional",
    titulo: "Bem-estar emocional",
    curto: "Emocional",
    texto: "Como está o controle do estresse, ansiedade e cansaço do responsável?",
    dica: "1 = Sobrecarga intensa · 5 = Bem-estar equilibrado",
  },
  {
    key: "engajamento",
    titulo: "Participação",
    curto: "Participação",
    texto: "Como tem sido a adesão do responsável às orientações passadas?",
    dica: "1 = Baixa adesão · 5 = Aplicação plena em casa",
  },
  {
    key: "vinculo",
    titulo: "Vínculo e manejo",
    curto: "Vínculo",
    texto: "Como está a relação e o manejo do responsável diante das dificuldades com a criança?",
    dica: "1 = Conflitos frequentes · 5 = Vínculo tranquilo e seguro",
  },
  {
    key: "objetivos",
    titulo: "Objetivos",
    curto: "Objetivos",
    texto: "Os combinados iniciais do acompanhamento foram atingidos?",
    dica: "1 = Não alcançados · 5 = Totalmente alcançados / pronto para a alta",
  },
];

/** Quem atende o responsável (Parental, Pilates) tem questionário e nome em destaque próprios. */
export function isParentalSpecialty(specialty: string | null | undefined): boolean {
  return isCaregiverSpecialty(specialty);
}

export function avfPerguntas(specialty: string | null | undefined): readonly AvfPergunta[] {
  return isParentalSpecialty(specialty) ? AVF_PERGUNTAS_PARENTAL : AVF_PERGUNTAS;
}

export const AVF_ESCALA: readonly { valor: 1 | 2 | 3 | 4 | 5; label: string; color: string }[] = [
  { valor: 1, label: "Cenário mais desafiador / difícil",   color: "#ef4444" },
  { valor: 2, label: "Dificuldade acentuada",                color: "#f97316" },
  { valor: 3, label: "Moderado / parcialmente adequado",     color: "#eab308" },
  { valor: 4, label: "Bom / adequado com leve apoio",        color: "#84cc16" },
  { valor: 5, label: "Cenário ideal / superado",             color: "#22c55e" },
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
