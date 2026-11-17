import { useEffect, useRef, useState } from "react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Heart } from "lucide-react";
import { agoraBR, fraseDoMomento, periodo } from "@/components/Saudacao";

export const neon = (cor: string): React.CSSProperties => ({ border: `1px solid ${cor}b0`, boxShadow: `0 0 16px ${cor}59, inset 0 0 22px ${cor}1f` });
export const glass = "bg-card rounded-3xl border p-4";
export const CORES_NEON = ["#38bdf8", "#ec4899", "#22c55e", "#a855f7", "#f97316", "#3b82f6"];
const ISO = (d: Date) => format(d, "yyyy-MM-dd");
const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function useAgora() {
  const [agora, setAgora] = useState(agoraBR);
  useEffect(() => { const t = setInterval(() => setAgora(agoraBR()), 60_000); return () => clearInterval(t); }, []);
  return agora;
}

/** Topo neon: saudação + nome, quadrinho com a data de hoje e a Mensagem do dia. */
export function NeonSaudacao({ nome, detalhe, pessoaId, acoes }: { nome: string; detalhe?: string | null; pessoaId?: number | null; acoes?: React.ReactNode }) {
  const agora = useAgora();
  const { texto } = periodo(agora.getHours());
  const primeiro = nome.trim().split(/\s+/)[0] || nome;
  return (
    <div className="space-y-4">
      {acoes && <div className="flex flex-wrap items-center justify-end gap-2">{acoes}</div>}
      <section className="flex flex-wrap items-start gap-3">
        <div className="min-w-[12rem] flex-1">
          <p className="text-[2rem] sm:text-4xl font-extrabold leading-tight tracking-tight">{texto},</p>
          <p className="text-[2.3rem] sm:text-5xl font-extrabold leading-tight tracking-tight neon-txt">{primeiro}!</p>
          {detalhe && <p className="text-base text-white/75 mt-1">{detalhe}</p>}
        </div>
        <div className={`${glass} !p-3 min-w-[6.8rem] shrink-0 text-center whitespace-nowrap`} style={neon("#a855f7")}>
          <p className="text-xs font-semibold tracking-wider uppercase text-white/85">{format(agora, "EEEE", { locale: ptBR })}</p>
          <p className="text-4xl font-bold leading-none my-1 tabular-nums">{format(agora, "dd")}</p>
          <p className="text-[0.8rem] font-medium uppercase text-violet-200">{format(agora, "MMM", { locale: ptBR })} | {format(agora, "yyyy")}</p>
        </div>
      </section>
      <section className="rounded-3xl p-[2px] bg-gradient-to-r from-sky-400 via-violet-500 to-pink-500 shadow-[0_0_24px_rgba(168,85,247,.45)]">
        <div className="rounded-[calc(1.5rem-2px)] bg-[#0d1438]/90 p-4 flex items-start gap-3">
          <span className="grid place-items-center w-11 h-11 rounded-2xl bg-gradient-to-br from-pink-500 to-violet-600 shrink-0 text-white"><Heart size={20} /></span>
          <span className="min-w-0">
            <span className="block text-sm font-bold uppercase tracking-wider text-pink-200">Mensagem do dia</span>
            <span className="block text-lg font-medium leading-snug text-white">“{fraseDoMomento(nome, pessoaId ?? null, agora)}”</span>
          </span>
        </div>
      </section>
    </div>
  );
}

/** Cartões de resumo em neon. */
export function NeonResumo({ itens }: { itens: { label: string; valor: number | string }[] }) {
  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
      {itens.map((i, n) => (
        <div key={i.label} className={`${glass} !p-3`} style={neon(CORES_NEON[n % CORES_NEON.length])}>
          <div className="text-3xl font-extrabold tabular-nums" style={{ color: CORES_NEON[n % CORES_NEON.length] }}>{i.valor}</div>
          <div className="text-sm text-white/80 leading-tight">{i.label}</div>
        </div>
      ))}
    </div>
  );
}

