import { useCallback, useEffect, useMemo, useState } from "react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { MotionCard, Button, Input, Label, Select } from "@/components/ui-custom";
import { DoorOpen, Plus, Trash2, RefreshCw, Clock, CircleDot, Users, Activity, CalendarDays } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  listSalas,
  upsertSala,
  deleteSala,
  getStatusSalas,
  listProfessionals,
  type Sala,
  type StatusSala,
  type SalaStatus,
  type Professional,
} from "@/lib/arco-rpc";

const STATUS_STYLE: Record<SalaStatus, { bg: string; border: string; dot: string; label: string }> = {
  Vermelho: {
    bg: "linear-gradient(135deg, rgba(239,68,68,0.18), rgba(239,68,68,0.06))",
    border: "rgba(239,68,68,0.55)",
    dot: "#ef4444",
    label: "Ocupada",
  },
  Amarelo: {
    bg: "linear-gradient(135deg, rgba(234,179,8,0.20), rgba(234,179,8,0.06))",
    border: "rgba(234,179,8,0.6)",
    dot: "#eab308",
    label: "Ociosa",
  },
  Verde: {
    bg: "linear-gradient(135deg, rgba(34,197,94,0.18), rgba(34,197,94,0.06))",
    border: "rgba(34,197,94,0.55)",
    dot: "#22c55e",
    label: "Livre",
  },
};

const REFRESH_MS = 30_000;

// ISO: 1=Segunda … 7=Domingo (bate com o extract(isodow) do banco).
const WEEKDAYS: Array<{ n: number; label: string }> = [
  { n: 1, label: "Seg" },
  { n: 2, label: "Ter" },
  { n: 3, label: "Qua" },
  { n: 4, label: "Qui" },
  { n: 5, label: "Sex" },
  { n: 6, label: "Sáb" },
  { n: 7, label: "Dom" },
];

type ScheduleEdit = { dias: number[]; inicio: string; fim: string };

