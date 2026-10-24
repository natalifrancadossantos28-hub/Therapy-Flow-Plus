import { requireSupabase } from "./supabase";
import { getCompanySession } from "./portal-session";

// Prioridade clínica, validação da triagem e resumo da fila (migração 0127).
// Esses indicadores NÃO mudam a ordem da fila: os critérios ainda precisam
// ser aprovados pela equipe técnica e pela instituição.

function creds() {
  const s = getCompanySession();
  if (!s?.companySlug || !s.adminToken) throw new Error("Sessão expirada. Faça login novamente.");
  return { p_slug: s.companySlug, p_password: s.adminToken };
}

export type NivelPrioridade = "maxima" | "elevada" | "moderada" | "habitual";

export const NIVEL_INFO: Record<NivelPrioridade, { label: string; desc: string; color: string; bg: string; border: string }> = {
  maxima:   { label: "Prioridade máxima",   desc: "Exige avaliação prioritária conforme protocolo clínico.", color: "#ef4444", bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.45)" },
  elevada:  { label: "Prioridade elevada",  desc: "Necessidades importantes que pedem atenção diferenciada.", color: "#f97316", bg: "rgba(249,115,22,0.12)", border: "rgba(249,115,22,0.45)" },
  moderada: { label: "Prioridade moderada", desc: "Demandas relevantes, sem sinais atuais de maior gravidade.", color: "#eab308", bg: "rgba(234,179,8,0.12)",  border: "rgba(234,179,8,0.45)" },
  habitual: { label: "Prioridade habitual", desc: "Pode seguir o fluxo regular de atendimento.", color: "#22c55e", bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.45)" },
};

export type PrioridadeOpcao = { valor: "nao" | "leve" | "grave"; label: string; pontos: number };
export const PRIORIDADE_OPCOES: PrioridadeOpcao[] = [
  { valor: "nao", label: "Não", pontos: 0 },
  { valor: "leve", label: "Sim, às vezes / leve", pontos: 1 },
  { valor: "grave", label: "Sim, frequente / intenso", pontos: 2 },
];

export type PrioridadePergunta = { key: string; pergunta: string; explicacao: string; risco?: boolean };

export const PRIORIDADE_PERGUNTAS: PrioridadePergunta[] = [
  { key: "perda_habilidades", pergunta: "Perda recente de habilidades já adquiridas (fala, marcha, controle esfincteriano)?", explicacao: "A criança deixou de fazer algo que já fazia, nos últimos meses?", risco: true },
  { key: "desregulacao", pergunta: "Desregulação comportamental intensa?", explicacao: "Crises fortes e difíceis de acalmar, que atrapalham a rotina.", },
  { key: "agressividade", pergunta: "Agressividade com risco de lesão a outras pessoas?", explicacao: "Bate, morde ou machuca alguém de forma que pode causar ferimento.", risco: true },
  { key: "autoagressao", pergunta: "Comportamento de autoagressão?", explicacao: "Machuca a si mesma (bate a cabeça, se morde, se arranha).", risco: true },
  { key: "motora", pergunta: "Dificuldade motora importante?", explicacao: "Tem muita dificuldade para sentar, ficar de pé, andar ou usar as mãos.", },
  { key: "funcional", pergunta: "Comprometimento funcional significativo?", explicacao: "Precisa de muita ajuda para as atividades do dia a dia.", },
  { key: "mobilidade", pergunta: "Dificuldade grave de mobilidade?", explicacao: "Não consegue se locomover sozinha ou depende de cadeira/colo.", },
  { key: "autonomia", pergunta: "Prejuízos importantes na autonomia (comer, vestir, higiene)?", explicacao: "Não consegue comer, se vestir ou se limpar sem ajuda, para a idade.", },
  { key: "escola", pergunta: "Desregulação severa no ambiente escolar?", explicacao: "A escola relata crises graves, afastamento ou redução de horário.", },
  { key: "outra", pergunta: "Outra situação clínica ou funcional que necessite avaliação prioritária?", explicacao: "Algo que a equipe considera urgente e não aparece nas perguntas acima.", },
];

export const EMERGENCIA_PERGUNTA = "Há risco imediato à vida ou à integridade (ex.: autolesão grave, convulsão sem controle, ideação suicida)?";
export const EMERGENCIA_ALERTA = "RISCO IMEDIATO: encaminhar agora ao serviço de saúde / urgência adequado. Não aguardar a fila.";

export type PrioridadeRespostas = Record<string, PrioridadeOpcao["valor"]>;

