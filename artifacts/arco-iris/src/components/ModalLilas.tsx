import { useEffect, type ComponentType, type ReactNode } from "react";
import { X } from "lucide-react";

type Icone = ComponentType<{ className?: string }>;

/** Janela no mesmo visual da "Horários das HH:MM" da agenda (lilás no claro, roxo-noite no escuro). */
export function ModalLilas({ icon: I, titulo, subtitulo, onClose, children }: {
  icon: Icone; titulo: string; subtitulo?: ReactNode; onClose: () => void; children: ReactNode;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="agenda-neon fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3 bg-black/40 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={titulo} onClick={onClose}>
      <div className="w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl space-y-4 text-[#1e1b4b]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <span className="grid place-items-center w-12 h-12 rounded-2xl bg-violet-100 text-violet-700 shrink-0"><I className="w-6 h-6" /></span>
          <div className="flex-1 min-w-0">
            <p className="text-2xl font-extrabold leading-tight">{titulo}</p>
            {subtitulo && <p className="text-base text-[#3b3561] leading-snug break-words">{subtitulo}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="grid place-items-center w-11 h-11 rounded-full bg-violet-50 text-violet-800 shrink-0"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const BTN_LILAS = "w-full rounded-2xl px-3 py-3 text-lg font-semibold bg-gradient-to-br from-violet-500 to-violet-700 text-white disabled:opacity-50 disabled:cursor-not-allowed";
export const BTN_LILAS_CONTORNO = "w-full rounded-2xl border border-violet-200 bg-white px-3 py-2.5 text-base font-semibold text-violet-800 disabled:opacity-50";
