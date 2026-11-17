import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Opcao = { value: string; label: string; disabled: boolean; grupo: string | null };

const CORES = ["#8b5cf6", "#3b82f6", "#ec4899", "#14b8a6", "#f97316", "#22c55e", "#eab308", "#06b6d4"];
const corDe = (t: string) => CORES[[...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % CORES.length];
const iniciais = (t: string) => t.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function lerOpcoes(sel: HTMLSelectElement): Opcao[] {
  return Array.from(sel.options).map((o) => ({
    value: o.value,
    label: o.textContent?.trim() || o.value,
    disabled: o.disabled,
    grupo: o.parentElement instanceof HTMLOptGroupElement ? o.parentElement.label : null,
  }));
}

function escolher(sel: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  setter?.call(sel, value);
  sel.dispatchEvent(new Event("input", { bubbles: true }));
  sel.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Troca a lista nativa (branca, do celular) de todos os <select> do sistema por uma
 * janela moderna com busca. O <select> continua no lugar: a escolha dispara o mesmo
 * onChange de sempre. Para manter a lista nativa num campo: data-nativo.
 */
export function SeletorModerno() {
  const [sel, setSel] = useState<HTMLSelectElement | null>(null);
  const [busca, setBusca] = useState("");
  const buscaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const abrir = (e: Event) => {
      const alvo = e.target as HTMLElement | null;
      const s = alvo?.closest?.("select") as HTMLSelectElement | null;
      if (!s || s.multiple || s.disabled || s.size > 1 || s.hasAttribute("data-nativo")) return;
      if (e instanceof MouseEvent && e.button !== 0) return;
      e.preventDefault();
      s.blur();
      setBusca("");
      setSel(s);
    };
    document.addEventListener("mousedown", abrir, true);
    document.addEventListener("touchstart", abrir, { capture: true, passive: false });
    return () => {
      document.removeEventListener("mousedown", abrir, true);
      document.removeEventListener("touchstart", abrir, true);
    };
  }, []);

  useEffect(() => {
    if (!sel) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setSel(null);
    window.addEventListener("keydown", esc);
    const t = setTimeout(() => buscaRef.current?.focus({ preventScroll: true }), 80);
    return () => { window.removeEventListener("keydown", esc); clearTimeout(t); };
  }, [sel]);

  const opcoes = useMemo(() => (sel ? lerOpcoes(sel) : []), [sel]);
  if (!sel) return null;

  const atual = sel.value;
  const comBusca = opcoes.length > 7;
  const q = semAcento(busca.trim());
  const filtradas = q ? opcoes.filter((o) => semAcento(o.label).includes(q)) : opcoes;
  const rotulo =
    sel.getAttribute("aria-label") ||
    (sel.id && document.querySelector(`label[for="${CSS.escape(sel.id)}"]`)?.textContent) ||
    sel.closest("label")?.textContent?.trim() ||
    sel.parentElement?.querySelector("label")?.textContent ||
    "Escolha uma opção";
  const pessoas = opcoes.filter((o) => o.value !== "").length > 3 && /profissional|paciente|nome|terapeuta/i.test(`${rotulo} ${opcoes[0]?.label ?? ""}`);

  const fechar = () => setSel(null);
  let ultimoGrupo: string | null = null;

  return createPortal(
    <div className="seletor-moderno fixed inset-0 z-[100] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={rotulo}>
      <button type="button" aria-label="Fechar" className="absolute inset-0 bg-[#06041a]/70 backdrop-blur-sm" onClick={fechar} />
      <div className="relative w-full sm:max-w-lg max-h-[82dvh] flex flex-col rounded-t-[28px] sm:rounded-[28px] border border-violet-400/40 bg-gradient-to-b from-[#221a52] to-[#110d2c] text-white shadow-[0_0_40px_-8px_rgba(139,92,246,.7)] pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto mt-2.5 h-1.5 w-12 rounded-full bg-white/25 sm:hidden" />
        <div className="flex items-center gap-3 px-5 pt-3 pb-2">
          <p className="flex-1 font-display text-xl font-bold leading-tight">{rotulo.replace(/[:*]\s*$/, "")}</p>
          <button type="button" onClick={fechar} aria-label="Fechar" className="grid place-items-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/20"><X className="w-5 h-5" /></button>
        </div>
        {comBusca && (
          <div className="px-5 pb-3">
            <label className="flex items-center gap-2 rounded-2xl border border-violet-400/40 bg-white/5 px-4 py-3 focus-within:border-violet-300">
              <Search className="w-5 h-5 text-violet-200 shrink-0" />
              <input ref={buscaRef} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pelo nome…" className="flex-1 bg-transparent text-lg outline-none placeholder:text-white/45" />
            </label>
          </div>
        )}
        <div className="overflow-y-auto overscroll-contain px-3 pb-4 space-y-1.5">
          {filtradas.length === 0 && <p className="px-3 py-6 text-center text-white/60 text-lg">Nada encontrado.</p>}
          {filtradas.map((o) => {
            const grupoNovo = o.grupo && o.grupo !== ultimoGrupo;
            ultimoGrupo = o.grupo;
            const ativo = o.value === atual;
            const vazio = o.value === "";
            const [nome, extra] = o.label.split(/\s+[—–-]\s+/, 2);
            const cor = corDe(extra || nome);
            return (
              <div key={`${o.grupo}-${o.value}`}>
                {grupoNovo && <p className="px-3 pt-3 pb-1 text-xs font-bold uppercase tracking-[0.14em] text-violet-200/80">{o.grupo}</p>}
                <button
                  type="button"
                  disabled={o.disabled}
                  onClick={() => { escolher(sel, o.value); fechar(); }}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors disabled:opacity-40",
                    ativo ? "bg-violet-500/30 border border-violet-300/60 shadow-[0_0_18px_-6px_rgba(167,139,250,.9)]" : "border border-white/5 bg-white/[0.04] hover:bg-white/10",
                  )}
                >
                  {pessoas && !vazio && (
                    <span className="grid place-items-center w-11 h-11 rounded-full shrink-0 text-base font-bold text-white shadow-lg" style={{ background: `linear-gradient(135deg, ${cor}, ${cor}99)`, boxShadow: `0 0 14px -3px ${cor}` }}>
                      {iniciais(nome)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-[17px] leading-snug break-words", vazio ? "text-white/60" : "font-semibold")}>{nome}</span>
                    {extra && <span className="block text-sm" style={{ color: `${cor}` }}>{extra}</span>}
                  </span>
                  {ativo && <Check className="w-5 h-5 text-violet-200 shrink-0" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
