import { useEffect, useRef, useState, type CSSProperties } from "react";
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

// Painel em portal com posição fixa, para não ser cortado por menus com overflow.
function panelPosition(rect: DOMRect, placement: Placement): CSSProperties {
  const gap = 8;
  if (window.innerWidth < 640) {
    const vertical = placement === "down-right" || placement === "down-left"
      ? { top: rect.bottom + gap }
      : { bottom: window.innerHeight - rect.top + gap };
    return { ...vertical, left: 16, right: 16, width: "auto", maxWidth: "none" };
  }
  switch (placement) {
    case "down-right":
      return { top: rect.bottom + gap, right: Math.max(16, window.innerWidth - rect.right) };
    case "down-left":
      return { top: rect.bottom + gap, left: Math.max(16, rect.left) };
    case "up-left":
      return { bottom: window.innerHeight - rect.top + gap, left: Math.max(16, rect.left) };
    case "side":
      return { bottom: Math.max(16, window.innerHeight - rect.bottom), left: rect.right + 12 };
  }
}

export function BackgroundPicker({
  bgKey,
  subtitle,
  variant = "icon",
  placement = "down-right",
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
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const current = getBackgroundChoice(bgKey);
  const custom = getCustomBackground(bgKey);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      if (wrapRef.current) setPos(panelPosition(wrapRef.current.getBoundingClientRect(), placement));
    };
    place();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!wrapRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    window.addEventListener("resize", place);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
    };
  }, [open, placement]);

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
        <div
          ref={panelRef}
          style={pos}
          className={cn(
            "fixed z-[100] w-[340px] max-w-[calc(100vw-2rem)] p-4 rounded-2xl text-[#e6eeff] border border-cyan-400/40 bg-[rgba(8,16,44,0.96)] backdrop-blur-xl shadow-[0_0_30px_-8px_#22d3ee,0_20px_50px_rgba(0,0,0,0.5)]",
          )}
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
        </div>,
        document.body,
      )}
    </div>
  );
}
