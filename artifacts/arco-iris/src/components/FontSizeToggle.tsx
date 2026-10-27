import { useState } from "react";
import { mudarEscala, escalaAtual } from "@/lib/font-scale";

/** Botões A− / A+ para diminuir ou aumentar as letras do sistema neste aparelho. */
export function FontSizeToggle() {
  const [v, setV] = useState(() => escalaAtual());
  const btn = "h-9 min-w-9 px-2 rounded-lg border border-border text-foreground/80 hover:bg-secondary font-bold";
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Tamanho das letras" title={v ? `Letras em ${v}%` : "Tamanho das letras"}>
      <button type="button" aria-label="Diminuir letras" className={`${btn} text-xs`} onClick={() => setV(mudarEscala(-1))}>A−</button>
      <button type="button" aria-label="Aumentar letras" className={`${btn} text-base`} onClick={() => setV(mudarEscala(1))}>A+</button>
    </div>
  );
}