// Proposta inicial de critérios — precisa de validação da equipe técnica.
export function calcularPrioridade(r: PrioridadeRespostas): { nivel: NivelPrioridade; alertas: string[]; pontos: number } {
  let pontos = 0;
  let graves = 0;
  let riscoGrave = false;
  const alertas: string[] = [];
  for (const p of PRIORIDADE_PERGUNTAS) {
    const v = r[p.key];
    const op = PRIORIDADE_OPCOES.find((o) => o.valor === v);
    if (!op) continue;
    pontos += op.pontos;
    if (v === "grave") {
      graves++;
      if (p.risco) { riscoGrave = true; alertas.push(p.pergunta.replace(/\?$/, "")); }
    }
  }
  let nivel: NivelPrioridade = "habitual";
  if (riscoGrave || graves >= 3) nivel = "maxima";
  else if (graves >= 1 || pontos >= 6) nivel = "elevada";
  else if (pontos >= 1) nivel = "moderada";
  return { nivel, alertas, pontos };
}

export type PrioridadeClinica = {
  id: number; patientId: number; respostas: PrioridadeRespostas; nivel: NivelPrioridade;
  alertas: string[]; emergencia: boolean; responsavel: string | null; observacoes: string | null; createdAt: string;
};

export async function listPrioridadesClinicas(patientId: number): Promise<PrioridadeClinica[]> {
  const { data, error } = await requireSupabase().rpc("list_prioridades_clinicas", { ...creds(), p_patient_id: patientId });
  if (error) throw error;
  return (data ?? []) as PrioridadeClinica[];
}

export async function createPrioridadeClinica(input: {
  patientId: number; respostas: PrioridadeRespostas; nivel: NivelPrioridade; alertas: string[];
  emergencia: boolean; responsavel?: string; observacoes?: string;
}): Promise<PrioridadeClinica> {
  const { data, error } = await requireSupabase().rpc("create_prioridade_clinica", {
    ...creds(), p_patient_id: input.patientId, p_respostas: input.respostas, p_nivel: input.nivel,
    p_alertas: input.alertas, p_emergencia: input.emergencia,
    p_responsavel: input.responsavel ?? null, p_observacoes: input.observacoes ?? null,
  });
  if (error) throw error;
  return data as PrioridadeClinica;
}

export type DecisaoValidacao = "confirmada" | "sem_demanda" | "revisar";
export const DECISAO_INFO: Record<DecisaoValidacao, { label: string; color: string }> = {
  confirmada:  { label: "Demanda confirmada", color: "#22c55e" },
  sem_demanda: { label: "Sem demanda (justificado)", color: "#94a3b8" },
  revisar:     { label: "Revisar com a equipe", color: "#eab308" },
};

export const DEMANDA_NAO_IDENTIFICADA =
  "Demanda não identificada na triagem inicial — encaminhamento sujeito à avaliação e validação técnica.";

export type TriagemValidacao = {
  id: number; patientId: number; specialty: string; decisao: DecisaoValidacao; origem: "triagem" | "avaliacao";
  justificativa: string | null; responsavel: string | null; createdAt: string;
};

export async function listTriagemValidacoes(patientId: number): Promise<TriagemValidacao[]> {
  const { data, error } = await requireSupabase().rpc("list_triagem_validacoes", { ...creds(), p_patient_id: patientId });
  if (error) throw error;
  return (data ?? []) as TriagemValidacao[];
}

export async function createTriagemValidacao(input: {
  patientId: number; specialty: string; decisao: DecisaoValidacao; origem?: "triagem" | "avaliacao";
  justificativa?: string; responsavel?: string;
}): Promise<TriagemValidacao> {
  const { data, error } = await requireSupabase().rpc("create_triagem_validacao", {
    ...creds(), p_patient_id: input.patientId, p_specialty: input.specialty, p_decisao: input.decisao,
    p_origem: input.origem ?? "triagem", p_justificativa: input.justificativa ?? null, p_responsavel: input.responsavel ?? null,
  });
  if (error) throw error;
  return data as TriagemValidacao;
}

export type FilaIndicador = {
  prioridade: { nivel: NivelPrioridade; emergencia: boolean; createdAt: string } | null;
  social: { score: number; scoreMax: number; createdAt: string } | null;
  validacoes: Record<string, DecisaoValidacao>;
};

// Resumo por paciente. Antes da migração 0127 devolve vazio, sem erro.
export async function listFilaIndicadores(): Promise<Record<string, FilaIndicador>> {
  try {
    const { data, error } = await requireSupabase().rpc("list_fila_indicadores", creds());
    if (error) return {};
    return (data ?? {}) as Record<string, FilaIndicador>;
  } catch {
    return {};
  }
}
