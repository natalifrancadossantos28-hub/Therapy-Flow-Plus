import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Snowflake, Clock, Play, Search, RefreshCw, Phone, CircleDot, Loader2, CheckCircle2, XCircle, MessageSquare } from "lucide-react";
import { Card, Button, Badge, Input } from "@/components/ui-custom";
import { useToast } from "@/hooks/use-toast";
import { cn, formatDate } from "@/lib/utils";
import {
  listPausedOverview,
  setWaitingListPaused,
  resumePatientAgendaPause,
  setBuscaAtivaStatus,
  type BuscaAtivaStatus,
  type PausedOverviewItem,
} from "@/lib/arco-rpc";

const BUSCA_STATUS: { v: BuscaAtivaStatus; label: string; icon: typeof CircleDot; on: string }[] = [
  { v: "pendente", label: "Pendente", icon: CircleDot, on: "bg-slate-500/25 text-slate-200" },
  { v: "em_andamento", label: "Em andamento", icon: Loader2, on: "bg-sky-500/25 text-sky-200" },
  { v: "resolvido", label: "Resolvido", icon: CheckCircle2, on: "bg-emerald-500/25 text-emerald-200" },
  { v: "nao_resolvido", label: "Não resolvido", icon: XCircle, on: "bg-red-500/25 text-red-200" },
];

const buscaOf = (i: PausedOverviewItem): BuscaAtivaStatus => i.buscaStatus || "pendente";
const keyOf = (i: PausedOverviewItem) => `${i.source}-${i.id}`;

const todayIso = () => new Date().toISOString().slice(0, 10);

function daysUntil(d: string | null | undefined): number | null {
  if (!d) return null;
  return Math.round((new Date(d + "T12:00:00").getTime() - new Date(todayIso() + "T12:00:00").getTime()) / 86_400_000);
}

