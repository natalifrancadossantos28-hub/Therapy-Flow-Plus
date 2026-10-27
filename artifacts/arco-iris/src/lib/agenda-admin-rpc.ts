import { requireSupabase } from "./supabase";
import { getCompanySession } from "./portal-session";

// Agenda Administrativa (migração 0130): reuniões e compromissos da Administração.

function creds() {
  const s = getCompanySession();
  if (!s?.companySlug || !s.adminToken) throw new Error("Sessão expirada. Faça login novamente.");
  return { p_slug: s.companySlug, p_password: s.adminToken };
}

export type Compromisso = {
  id: number; titulo: string; data: string; hora: string; local: string | null; observacao: string | null;
  antecedenciaMin: number; concluido: boolean; createdAt: string;
};
export type CompromissoInput = {
  id?: number | null; titulo: string; data: string; hora: string;
  local?: string | null; observacao?: string | null; antecedenciaMin: number;
};

/** A migração 0130 ainda não foi rodada (função/tabela inexistente). */
export function migracaoPendente(e: unknown): boolean {
  const c = (e as { code?: string } | null)?.code;
  return c === "PGRST202" || c === "PGRST205" || c === "42P01" || c === "42883";
}

export async function listCompromissos(from: string, to: string): Promise<Compromisso[]> {
  const { data, error } = await requireSupabase().rpc("list_admin_compromissos", { ...creds(), p_from: from, p_to: to });
  if (error) throw error;
  return (data ?? []) as Compromisso[];
}

export async function saveCompromisso(i: CompromissoInput): Promise<Compromisso> {
  const { data, error } = await requireSupabase().rpc("save_admin_compromisso", {
    ...creds(), p_id: i.id ?? null, p_titulo: i.titulo, p_data: i.data, p_hora: i.hora,
    p_local: i.local || null, p_observacao: i.observacao || null, p_antecedencia_min: i.antecedenciaMin,
  });
  if (error) throw error;
  return data as Compromisso;
}

export async function setCompromissoConcluido(id: number, concluido: boolean): Promise<Compromisso> {
  const { data, error } = await requireSupabase().rpc("set_admin_compromisso_concluido", { ...creds(), p_id: id, p_concluido: concluido });
  if (error) throw error;
  return data as Compromisso;
}

export async function deleteCompromisso(id: number): Promise<void> {
  const { error } = await requireSupabase().rpc("delete_admin_compromisso", { ...creds(), p_id: id });
  if (error) throw error;
}
