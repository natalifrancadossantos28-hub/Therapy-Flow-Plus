import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquarePlus, Send, ChevronDown, ChevronUp, RefreshCw, Trash2 } from "lucide-react";
import { createRecadoEquipe, deleteRecadoEquipe, listRecadosEquipeDoProfissional, type RecadoEquipe, type RecadoEquipeStatus } from "@/lib/arco-rpc";
import { RECADO_STATUS_META, recadoStatusOf } from "@/lib/recado-status";
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
  const [excluindoId, setExcluindoId] = useState<number | null>(null);

  // O status é definido pela administração em "Recados da Equipe"; aqui o
  // profissional só acompanha. Falha silenciosa: o envio continua funcionando
  // mesmo com a migração 0104 pendente.
  const carregarMeus = useCallback(() => {
    if (professionalId == null) return;
    listRecadosEquipeDoProfissional(professionalId).then(setMeus).catch(() => undefined);
  }, [professionalId]);

  useEffect(() => { carregarMeus(); }, [carregarMeus]);
  useVisibleInterval(carregarMeus, 60_000);

  const resumo = useMemo(() => {
    const c: Record<RecadoEquipeStatus, number> = { pendente: 0, em_andamento: 0, resolvido: 0 };
    for (const r of meus) c[recadoStatusOf(r)]++;
    return (Object.entries(c) as [RecadoEquipeStatus, number][]).filter(([, n]) => n > 0);
  }, [meus]);

  // Só o que a administração ainda não resolveu; resolvido vira histórico.
  const excluir = async (r: RecadoEquipe) => {
    if (professionalId == null || excluindoId != null) return;
    if (!confirm("Excluir este recado? A administração deixa de vê-lo.")) return;
    setExcluindoId(r.id);
    try {
      await deleteRecadoEquipe(r.id, professionalId);
      setMeus(prev => prev.filter(m => m.id !== r.id));
      toast({ title: "Recado excluído" });
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

          {meus.length > 0 && (
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
                {meus.map(r => {
                  const status = recadoStatusOf(r);
                  const meta = RECADO_STATUS_META[status];
                  const podeExcluir = status !== "resolvido";
                  return (
                    <li key={r.id} className="rounded-xl border border-border bg-muted/40 px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-foreground whitespace-pre-wrap break-words">{r.mensagem}</p>
                        <span className="shrink-0 inline-flex items-center gap-2">
                          <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border", meta.badge)}>
                            <span className={cn("w-1.5 h-1.5 rounded-full", meta.dot)} />
                            {meta.label}
                          </span>
                          {podeExcluir && (
                            <button
                              type="button"
                              onClick={() => excluir(r)}
                              disabled={excluindoId === r.id}
                              title="Excluir recado"
                              className="text-muted-foreground hover:text-red-400 disabled:opacity-50 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Enviado em {fmtDateTime(r.createdAt)}
                        {recadoStatusOf(r) === "resolvido" && r.resolvedAt ? ` · resolvido em ${fmtDateTime(r.resolvedAt)}` : ""}
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