export default function PausadosPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<PausedOverviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [specFilter, setSpecFilter] = useState<string>("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [buscaFilter, setBuscaFilter] = useState<BuscaAtivaStatus | "">("");
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listPausedOverview();
      setItems([...r.fila, ...r.agenda]);
    } catch (err: unknown) {
      toast({ title: "Erro ao carregar pausados", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const specialties = useMemo(
    () => Array.from(new Set(items.map(i => i.specialty).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [items]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter(i => !specFilter || i.specialty === specFilter)
      .filter(i => !buscaFilter || buscaOf(i) === buscaFilter)
      .filter(i => !q || i.patientName.toLowerCase().includes(q) || (i.prontuario || "").toLowerCase().includes(q))
      .sort((a, b) => {
        // vencidos primeiro, depois quem vence antes, depois sem prazo
        const da = daysUntil(a.pausedReturnDate), db = daysUntil(b.pausedReturnDate);
        if (da === null && db === null) return (b.pausedAt || "").localeCompare(a.pausedAt || "");
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db;
      });
  }, [items, search, specFilter, buscaFilter]);

  const overdueCount = items.filter(i => i.returnOverdue).length;
  const nearCount = items.filter(i => { const d = daysUntil(i.pausedReturnDate); return d !== null && d >= 0 && d <= 7; }).length;

  const updateBusca = async (item: PausedOverviewItem, status: BuscaAtivaStatus, obs: string | null) => {
    const k = keyOf(item);
    setSavingKey(k);
    try {
      await setBuscaAtivaStatus(item.source, item.id, status, obs);
      setItems(prev => prev.map(i => keyOf(i) === k ? { ...i, buscaStatus: status, buscaObs: obs, buscaUpdatedAt: new Date().toISOString() } : i));
    } catch (err: unknown) {
      toast({ title: "Erro ao salvar busca ativa", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setSavingKey(null);
    }
  };

  const editObs = (item: PausedOverviewItem) => {
    const obs = prompt(`Observação da busca ativa — ${item.patientName}\n(ex.: visita feita, família informou que...)`, item.buscaObs || "");
    if (obs === null) return;
    updateBusca(item, buscaOf(item), obs.trim() || null);
  };

  const handleResume = async (item: PausedOverviewItem) => {
    if (item.source !== "fila") {
      if (!item.professionalId) {
        toast({ title: "Retome pela agenda", description: "Abra o card do paciente na agenda do profissional e clique em Retomar Atendimento." });
        return;
      }
      if (!confirm(`Retomar ${item.patientName} na agenda de ${item.professionalName}?\n\nOs horários dele voltam para "Agendado".`)) return;
      setBusyId(item.id);
      try {
        await resumePatientAgendaPause(item.patientId, item.professionalId);
        setItems(prev => prev.filter(i => keyOf(i) !== keyOf(item)));
        toast({ title: "▶ Retomado", description: `${item.patientName} voltou para a agenda de ${item.professionalName}.` });
      } catch (err: unknown) {
        toast({ title: "Erro", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
      } finally {
        setBusyId(null);
      }
      return;
    }
    if (!confirm(`Retomar ${item.patientName} em ${item.specialty}?\n\nEle volta a disputar vaga na Fila de Espera (o horário anterior pode já ter sido ocupado).`)) return;
    setBusyId(item.id);
    try {
      await setWaitingListPaused(item.id, false);
      setItems(prev => prev.filter(i => !(i.source === "fila" && i.id === item.id)));
      toast({ title: "▶ Retomado", description: `${item.patientName} voltou para a Fila de Espera de ${item.specialty}.` });
    } catch (err: unknown) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display flex items-center gap-2">
            <Snowflake className="w-7 h-7 text-sky-400" /> Pausados / Busca Ativa
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Pacientes pausados pela fila ou pela agenda. Aqui fica o motivo, se saiu ou ficou na agenda, a previsão de retorno e o acompanhamento da busca ativa (Pendente, Em andamento, Resolvido, Não resolvido).
            Vencido o prazo, o paciente volta sozinho para a Fila de Espera da especialidade.
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading} className="gap-2">
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /> Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4"><p className="text-xs uppercase text-muted-foreground">Total pausados</p><p className="text-3xl font-bold text-sky-400">{items.length}</p></Card>
        <Card className="p-4 border-yellow-500/30"><p className="text-xs uppercase text-muted-foreground">Retorno nos próximos 7 dias</p><p className="text-3xl font-bold text-yellow-400">{nearCount}</p></Card>
        <Card className="p-4 border-red-500/30"><p className="text-xs uppercase text-muted-foreground">Prazo vencido</p><p className="text-3xl font-bold text-red-400">{overdueCount}</p></Card>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="text-xs uppercase text-muted-foreground font-bold self-center mr-1">Busca ativa:</span>
        <Button size="sm" variant={buscaFilter ? "outline" : "default"} onClick={() => setBuscaFilter("")}>Todos ({items.length})</Button>
        {BUSCA_STATUS.map(b => (
          <Button key={b.v} size="sm" variant={buscaFilter === b.v ? "default" : "outline"} onClick={() => setBuscaFilter(b.v)}>
            {b.label} ({items.filter(i => buscaOf(i) === b.v).length})
          </Button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome ou prontuário…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant={specFilter ? "outline" : "default"} onClick={() => setSpecFilter("")}>Todas</Button>
          {specialties.map(sp => (
            <Button key={sp} size="sm" variant={specFilter === sp ? "default" : "outline"} onClick={() => setSpecFilter(sp)}>
              {sp} ({items.filter(i => i.specialty === sp).length})
            </Button>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border">
              <tr>
                <th className="px-5 py-3">Paciente</th>
                <th className="px-5 py-3">Especialidade</th>
                <th className="px-5 py-3">Veio de</th>
                <th className="px-5 py-3">Agenda</th>
                <th className="px-5 py-3">Motivo</th>
                <th className="px-5 py-3">Pausado em</th>
                <th className="px-5 py-3">Retorno previsto</th>
                <th className="px-5 py-3">Busca ativa</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && items.length === 0 ? (
                <tr><td colSpan={9} className="px-5 py-10 text-center text-muted-foreground">Carregando…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-5 py-10 text-center text-muted-foreground">Nenhum paciente pausado{search || specFilter ? " com esse filtro" : ""}.</td></tr>
              ) : filtered.map(item => {
                const d = daysUntil(item.pausedReturnDate);
                const overdue = item.returnOverdue || (d !== null && d < 0);
                const near = !overdue && d !== null && d <= 7;
                return (
                  <tr key={`${item.source}-${item.id}`} className={cn("hover:bg-secondary/30", overdue && "bg-red-500/5", near && "bg-yellow-500/5")}>
                    <td className="px-5 py-3">
                      <Link href={`/patients/${item.patientId}`} className="font-semibold hover:underline">{item.patientName}</Link>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        {item.prontuario && <span>Pront. {item.prontuario}</span>}
                        {item.patientPhone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{item.patientPhone}</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3">{item.specialty || "—"}</td>
                    <td className="px-5 py-3">
                      <Badge className={cn("text-[10px] uppercase font-bold",
                        (item.origin || "").startsWith("Agenda") ? "bg-violet-500/20 text-violet-300 border border-violet-500/30" : "bg-sky-500/20 text-sky-300 border border-sky-500/30")}>
                        {item.origin || (item.source === "fila" ? "Fila de Espera" : "Agenda")}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      {item.keepsAgenda ? (
                        <Badge className="text-[10px] uppercase font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Ficou na agenda</Badge>
                      ) : (
                        <Badge className="text-[10px] uppercase font-bold bg-red-500/20 text-red-300 border border-red-500/30">Saiu da agenda</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3 max-w-[260px]"><span className="text-foreground">{item.pausedReason || "—"}</span></td>
                    <td className="px-5 py-3 whitespace-nowrap text-muted-foreground">{item.pausedAt ? formatDate(item.pausedAt) : "—"}</td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      {item.pausedReturnDate ? (
                        <span className={cn("font-semibold inline-flex items-center gap-1", overdue ? "text-red-400" : near ? "text-yellow-400" : "text-foreground")}>
                          <Clock className="w-3.5 h-3.5" /> {formatDate(item.pausedReturnDate)}
                          {overdue && <span className="text-[10px] uppercase ml-1">vencido</span>}
                          {near && <span className="text-[10px] uppercase ml-1">{d === 0 ? "hoje" : `em ${d}d`}</span>}
                        </span>
                      ) : <span className="text-muted-foreground">sem prazo</span>}
                    </td>
                    <td className="px-5 py-3 min-w-[260px]">
                      <div className="inline-flex flex-wrap rounded-lg border border-border overflow-hidden text-xs">
                        {BUSCA_STATUS.map((b, idx) => {
                          const Icon = b.icon;
                          const active = buscaOf(item) === b.v;
                          return (
                            <button key={b.v} type="button" title={`Marcar como ${b.label.toLowerCase()}`}
                              disabled={savingKey === keyOf(item)}
                              onClick={() => !active && updateBusca(item, b.v, item.buscaObs ?? null)}
                              className={cn("inline-flex items-center gap-1 px-2 py-1.5 font-semibold transition-colors", idx > 0 && "border-l border-border", active ? b.on : "hover:bg-secondary/70 text-muted-foreground")}>
                              <Icon className="w-3.5 h-3.5" /> {b.label}
                            </button>
                          );
                        })}
                      </div>
                      <button type="button" onClick={() => editObs(item)} className="mt-1.5 flex items-start gap-1 text-xs text-left text-muted-foreground hover:text-foreground">
                        <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span>{item.buscaObs || "Adicionar observação"}</span>
                      </button>
                      {item.buscaUpdatedAt && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">Atualizado em {formatDate(item.buscaUpdatedAt)}</p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button size="sm" variant="outline" className="gap-1 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                        disabled={busyId === item.id} onClick={() => handleResume(item)}>
                        <Play className="w-3.5 h-3.5" /> Retomar
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
