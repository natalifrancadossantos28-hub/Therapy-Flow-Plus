import { useState } from "react";
import { Headset, X, Send, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { createRecadoEquipe } from "@/lib/arco-rpc";
import { getCurrentScope, getProfessionalSession } from "@/lib/portal-session";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const TIPOS = ["Dúvida", "Problema no sistema", "Sugestão", "Urgente"] as const;

/** Botão "Falar com o suporte": a mensagem chega em Recados da Equipe (administração). */
export function SuporteBotao({ className, profissional }: { className?: string; profissional?: { id: number; name: string } | null }) {
  const { toast } = useToast();
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]>("Dúvida");
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [minimizado, setMinimizado] = useState(() => {
    try { return localStorage.getItem("nfs_suporte_min") === "1"; } catch { return false; }
  });
  const minimizar = (v: boolean) => {
    setMinimizado(v);
    try { localStorage.setItem("nfs_suporte_min", v ? "1" : "0"); } catch { /* ignore */ }
  };

  const scope = getCurrentScope();
  const sessao = getProfessionalSession();
  const prof = profissional ? { professionalId: profissional.id, professionalName: profissional.name } : sessao;
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
      {/* Só o ícone (o texto aparece ao passar o mouse) e pode ser recolhido para a borda, para não cobrir botões e textos. */}
      {minimizado ? (
        <button type="button" onClick={() => minimizar(false)} aria-label="Mostrar botão Falar com o suporte" title="Falar com o suporte"
          className={cn("fixed z-40 right-0 flex items-center gap-0.5 rounded-l-xl bg-gradient-to-br from-violet-500 to-violet-700 text-white py-2 pl-1 pr-1.5 opacity-80 hover:opacity-100 shadow-[0_6px_16px_-8px_rgba(109,40,217,.7)] transition", className ?? "bottom-4")}>
          <ChevronLeft className="w-3.5 h-3.5" /><Headset className="w-4 h-4" />
        </button>
      ) : (
        <div className={cn("fixed z-40 right-3 group flex items-center gap-1", className ?? "bottom-4")}>
          <button type="button" onClick={() => minimizar(true)} aria-label="Recolher botão do suporte" title="Recolher"
            className="grid place-items-center w-6 h-6 rounded-full bg-black/45 text-white/90 hover:bg-black/70 transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={() => setAberto(true)} aria-label="Falar com o suporte" title="Falar com o suporte"
            className="flex items-center gap-2 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 text-white font-semibold p-3 shadow-[0_10px_24px_-8px_rgba(109,40,217,.7)] hover:brightness-110 transition">
            <Headset className="w-5 h-5" />
            <span className="hidden max-w-0 overflow-hidden whitespace-nowrap transition-all duration-200 sm:inline group-hover:max-w-[12rem] group-hover:pr-1">Falar com o suporte</span>
          </button>
        </div>
      )}
      {aberto && (
        <div className="fixed inset-0 overflow-y-auto z-[70] flex items-end-safe sm:items-center-safe justify-center p-3 bg-black/40 backdrop-blur-sm" role="dialog" aria-label="Falar com o suporte" onClick={() => !enviando && setAberto(false)}>
          <div className="w-full max-w-md max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl space-y-4 text-[#1e1b4b]" onClick={(e) => e.stopPropagation()}>
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
