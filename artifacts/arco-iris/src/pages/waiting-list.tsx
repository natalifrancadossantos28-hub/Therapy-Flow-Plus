import { useState } from "react";
import { useGetWaitingList, useDeleteWaitingListEntry, useGetPatients, useGetProfessionals } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, MotionCard, Button, Badge, Label, Select } from "@/components/ui-custom";
import { Trash2, ListTodo, ListPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getPriorityColor, formatDate } from "@/lib/utils";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

async function apiAddToFila(patientId: number, specialty: string | null) {
  const res = await fetch(`${BASE_URL}/api/patients/${patientId}/add-to-fila`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ specialty }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? json.error ?? "Erro ao adicionar à fila");
  return json;
}

const PRIORITY_LABEL: Record<string, string> = {
  elevado: "VERMELHO – Elevado",
  moderado: "LARANJA – Moderado",
  leve: "AZUL – Leve",
  baixo: "VERDE – Baixo",
  alta: "VERMELHO – Elevado",
  media: "LARANJA – Moderado",
  baixa: "VERDE – Baixo",
};

export default function WaitingList() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [formPatientId, setFormPatientId] = useState("");
  const { data: waitingList, isLoading } = useGetWaitingList({} as any, { refetchInterval: 20_000 } as any);
  const { data: patients } = useGetPatients();
  const { data: professionals } = useGetProfessionals();
  const deleteMutation = useDeleteWaitingListEntry();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const eligiblePatients = (patients ?? []).filter((p) => {
    const score = p.triagemScore;
    const inactiveStatus = ["Alta", "Óbito", "Desistência", "Atendimento"].includes(p.status ?? "");
    const isCenso = p.tipoRegistro === "Registro Censo Municipal";
    return score != null && !inactiveStatus && !isCenso;
  });

  const SCORE_SPECIALTY_MAP = [
    { field: "scorePsicologia",       specialty: "Psicologia"         },
    { field: "scorePsicomotricidade", specialty: "Psicomotricidade"   },
    { field: "scoreFisioterapia",     specialty: "Fisioterapia"       },
    { field: "scoreTO",               specialty: "Terapia Ocupacional"},
    { field: "scoreFonoaudiologia",   specialty: "Fonoaudiologia"     },
    { field: "scoreNutricionista",    specialty: "Nutrição"           },
    { field: "scorePsicopedagogia",   specialty: "Psicopedagogia"     },
    { field: "scoreEdFisica",         specialty: "Educação Física"    },
  ];

  const resetForm = () => { setFormPatientId(""); };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPatientId) return;
    setAdding(true);

    const selectedPatient = (patients ?? []).find(p => String(p.id) === formPatientId);
    const scoredSpecialties = SCORE_SPECIALTY_MAP
      .filter(({ field }) => ((selectedPatient as any)?.[field] ?? 0) > 0)
      .map(({ specialty }) => specialty);
    const specialtiesToAdd: (string | null)[] = scoredSpecialties.length > 0 ? scoredSpecialties : [null];

    let added = 0;
    let skipped = 0;
    let lastPriority = "";
    try {
      for (const sp of specialtiesToAdd) {
        try {
          const result = await apiAddToFila(parseInt(formPatientId), sp ?? null);
          lastPriority = result.priority;
          added++;
        } catch (err: any) {
          if (err.message?.includes("Já na fila") || err.message?.toLowerCase().includes("fila")) skipped++;
          else throw err;
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/waiting-list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      const desc = added > 0
        ? `${added} especialidade(s) adicionada(s)${skipped > 0 ? `, ${skipped} já existia(m)` : ""}. Prioridade: ${PRIORITY_LABEL[lastPriority] ?? lastPriority}`
        : "Todas as especialidades já estavam na fila.";
      toast({ title: added > 0 ? "✅ Adicionado à fila!" : "Aviso", description: desc, variant: added > 0 ? "default" : "destructive" });
      if (added > 0) { setIsDialogOpen(false); resetForm(); }
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (id: number) => {
    if (!confirm("Remover paciente da fila de espera?")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: ["/api/waiting-list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({ title: "Removido", description: "Entrada removida com sucesso." });
    } catch {
      toast({ title: "Erro", description: "Falha ao remover.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Fila de Espera</h1>
          <p className="text-muted-foreground mt-1">Organização por prioridade calculada na triagem.</p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} className="gap-2" disabled={eligiblePatients.length === 0}>
          <ListPlus className="w-4 h-4" /> Adicionar Triado à Fila
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground bg-secondary/40 border border-border rounded-xl px-4 py-2.5">
        <span className="font-semibold">Ordenação por prioridade:</span>
        <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-bold border border-rose-200">VERMELHO – Elevado</span>
        <span className="text-muted-foreground">→</span>
        <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-bold border border-orange-200">LARANJA – Moderado</span>
        <span className="text-muted-foreground">→</span>
        <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-bold border border-sky-200">AZUL – Leve</span>
        <span className="text-muted-foreground">→</span>
        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold border border-emerald-200">VERDE – Baixo</span>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border">
              <tr>
                <th className="px-6 py-4">Posição</th>
                <th className="px-6 py-4">Paciente</th>
                <th className="px-6 py-4">Especialidade</th>
                <th className="px-6 py-4">Prioridade</th>
                <th className="px-6 py-4">Entrada</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="text-center py-12 animate-pulse">Carregando fila...</td></tr>
              ) : waitingList?.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                      <ListTodo className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <p className="text-lg font-bold text-foreground">Fila Vazia</p>
                    <p className="text-muted-foreground">Nenhum paciente aguardando vaga.</p>
                  </td>
                </tr>
              ) : (
                waitingList?.map((entry, idx) => {
                  const e = entry as any;
                  return (
                    <tr key={entry.id} className="border-b border-border hover:bg-secondary/20 transition-colors">
                      <td className="px-6 py-4 font-display font-bold text-lg text-primary">#{idx + 1}</td>
                      <td className="px-6 py-4 font-semibold text-foreground">
                        {entry.patientName}
                        <div className="text-xs text-muted-foreground font-mono font-normal mt-0.5">
                          {e.patientProntuario || `#${String(entry.patientId).padStart(4, "0")}`}
                        </div>
                        {entry.patientPhone && (
                          <div className="text-xs text-muted-foreground font-normal mt-0.5">{entry.patientPhone}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {e.specialty || "Qualquer especialidade"}
                      </td>
                      <td className="px-6 py-4">
                        <Badge className={getPriorityColor(entry.priority)}>
                          {PRIORITY_LABEL[entry.priority] ?? entry.priority}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 font-medium">{formatDate(entry.entryDate)}</td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 h-8 w-8 p-0"
                          onClick={() => handleRemove(entry.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {isDialogOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <MotionCard className="w-full max-w-md p-6 overflow-visible" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <h2 className="text-2xl font-bold font-display mb-1">Adicionar à Fila de Espera</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Apenas pacientes com triagem registrada aparecem aqui. A prioridade é calculada automaticamente.
            </p>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <Label>Paciente (com triagem realizada)</Label>
                <Select required value={formPatientId} onChange={e => setFormPatientId(e.target.value)}>
                  <option value="">Selecione um paciente triado...</option>
                  {eligiblePatients.map(p => {
                    const score = p.triagemScore;
                    return (
                      <option key={p.id} value={p.id}>
                        {p.name} — Score: {score}/360
                      </option>
                    );
                  })}
                </Select>
                {eligiblePatients.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1 font-semibold">
                    Nenhum paciente com triagem disponível. Realize a triagem no prontuário primeiro.
                  </p>
                )}
              </div>
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold">
                ✅ As especialidades são detectadas automaticamente pelas áreas pontuadas na triagem do paciente. A prioridade (Elevado / Moderado / Leve / Baixo) é calculada com base no score clínico e critérios de vulnerabilidade.
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <Button type="button" variant="ghost" onClick={() => { setIsDialogOpen(false); resetForm(); }}>Cancelar</Button>
                <Button type="submit" disabled={adding || !formPatientId}>
                  {adding ? "Adicionando..." : "Confirmar e Adicionar"}
                </Button>
              </div>
            </form>
          </MotionCard>
        </div>
      )}
    </div>
  );
}