/** Calendário mensal neon: bolinhas nos dias com atendimentos. */
export function NeonMes({ mes, setMes, diaSel, onDia, contar, hoje }: {
  mes: Date; setMes: (d: Date) => void; diaSel: string; onDia: (d: string) => void; contar: (iso: string) => number; hoje: string;
}) {
  const dias: Date[] = [];
  for (let d = startOfWeek(startOfMonth(mes)); d <= endOfWeek(endOfMonth(mes)); d = addDays(d, 1)) dias.push(d);
  const navBtn = "grid place-items-center rounded-full bg-white/10 border border-white/15 w-9 h-9";
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button type="button" aria-label="Mês anterior" onClick={() => setMes(subMonths(mes, 1))} className={navBtn}><ChevronLeft size={16} /></button>
        <p className="text-lg font-semibold">{cap1(format(mes, "MMMM 'de' yyyy", { locale: ptBR }))}</p>
        <button type="button" aria-label="Próximo mês" onClick={() => setMes(addMonths(mes, 1))} className={navBtn}><ChevronRight size={16} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => <div key={i} className="text-center text-xs font-semibold text-white/60 pb-0.5">{d}</div>)}
        {dias.map((d) => {
          const iso = ISO(d), n = contar(iso), noMes = isSameMonth(d, mes);
          const sel = iso === diaSel, eHoje = iso === hoje;
          return (
            <button type="button" key={iso} onClick={() => onDia(iso)} aria-label={`${format(d, "d 'de' MMMM", { locale: ptBR })}: ${n} atendimentos`} aria-current={eHoje ? "date" : undefined}
              className={`relative h-12 rounded-lg flex flex-col items-center justify-center border transition
                ${sel ? "bg-gradient-to-br from-sky-500/70 to-violet-600/70 border-sky-300 neon-brilho" : eHoje ? "border-sky-300/80 bg-sky-400/10" : "border-white/[0.06] bg-white/[0.06]"} ${noMes ? "" : "opacity-35"}`}>
              <span className="text-base font-bold tabular-nums leading-none">{format(d, "d")}</span>
              {n > 0 && <span className="absolute bottom-1 flex gap-0.5">{Array.from({ length: Math.min(n, 3) }).map((_, k) => <i key={k} className="w-1 h-1 rounded-full" style={{ background: CORES_NEON[k] }} />)}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Telas que trocam deslizando o dedo para os lados (ou pelas bolinhas). Mantém todas montadas. */
export function NeonTelas({ titulos, pagina, setPagina, children }: { titulos: string[]; pagina: number; setPagina: (n: number) => void; children: React.ReactNode[] }) {
  const toque = useRef<{ x: number; y: number; ok: boolean } | null>(null);
  const [lado, setLado] = useState<"e" | "d">("e");
  const ir = (n: number) => { if (n < 0 || n >= titulos.length || n === pagina) return; setLado(n > pagina ? "e" : "d"); setPagina(n); };
  return (
    <div
      onTouchStart={(e) => {
        const t = e.touches[0]; const alvo = e.target as HTMLElement;
        toque.current = { x: t.clientX, y: t.clientY, ok: !alvo.closest("input,textarea,select,table,.overflow-x-auto,[role=dialog],[data-sem-deslizar]") };
      }}
      onTouchEnd={(e) => {
        const ini = toque.current; toque.current = null; if (!ini?.ok) return;
        const t = e.changedTouches[0], dx = t.clientX - ini.x, dy = t.clientY - ini.y;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) ir(pagina + (dx < 0 ? 1 : -1));
      }}
      className="min-h-[70dvh]">
      {children.map((c, i) => (
        <div key={i} hidden={i !== pagina} className={i === pagina ? `neon-lado-${lado}` : undefined}>{c}</div>
      ))}
      <div className="flex flex-col items-center gap-1 pt-6">
        <div className="flex items-center gap-1.5" role="tablist" aria-label="Telas">
          {titulos.map((t, i) => (
            <button type="button" key={t} role="tab" aria-selected={i === pagina} aria-label={t} onClick={() => ir(i)} className="h-6 grid place-items-center px-0.5">
              <span className={`block h-2.5 rounded-full transition-all ${i === pagina ? "w-7 bg-gradient-to-r from-sky-400 to-pink-400 shadow-[0_0_10px_rgba(236,72,153,.7)]" : "w-2.5 bg-white/35"}`} />
            </button>
          ))}
        </div>
        <p className="text-center text-sm text-white/55">Deslize para o lado para ver as outras telas</p>
      </div>
    </div>
  );
}

export type NeonMenuItem = { id: string; label: string; icon: React.ReactNode; destaque?: boolean };
/** Menu inferior fixo; o item com destaque (Falar) fica grande e centralizado. */
export function NeonMenuInferior({ itens, ativo, onItem }: { itens: NeonMenuItem[]; ativo: string; onItem: (id: string) => void }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(.6rem,env(safe-area-inset-bottom))]" aria-label="Menu">
      <div className="mx-auto max-w-xl grid items-end gap-1 rounded-3xl border border-violet-400/30 p-1.5 shadow-[0_-6px_30px_rgba(0,0,0,.4),0_0_18px_rgba(139,92,246,.25)] backdrop-blur"
        style={{ background: "rgba(10,16,48,.92)", gridTemplateColumns: `repeat(${itens.length}, minmax(0, 1fr))` }}>
        {itens.map((it) => it.destaque ? (
          <button type="button" key={it.id} onClick={() => onItem(it.id)} className="flex flex-col items-center gap-1 -mt-8 text-[12px] font-semibold text-white">
            <span className="grid place-items-center w-[4.25rem] h-[4.25rem] rounded-full bg-gradient-to-br from-sky-400 via-violet-500 to-pink-500 neon-mic">{it.icon}</span>
            <span>{it.label}</span>
          </button>
        ) : (
          <button type="button" key={it.id} onClick={() => onItem(it.id)} aria-current={ativo === it.id ? "page" : undefined}
            className={`h-14 min-w-0 px-0.5 rounded-2xl flex flex-col items-center justify-center gap-1 text-[12px] leading-none font-medium transition ${ativo === it.id ? "text-white bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-[0_0_16px_rgba(192,38,211,.6)]" : "text-white/75"}`}>
            {it.icon}<span className="max-w-full truncate">{it.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
