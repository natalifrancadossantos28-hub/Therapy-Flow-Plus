import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ShieldAlert, Search, RefreshCw, Phone, CircleDot, Loader2, CheckCircle2, XCircle, MessageSquare, Printer, Archive, RotateCcw, Snowflake, Plus } from "lucide-react";
import { printBuscaAtivaReport } from "@/lib/print-busca-ativa";
import { buscaStatusLabel, casoAberto } from "@/lib/busca-ativa";
import { Card, Button, Badge, Input } from "@/components/ui-custom";
import { EncaminharBuscaAtivaModal } from "@/components/EncaminharBuscaAtivaModal";
import { useToast } from "@/hooks/use-toast";
import { cn, formatDate } from "@/lib/utils";
import {
  listBuscaAtivaCasos,
  updateBuscaAtivaCaso,
  listPatients,
  type BuscaAtivaCaso,
  type BuscaAtivaStatus,
  type Patient,
} from "@/lib/arco-rpc";

type StatusAberto = Exclude<BuscaAtivaStatus, "finalizado">;

const BUSCA_STATUS: { v: StatusAberto; label: string; icon: typeof CircleDot; on: string }[] = [
  { v: "pendente", label: "Pendente", icon: CircleDot, on: "bg-slate-500/25 text-slate-200" },
  { v: "em_andamento", label: "Em andamento", icon: Loader2, on: "bg-sky-500/25 text-sky-200" },
  { v: "resolvido", label: "Resolvido", icon: CheckCircle2, on: "bg-emerald-500/25 text-emerald-200" },
  { v: "nao_resolvido", label: "Não resolvido", icon: XCircle, on: "bg-red-500/25 text-red-200" },
];

