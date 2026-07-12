import { useState } from "react";
import { createPortal } from "react-dom";
import { User, X } from "lucide-react";

type Props = {
  url?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
  /** Permite ampliar a foto ao clicar (padrão: true quando há foto). */
  zoomable?: boolean;
};

/** Miniatura da foto do paciente (ou ícone genérico quando não há foto). Clique amplia. */
export function PatientAvatar({ url, name, size = 32, className = "", zoomable = true }: Props) {
  const [open, setOpen] = useState(false);
  const style = { width: size, height: size };

  if (url) {
    const canZoom = zoomable;
    return (
      <>
        <img
          src={url}
          alt={name || "Foto do paciente"}
          className={`rounded-full object-cover border border-border shrink-0 ${canZoom ? "cursor-zoom-in" : ""} ${className}`}
          style={style}
          onClick={canZoom ? (e) => { e.stopPropagation(); setOpen(true); } : undefined}
        />
        {open && canZoom && createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
          >
            <div className="relative flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
              <img
                src={url}
                alt={name || "Foto do paciente"}
                className="max-h-[80vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl border border-white/20"
              />
              {name && <span className="text-white text-lg font-semibold">{name}</span>}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setOpen(false); }}
                className="absolute -top-3 -right-3 rounded-full bg-white text-black p-1.5 shadow-lg hover:bg-gray-200"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>,
          document.body
        )}
      </>
    );
  }
  return (
    <span
      className={`rounded-full flex items-center justify-center bg-secondary/40 border border-border shrink-0 ${className}`}
      style={style}
    >
      <User className="text-muted-foreground" style={{ width: size * 0.5, height: size * 0.5 }} />
    </span>
  );
}
