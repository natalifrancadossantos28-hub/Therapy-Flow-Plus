import type { BuscaAtivaStatus, RecadoEquipe, RecadoEquipeStatus } from "@/lib/arco-rpc";

/** Cores do selo de status do recado, iguais na Administração e no Portal. */
export const RECADO_STATUS_META: Record<RecadoEquipeStatus, { label: string; badge: string; dot: string }> = {
  pendente:     { label: "Pendente",     badge: "bg-amber-500/15 text-amber-300 border-amber-400/40",       dot: "bg-amber-400" },
  em_andamento: { label: "Em andamento", badge: "bg-sky-500/15 text-sky-300 border-sky-400/40",             dot: "bg-sky-400" },
  resolvido:    { label: "Resolvido",    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-400/40", dot: "bg-emerald-400" },
};

export const recadoStatusOf = (r: RecadoEquipe): RecadoEquipeStatus => r.status ?? "pendente";

/** Selo do card de retorno da Busca Ativa, no mesmo padrão dos recados. */
export const BUSCA_RETORNO_STATUS_META: Record<BuscaAtivaStatus, { label: string; badge: string; dot: string }> = {
  ...RECADO_STATUS_META,
  nao_resolvido: { label: "Não resolvido", badge: "bg-red-500/15 text-red-300 border-red-400/40",          dot: "bg-red-400" },
  finalizado:    { label: "Finalizado",    badge: "bg-violet-500/15 text-violet-300 border-violet-400/40", dot: "bg-violet-400" },
};