export default function BuscaAtivaPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<BuscaAtivaCaso[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<BuscaAtivaStatus | "">("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [pickQuery, setPickQuery] = useState("");
  const [picking, setPicking] = useState(false);
  const [encaminhar, setEncaminhar] = useState<{ id: number; name: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listBuscaAtivaCasos());
    } catch (err: unknown) {
      toast({ title: "Erro ao carregar a Busca Ativa", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const abertos = useMemo(() => items.filter(casoAberto), [items]);
  const finalizados = useMemo(() => items.filter(c => !casoAberto(c)), [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = filter === "finalizado"
      ? [...finalizados].sort((a, b) => (b.finalizadoAt || "").localeCompare(a.finalizadoAt || ""))
      : abertos.filter(c => !filter || c.status === filter);
    return base.filter(c => !q || c.patientName.toLowerCase().includes(q) || (c.prontuario || "").toLowerCase().includes(q));
  }, [abertos, finalizados, filter, search]);

  const salvar = async (c: BuscaAtivaCaso, status: BuscaAtivaStatus, obs: string | null, saida?: string) => {
    setSavingId(c.id);
    try {
      await updateBuscaAtivaCaso(c.id, status, obs, saida ?? null);
      const now = new Date().toISOString();
      setItems(prev => prev.map(i => i.id === c.id ? {
        ...i, status, obs, updatedAt: now,
        finalizadoAt: status === "finalizado" ? now : null,
        saida: status === "finalizado" ? (saida || "Busca ativa finalizada") : null,
      } : i));
    } catch (err: unknown) {
      toast({ title: "Erro ao salvar", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  const editObs = (c: BuscaAtivaCaso) => {
    const obs = prompt(`Observação da busca ativa — ${c.patientName}\n(ex.: visita feita, conselho tutelar acionado...)`, c.obs || "");
    if (obs === null) return;
    salvar(c, c.status, obs.trim() || null);
  };

  const finalizar = (c: BuscaAtivaCaso) => {
    const obs = prompt(`Finalizar a busca ativa de ${c.patientName}?\n\nEle sai desta lista. A agenda e a fila NÃO mudam.\nObservação final (opcional):`, c.obs || "");
    if (obs === null) return;
    salvar(c, "finalizado", obs.trim() || null, "Busca ativa finalizada");
  };

  const soPausa = (c: BuscaAtivaCaso) => {
    if (!confirm(`${c.patientName} é só pausa (não é caso da assistente social)?\n\nSai da Busca Ativa e continua em Pausados, sem mudar a agenda nem a fila.`)) return;
    salvar(c, "finalizado", c.obs, "Era só pausa — continua em Pausados");
  };

  const abrirEscolha = () => {
    setPicking(true);
    if (!patients) listPatients().then(setPatients).catch(() => setPatients([]));
  };

  const pickList = useMemo(() => {
    const q = pickQuery.trim().toLowerCase();
    if (!patients || q.length < 2) return [];
    return patients.filter(p => p.name.toLowerCase().includes(q) || (p.prontuario || "").toLowerCase().includes(q)).slice(0, 8);
  }, [patients, pickQuery]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display flex items-center gap-2">
            <ShieldAlert className="w-7 h-7 text-rose-400" /> Busca Ativa
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Casos para a assistente social (violação de direitos, risco, faltas seguidas...). A criança continua na agenda e na fila normalmente.
            Ao terminar, clique em <strong>Finalizar e tirar da lista</strong> para seguir com o próximo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={abrirEscolha} className="gap-2 bg-rose-600 hover:bg-rose-500 text-white">
            <Plus className="w-4 h-4" /> Encaminhar paciente
          </Button>
          <Button variant="outline" onClick={() => printBuscaAtivaReport(filtered, filter ? buscaStatusLabel(filter) : "")} className="gap-2">
            <Printer className="w-4 h-4" /> Imprimir relatório
          </Button>
          <Link href="/pausados"><Button variant="outline" className="gap-2"><Snowflake className="w-4 h-4" /> Pausados</Button></Link>
          <Button variant="outline" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /> Atualizar
          </Button>
        </div>
      </div>

      {picking && (
        <Card className="p-4 space-y-2 border-rose-500/40">
          <div className="flex gap-2">
            <Input autoFocus placeholder="Digite o nome ou prontuário do paciente…" value={pickQuery} onChange={e => setPickQuery(e.target.value)} />
            <Button variant="outline" onClick={() => { setPicking(false); setPickQuery(""); }}>Fechar</Button>
          </div>
          {!patients && <p className="text-xs text-muted-foreground">Carregando pacientes…</p>}
          {pickList.map(p => (
            <button key={p.id} type="button" onClick={() => setEncaminhar({ id: p.id, name: p.name })}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-secondary/60 text-sm">
              <span className="font-semibold">{p.name}</span>
              {p.prontuario && <span className="text-xs text-muted-foreground ml-2">Pront. {p.prontuario}</span>}
            </button>
          ))}
        </Card>
      )}

      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant={filter ? "outline" : "default"} onClick={() => setFilter("")}>Na lista ({abertos.length})</Button>
        {BUSCA_STATUS.map(b => (
          <Button key={b.v} size="sm" variant={filter === b.v ? "default" : "outline"} onClick={() => setFilter(b.v)}>
            {b.label} ({abertos.filter(c => c.status === b.v).length})
          </Button>
        ))}
        <Button size="sm" variant={filter === "finalizado" ? "default" : "outline"} onClick={() => setFilter("finalizado")} className="gap-1">
          <Archive className="w-3.5 h-3.5" /> Já passaram ({finalizados.length})
        </Button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por nome ou prontuário…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border">
              <tr>
                <th className="px-5 py-3">Nº</th>
                <th className="px-5 py-3">Paciente</th>
                <th className="px-5 py-3">Especialidade</th>
                <th className="px-5 py-3">Motivo</th>
                <th className="px-5 py-3">{filter === "finalizado" ? "Período" : "Desde"}</th>
                <th className="px-5 py-3">Acompanhamento</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && items.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">Carregando…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">Nenhum caso{search || filter ? " com esse filtro" : " na Busca Ativa"}.</td></tr>
              ) : filtered.map((c, idx) => {
                const aberto = casoAberto(c);
                return (
                  <tr key={c.id} className="hover:bg-secondary/30">
                    <td className="px-5 py-3 font-bold text-rose-400 whitespace-nowrap">{idx + 1}º</td>
                    <td className="px-5 py-3">
                      <Link href={`/patients/${c.patientId}`} className="font-semibold hover:underline">{c.patientName}</Link>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        {c.prontuario && <span>Pront. {c.prontuario}</span>}
                        {c.patientPhone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{c.patientPhone}</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3">{c.specialty || "—"}{c.professionalName && <div className="text-xs text-muted-foreground">{c.professionalName}</div>}</td>
                    <td className="px-5 py-3 max-w-[280px]">
                      {c.motivo}
                      <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-1 items-center">
                        {c.origem === "pausa" && <Badge className="text-[10px] uppercase font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">Veio da pausa</Badge>}
                        {c.encaminhadoPor && <span>por {c.encaminhadoPor}</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-muted-foreground">
                      {formatDate(c.createdAt)}{!aberto && c.finalizadoAt ? ` até ${formatDate(c.finalizadoAt)}` : ""}
                    </td>
                    <td className="px-5 py-3 min-w-[260px]">
                      {aberto ? (
                        <div className="inline-flex flex-wrap rounded-lg border border-border overflow-hidden text-xs">
                          {BUSCA_STATUS.map((b, i) => {
                            const Icon = b.icon;
                            const active = c.status === b.v;
                            return (
                              <button key={b.v} type="button" disabled={savingId === c.id}
                                onClick={() => !active && salvar(c, b.v, c.obs)}
                                className={cn("inline-flex items-center gap-1 px-2 py-1.5 font-semibold transition-colors", i > 0 && "border-l border-border", active ? b.on : "hover:bg-secondary/70 text-muted-foreground")}>
                                <Icon className="w-3.5 h-3.5" /> {b.label}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-xs text-emerald-400">{c.saida || "Finalizada"}</span>
                      )}
                      <button type="button" onClick={() => editObs(c)} className="mt-1.5 flex items-start gap-1 text-xs text-left text-muted-foreground hover:text-foreground">
                        <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span>{c.obs || "Adicionar observação"}</span>
                      </button>
                    </td>
                    <td className="px-5 py-3 text-right space-y-1.5">
                      {aberto ? (
                        <>
                          <Button size="sm" className="gap-1 w-full bg-rose-600 hover:bg-rose-500 text-white" disabled={savingId === c.id} onClick={() => finalizar(c)}>
                            <Archive className="w-3.5 h-3.5" /> Finalizar e tirar da lista
                          </Button>
                          {c.origem === "pausa" && (
                            <Button size="sm" variant="outline" className="gap-1 w-full" disabled={savingId === c.id} onClick={() => soPausa(c)}>
                              <Snowflake className="w-3.5 h-3.5" /> É só pausa
                            </Button>
                          )}
                        </>
                      ) : (
                        <Button size="sm" variant="outline" className="gap-1 w-full" disabled={savingId === c.id} onClick={() => salvar(c, "pendente", c.obs)}>
                          <RotateCcw className="w-3.5 h-3.5" /> Reabrir busca
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {encaminhar && (
        <EncaminharBuscaAtivaModal
          patientId={encaminhar.id}
          patientName={encaminhar.name}
          onClose={() => setEncaminhar(null)}
          onDone={() => { setPicking(false); setPickQuery(""); load(); }}
        />
      )}
    </div>
  );
}
