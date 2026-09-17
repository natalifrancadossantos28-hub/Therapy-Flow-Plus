import { useState, useEffect, useMemo, useCallback } from "react";
import { Inbox, Check, RotateCcw, Filter, UserRound, CircleDot, Loader2, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui-custom";
import { listRecadosEquipe, markRecadoEquipeLido, setRecadoEquipeStatus, type RecadoEquipe, type RecadoEquipeStatus } from "@/lib/arco-rpc";
import { useToast } from "@/hooks/use-toast";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useVisibleInterval } from "@/hooks/usePageVisible";
import { cn } from "@/lib/utils";

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (dayKey(today.toISOString()) === key) return "Hoje";
  if (dayKey(yesterday.toISOString()) === key) return "Ontem";
  return dt.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

type FiltroStatus = RecadoEquipeStatus | "todos";

const STATUS_META: Record<RecadoEquipeStatus, { label: string; badge: string; dot: string }> = {
  pendente:     { label: "Pendente",     badge: "bg-amber-500/15 text-amber-300 border-amber-400/40",     dot: "bg-amber-400" },
  em_andamento: { label: "Em andamento", badge: "bg-sky-500/15 text-sky-300 border-sky-400/40",           dot: "bg-sky-400" },
  resolvido:    { label: "Resolvido",    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-400/40", dot: "bg-emerald-400" },
};

const statusOf = (r: RecadoEquipe): RecadoEquipeStatus => r.status ?? "pendente";

export default function RecadosEquipePage() {
  useDocumentTitle("Recados da Equipe");
  const { toast } = useToast();
  const [recados, setRecados] = useState<RecadoEquipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroProf, setFiltroProf] = useState<string>("");
  const [somenteNaoLidos, setSomenteNaoLidos] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>("pendente");
  const [agrupar, setAgrupar] = useState<"data" | "profissional">("data");

  const load = useCallback(() => {
    listRecadosEquipe()
      .then(setRecados)
      .catch(e => toast({ title: "Erro ao carregar recados", description: e instanceof Error ? e.message : String(e), variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => { load(); }, [load]);
  useVisibleInterval(load, 30_000);

  const profissionais = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of recados) m.set(r.professionalName, (m.get(r.professionalName) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }, [recados]);

  const filtrados = useMemo(() => {
    return recados
      .filter(r => !filtroProf || r.professionalName === filtroProf)
      .filter(r => !somenteNaoLidos || !r.lido)
      .filter(r => filtroStatus === "todos" || statusOf(r) === filtroStatus)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [recados, filtroProf, somenteNaoLidos, filtroStatus]);

  const porStatus = useMemo(() => {
    const c: Record<RecadoEquipeStatus, number> = { pendente: 0, em_andamento: 0, resolvido: 0 };
    for (const r of recados) c[statusOf(r)]++;
    return c;
  }, [recados]);

  const grupos = useMemo(() => {
    const m = new Map<string, RecadoEquipe[]>();
    for (const r of filtrados) {
      const k = agrupar === "data" ? dayKey(r.createdAt) : r.professionalName;
      const arr = m.get(k);
      if (arr) arr.push(r); else m.set(k, [r]);
    }
    const entries = Array.from(m.entries());
    if (agrupar === "data") entries.sort((a, b) => b[0].localeCompare(a[0]));
    else entries.sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
    return entries;
  }, [filtrados, agrupar]);

  const naoLidos = recados.filter(r => !r.lido).length;

  const toggleLido = async (r: RecadoEquipe) => {
    const novo = !r.lido;
    setRecados(prev => prev.map(x => x.id === r.id ? { ...x, lido: novo } : x));
    try {
      await markRecadoEquipeLido(r.id, novo);
    } catch (e) {
      setRecados(prev => prev.map(x => x.id === r.id ? { ...x, lido: r.lido } : x));
      toast({ title: "Não foi possível atualizar", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const mudarStatus = async (r: RecadoEquipe, status: RecadoEquipeStatus) => {
    const anterior = statusOf(r);
    if (anterior === status) return;
    setRecados(prev => prev.map(x => x.id === r.id ? { ...x, status, lido: status === "pendente" ? x.lido : true } : x));
    try {
      const atualizado = await setRecadoEquipeStatus(r.id, status);
      setRecados(prev => prev.map(x => x.id === r.id ? { ...x, ...atualizado } : x));
    } catch (e) {
      setRecados(prev => prev.map(x => x.id === r.id ? { ...x, status: anterior, lido: r.lido } : x));
      toast({ title: "Não foi possível atualizar o status", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const marcarTodosLidos = async () => {
    const pendentes = filtrados.filter(r => !r.lido);
    if (pendentes.length === 0) return;
    setRecados(prev => prev.map(x => pendentes.some(p => p.id === x.id) ? { ...x, lido: true } : x));
    try {
      await Promise.all(pendentes.map(r => markRecadoEquipeLido(r.id, true)));
    } catch {
      load();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display text-violet-400 flex items-center gap-3" style={{ textShadow: "0 0 14px rgba(167,139,250,0.5)" }}>
            <Inbox className="w-8 h-8" />
            Recados da Equipe
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Mensagens e sugestões enviadas pelos profissionais no Portal do Profissional.
            {naoLidos > 0 && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-violet-500/20 text-violet-300 border border-violet-400/40">{naoLidos} não lido{naoLidos > 1 ? "s" : ""}</span>}
            {porStatus.pendente > 0 && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-400/40">{porStatus.pendente} pendente{porStatus.pendente > 1 ? "s" : ""}</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={marcarTodosLidos}
          disabled={filtrados.every(r => r.lido)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-secondary text-sm font-semibold hover:border-violet-400/50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          <Check className="w-4 h-4" /> Marcar todos como lidos
        </button>
      </div>

      <Card className="p-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border border-border overflow-hidden text-sm">
          {(["pendente", "em_andamento", "resolvido", "todos"] as FiltroStatus[]).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setFiltroStatus(s)}
              className={cn("px-3 py-2 font-semibold transition-colors", filtroStatus === s ? "bg-violet-500 text-white" : "bg-secondary hover:bg-secondary/70")}
            >
              {s === "todos" ? `Todos (${recados.length})` : `${STATUS_META[s].label} (${porStatus[s]})`}
            </button>
          ))}
        </div>
        <Filter className="w-4 h-4 text-muted-foreground" />
        <select
          value={filtroProf}
          onChange={e => setFiltroProf(e.target.value)}
          className="rounded-xl border border-border bg-muted px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-violet-400/40"
        >
          <option value="">Todos os profissionais ({recados.length})</option>
          {profissionais.map(([nome, n]) => <option key={nome} value={nome}>{nome} ({n})</option>)}
        </select>
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={somenteNaoLidos} onChange={e => setSomenteNaoLidos(e.target.checked)} className="accent-violet-500" />
          Somente não lidos
        </label>
        <div className="ml-auto inline-flex rounded-xl border border-border overflow-hidden text-sm">
          <button type="button" onClick={() => setAgrupar("data")} className={cn("px-3 py-2 font-semibold transition-colors", agrupar === "data" ? "bg-violet-500 text-white" : "bg-secondary hover:bg-secondary/70")}>Por data</button>
          <button type="button" onClick={() => setAgrupar("profissional")} className={cn("px-3 py-2 font-semibold transition-colors", agrupar === "profissional" ? "bg-violet-500 text-white" : "bg-secondary hover:bg-secondary/70")}>Por profissional</button>
        </div>
      </Card>

      {loading ? (
        <Card className="p-10 text-center text-muted-foreground animate-pulse">Carregando recados...</Card>
      ) : grupos.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          <Inbox className="w-10 h-10 mx-auto mb-3 opacity-40" />
          Nenhum recado {filtroStatus !== "todos" ? STATUS_META[filtroStatus].label.toLowerCase() : somenteNaoLidos ? "não lido" : "recebido"}{filtroProf ? ` de ${filtroProf}` : ""}.
        </Card>
      ) : (
        grupos.map(([chave, itens]) => (
          <section key={chave} className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2 capitalize">
              {agrupar === "profissional" && <UserRound className="w-4 h-4" />}
              {agrupar === "data" ? dayLabel(chave) : chave}
              <span className="text-xs font-normal normal-case">· {itens.length} recado{itens.length > 1 ? "s" : ""}</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {itens.map(r => (
                <Card
                  key={r.id}
                  className={cn(
                    "p-4 flex flex-col gap-2 transition-all",
                    statusOf(r) === "resolvido" ? "opacity-60" : r.lido ? "opacity-90" : "border-violet-400/40 shadow-[0_0_18px_rgba(167,139,250,0.12)]",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-foreground truncate">{r.professionalName}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.specialty ? `${r.specialty} · ` : ""}{fmtDateTime(r.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border", STATUS_META[statusOf(r)].badge)}>
                        <span className={cn("w-1.5 h-1.5 rounded-full", STATUS_META[statusOf(r)].dot)} />
                        {STATUS_META[statusOf(r)].label}
                      </span>
                      {!r.lido && <span className="w-2.5 h-2.5 rounded-full bg-violet-400" title="Não lido" />}
                    </div>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap break-words">{r.mensagem}</p>
                  {statusOf(r) === "resolvido" && r.resolvedAt && (
                    <p className="text-[11px] text-emerald-300/80">Resolvido em {fmtDateTime(r.resolvedAt)}</p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs">
                      <button type="button" onClick={() => mudarStatus(r, "pendente")} title="Marcar como pendente" className={cn("inline-flex items-center gap-1 px-2.5 py-1.5 font-semibold transition-colors", statusOf(r) === "pendente" ? "bg-amber-500/25 text-amber-200" : "hover:bg-secondary/70")}>
                        <CircleDot className="w-3.5 h-3.5" /> Pendente
                      </button>
                      <button type="button" onClick={() => mudarStatus(r, "em_andamento")} title="Marcar como em andamento" className={cn("inline-flex items-center gap-1 px-2.5 py-1.5 font-semibold transition-colors border-l border-border", statusOf(r) === "em_andamento" ? "bg-sky-500/25 text-sky-200" : "hover:bg-secondary/70")}>
                        <Loader2 className="w-3.5 h-3.5" /> Em andamento
                      </button>
                      <button type="button" onClick={() => mudarStatus(r, "resolvido")} title="Marcar como resolvido" className={cn("inline-flex items-center gap-1 px-2.5 py-1.5 font-semibold transition-colors border-l border-border", statusOf(r) === "resolvido" ? "bg-emerald-500/25 text-emerald-200" : "hover:bg-secondary/70")}>
                        <CheckCircle2 className="w-3.5 h-3.5" /> Resolvido
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleLido(r)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-border hover:border-violet-400/50 transition-colors"
                    >
                      {r.lido ? <><RotateCcw className="w-3.5 h-3.5" /> Marcar como não lido</> : <><Check className="w-3.5 h-3.5" /> Marcar como lido</>}
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
