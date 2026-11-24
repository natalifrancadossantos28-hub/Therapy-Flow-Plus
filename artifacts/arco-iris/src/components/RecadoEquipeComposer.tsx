import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquarePlus, Send, ChevronDown, ChevronUp, RefreshCw, Trash2, ShieldAlert } from "lucide-react";
import {
  createRecadoEquipe, deleteRecadoEquipe, listRecadosEquipeDoProfissional,
  listBuscaAtivaRetornosDoProfissional, ocultarBuscaAtivaRetorno,
  type BuscaAtivaRetorno, type RecadoEquipe, type RecadoEquipeStatus,
} from "@/lib/arco-rpc";
import { BUSCA_RETORNO_STATUS_META, RECADO_STATUS_META, recadoStatusOf } from "@/lib/recado-status";
import { useToast } from "@/hooks/use-toast";
import { useVisibleInterval } from "@/hooks/usePageVisible";
import { cn } from "@/lib/utils";

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

type Props = {
  professionalId: number | null;
  professionalName: string;
  specialty?: string | null;
};

/** Campo de recados/sugestões do profissional para a administração. */
export function RecadoEquipeComposer({ professionalId, professionalName, specialty }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [sending, setSending] = useState(false);
  const [meus, setMeus] = useState<RecadoEquipe[]>([]);
  const [retornos, setRetornos] = useState<BuscaAtivaRetorno[]>([]);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);

  // O status é definido pela administração em "Recados da Equipe"; aqui o
  // profissional só acompanha. Falha silenciosa: o envio continua funcionando
  // mesmo com a migração 0104 pendente.
  const carregarMeus = useCallback(() => {
    if (professionalId == null) return;
    listRecadosEquipeDoProfissional(professionalId).then(setMeus).catch(() => undefined);
    listBuscaAtivaRetornosDoProfissional(professionalId).then(setRetornos).catch(() => undefined);
  }, [professionalId]);

  useEffect(() => { carregarMeus(); }, [carregarMeus]);
  useVisibleInterval(carregarMeus, 60_000);

  const resumo = useMemo(() => {
    const c: Record<RecadoEquipeStatus, number> = { pendente: 0, em_andamento: 0, resolvido: 0 };
    for (const r of meus) c[recadoStatusOf(r)]++;
    return (Object.entries(c) as [RecadoEquipeStatus, number][]).filter(([, n]) => n > 0);
  }, [meus]);

  type Item = { kind: "recado"; r: RecadoEquipe; at: string } | { kind: "busca"; b: BuscaAtivaRetorno; at: string };
  const itens = useMemo<Item[]>(() => [
    ...meus.map(r => ({ kind: "recado" as const, r, at: r.createdAt })),
    ...retornos.map(b => ({ kind: "busca" as const, b, at: b.updatedAt })),
  ].sort((a, b) => b.at.localeCompare(a.at)), [meus, retornos]);

  // Recado não resolvido é apagado; resolvido e retorno da busca ativa só
  // saem da lista do profissional (a administração mantém o histórico).
  const excluir = async (item: Item) => {
    if (professionalId == null || excluindoId != null) return;
    const key = item.kind === "recado" ? `r${item.r.id}` : `b${item.b.id}`;
    const pergunta = item.kind === "busca"
      ? "Apagar este retorno da busca ativa da sua lista? O caso continua guardado com a equipe."
      : recadoStatusOf(item.r) === "resolvido"
        ? "Apagar este recado resolvido da sua lista?"
        : "Excluir este recado? A administração deixa de vê-lo.";
    if (!confirm(pergunta)) return;
    setExcluindoId(key);
    try {
      if (item.kind === "recado") {
        await deleteRecadoEquipe(item.r.id, professionalId);
        setMeus(prev => prev.filter(m => m.id !== item.r.id));
      } else {
        await ocultarBuscaAtivaRetorno(item.b.id, professionalId);
        setRetornos(prev => prev.filter(m => m.id !== item.b.id));
      }
      toast({ title: "Apagado da sua lista" });
    } catch (e) {
      toast({
        title: "Não foi possível excluir",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
      carregarMeus();
    } finally {
      setExcluindoId(null);
    }
  };

  const enviar = async () => {
    const texto = mensagem.trim();
    if (!texto || sending) return;
    setSending(true);
    try {
      await createRecadoEquipe({ professionalId, professionalName, specialty: specialty ?? null, mensagem: texto });
      setMensagem("");
      carregarMeus();
      toast({ title: "Recado enviado", description: "A administração receberá sua mensagem em \"Recados da Equipe\"." });
    } catch (e) {
      const msg =
        e instanceof Error ? e.message
        : typeof e === "object" && e !== null && "message" in e && typeof (e as { message: unknown }).message === "string"
          ? (e as { message: string }).message
          : "Tente novamente.";
      const semFuncao = /create_recado_equipe|schema cache|does not exist/i.test(msg);
      toast({
        title: "Não foi possível enviar",
        description: semFuncao
          ? "O módulo de recados ainda não foi ativado no banco de dados (migração 0097 pendente). Avise a administração."
          : msg,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-2xl border border-violet-400/30 bg-card shadow-[0_0_20px_rgba(167,139,250,0.08)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-violet-400/5 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-violet-400">
          <MessageSquarePlus className="w-4 h-4" />
          Recado / sugestão para a administração
        </span>
        <span className="flex items-center gap-2">
          {!open && retornos.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-rose-500/15 text-rose-300 border-rose-400/40">
              <ShieldAlert className="w-3 h-3" />
              {retornos.length} Busca ativa
            </span>
          )}
          {!open && resumo.map(([status, n]) => {
            const meta = RECADO_STATUS_META[status];
            return (
              <span key={status} className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border", meta.badge)}>
                <span className={cn("w-1.5 h-1.5 rounded-full", meta.dot)} />
                {n} {meta.label}
              </span>
            );
          })}
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Enviado como <strong className="text-foreground">{professionalName}</strong>{specialty ? ` (${specialty})` : ""}. A gestão vê todos os recados organizados por data e profissional.
          </p>
          <textarea
            value={mensagem}
            onChange={e => setMensagem(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Escreva aqui seu recado, sugestão ou solicitação..."
            className="w-full rounded-xl border border-border bg-muted px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-violet-400/40 resize-y"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-muted-foreground">{mensagem.length}/2000</span>
            <button
              type="button"
              onClick={enviar}
              disabled={!mensagem.trim() || sending}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-bold hover:bg-violet-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Send className="w-4 h-4" />
              {sending ? "Enviando..." : "Enviar recado"}
            </button>
          </div>

          {itens.length > 0 && (
            <div className="pt-2 border-t border-border space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Meus recados e o andamento</span>
                <button
                  type="button"
                  onClick={carregarMeus}
                  title="Atualizar status"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Atualizar
                </button>
              </div>
              <ul className="space-y-2">
                {itens.map(item => {
                  const key = item.kind === "recado" ? `r${item.r.id}` : `b${item.b.id}`;
                  const meta = item.kind === "recado"
                    ? RECADO_STATUS_META[recadoStatusOf(item.r)]
                    : BUSCA_RETORNO_STATUS_META[item.b.status] ?? BUSCA_RETORNO_STATUS_META.pendente;
                  return (
                    <li key={key} className={cn("rounded-xl border px-3 py-2", item.kind === "busca" ? "border-rose-400/30 bg-rose-500/5" : "border-border bg-muted/40")}>
                      <div className="flex items-start justify-between gap-2">
                        {item.kind === "recado" ? (
                          <p className="text-sm text-foreground whitespace-pre-wrap break-words">{item.r.mensagem}</p>
                        ) : (
                          <div className="min-w-0">
                            <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-rose-400">
                              <ShieldAlert className="w-3 h-3" /> Retorno da busca ativa
                            </p>
                            <p className="text-sm font-bold text-foreground break-words">
                              {item.b.prontuario ? `[${item.b.prontuario}] ` : ""}{item.b.patientName}
                            </p>
                            <p className="text-sm text-foreground whitespace-pre-wrap break-words mt-0.5">
                              {item.b.obs || <span className="text-muted-foreground italic">Sem observação da equipe.</span>}
                            </p>
                            {item.b.status === "finalizado" && item.b.saida && (
                              <p className="text-xs text-muted-foreground mt-0.5">{item.b.saida}</p>
                            )}
                          </div>
                        )}
                        <span className="shrink-0 inline-flex items-center gap-2">
                          <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border", meta.badge)}>
                            <span className={cn("w-1.5 h-1.5 rounded-full", meta.dot)} />
                            {meta.label}
                          </span>
                          <button
                            type="button"
                            onClick={() => excluir(item)}
                            disabled={excluindoId === key}
                            title="Apagar"
                            aria-label="Apagar"
                            className="p-1 -m-1 text-muted-foreground hover:text-red-400 disabled:opacity-50 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {item.kind === "recado" ? (
                          <>
                            Enviado em {fmtDateTime(item.r.createdAt)}
                            {recadoStatusOf(item.r) === "resolvido" && item.r.resolvedAt ? ` · resolvido em ${fmtDateTime(item.r.resolvedAt)}` : ""}
                          </>
                        ) : (
                          <>
                            {item.b.status === "finalizado" && item.b.finalizadoAt
                              ? `Finalizado em ${fmtDateTime(item.b.finalizadoAt)}`
                              : `Atualizado em ${fmtDateTime(item.b.updatedAt)}`}
                            {` · encaminhado em ${fmtDateTime(item.b.createdAt)}`}
                          </>
                        )}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
