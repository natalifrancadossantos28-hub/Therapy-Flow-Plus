import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { format, addDays } from "date-fns";
import { Bell, CalendarClock, X } from "lucide-react";
import { Button } from "@/components/ui-custom";
import { listCompromissos, type Compromisso } from "@/lib/agenda-admin-rpc";

/** Disparado pela Agenda Administrativa quando um compromisso é salvo/alterado. */
export const COMPROMISSOS_EVENTO = "nfs-compromissos-alterados";
export const inicioDe = (c: Pick<Compromisso, "data" | "hora">) => new Date(`${c.data}T${c.hora}:00`);

const ISO = (d: Date) => format(d, "yyyy-MM-dd");
const chave = (c: Compromisso) => `nfs_lembrete_${c.id}_${c.data}_${c.hora}`;

function bip() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    for (const t of [0, 0.35]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.3);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.32);
    }
    setTimeout(() => void ctx.close(), 1200);
  } catch { /* navegador sem áudio */ }
}

function notificar(c: Compromisso) {
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(`Lembrete: ${c.titulo}`, { body: `${c.hora}${c.local ? ` · ${c.local}` : ""}`, tag: chave(c) });
    }
  } catch { /* sem notificação */ }
}

export function faltaTexto(min: number) {
  if (min >= 1440) return `em ${Math.round(min / 1440)} dia(s)`;
  if (min >= 60) return `em ${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}min` : ""}`;
  if (min > 0) return `em ${min} min`;
  if (min === 0) return "agora";
  return `começou há ${-min} min`;
}

/**
 * Avisos da Agenda Administrativa (só Administração, com o sistema aberto):
 * resumo do dia ao entrar e aviso com som/notificação na antecedência escolhida.
 * "Ok, vi" e "Lembrar em 10 min" ficam guardados neste navegador.
 */
export function LembretesAviso() {
  const [lista, setLista] = useState<Compromisso[]>([]);
  const [agora, setAgora] = useState(() => Date.now());
  const [, setTick] = useState(0);
  const [resumo, setResumo] = useState(false);
  const avisados = useRef(new Set<string>());

  useEffect(() => {
    let vivo = true;
    const carregar = () => {
      const h = new Date();
      listCompromissos(ISO(h), ISO(addDays(h, 1))).then((l) => { if (vivo) setLista(l); }).catch(() => {});
    };
    carregar();
    const t = setInterval(carregar, 5 * 60_000);
    window.addEventListener(COMPROMISSOS_EVENTO, carregar);
    return () => { vivo = false; clearInterval(t); window.removeEventListener(COMPROMISSOS_EVENTO, carregar); };
  }, []);
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);

  const hojeIso = ISO(new Date(agora));
  const deHoje = lista.filter((c) => !c.concluido && c.data === hojeIso && inicioDe(c).getTime() > agora);
  useEffect(() => {
    const k = `nfs_lembrete_resumo_${hojeIso}`;
    if (deHoje.length && !sessionStorage.getItem(k)) { sessionStorage.setItem(k, "1"); setResumo(true); }
  }, [deHoje.length, hojeIso]);

  const ativos = lista.filter((c) => {
    if (c.concluido) return false;
    const ini = inicioDe(c).getTime();
    if (agora < ini - c.antecedenciaMin * 60_000 || agora > ini + 60 * 60_000) return false;
    const v = localStorage.getItem(chave(c));
    return v !== "ok" && !(v && Number(v) > agora);
  });

  useEffect(() => {
    let novo = false;
    for (const c of ativos) {
      const k = `${chave(c)}|${localStorage.getItem(chave(c)) ?? ""}`;
      if (!avisados.current.has(k)) { avisados.current.add(k); novo = true; notificar(c); }
    }
    if (novo) bip();
  });

  const marcar = (c: Compromisso, v: string) => { localStorage.setItem(chave(c), v); setTick((t) => t + 1); };

  if (!ativos.length && !(resumo && deHoje.length)) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[60] w-[min(360px,calc(100vw-2rem))] space-y-2" role="status" aria-live="polite">
      {resumo && deHoje.length > 0 && (
        <div className="rounded-2xl border border-primary/40 bg-card/95 backdrop-blur p-4 shadow-xl">
          <div className="flex items-start gap-3">
            <CalendarClock className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm">Hoje você tem {deHoje.length} compromisso{deHoje.length > 1 ? "s" : ""}</p>
              <ul className="mt-1 text-xs text-muted-foreground space-y-0.5">
                {deHoje.slice(0, 5).map((c) => <li key={c.id}><b className="text-foreground">{c.hora}</b> · {c.titulo}</li>)}
              </ul>
              <Link href="/agenda-administrativa" onClick={() => setResumo(false)} className="text-xs font-semibold text-primary hover:underline mt-2 inline-block">
                Ver Agenda Administrativa
              </Link>
            </div>
            <button type="button" aria-label="Fechar" onClick={() => setResumo(false)} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}
      {ativos.map((c) => {
        const min = Math.round((inicioDe(c).getTime() - agora) / 60_000);
        return (
          <div key={c.id} className="rounded-2xl border-2 border-amber-400 bg-card/95 backdrop-blur p-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <Bell className="w-5 h-5 text-amber-500 shrink-0 mt-0.5 animate-pulse" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold uppercase text-amber-600 dark:text-amber-400">Lembrete · {faltaTexto(min)}</p>
                <p className="font-bold">{c.titulo}</p>
                <p className="text-sm text-muted-foreground">{c.data !== hojeIso ? `${format(inicioDe(c), "dd/MM")} · ` : ""}{c.hora}{c.local ? ` · ${c.local}` : ""}</p>
                {c.observacao && <p className="text-xs mt-1 line-clamp-2">{c.observacao}</p>}
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={() => marcar(c, "ok")}>Ok, vi</Button>
                  <Button size="sm" variant="outline" onClick={() => marcar(c, String(Date.now() + 10 * 60_000))}>Lembrar em 10 min</Button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
