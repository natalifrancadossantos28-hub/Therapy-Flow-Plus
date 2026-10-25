import { requireSupabase } from "./supabase";
import { getCompanySession } from "./portal-session";
import type { Respostas86, Social86 } from "./triagem-86";

// Triagem 86, regras/pesos da fila (simulação) e situação por especialidade
// (migração 0128). As regras salvas aqui NÃO mudam a ordem real da fila.

function creds() {
  const s = getCompanySession();
  if (!s?.companySlug || !s.adminToken) throw new Error("Sessão expirada. Faça login novamente.");
  return { p_slug: s.companySlug, p_password: s.adminToken };
}

export type Triagem86 = {
  id: number; patientId: number; respostas: Respostas86; social: Social86;
  resultado: { somas?: Record<string, number> }; responsavel: string | null; createdAt: string;
  encaminhamento?: Encaminhamento86 | null;
};

/** Registro do encaminhamento à fila (migração 0130): todas as áreas com ≥ 9 pontos (+ Fisio para bebê < 2 anos). */
export type Encaminhamento86 = {
  em: string; origem: string; criterio: string;
  areas: { especialidade: string; pontos: number; respondidas: number; encaminhada: boolean }[];
  encaminhadas: string[]; adicionadas: string[]; jaNaFila: string[];
  prioridade?: string | null; reason?: string | null;
};
export type SaveTriagem86Result = {
  triagem: Triagem86; encaminhamento?: Encaminhamento86 | null; addedToQueue: boolean; linkedOnly: boolean; reason?: string | null;
  priority?: string | null; specialties?: string[]; addedSpecialties?: string[]; existingSpecialties?: string[];
};

/** `enfileirar = false`: só salva; o encaminhamento à fila fica para `encaminharTriagem86` (fim do fluxo Triagem → ABC). */
export async function saveTriagem86(patientId: number, respostas: Respostas86, social: Social86, responsavel: string, enfileirar = true): Promise<SaveTriagem86Result> {
  const { data, error } = await requireSupabase().rpc("save_triagem_86", {
    ...creds(), p_patient_id: patientId, p_respostas: respostas, p_social: social, p_responsavel: responsavel || null,
    p_enfileirar: enfileirar,
  });
  if (error) throw error;
  return data as SaveTriagem86Result;
}

export async function encaminharTriagem86(triagemId: number): Promise<SaveTriagem86Result> {
  const { data, error } = await requireSupabase().rpc("encaminhar_triagem_86", { ...creds(), p_triagem_id: triagemId });
  if (error) throw error;
  return data as SaveTriagem86Result;
}

export async function listTriagens86(patientId: number): Promise<Triagem86[]> {
  const { data, error } = await requireSupabase().rpc("list_triagens_86", { ...creds(), p_patient_id: patientId });
  if (error) throw error;
  return (data ?? []) as Triagem86[];
}

export type Triagem86Resumo = { id: number; createdAt: string; prioridades: string[]; social: string[] };
export async function listTriagens86Resumo(): Promise<Record<string, Triagem86Resumo>> {
  const { data, error } = await requireSupabase().rpc("list_triagens_86_resumo", creds());
  if (error) throw error;
  return (data ?? {}) as Record<string, Triagem86Resumo>;
}

// ── Regras / pesos ──────────────────────────────────────────────────────
export type PesosFila = {
  porSinalPrioridade: number;
  porSinalSocial: number;
  porMesEspera: number;
  limiteMesesEspera: number;
  porEspecialidade: Record<string, { porSinalPrioridade?: number; porSinalSocial?: number }>;
};
// Padrão neutro: todos os pesos em zero = mesma ordem de hoje. A instituição
// define os valores; o sistema não inventa pesos clínicos.
export const PESOS_NEUTROS: PesosFila = {
  porSinalPrioridade: 0, porSinalSocial: 0, porMesEspera: 0, limiteMesesEspera: 24, porEspecialidade: {},
};
export type FilaRegras = { id: number; pesos: PesosFila; status: "rascunho" | "validada"; responsavel: string | null; observacoes: string | null; createdAt: string };

export async function listFilaRegras(): Promise<FilaRegras[]> {
  const { data, error } = await requireSupabase().rpc("list_fila_regras", creds());
  if (error) throw error;
  return (data ?? []) as FilaRegras[];
}
export async function saveFilaRegras(input: { senha: string; pesos: PesosFila; status: "rascunho" | "validada"; responsavel: string; observacoes: string }): Promise<FilaRegras> {
  const s = getCompanySession();
  if (!s?.companySlug) throw new Error("Sessão expirada. Faça login novamente.");
  const { data, error } = await requireSupabase().rpc("save_fila_regras", {
    p_slug: s.companySlug, p_password: input.senha, p_pesos: input.pesos, p_status: input.status,
    p_responsavel: input.responsavel || null, p_observacoes: input.observacoes || null,
  });
  if (error) throw error;
  return data as FilaRegras;
}

// ── Situação na fila ────────────────────────────────────────────────────
export type Situacao = "aguardando" | "convocado" | "em_avaliacao" | "agendado" | "demanda_nao_confirmada";
export const SITUACAO_INFO: Record<Situacao, { label: string; color: string }> = {
  aguardando: { label: "Aguardando", color: "#94a3b8" },
  convocado: { label: "Convocado", color: "#22d3ee" },
  em_avaliacao: { label: "Em avaliação", color: "#a78bfa" },
  agendado: { label: "Agendado", color: "#34d399" },
  demanda_nao_confirmada: { label: "Demanda não confirmada", color: "#f87171" },
};
export type FilaSituacao = {
  id: number; waitingListId: number | null; patientId: number; specialty: string;
  situacao: Situacao; justificativa: string | null; responsavel: string | null; createdAt: string;
};
export async function listFilaSituacoes(): Promise<FilaSituacao[]> {
  const { data, error } = await requireSupabase().rpc("list_fila_situacoes", creds());
  if (error) throw error;
  return (data ?? []) as FilaSituacao[];
}
export async function createFilaSituacao(waitingListId: number, situacao: Situacao, justificativa: string, responsavel: string): Promise<FilaSituacao> {
  const { data, error } = await requireSupabase().rpc("create_fila_situacao", {
    ...creds(), p_waiting_list_id: waitingListId, p_situacao: situacao,
    p_justificativa: justificativa || null, p_responsavel: responsavel || null,
  });
  if (error) throw error;
  return data as FilaSituacao;
}
