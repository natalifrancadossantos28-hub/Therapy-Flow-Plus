import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImageIcon, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BACKGROUND_PRESETS,
  getBackgroundChoice,
  getCustomBackground,
  setBackgroundChoice,
  setCustomBackground,
  useBackground,
} from "@/lib/background";

type Placement = "down-right" | "down-left" | "up-left" | "side";

export function BackgroundPicker({
  bgKey,
  subtitle,
  variant = "icon",
  className,
}: {
  bgKey: string;
  subtitle?: string;
  variant?: "icon" | "button" | "pill";
  placement?: Placement;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  useBackground(bgKey); // re-renderiza quando a escolha muda
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const current = getBackgroundChoice(bgKey);
  const custom = getCustomBackground(bgKey);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    try {
      const ok = await setCustomBackground(bgKey, file);
      if (!ok) setError("Foto muito grande para salvar. Tente uma imagem menor.");
    } catch {
      setError("Não foi possível abrir essa imagem.");
    }
  };

  const option = (id: string, label: string, url: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setBackgroundChoice(bgKey, id)}
      className={cn(
        "relative h-[74px] rounded-xl border-2 overflow-hidden flex items-end px-2 py-1.5 text-[11.5px] font-semibold text-white text-left transition-all",
        current === id ? "border-cyan-400 shadow-[0_0_14px_-2px_rgba(34,211,238,0.9)]" : "border-transparent hover:border-white/30",
      )}
      style={
        url
          ? { backgroundImage: `url("${url}")`, backgroundSize: "cover", backgroundPosition: "center", textShadow: "0 1px 6px #000" }
          : { background: "linear-gradient(135deg,#0a1a4a,#2a0f5a)" }
      }
    >
      {label}
    </button>
  );

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          title="Personalizar fundo"
          aria-label="Personalizar fundo"
          className="p-2 rounded-lg text-foreground/70 hover:bg-secondary transition-colors"
        >
          <ImageIcon className="w-4 h-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex items-center gap-2 text-sm font-semibold transition-all",
            variant === "pill"
              ? "px-4 py-2.5 rounded-full bg-[rgba(6,14,40,0.7)] border border-cyan-400/45 text-[#e6f6ff] backdrop-blur-md shadow-[0_0_18px_-6px_#22d3ee] hover:border-cyan-400"
              : "w-full px-3 py-2 rounded-xl bg-secondary/60 hover:bg-secondary text-foreground/80 hover:text-foreground border border-border/50",
          )}
        >
          <ImageIcon className="w-4 h-4" />
          Personalizar fundo
        </button>
      )}

      {open && createPortal(
        // Centralizado na tela: em menus com rolagem, zoom ou telas deslizantes o painel ancorado no botão saía da área visível.
        <div className="fixed inset-0 z-[100] flex items-center-safe justify-center p-4 overflow-y-auto bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)}>
        <div
          role="dialog"
          aria-label="Personalizar fundo"
          onClick={(e) => e.stopPropagation()}
          className="w-[360px] max-w-full max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain p-4 rounded-2xl text-[#e6eeff] border border-cyan-400/40 bg-[rgba(8,16,44,0.96)] backdrop-blur-xl shadow-[0_0_30px_-8px_#22d3ee,0_20px_50px_rgba(0,0,0,0.5)]"
        >
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-sm font-bold text-white">Personalizar fundo</h4>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="p-1 rounded-lg text-white/70 hover:bg-white/10">
              <X className="w-4 h-4" />
            </button>
          </div>
          {subtitle && <p className="text-xs text-[#93a4c7] mb-3">{subtitle}</p>}
          <div className="grid grid-cols-2 gap-2.5">
            {BACKGROUND_PRESETS.map((p) => option(p.id, p.label, p.url))}
            {custom && option("custom", "Minha foto", custom)}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="h-[74px] rounded-xl border-2 border-dashed border-cyan-400/50 text-cyan-300 text-[11.5px] font-semibold flex flex-col items-center justify-center gap-1 hover:border-cyan-400"
            >
              <Plus className="w-4 h-4" />
              Enviar foto
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
          {error && <p className="text-xs text-red-300 mt-2">{error}</p>}
          <p className="text-[11.5px] text-[#93a4c7] mt-3">
            Sua escolha fica salva neste navegador. As telas ganham um véu por cima da foto para continuar legíveis.
          </p>
        </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
