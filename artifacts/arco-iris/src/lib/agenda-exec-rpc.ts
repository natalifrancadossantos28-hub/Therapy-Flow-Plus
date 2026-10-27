import { requireSupabase } from "./supabase";
import { getCompanySession, getDeviceCompanySlug } from "./portal-session";

// Agenda da Cláudia (migração 0133): agenda separada, com PIN pessoal.
// A sessão fica guardada no aparelho (o app instalado continua conectado).

const KEY = "nfs_agenda_exec";
export const SLUG_PADRAO = (import.meta.env.VITE_DEFAULT_COMPANY_SLUG as string | undefined) || "clinica-nfs";

export type Categoria = "reuniao" | "evento" | "visita" | "palestra" | "urgente" | "pessoal" | "outro";
export const CATEGORIAS: { id: Categoria; nome: string; cor: string }[] = [
  { id: "reuniao", nome: "Reunião", cor: "#3b82f6" },
  { id: "evento", nome: "Evento", cor: "#8b5cf6" },
  { id: "visita", nome: "Visita externa", cor: "#22c55e" },
  { id: "palestra", nome: "Palestra", cor: "#f59e0b" },
  { id: "urgente", nome: "Urgente", cor: "#ef4444" },
  { id: "pessoal", nome: "Pessoal", cor: "#ec4899" },
  { id: "outro", nome: "Outro", cor: "#94a3b8" },
];
export const categoria = (id: string) => CATEGORIAS.find((c) => c.id === id) ?? CATEGORIAS[CATEGORIAS.length - 1];

export type Pessoa = { id: number; nome: string; papel: "dona" | "gestora" };
export type AgxSessao = { slug: string; token: string; usuario: Pessoa; dona: { id: number; nome: string } };
export type AgxCompromisso = {
  id: number; titulo: string; data: string; hora: string | null; local: string | null; observacao: string | null;
  categoria: Categoria; avisarVespera: boolean; avisarDia: boolean; antecedenciaMin: number | null; concluido: boolean;
  criadoPor: string | null; atualizadoPor: string | null; createdAt: string; updatedAt: string;
};
export type AgxInput = Omit<AgxCompromisso, "id" | "concluido" | "criadoPor" | "atualizadoPor" | "createdAt" | "updatedAt"> & { id?: number | null };

export function getSessao(): AgxSessao | null {
  try { const r = localStorage.getItem(KEY); return r ? (JSON.parse(r) as AgxSessao) : null; } catch { return null; }
}
export const setSessao = (s: AgxSessao) => localStorage.setItem(KEY, JSON.stringify(s));
export const limparSessao = () => localStorage.removeItem(KEY);
export const slugDoAparelho = () => getDeviceCompanySlug() ?? SLUG_PADRAO;

type Erro = { code?: string; message?: string };
export const sessaoInvalida = (e: unknown) => (e as Erro)?.code === "28P01";
export const migracaoPendente = (e: unknown) =>
  (e as Erro)?.code === "PGRST202" || /could not find the function/i.test((e as Erro)?.message ?? "");

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await requireSupabase().rpc(fn, args);
  if (error) throw error;
  return data as T;
}
const tk = () => {
  const s = getSessao();
  if (!s) throw Object.assign(new Error("Entre com seu PIN."), { code: "28P01" });
  return s.token;
};

export const listarPessoas = (slug: string) =>
  rpc<(Pessoa & { donaNome: string })[]>("agenda_exec_usuarios_listar", { p_slug: slug });

export function criarDona(nome: string, pin: string) {
  const s = getCompanySession();
  if (!s?.companySlug || !s.adminToken) throw new Error("A Administração precisa entrar no NFs neste aparelho para criar a agenda.");
  return rpc<number>("agenda_exec_criar_dona", { p_slug: s.companySlug, p_password: s.adminToken, p_nome: nome, p_pin: pin });
}

export async function entrar(slug: string, usuarioId: number, pin: string): Promise<AgxSessao | { erro: string; ate?: string }> {
  const r = await rpc<{ token?: string; usuario?: Pessoa; dona?: { id: number; nome: string }; erro?: string; ate?: string }>(
    "agenda_exec_entrar", { p_slug: slug, p_usuario_id: usuarioId, p_pin: pin });
  if (r.erro || !r.token || !r.usuario || !r.dona) return { erro: r.erro ?? "pin", ate: r.ate };
  const s: AgxSessao = { slug, token: r.token, usuario: r.usuario, dona: r.dona };
  setSessao(s);
  return s;
}
export async function sair() {
  const s = getSessao();
  limparSessao();
  if (s) await rpc("agenda_exec_sair", { p_token: s.token }).catch(() => {});
}

export const listar = (de: string, ate: string) => rpc<AgxCompromisso[]>("agenda_exec_listar", { p_token: tk(), p_de: de, p_ate: ate });
export const salvar = (c: AgxInput) => rpc<AgxCompromisso>("agenda_exec_salvar", {
  p_token: tk(), p_id: c.id ?? null, p_titulo: c.titulo, p_data: c.data, p_hora: c.hora, p_local: c.local, p_observacao: c.observacao,
  p_categoria: c.categoria, p_avisar_vespera: c.avisarVespera, p_avisar_dia: c.avisarDia, p_antecedencia_min: c.antecedenciaMin,
});
export const concluir = (id: number, v: boolean) => rpc<void>("agenda_exec_concluir", { p_token: tk(), p_id: id, p_concluido: v });
export const excluir = (id: number) => rpc<void>("agenda_exec_excluir", { p_token: tk(), p_id: id });
export const historico = () => rpc<{ acao: string; titulo: string | null; em: string; por: string | null }[]>("agenda_exec_historico_listar", { p_token: tk() });

export const acessos = () => rpc<{ id: number; nome: string; createdAt: string }[]>("agenda_exec_acessos", { p_token: tk() });
export const autorizar = (nome: string, pin: string) => rpc<number>("agenda_exec_autorizar", { p_token: tk(), p_nome: nome, p_pin: pin });
export const revogar = (id: number) => rpc<void>("agenda_exec_revogar", { p_token: tk(), p_usuario_id: id });
export const trocarPin = (atual: string, novo: string) => rpc<void>("agenda_exec_trocar_pin", { p_token: tk(), p_pin_atual: atual, p_pin_novo: novo });

export const chavePush = () => rpc<string | null>("agenda_exec_push_chave");
export const registrarPush = (endpoint: string, p256dh: string, auth: string, aparelho: string) =>
  rpc<void>("agenda_exec_push_registrar", { p_token: tk(), p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth, p_aparelho: aparelho });
export const removerPush = (endpoint: string) => rpc<void>("agenda_exec_push_remover", { p_token: tk(), p_endpoint: endpoint });
export const statusPush = (endpoint: string | null) => rpc<{
  configurado: boolean; aparelhos: number; esteAparelho: { ultimoOk: string | null; ultimoErro: string | null } | null;
}>("agenda_exec_push_status", { p_token: tk(), p_endpoint: endpoint });
export const testarPush = (atrasoSeg = 0) => rpc<number>("agenda_exec_push_testar", { p_token: tk(), p_atraso_seg: atrasoSeg });
