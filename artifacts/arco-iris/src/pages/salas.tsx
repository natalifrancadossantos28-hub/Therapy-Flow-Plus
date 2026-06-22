import { useCallback, useEffect, useMemo, useState } from "react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { MotionCard, Button, Input, Label, Select } from "@/components/ui-custom";
import { DoorOpen, Plus, Trash2, RefreshCw, Clock, UserRound, CircleDot } from "lucide-react";
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
      await upsertSala(sala.id, sala.numero, professionalId);
      await fetchAll();
      toast({ title: "Sala atualizada" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao atualizar sala.";
      toast({ title: "Erro", description: msg, variant: "destructive" });
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
                    <p className="text-xl font-bold text-foreground">{s.numeroDaSala}</p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                      <UserRound className="w-3.5 h-3.5" />
                      {s.profissionalResponsavel ?? "Sem profissional"}
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

                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {s.pacienteAtual && (
                    <p>Paciente: <span className="text-foreground/90 font-medium">{s.pacienteAtual}</span>{s.horarioAtual ? ` (${s.horarioAtual})` : ""}</p>
                  )}
                  <p className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
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
        <h2 className="text-lg font-bold text-foreground mb-4">Cadastro de Salas</h2>

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
          <div className="space-y-2">
            {salas.map((sala) => (
              <div
                key={sala.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl border border-border bg-secondary/30"
              >
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
            ))}
          </div>
        )}
      </MotionCard>
    </div>
  );
}
