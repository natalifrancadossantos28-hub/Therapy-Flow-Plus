import { useEffect, useRef, useState } from "react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, CalendarDays, CalendarCheck } from "lucide-react";
import { agoraBR, fraseDoMomento, periodo } from "@/components/Saudacao";

export const neon = (cor: string): React.CSSProperties => ({ borderColor: `${cor}55` });
export const glass = "lilas-card p-4";
export const CORES_NEON = ["#7c3aed", "#22c55e", "#3b82f6", "#f59e0b", "#ec4899", "#06b6d4"];
const ISO = (d: Date) => format(d, "yyyy-MM-dd");
const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function useAgora() {
  const [agora, setAgora] = useState(agoraBR);
  useEffect(() => { const t = setInterval(() => setAgora(agoraBR()), 60_000); return () => clearInterval(t); }, []);
  return agora;
}

const FONTE_KEY = "agenda_fonte";
const FONTE_EVT = "agenda-fonte";
const FONTES = [0.9, 1, 1.1, 1.2, 1.35];
/** Tamanho da letra da agenda (A+ / A-), guardado no aparelho. */
export function useFonteAgenda() {
  const [n, setN] = useState(() => {
    const v = Number(localStorage.getItem(FONTE_KEY));
    return Number.isInteger(v) && v >= 0 && v < FONTES.length ? v : 1;
  });
  useEffect(() => {
    if (localStorage.getItem(FONTE_KEY) === String(n)) return;
    localStorage.setItem(FONTE_KEY, String(n));
    window.dispatchEvent(new CustomEvent(FONTE_EVT, { detail: n }));
  }, [n]);
  useEffect(() => {
    const ouvir = (e: Event) => setN((e as CustomEvent<number>).detail);
    window.addEventListener(FONTE_EVT, ouvir);
    return () => window.removeEventListener(FONTE_EVT, ouvir);
  }, []);
  return {
    zoom: FONTES[n],
    maior: () => setN((x) => Math.min(FONTES.length - 1, x + 1)),
    menor: () => setN((x) => Math.max(0, x - 1)),
    podeMaior: n < FONTES.length - 1,
    podeMenor: n > 0,
  };
}

const FOTOS_SEMANA = ["hero-agenda", "hero-agenda-2", "hero-agenda-3", "hero-agenda-4", "hero-agenda-5", "hero-agenda-6"];
/** Foto do topo: troca toda segunda-feira (horário de Brasília). */
function fotoDaSemana(agora: Date) {
  const dias = Math.floor(Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate()) / 86400000);
  const semana = Math.floor((dias + 3) / 7);
  return `${import.meta.env.BASE_URL.replace(/\/$/, "")}/visual/${FOTOS_SEMANA[semana % FOTOS_SEMANA.length]}.webp`;
}

/** Relógio grande com o horário de Brasília, por cima da foto. */
function RelogioBrasilia() {
  const [agora, setAgora] = useState(agoraBR);
  useEffect(() => { const t = setInterval(() => setAgora(agoraBR()), 1000); return () => clearInterval(t); }, []);
  const hm = format(agora, "HH:mm");
  return (
    <div className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 text-white drop-shadow-[0_4px_14px_rgba(0,0,0,.6)] pointer-events-none select-none">
      <p className="font-extrabold tabular-nums leading-none tracking-tight text-5xl sm:text-7xl md:text-8xl">
        {hm}<span className="text-2xl sm:text-4xl md:text-5xl text-white/80">:{format(agora, "ss")}</span>
      </p>
      <p className="mt-1 sm:mt-2 text-sm sm:text-lg font-semibold text-violet-200">Horário de Brasília</p>
    </div>
  );
}

const redondo = "grid place-items-center w-11 h-11 rounded-full bg-white/90 border border-violet-200 text-violet-800 font-bold shadow-sm hover:bg-white disabled:opacity-40 transition";

