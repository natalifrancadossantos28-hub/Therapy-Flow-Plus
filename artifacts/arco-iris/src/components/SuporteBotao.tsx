import { useState } from "react";
import { Headset, X, Send, Loader2 } from "lucide-react";
import { createRecadoEquipe } from "@/lib/arco-rpc";
import { getCurrentScope, getProfessionalSession } from "@/lib/portal-session";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const TIPOS = ["Dúvida", "Problema no sistema", "Sugestão", "Urgente"] as const;

/** Botão "Falar com o suporte": a mensagem chega em Recados da Equipe (administração). */
export function SuporteBotao({ className }: { className?: string }) {
  const { toast } = useToast();
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]>("Dúvida");
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);

  const scope = getCurrentScope();
  const prof = getProfessionalSession();
  const quem = prof?.professionalName ?? (scope === "reception" ? "Recepção" : "Administração");

  const enviar = async () => {
    const texto = mensagem.trim();
    if (!texto) return;
    setEnviando(true);
    try {
      const tela = window.location.pathname.replace(import.meta.env.BASE_URL.replace(/\/$/, ""), "") || "/";
      await createRecadoEquipe({
        professionalId: prof?.professionalId ?? null,
        professionalName: quem,
        specialty: `Suporte · ${tipo}`,
        mensagem: `${texto}\n\n— Tela: ${tela} · ${new Date().toLocaleString("pt-BR")}`,
      });
      toast({ title: "Mensagem enviada ao suporte", description: "Você será avisado(a) assim que for respondida." });
      setMensagem(""); setTipo("Dúvida"); setAberto(false);
    } catch (err: any) {
      toast({ title: "Não foi possível enviar", description: err?.message ?? "Tente de novo.", variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => setAberto(true)} aria-label="Falar com o suporte"
        className={cn("fixed z-40 right-4 flex items-center gap-2 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 text-white font-semibold p-3 sm:pl-3 sm:pr-4 shadow-[0_10px_24px_-8px_rgba(109,40,217,.7)] hover:brightness-110 transition", className ?? "bottom-4")}>
        <Headset className="w-5 h-5" /> <span className="hidden sm:inline">Falar com o suporte</span>
      </button>
      {aberto && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-3 bg-black/40 backdrop-blur-sm" role="dialog" aria-label="Falar com o suporte" onClick={() => !enviando && setAberto(false)}>
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl space-y-4 text-[#1e1b4b]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <span className="grid place-items-center w-12 h-12 rounded-2xl bg-violet-100 text-violet-700 shrink-0"><Headset className="w-6 h-6" /></span>
              <div className="flex-1">
                <p className="text-2xl font-extrabold">Falar com o suporte</p>
                <p className="text-base text-[#3b3561]">Enviando como <b>{quem}</b></p>
              </div>
              <button type="button" onClick={() => setAberto(false)} aria-label="Fechar" className="grid place-items-center w-11 h-11 rounded-full bg-violet-50 text-violet-800"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex flex-wrap gap-2">
              {TIPOS.map((t) => (
                <button key={t} type="button" onClick={() => setTipo(t)}
                  className={cn("rounded-full border px-4 py-2 text-base font-semibold", tipo === t ? (t === "Urgente" ? "border-rose-500 bg-rose-50 text-rose-700" : "border-violet-600 bg-violet-50 text-violet-800") : "border-violet-200 text-[#3b3561]")}>
                  {t}
                </button>
              ))}
            </div>
            <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={5} autoFocus
              placeholder="Escreva o que está acontecendo. Ex.: não consigo marcar falta na agenda da Gabrielly."
              className="w-full rounded-2xl border border-violet-200 px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-violet-400" />
            <button type="button" onClick={enviar} disabled={!mensagem.trim() || enviando}
              className="w-full rounded-2xl py-3 text-lg font-bold text-white bg-gradient-to-br from-violet-500 to-violet-700 disabled:opacity-40 flex items-center justify-center gap-2">
              {enviando ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />} Enviar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
