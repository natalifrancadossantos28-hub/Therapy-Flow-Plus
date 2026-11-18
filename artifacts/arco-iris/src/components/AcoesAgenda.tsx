import { useEffect, type ButtonHTMLAttributes, type ComponentType, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Icone = ComponentType<{ className?: string; strokeWidth?: number; style?: React.CSSProperties }>;

const ESCURO = "#1e1b4b";
const CORES = {
  verde: ["#86efac", "#4ade80", "#15803d", "rgba(34,197,94,.7)", ESCURO, "#14532d"],
  azul: ["#60a5fa", "#3b82f6", "#1d4ed8", "rgba(59,130,246,.7)", "#fff", "#fff"],
  violeta: ["#ede9fe", "#c4b5fd", "#8b5cf6", "rgba(139,92,246,.6)", ESCURO, "#4c1d95"],
  amarelo: ["#fcd34d", "#fbbf24", "#d97706", "rgba(245,158,11,.7)", ESCURO, "#92400e"],
  vermelho: ["#fda4af", "#fb7185", "#e11d48", "rgba(244,63,94,.7)", ESCURO, "#9f1239"],
  cinza: ["#cbd5e1", "#a5b4c8", "#64748b", "rgba(100,116,139,.6)", ESCURO, ESCURO],
  laranja: ["#fdba74", "#fb923c", "#ea580c", "rgba(249,115,22,.7)", ESCURO, "#9a3412"],
  roxo: ["#c4b5fd", "#a78bfa", "#7c3aed", "rgba(124,58,237,.65)", ESCURO, "#3b0764"],
  ciano: ["#a5f3fc", "#67e8f9", "#0891b2", "rgba(6,182,212,.65)", ESCURO, "#155e75"],
  rosa: ["#f9a8d4", "#f472b6", "#db2777", "rgba(236,72,153,.65)", ESCURO, "#831843"],
  indigo: ["#818cf8", "#6d28d9", "#4c1d95", "rgba(109,40,217,.75)", "#fff", "#fff"],
  turquesa: ["#67e8f9", "#0891b2", "#155e75", "rgba(8,145,178,.75)", "#fff", "#fff"],
  marinho: ["#60a5fa", "#1d4ed8", "#1e3a8a", "rgba(29,78,216,.75)", "#fff", "#fff"],
  perigo: ["#fb7185", "#e11d48", "#9f1239", "rgba(225,29,72,.8)", "#fff", "#fff"],
} as const;
export type CorAcao = keyof typeof CORES;

/** Janela "Ações" do agendamento: painel lilás de vidro, centralizado (cabe no celular). */
export function PainelAcoes({ titulo = "Ações", nome, onClose, children }: {
  titulo?: string; nome: string; onClose: () => void; children: ReactNode;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  return createPortal(
    <div
      data-acoes-painel
      className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6 bg-[#0b0820]/45 backdrop-blur-[3px]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${titulo} — ${nome}`}
        className="relative w-full max-w-[440px] max-h-[calc(100dvh-24px)] overflow-y-auto overscroll-contain rounded-[34px] border-2 border-white/80 p-4 sm:p-5 flex flex-col gap-3 [&>*]:shrink-0 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200"
        style={{
          color: ESCURO,
          background: "radial-gradient(120% 60% at 100% 0%, rgba(244,114,182,.22), transparent 60%), radial-gradient(90% 50% at 0% 100%, rgba(56,189,248,.18), transparent 60%), linear-gradient(165deg, rgba(248,246,255,.86), rgba(221,214,254,.8) 45%, rgba(237,233,254,.86))",
          boxShadow: "0 0 0 1px rgba(167,139,250,.55), 0 0 44px -4px rgba(168,85,247,.9), 0 30px 60px -20px rgba(0,0,0,.6)",
        }}
      >
        <div className="flex items-center gap-3 mb-1">
          <div className="relative shrink-0 w-[72px] h-[72px] rounded-full border-[3px] border-white shadow-[0_0_18px_-2px_rgba(139,92,246,.9),0_6px_16px_-4px_rgba(76,29,149,.7)]">
            <img src={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/visual/avatar-acoes.webp`} alt="" aria-hidden width={256} height={256} className="w-full h-full rounded-full object-cover" />
            <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full grid place-items-center bg-violet-600 border-2 border-white">
              <Check className="w-3.5 h-3.5 text-white" strokeWidth={3.5} />
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display font-extrabold text-[32px] leading-none !text-[#1e1b4b]">{titulo}</h2>
            <p className="mt-1 text-[17px] font-medium text-[#2e1065] leading-tight line-clamp-2">{nome}</p>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="shrink-0 w-12 h-12 rounded-full grid place-items-center bg-white/85 border border-white shadow-[0_4px_12px_-2px_rgba(76,29,149,.45)] hover:bg-white"
          >
            <X className="w-6 h-6" strokeWidth={2.75} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Botão brilhante colorido, com ícone e seta. `compacto` = botão menor sem seta (ex.: Saída). */
export function AcaoBotao({ cor, icon: I, compacto, children, className, ...props }: {
  cor: CorAcao; icon: Icone; compacto?: boolean; children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const [a, b, c, brilho, texto, icone] = CORES[cor];
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "relative w-full flex items-center rounded-full border-2 font-bold overflow-hidden transition-all hover:brightness-110 active:scale-[.98] disabled:opacity-60 disabled:cursor-wait",
        compacto ? "justify-center gap-1 h-12 px-1 text-[13px] sm:text-[15px] font-semibold" : "gap-4 min-h-[50px] py-1 pl-4 pr-3 text-[16px] sm:text-[18px] font-semibold leading-tight",
        className,
      )}
      style={{
        color: texto,
        borderColor: b,
        background: `linear-gradient(90deg, ${c} 0%, ${b} 22%, ${a} 52%, ${b} 80%, ${c} 100%)`,
        boxShadow: `0 0 16px -2px ${brilho}, 0 0 4px ${brilho}, inset 0 2px 0 rgba(255,255,255,.7), inset 0 -4px 8px rgba(0,0,0,.18)`,
      }}
    >
      <span aria-hidden className="pointer-events-none absolute inset-x-3 top-0 h-1/2 rounded-b-[40%] bg-gradient-to-b from-white/50 to-white/0" />
      <span aria-hidden className="pointer-events-none absolute -right-6 top-0 h-full w-28 skew-x-[-28deg] bg-white/15" />
      <I className={cn("relative shrink-0", compacto ? "w-5 h-5" : "w-8 h-8")} strokeWidth={2.5} style={{ color: icone }} />
      <span className={cn("relative", compacto ? "truncate" : "flex-1 text-left line-clamp-2")}>{children}</span>
      {!compacto && <ChevronRight className="relative w-6 h-6 shrink-0" strokeWidth={3} />}
    </button>
  );
}

export function SecaoAcoes({ icon: I, children }: { icon: Icone; children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 mt-2 px-1 text-[18px] font-bold">
      <I className="w-6 h-6 text-violet-700" strokeWidth={2.5} />
      {children}
    </p>
  );
}

export function AvisoAcoes({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl bg-amber-100/90 border border-amber-300 px-3 py-2 text-[14px] font-semibold text-amber-800">{children}</p>;
}

export function CartaoPeriodo({ ativo, titulo, desc, icon: I, ...props }: {
  ativo: boolean; titulo: string; desc: string; icon: Icone;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      {...props}
      className={cn(
        "relative rounded-2xl px-1.5 py-2.5 text-center border-2 transition-all disabled:opacity-60 disabled:cursor-wait",
        ativo
          ? "bg-gradient-to-br from-indigo-600 to-violet-800 text-white border-violet-300 shadow-[0_0_18px_-2px_rgba(124,58,237,.85)]"
          : "bg-white/75 border-white text-[#1e1b4b] shadow-[inset_0_-3px_6px_rgba(76,29,149,.12),0_4px_10px_-6px_rgba(76,29,149,.5)] hover:bg-white",
      )}
    >
      {ativo && (
        <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full grid place-items-center bg-violet-600 border-2 border-white">
          <Check className="w-4 h-4 text-white" strokeWidth={3.5} />
        </span>
      )}
      <I className={cn("w-7 h-7 mx-auto mb-1", ativo ? "text-white" : "text-violet-700")} strokeWidth={2.25} />
      <span className="block text-[16px] font-bold leading-tight">{titulo}</span>
      <span className="block text-[13px] opacity-80 leading-tight">{desc}</span>
    </button>
  );
}
