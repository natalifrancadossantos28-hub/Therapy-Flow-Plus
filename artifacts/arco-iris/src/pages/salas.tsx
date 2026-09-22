import { useCallback, useEffect, useMemo, useState } from "react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { MotionCard, Button, Input, Label, Select } from "@/components/ui-custom";
import { DoorOpen, Plus, Trash2, RefreshCw, Clock, CircleDot, Users, Activity, CalendarDays, UserCheck, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SPECIALTIES } from "@/lib/specialty-colors";
import {
  listSalas,
  upsertSala,
  deleteSala,
  listSalaHorarios,
  addSalaHorario,
  deleteSalaHorario,
  getStatusSalas,
  listProfessionals,
  type Sala,
  type SalaHorario,
  type StatusSala,
  type SalaStatus,
  type Professional,
} from "@/lib/arco-rpc";

const STATUS_STYLE: Record<SalaStatus, { bg: string; border: string; dot: string; label: string }> = {
  Vermelho: {
    bg: "linear-gradient(135deg, rgba(239,68,68,0.18), rgba(239,68,68,0.06))",
    border: "rgba(239,68,68,0.55)",
    dot: "#ef4444",
    label: "Em atendimento",
  },
  Azul: {
    bg: "linear-gradient(135deg, rgba(59,130,246,0.20), rgba(59,130,246,0.06))",
    border: "rgba(59,130,246,0.6)",
    dot: "#3b82f6",
    label: "Paciente chegou",
  },
  Amarelo: {
    bg: "linear-gradient(135deg, rgba(234,179,8,0.20), rgba(234,179,8,0.06))",
    border: "rgba(234,179,8,0.6)",
    dot: "#eab308",
    label: "Aguardando paciente",
  },
  Verde: {
    bg: "linear-gradient(135deg, rgba(34,197,94,0.18), rgba(34,197,94,0.06))",
    border: "rgba(34,197,94,0.55)",
    dot: "#22c55e",
    label: "Livre",
  },
};

const STATUS_ORDER: SalaStatus[] = ["Verde", "Amarelo", "Azul", "Vermelho"];

const REFRESH_MS = 30_000;

// ISO: 1=Segunda … 7=Domingo (bate com o extract(isodow) do banco).
const WEEKDAYS: Array<{ n: number; label: string }> = [
  { n: 1, label: "Segunda" },
  { n: 2, label: "Terça" },
  { n: 3, label: "Quarta" },
  { n: 4, label: "Quinta" },
  { n: 5, label: "Sexta" },
  { n: 6, label: "Sábado" },
  { n: 7, label: "Domingo" },
];

type NovoPeriodo = { professionalId: string; dias: number[]; inicio: string; fim: string };
const EMPTY_PERIODO: NovoPeriodo = { professionalId: "", dias: [], inicio: "", fim: "" };