/** Topo: ícone, "Boa tarde, Nome!", frase do dia, data e botões A+ / A-. */
export function NeonCabecalho({ nome, pessoaId, subtitulo, fonte, extra }: {
  nome: string; pessoaId?: number | null; subtitulo?: string;
  fonte?: ReturnType<typeof useFonteAgenda>; extra?: React.ReactNode;
}) {
  const agora = useAgora();
  const { texto } = periodo(agora.getHours());
  const primeiro = nome.trim().split(/\s+/)[0] || nome;
  return (
    <header className="lilas-card !rounded-3xl p-3 sm:p-4 flex flex-wrap items-center gap-3 sm:gap-4">
      <div className="relative basis-full w-full">
        <img src={fotoDaSemana(agora)} alt="Terapeuta brincando com criança" width={1024} height={683} className="w-full h-40 sm:h-56 object-cover object-[70%_25%] rounded-2xl shadow-[0_0_24px_-8px_rgba(139,92,246,.8)]" />
        <RelogioBrasilia />
      </div>
      <img src={ICONE_URL("calendario")} alt="" aria-hidden width={72} height={72} className="w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem] shrink-0 object-contain drop-shadow-[0_8px_12px_rgba(91,33,182,.25)]" />
      <div className="min-w-[14rem] flex-1">
        <h1 className="text-[1.7rem] sm:text-4xl font-extrabold leading-tight tracking-tight text-[#1e1b4b]">
          {texto}, <span className="text-violet-700">{primeiro}!</span>
        </h1>
        <p className="text-base sm:text-lg text-[#3b3561]">{subtitulo ?? "Organize e acompanhe os atendimentos"}</p>
        <p className="text-sm sm:text-base text-violet-700/90 italic mt-0.5">“{fraseDoMomento(nome, pessoaId ?? null, agora)}”</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/90 border border-violet-200 px-4 py-2.5 text-[#1e1b4b] font-medium shadow-sm">
          <CalendarCheck size={20} className="text-violet-700" />
          <span className="first-letter:uppercase">{format(agora, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
        </span>
        {fonte && (
          <>
            <button type="button" className={redondo} onClick={fonte.maior} disabled={!fonte.podeMaior} aria-label="Aumentar letra">A+</button>
            <button type="button" className={redondo} onClick={fonte.menor} disabled={!fonte.podeMenor} aria-label="Diminuir letra">A-</button>
          </>
        )}
        {extra}
      </div>
    </header>
  );
}

const ICONE_URL = (n: string) => `${import.meta.env.BASE_URL.replace(/\/$/, "")}/agenda-icones/${n}.webp`;
/** Desenhos 3D (public/agenda-icones) no lugar dos ícones de traço. */
const ICONES: Record<string, string> = {
  "Atendimentos na semana": "calendario",
  "Pacientes": "pacientes",
  "Realizados": "realizados",
  "Faltas": "faltas",
  "Faltas justificadas": "justificadas",
};

/** Cartões de resumo com ícone redondo colorido. */
export function NeonResumo({ itens }: { itens: { label: string; valor: number | string }[] }) {
  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
      {itens.map((i, n) => {
        const ic = ICONES[i.label];
        return (
          <div key={i.label} className="lilas-card !rounded-3xl p-3 sm:p-4 flex items-center gap-2 sm:gap-3 min-w-0">
            {ic ? <img src={ICONE_URL(ic)} alt="" aria-hidden width={64} height={64} className="w-11 h-11 sm:w-16 sm:h-16 shrink-0 object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,.18)]" />
              : <span className="grid place-items-center w-11 h-11 sm:w-14 sm:h-14 rounded-full shrink-0 shadow-md text-white" style={{ background: CORES_NEON[n % CORES_NEON.length] }}><CalendarDays size={28} /></span>}
            <span className="min-w-0">
              <span className="block text-3xl font-extrabold tabular-nums leading-none text-[#1e1b4b]">{i.valor}</span>
              <span className="block text-sm sm:text-base text-[#3b3561] leading-tight mt-1 break-words hyphens-auto" lang="pt-BR">{i.label}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Calendário mensal: bolinhas nos dias com atendimentos. */
export function NeonMes({ mes, setMes, diaSel, onDia, contar, hoje }: {
  mes: Date; setMes: (d: Date) => void; diaSel: string; onDia: (d: string) => void; contar: (iso: string) => number; hoje: string;
}) {
  const dias: Date[] = [];
  for (let d = startOfWeek(startOfMonth(mes)); d <= endOfWeek(endOfMonth(mes)); d = addDays(d, 1)) dias.push(d);
  const navBtn = "grid place-items-center rounded-full bg-white border border-violet-200 text-violet-700 w-10 h-10";
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button type="button" aria-label="Mês anterior" onClick={() => setMes(subMonths(mes, 1))} className={navBtn}><ChevronLeft size={18} /></button>
        <p className="text-lg font-bold text-[#1e1b4b]">{cap1(format(mes, "MMMM 'de' yyyy", { locale: ptBR }))}</p>
        <button type="button" aria-label="Próximo mês" onClick={() => setMes(addMonths(mes, 1))} className={navBtn}><ChevronRight size={18} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => <div key={i} className="text-center text-sm font-bold text-violet-700/70 pb-0.5">{d}</div>)}
        {dias.map((d) => {
          const iso = ISO(d), n = contar(iso), noMes = isSameMonth(d, mes);
          const sel = iso === diaSel, eHoje = iso === hoje;
          return (
            <button type="button" key={iso} onClick={() => onDia(iso)} aria-label={`${format(d, "d 'de' MMMM", { locale: ptBR })}: ${n} atendimentos`} aria-current={eHoje ? "date" : undefined}
              className={`relative h-12 rounded-xl flex flex-col items-center justify-center border transition
                ${sel ? "bg-gradient-to-br from-violet-500 to-violet-700 border-violet-600 text-white neon-brilho" : eHoje ? "border-violet-400 bg-violet-100 text-[#1e1b4b]" : "border-violet-100 bg-white/80 text-[#1e1b4b]"} ${noMes ? "" : "opacity-35"}`}>
              <span className="text-base font-bold tabular-nums leading-none">{format(d, "d")}</span>
              {n > 0 && <span className="absolute bottom-1 flex gap-0.5">{Array.from({ length: Math.min(n, 3) }).map((_, k) => <i key={k} className="w-1.5 h-1.5 rounded-full" style={{ background: sel ? "#fff" : CORES_NEON[k] }} />)}</span>}
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
        toque.current = { x: t.clientX, y: t.clientY, ok: !alvo.closest("input,textarea,select,.overflow-x-auto,[role=dialog],[data-sem-deslizar]") };
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
      <div className="mx-auto w-fit flex flex-col items-center gap-1 mt-6 px-4 py-1.5 rounded-2xl bg-white/90 shadow-sm">
        <div className="flex items-center gap-1.5" role="tablist" aria-label="Telas">
          {titulos.map((t, i) => (
            <button type="button" key={t} role="tab" aria-selected={i === pagina} aria-label={t} onClick={() => ir(i)} className="h-6 grid place-items-center px-0.5">
              <span className={`block h-2.5 rounded-full transition-all ${i === pagina ? "w-7 bg-violet-600" : "w-2.5 bg-violet-300"}`} />
            </button>
          ))}
        </div>
        <p className="text-center text-sm text-violet-900/60">Deslize para o lado para ver as outras telas</p>
      </div>
    </div>
  );
}

export type NeonMenuItem = { id: string; label: string; icon: React.ReactNode; destaque?: boolean };
/** Menu inferior fixo; o item com destaque (microfone) fica grande e centralizado. */
export function NeonMenuInferior({ itens, ativo, onItem }: { itens: NeonMenuItem[]; ativo: string; onItem: (id: string) => void }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(.6rem,env(safe-area-inset-bottom))]" aria-label="Menu">
      <div className="mx-auto max-w-2xl grid items-end gap-1 rounded-[2rem] border border-violet-200 bg-white/95 p-1.5 shadow-[0_-4px_30px_rgba(91,33,182,.22)] backdrop-blur"
        style={{ gridTemplateColumns: `repeat(${itens.length}, minmax(0, 1fr))` }}>
        {itens.map((it) => it.destaque ? (
          <button type="button" key={it.id} onClick={() => onItem(it.id)} className="flex flex-col items-center gap-1 -mt-9 text-[13px] font-semibold text-violet-800">
            <span className="grid place-items-center w-[4.5rem] h-[4.5rem] rounded-full bg-gradient-to-br from-violet-500 to-violet-700 text-white neon-mic">{it.icon}</span>
            <span>{it.label}</span>
          </button>
        ) : (
          <button type="button" key={it.id} onClick={() => onItem(it.id)} aria-current={ativo === it.id ? "page" : undefined}
            className={`h-16 min-w-0 px-0.5 rounded-3xl flex flex-col items-center justify-center gap-1 text-[12px] min-[400px]:text-[13px] tracking-tight leading-none font-semibold transition ${ativo === it.id ? "text-white bg-gradient-to-br from-violet-500 to-violet-700 shadow-[0_8px_20px_-6px_rgba(109,40,217,.6)]" : "text-[#1e1b4b]"}`}>
            {it.icon}<span className="max-w-full truncate">{it.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
