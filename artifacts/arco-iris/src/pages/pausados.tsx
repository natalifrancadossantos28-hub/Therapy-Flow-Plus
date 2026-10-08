import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Snowflake, Clock, Play, Search, RefreshCw, Phone } from "lucide-react";
import { Card, Button, Badge, Input } from "@/components/ui-custom";
import { useToast } from "@/hooks/use-toast";
import { cn, formatDate } from "@/lib/utils";
import {
  listPausedOverview,
  setWaitingListPaused,
  type PausedOverviewItem,
} from "@/lib/arco-rpc";

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
      .filter(i => !q || i.patientName.toLowerCase().includes(q) || (i.prontuario || "").toLowerCase().includes(q))
      .sort((a, b) => {
        // vencidos primeiro, depois quem vence antes, depois sem prazo
        const da = daysUntil(a.pausedReturnDate), db = daysUntil(b.pausedReturnDate);
        if (da === null && db === null) return (b.pausedAt || "").localeCompare(a.pausedAt || "");
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db;
      });
  }, [items, search, specFilter]);

  const overdueCount = items.filter(i => i.returnOverdue).length;
  const nearCount = items.filter(i => { const d = daysUntil(i.pausedReturnDate); return d !== null && d >= 0 && d <= 7; }).length;

  const handleResume = async (item: PausedOverviewItem) => {
    if (item.source !== "fila") {
      toast({ title: "Pausa antiga da agenda", description: "Essa pausa foi feita no modelo antigo. Retome pelo card do paciente na agenda do profissional." });
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
            Pacientes que saíram da agenda ou da disputa da fila temporariamente. Aqui fica o motivo, de onde vieram e a previsão de retorno.
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
                <th className="px-5 py-3">Motivo</th>
                <th className="px-5 py-3">Pausado em</th>
                <th className="px-5 py-3">Retorno previsto</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && items.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">Carregando…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">Nenhum paciente pausado{search || specFilter ? " com esse filtro" : ""}.</td></tr>
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
