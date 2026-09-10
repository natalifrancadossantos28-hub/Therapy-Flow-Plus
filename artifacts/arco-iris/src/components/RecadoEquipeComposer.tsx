import { useState } from "react";
import { MessageSquarePlus, Send, ChevronDown, ChevronUp } from "lucide-react";
import { createRecadoEquipe } from "@/lib/arco-rpc";
import { useToast } from "@/hooks/use-toast";

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

  const enviar = async () => {
    const texto = mensagem.trim();
    if (!texto || sending) return;
    setSending(true);
    try {
      await createRecadoEquipe({ professionalId, professionalName, specialty: specialty ?? null, mensagem: texto });
      setMensagem("");
      setOpen(false);
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
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
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
        </div>
      )}
    </div>
  );
}