export default function SalasPage() {
  useDocumentTitle("Gestão de Salas");
  const { toast } = useToast();

  const [status, setStatus] = useState<StatusSala[]>([]);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [novoNumero, setNovoNumero] = useState("");
  const [novoProfId, setNovoProfId] = useState("");
  const [saving, setSaving] = useState(false);

  // Edição local de dias/horário por sala (chave = sala.id).
  const [sched, setSched] = useState<Record<number, ScheduleEdit>>({});
  const [savingSchedId, setSavingSchedId] = useState<number | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const s = await getStatusSalas();
      setStatus(s);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao carregar status das salas.";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    }
  }, [toast]);

  const fetchAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const [s, sl, pr] = await Promise.all([getStatusSalas(), listSalas(), listProfessionals()]);
      setStatus(s);
      setSalas(sl);
      setProfessionals(pr);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao carregar dados.";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Espelha os dias/horário salvos no estado de edição local.
  useEffect(() => {
    const next: Record<number, ScheduleEdit> = {};
    for (const s of salas) {
      next[s.id] = {
        dias: s.diasSemana ?? [],
        inicio: s.horaInicio ?? "",
        fim: s.horaFim ?? "",
      };
    }
    setSched(next);
  }, [salas]);

  // Atualização automática do status em tempo real
  useEffect(() => {
    const poll = setInterval(fetchStatus, REFRESH_MS);
    return () => clearInterval(poll);
  }, [fetchStatus]);

  const handleAdd = async () => {
    if (!novoNumero.trim()) {
      toast({ title: "Informe o número/nome da sala", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await upsertSala(null, novoNumero.trim(), novoProfId ? Number(novoProfId) : null);
      setNovoNumero("");
      setNovoProfId("");
      await fetchAll();
      toast({ title: "Sala adicionada" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao salvar sala.";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleReassign = async (sala: Sala, professionalId: number | null) => {
    try {
      await upsertSala(sala.id, sala.numero, professionalId, sala.diasSemana, sala.horaInicio, sala.horaFim);
      await fetchAll();
      toast({ title: "Sala atualizada" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao atualizar sala.";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    }
  };

  const toggleDia = (salaId: number, dia: number) => {
    setSched((prev) => {
      const cur = prev[salaId] ?? { dias: [], inicio: "", fim: "" };
      const has = cur.dias.includes(dia);
      const dias = has ? cur.dias.filter((d) => d !== dia) : [...cur.dias, dia].sort((a, b) => a - b);
      return { ...prev, [salaId]: { ...cur, dias } };
    });
  };

  const setScheduleField = (salaId: number, field: "inicio" | "fim", value: string) => {
    setSched((prev) => {
      const cur = prev[salaId] ?? { dias: [], inicio: "", fim: "" };
      return { ...prev, [salaId]: { ...cur, [field]: value } };
    });
  };

  const handleSaveSchedule = async (sala: Sala) => {
    const s = sched[sala.id] ?? { dias: [], inicio: "", fim: "" };
    if ((s.inicio && !s.fim) || (!s.inicio && s.fim)) {
      toast({ title: "Preencha início e fim do horário", variant: "destructive" });
      return;
    }
    setSavingSchedId(sala.id);
    try {
      await upsertSala(sala.id, sala.numero, sala.professionalId, s.dias, s.inicio || null, s.fim || null);
      await fetchAll();
      toast({ title: "Dias/horário salvos" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao salvar dias/horário.";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setSavingSchedId(null);
    }
  };

  const handleDelete = async (sala: Sala) => {
    if (!confirm(`Excluir a sala "${sala.numero}"?`)) return;
    try {
      await deleteSala(sala.id);
      await fetchAll();
      toast({ title: "Sala excluída" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao excluir sala.";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    }
  };

  const counts = useMemo(() => {
    const c = { Verde: 0, Amarelo: 0, Vermelho: 0 } as Record<SalaStatus, number>;
    status.forEach((s) => { c[s.statusAtual] = (c[s.statusAtual] ?? 0) + 1; });
    return c;
  }, [status]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <DoorOpen className="w-7 h-7 text-primary" /> Gestão Inteligente de Salas
          </h1>
          <p className="text-muted-foreground mt-1">
            Status em tempo real — 🟢 Livre · 🟡 Ociosa (paciente não chegou) · 🔴 Ocupada. Atualiza sozinho a cada 30s.
          </p>
        </div>
        <Button variant="outline" onClick={fetchAll} disabled={refreshing} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      {/* Resumo */}
      <div className="flex flex-wrap gap-3">
        {(["Verde", "Amarelo", "Vermelho"] as SalaStatus[]).map((st) => (
          <div
            key={st}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-foreground"
            style={{ background: STATUS_STYLE[st].bg, border: `1px solid ${STATUS_STYLE[st].border}` }}
          >
            <CircleDot className="w-4 h-4" style={{ color: STATUS_STYLE[st].dot }} />
            {STATUS_STYLE[st].label}: {counts[st] ?? 0}
          </div>
        ))}
      </div>

      {/* Dashboard de status */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <MotionCard key={i} className="h-36 animate-pulse bg-secondary/50" />
          ))}
        </div>
      ) : status.length === 0 ? (
        <MotionCard className="p-8 text-center text-muted-foreground">
          Nenhuma sala cadastrada ainda. Adicione suas salas abaixo para começar.
        </MotionCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {status.map((s) => {
            const style = STATUS_STYLE[s.statusAtual];
            return (
              <div
                key={s.salaId}
                className="rounded-2xl p-5"
                style={{ background: style.bg, border: `1px solid ${style.border}` }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xl font-bold text-foreground flex items-center gap-2">
                      <DoorOpen className="w-5 h-5 text-muted-foreground" />
                      {s.numeroDaSala}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s.totalProfissionais} {s.totalProfissionais === 1 ? "profissional" : "profissionais"}
                    </p>
                  </div>
                  <span
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-foreground"
                    style={{ background: "rgba(0,0,0,0.25)", border: `1px solid ${style.border}` }}
                  >
                    <CircleDot className="w-3.5 h-3.5" style={{ color: style.dot }} />
                    {style.label}
                  </span>
                </div>

                <p className="text-sm text-foreground/90 mt-3">{s.detalheStatus}</p>

                <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                  <p className="flex items-start gap-1.5">
                    <Users className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span><span className="text-foreground/80">Profissionais:</span> {s.profissionais ?? "Sem profissional"}</span>
                  </p>
                  {s.pacienteAtual && (
                    <p className="flex items-start gap-1.5">
                      <Activity className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>
                        <span className="text-foreground/80">Em atendimento:</span>{" "}
                        <span className="text-foreground/90 font-medium">{s.pacienteAtual}</span>
                        {s.horarioAtual ? ` (${s.horarioAtual})` : ""}
                        {s.profissionalEmAtendimento ? ` — ${s.profissionalEmAtendimento}` : ""}
                      </span>
                    </p>
                  )}
                  <p className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    Próximo agendamento: {s.horarioProximoAgendamento ?? "—"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cadastro de salas */}
      <MotionCard className="p-6">
        <h2 className="text-lg font-bold text-foreground mb-1">Cadastro de Salas</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Para uma sala compartilhada, cadastre o mesmo nome para cada profissional — o painel acima agrupa tudo num único card da sala física.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-end mb-6">
          <div className="flex-1">
            <Label htmlFor="numero">Número / Nome da sala</Label>
            <Input
              id="numero"
              value={novoNumero}
              onChange={(e) => setNovoNumero(e.target.value)}
              placeholder="Ex: Sala 1"
            />
          </div>
          <div className="flex-1">
            <Label htmlFor="prof">Profissional responsável</Label>
            <Select id="prof" value={novoProfId} onChange={(e) => setNovoProfId(e.target.value)}>
              <option value="">— Sem profissional —</option>
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
          <Button onClick={handleAdd} disabled={saving} className="gap-2">
            <Plus className="w-4 h-4" /> Adicionar
          </Button>
        </div>

        {salas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma sala cadastrada.</p>
        ) : (
          <div className="space-y-3">
            {salas.map((sala) => {
              const s = sched[sala.id] ?? { dias: [], inicio: "", fim: "" };
              return (
              <div
                key={sala.id}
                className="p-3 rounded-xl border border-border bg-secondary/30 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 font-semibold text-foreground flex items-center gap-2">
                    <DoorOpen className="w-4 h-4 text-muted-foreground" />
                    {sala.numero}
                  </div>
                  <div className="sm:w-64">
                    <Select
                      value={sala.professionalId ? String(sala.professionalId) : ""}
                      onChange={(e) => handleReassign(sala, e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">— Sem profissional —</option>
                      {professionals.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </Select>
                  </div>
                  <Button variant="destructive" size="icon" onClick={() => handleDelete(sala)} title="Excluir sala">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                {/* Dias + horário que o profissional usa esta sala */}
                <div className="flex flex-col lg:flex-row lg:items-center gap-3 pl-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
                    {WEEKDAYS.map((d) => {
                      const active = s.dias.includes(d.n);
                      return (
                        <button
                          key={d.n}
                          type="button"
                          onClick={() => toggleDia(sala.id, d.n)}
                          className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-colors ${
                            active
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-secondary/40 text-muted-foreground border-border hover:border-primary/40"
                          }`}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                    <Input
                      type="time"
                      value={s.inicio}
                      onChange={(e) => setScheduleField(sala.id, "inicio", e.target.value)}
                      className="w-28"
                    />
                    <span className="text-muted-foreground">–</span>
                    <Input
                      type="time"
                      value={s.fim}
                      onChange={(e) => setScheduleField(sala.id, "fim", e.target.value)}
                      className="w-28"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSaveSchedule(sala)}
                    disabled={savingSchedId === sala.id}
                  >
                    {savingSchedId === sala.id ? "Salvando…" : "Salvar dias/horário"}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground pl-1">
                  {s.dias.length === 0
                    ? "Sem dias marcados = usa a sala todos os dias."
                    : `Usa esta sala: ${s.dias.map((n) => WEEKDAYS.find((w) => w.n === n)?.label).join(", ")}${
                        s.inicio && s.fim ? ` · ${s.inicio}–${s.fim}` : ""
                      }`}
                </p>
              </div>
              );
            })}
          </div>
        )}
      </MotionCard>
    </div>
  );
}