export default function SalasPage() {
  useDocumentTitle("Gestão de Salas");
  const { toast } = useToast();

  const [status, setStatus] = useState<StatusSala[]>([]);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [horarios, setHorarios] = useState<SalaHorario[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [novoNumero, setNovoNumero] = useState("");
  const [novaEspecialidade, setNovaEspecialidade] = useState("");
  const [saving, setSaving] = useState(false);

  // Formulário "Adicionar horário" por sala (chave = sala.id).
  const [novo, setNovo] = useState<Record<number, NovoPeriodo>>({});
  const [savingSalaId, setSavingSalaId] = useState<number | null>(null);
  const [openSalaId, setOpenSalaId] = useState<number | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setStatus(await getStatusSalas());
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao carregar status das salas.";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    }
  }, [toast]);

  const fetchAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const [s, sl, hs, pr] = await Promise.all([getStatusSalas(), listSalas(), listSalaHorarios(), listProfessionals()]);
      setStatus(s);
      setSalas(sl);
      setHorarios(hs);
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

  useEffect(() => {
    const poll = setInterval(fetchStatus, REFRESH_MS);
    return () => clearInterval(poll);
  }, [fetchStatus]);

  const profName = useCallback(
    (id: number) => professionals.find((p) => p.id === id)?.name ?? `Profissional #${id}`,
    [professionals]
  );

  const handleAdd = async () => {
    if (!novoNumero.trim()) {
      toast({ title: "Informe o número/nome da sala", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await upsertSala(null, novoNumero.trim(), novaEspecialidade || null);
      setNovoNumero("");
      setNovaEspecialidade("");
      await fetchAll();
      toast({ title: "Sala adicionada" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao salvar sala.";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleEspecialidade = async (sala: Sala, especialidade: string) => {
    try {
      await upsertSala(sala.id, sala.numero, especialidade || null);
      await fetchAll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao atualizar sala.";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    }
  };

  const handleDelete = async (sala: Sala) => {
    if (!confirm(`Excluir a sala "${sala.numero}" e todos os horários vinculados?`)) return;
    try {
      await deleteSala(sala.id);
      await fetchAll();
      toast({ title: "Sala excluída" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao excluir sala.";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    }
  };

  const setNovoField = (salaId: number, patch: Partial<NovoPeriodo>) => {
    setNovo((prev) => ({ ...prev, [salaId]: { ...(prev[salaId] ?? EMPTY_PERIODO), ...patch } }));
  };

  const toggleDia = (salaId: number, dia: number) => {
    const cur = novo[salaId] ?? EMPTY_PERIODO;
    const dias = cur.dias.includes(dia) ? cur.dias.filter((d) => d !== dia) : [...cur.dias, dia].sort((a, b) => a - b);
    setNovoField(salaId, { dias });
  };

  const handleAddHorario = async (sala: Sala) => {
    const f = novo[sala.id] ?? EMPTY_PERIODO;
    if (!f.professionalId) {
      toast({ title: "Escolha o profissional", variant: "destructive" });
      return;
    }
    if (f.dias.length === 0) {
      toast({ title: "Marque pelo menos um dia da semana", variant: "destructive" });
      return;
    }
    if (!f.inicio || !f.fim) {
      toast({ title: "Preencha início e fim do horário", variant: "destructive" });
      return;
    }
    if (f.fim <= f.inicio) {
      toast({ title: "O fim deve ser depois do início", variant: "destructive" });
      return;
    }
    setSavingSalaId(sala.id);
    const erros: string[] = [];
    for (const dia of f.dias) {
      try {
        await addSalaHorario({
          salaId: sala.id,
          professionalId: Number(f.professionalId),
          diaSemana: dia,
          horaInicio: f.inicio,
          horaFim: f.fim,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Falha ao salvar horário.";
        erros.push(`${WEEKDAYS.find((w) => w.n === dia)?.label}: ${msg}`);
      }
    }
    setSavingSalaId(null);
    await fetchAll();
    if (erros.length > 0) {
      toast({ title: "⚠️ Conflito de sala", description: erros.join(" · "), variant: "destructive" });
    } else {
      setNovoField(sala.id, { dias: [], inicio: "", fim: "" });
      toast({ title: "Horário adicionado" });
    }
  };

  const handleDeleteHorario = async (h: SalaHorario) => {
    try {
      await deleteSalaHorario(h.id);
      await fetchAll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao remover horário.";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    }
  };

  const counts = useMemo(() => {
    const c: Record<SalaStatus, number> = { Verde: 0, Amarelo: 0, Azul: 0, Vermelho: 0 };
    status.forEach((s) => { c[s.statusAtual] = (c[s.statusAtual] ?? 0) + 1; });
    return c;
  }, [status]);

  // Períodos agrupados por sala → profissional → dia.
  const horariosPorSala = useMemo(() => {
    const map = new Map<number, Map<number, SalaHorario[]>>();
    for (const h of horarios) {
      if (!map.has(h.salaId)) map.set(h.salaId, new Map());
      const byProf = map.get(h.salaId)!;
      if (!byProf.has(h.professionalId)) byProf.set(h.professionalId, []);
      byProf.get(h.professionalId)!.push(h);
    }
    return map;
  }, [horarios]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <DoorOpen className="w-7 h-7 text-primary" /> Gestão de Salas
          </h1>
          <p className="text-muted-foreground mt-1">
            Cada card é uma sala física. 🟢 Livre · 🟡 Aguardando paciente (agendado, sem check-in) · 🔵 Paciente chegou (check-in feito) · 🔴 Em atendimento. Atualiza sozinho a cada 30s.
          </p>
        </div>
        <Button variant="outline" onClick={fetchAll} disabled={refreshing} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      {/* Resumo */}
      <div className="flex flex-wrap gap-3">
        {STATUS_ORDER.map((st) => (
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
            const style = STATUS_STYLE[s.statusAtual] ?? STATUS_STYLE.Verde;
            const emCurso = s.statusAtual !== "Verde";
            return (
              <div
                key={s.salaId}
                className="rounded-2xl p-5"
                style={{ background: style.bg, border: `1px solid ${style.border}` }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xl font-bold text-foreground flex items-center gap-2 uppercase">
                      <DoorOpen className="w-5 h-5 text-muted-foreground" />
                      {s.numeroDaSala}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s.especialidade ?? "Sem especialidade"} · {s.totalProfissionais} {s.totalProfissionais === 1 ? "profissional agora" : "profissionais agora"}
                    </p>
                  </div>
                  <span
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-foreground whitespace-nowrap"
                    style={{ background: "rgba(0,0,0,0.25)", border: `1px solid ${style.border}` }}
                  >
                    <CircleDot className="w-3.5 h-3.5" style={{ color: style.dot }} />
                    {style.label}
                  </span>
                </div>

                <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                  <p className="flex items-start gap-1.5">
                    <Users className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span><span className="text-foreground/80">Na sala agora:</span> {s.profissionais ?? "ninguém"}</span>
                  </p>
                  {emCurso && (
                    <p className="flex items-start gap-1.5">
                      <Activity className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>
                        <span className="text-foreground/80">Paciente:</span>{" "}
                        <span className="text-foreground/90 font-medium">{s.pacienteAtual ?? "—"}</span>
                        {s.horarioAtual ? ` · ${s.horarioAtual}` : ""}
                        {s.profissionalEmAtendimento ? ` — ${s.profissionalEmAtendimento}` : ""}
                      </span>
                    </p>
                  )}
                  {s.checkinHorario && (
                    <p className="flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 shrink-0" />
                      {s.statusAtual === "Vermelho" ? "Início" : "Check-in"}: {s.checkinHorario}
                    </p>
                  )}
                  <p className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    Próximo atendimento: {s.horarioProximoAgendamento ?? "—"}
                    {s.proximoPaciente ? ` · ${s.proximoPaciente}` : ""}
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
          Cadastre cada sala física uma única vez. Depois, em cada sala, vincule os profissionais com os dias e quantos períodos de horário forem necessários (ex.: 08:00–12:00 e 14:00–16:00 na segunda).
        </p>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-end mb-6">
          <div className="flex-1">
            <Label htmlFor="numero">Número / Nome da sala</Label>
            <Input
              id="numero"
              value={novoNumero}
              onChange={(e) => setNovoNumero(e.target.value)}
              placeholder="Ex: Sala 01"
            />
          </div>
          <div className="flex-1">
            <Label htmlFor="esp">Especialidade</Label>
            <Select id="esp" value={novaEspecialidade} onChange={(e) => setNovaEspecialidade(e.target.value)}>
              <option value="">— Sem especialidade —</option>
              {SPECIALTIES.map((sp) => (
                <option key={sp} value={sp}>{sp}</option>
              ))}
            </Select>
          </div>
          <Button onClick={handleAdd} disabled={saving} className="gap-2">
            <Plus className="w-4 h-4" /> Adicionar sala
          </Button>
        </div>

        {salas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma sala cadastrada.</p>
        ) : (
          <div className="space-y-3">
            {salas.map((sala) => {
              const byProf = horariosPorSala.get(sala.id) ?? new Map<number, SalaHorario[]>();
              const f = novo[sala.id] ?? EMPTY_PERIODO;
              const open = openSalaId === sala.id;
              return (
                <div key={sala.id} className="p-3 rounded-xl border border-border bg-secondary/30 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 font-semibold text-foreground flex items-center gap-2">
                      <DoorOpen className="w-4 h-4 text-muted-foreground" />
                      {sala.numero}
                      <span className="text-xs font-normal text-muted-foreground">
                        · {byProf.size} {byProf.size === 1 ? "profissional" : "profissionais"}
                      </span>
                    </div>
                    <div className="sm:w-64">
                      <Select
                        value={sala.especialidade ?? ""}
                        onChange={(e) => handleEspecialidade(sala, e.target.value)}
                        title="Especialidade da sala"
                      >
                        <option value="">— Sem especialidade —</option>
                        {SPECIALTIES.map((sp) => (
                          <option key={sp} value={sp}>{sp}</option>
                        ))}
                      </Select>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setOpenSalaId(open ? null : sala.id)} className="gap-1.5">
                      <Plus className="w-4 h-4" /> Adicionar horário
                    </Button>
                    <Button variant="destructive" size="icon" onClick={() => handleDelete(sala)} title="Excluir sala">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Horários já cadastrados: profissional → dia → períodos */}
                  {byProf.size === 0 ? (
                    <p className="text-[11px] text-muted-foreground pl-1">
                      Nenhum profissional vinculado. Clique em "Adicionar horário".
                    </p>
                  ) : (
                    <div className="space-y-2 pl-1">
                      {[...byProf.entries()].map(([pid, hs]) => {
                        const porDia = new Map<number, SalaHorario[]>();
                        for (const h of hs) {
                          if (!porDia.has(h.diaSemana)) porDia.set(h.diaSemana, []);
                          porDia.get(h.diaSemana)!.push(h);
                        }
                        return (
                          <div key={pid} className="text-xs">
                            <p className="font-semibold text-foreground flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5 text-muted-foreground" /> {profName(pid)}
                            </p>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 ml-5">
                              {WEEKDAYS.filter((w) => porDia.has(w.n)).map((w) => (
                                <div key={w.n} className="flex items-center gap-1 flex-wrap">
                                  <span className="text-muted-foreground w-14">{w.label}:</span>
                                  {porDia.get(w.n)!
                                    .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio))
                                    .map((h) => (
                                      <span
                                        key={h.id}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/15 border border-primary/30 text-foreground"
                                      >
                                        {h.horaInicio}–{h.horaFim}
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteHorario(h)}
                                          className="text-muted-foreground hover:text-destructive"
                                          title="Remover este período"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      </span>
                                    ))}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Formulário: adicionar período */}
                  {open && (
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
                      <div className="flex flex-col lg:flex-row lg:items-end gap-3">
                        <div className="lg:w-64">
                          <Label>Profissional</Label>
                          <Select
                            value={f.professionalId}
                            onChange={(e) => setNovoField(sala.id, { professionalId: e.target.value })}
                          >
                            <option value="">— Escolha —</option>
                            {professionals.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </Select>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
                          {WEEKDAYS.map((d) => {
                            const active = f.dias.includes(d.n);
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
                                {d.label.slice(0, 3)}
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                          <Input
                            type="time"
                            value={f.inicio}
                            onChange={(e) => setNovoField(sala.id, { inicio: e.target.value })}
                            className="w-28"
                          />
                          <span className="text-muted-foreground">–</span>
                          <Input
                            type="time"
                            value={f.fim}
                            onChange={(e) => setNovoField(sala.id, { fim: e.target.value })}
                            className="w-28"
                          />
                        </div>
                        <Button size="sm" onClick={() => handleAddHorario(sala)} disabled={savingSalaId === sala.id} className="gap-1.5">
                          <Plus className="w-4 h-4" /> {savingSalaId === sala.id ? "Salvando…" : "Salvar período"}
                        </Button>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Marque os dias e um período; repita para adicionar outros períodos no mesmo dia (ex.: 08:00–12:00 e depois 14:00–16:00). O sistema avisa se a sala já estiver reservada para outro profissional nesse horário.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </MotionCard>
    </div>
  );
}
