import { useState } from "react";
import { useParams, Link } from "wouter";
import {
  useGetPatient,
  useGetPatientPdf,
  useDeletePatient,
  useGetProfessionalVacancyAlert,
  useGetPatientAbsences,
  useGetProfessionals,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, Button, Badge, MotionCard, Input, Label, Select } from "@/components/ui-custom";
import { generatePatientPdf } from "@/hooks/use-pdf";
import { ArrowLeft, Download, UserMinus, AlertCircle, FileText, CalendarX, ClipboardCheck, ListPlus, CheckCircle2, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn, getStatusColor, formatDate } from "@/lib/utils";
import { AnimatePresence } from "framer-motion";
import { format } from "date-fns";

function calcPriority(score: number, escolaPublica: boolean, trabalhoNaRoca: boolean): "alta" | "media" | "baixa" {
  const vuln = (escolaPublica ? 1 : 0) + (trabalhoNaRoca ? 1 : 0);
  if (score >= 65 || vuln >= 2) return "alta";
  if (score >= 35 || vuln >= 1) return "media";
  return "baixa";
}

const PRIORITY_STYLE: Record<string, string> = {
  alta: "bg-rose-100 text-rose-800 border-rose-300",
  media: "bg-amber-100 text-amber-800 border-amber-300",
  baixa: "bg-emerald-100 text-emerald-800 border-emerald-300",
};
const PRIORITY_LABEL: Record<string, string> = { alta: "ALTA", media: "MÉDIA", baixa: "BAIXA" };

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

async function apiPatch(path: string, body: object) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function apiAddToFila(patientId: number, body: object) {
  const res = await fetch(`${BASE_URL}/api/patients/${patientId}/add-to-fila`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? json.error ?? "Erro ao adicionar à fila");
  return json;
}

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>();
  const patientId = parseInt(id || "0");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: patient, isLoading, refetch } = useGetPatient(patientId);
  const { data: pdfData } = useGetPatientPdf(patientId);
  const { data: absenceInfo } = useGetPatientAbsences(patientId);
  const { data: professionals } = useGetProfessionals();
  const deleteMutation = useDeletePatient();

  const [showVacancyAlert, setShowVacancyAlert] = useState<{ show: boolean; data: any }>({ show: false, data: null });
  const { refetch: checkVacancy } = useGetProfessionalVacancyAlert(patient?.professionalId || 0, { query: { enabled: false } });

  const [triagemEdit, setTriagemEdit] = useState(false);
  const [triagemScore, setTriagemScore] = useState("");
  const [escolaPublica, setEscolaPublica] = useState<boolean | null>(null);
  const [trabalhoNaRoca, setTrabalhoNaRoca] = useState<boolean | null>(null);
  const [savingTriagem, setSavingTriagem] = useState(false);

  const [showFilaModal, setShowFilaModal] = useState(false);
  const [filaProfId, setFilaProfId] = useState("");
  const [addingToFila, setAddingToFila] = useState(false);

  const handleDownloadPdf = () => {
    if (pdfData) {
      generatePatientPdf(pdfData);
      toast({ title: "PDF Gerado", description: "O download iniciará em instantes." });
    }
  };

  const handleDischarge = async () => {
    if (!confirm("Tem certeza que deseja dar alta para este paciente? O status mudará e a vaga será liberada.")) return;
    try {
      const profId = patient?.professionalId;
      await deleteMutation.mutateAsync({ id: patientId });
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/professionals"] });
      toast({ title: "Alta Realizada", description: "Paciente liberado com sucesso." });
      if (profId) {
        const { data: alertData } = await checkVacancy();
        if (alertData?.hasVacancy && alertData?.nextWaitingPatient) {
          setShowVacancyAlert({ show: true, data: alertData.nextWaitingPatient });
        }
      }
    } catch {
      toast({ title: "Erro", description: "Não foi possível dar alta.", variant: "destructive" });
    }
  };

  const openTriagemEdit = () => {
    setTriagemScore(patient?.triagemScore != null ? String(patient.triagemScore) : "");
    setEscolaPublica(patient?.escolaPublica ?? null);
    setTrabalhoNaRoca(patient?.trabalhoNaRoca ?? null);
    setTriagemEdit(true);
  };

  const saveTriagem = async () => {
    const score = parseInt(triagemScore);
    if (isNaN(score) || score < 0 || score > 100) {
      toast({ title: "Score inválido", description: "Informe um valor entre 0 e 100.", variant: "destructive" });
      return;
    }
    setSavingTriagem(true);
    try {
      await apiPatch(`/api/patients/${patientId}`, {
        triagemScore: score,
        escolaPublica: escolaPublica ?? false,
        trabalhoNaRoca: trabalhoNaRoca ?? false,
      });
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      setTriagemEdit(false);
      toast({ title: "Triagem registrada!", description: "Agora é possível adicionar o paciente à fila." });
    } catch {
      toast({ title: "Erro", description: "Falha ao salvar triagem.", variant: "destructive" });
    } finally {
      setSavingTriagem(false);
    }
  };

  const handleAddToFila = async () => {
    setAddingToFila(true);
    try {
      const result = await apiAddToFila(patientId, {
        professionalId: filaProfId ? Number(filaProfId) : null,
      });
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/waiting-list"] });
      setShowFilaModal(false);
      toast({
        title: "Paciente adicionado à fila!",
        description: `Prioridade calculada: ${PRIORITY_LABEL[result.priority] ?? result.priority}`,
      });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setAddingToFila(false);
    }
  };

  if (isLoading || !patient) return <div className="p-8 text-center animate-pulse">Carregando prontuário...</div>;

  const hasWarning = patient.absenceCount >= 3;
  const triagemFeita = (patient as any).triagemScore != null;
  const ep = (patient as any).escolaPublica ?? false;
  const tnr = (patient as any).trabalhoNaRoca ?? false;
  const previewPriority = triagemFeita
    ? calcPriority((patient as any).triagemScore, ep, tnr)
    : null;

  const naFila = patient.status === "Fila de Espera";
  const emAtendimento = patient.status === "Atendimento";
  const podeAdicionarFila = triagemFeita && !naFila && !emAtendimento && patient.status !== "Alta";

  return (
    <div className="space-y-8">
      <AnimatePresence>
        {showVacancyAlert.show && (
          <MotionCard className="p-6 bg-emerald-50 border-emerald-200 shadow-lg relative mb-8" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
            <h3 className="text-emerald-800 font-bold text-xl mb-2">Vaga Liberada!</h3>
            <p className="text-emerald-700 mb-4">Com a alta, há uma nova vaga. A fila de espera sugere chamar:</p>
            <div className="bg-white p-4 rounded-xl border border-emerald-100 flex justify-between items-center">
              <div>
                <p className="font-bold text-lg">{showVacancyAlert.data?.patientName}</p>
                <p className="text-sm text-muted-foreground">Prioridade: {showVacancyAlert.data?.priority}</p>
              </div>
              <Link href="/waiting-list">
                <Button variant="outline" className="text-emerald-700 border-emerald-300">Ir para Fila</Button>
              </Link>
            </div>
            <button onClick={() => setShowVacancyAlert({ show: false, data: null })} className="absolute top-4 right-4 text-emerald-800/50 hover:text-emerald-800">✕</button>
          </MotionCard>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <Link href="/patients" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Link>
          <div className="flex items-center gap-4 flex-wrap">
            <h1 className="text-3xl font-display font-bold text-foreground">{patient.name}</h1>
            <Badge className={getStatusColor(patient.status)}>{patient.status}</Badge>
            {triagemFeita && previewPriority && (
              <Badge className={PRIORITY_STYLE[previewPriority]}>
                Prioridade {PRIORITY_LABEL[previewPriority]}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Button variant="outline" onClick={handleDownloadPdf} disabled={!pdfData} className="gap-2">
            <Download className="w-4 h-4" /> Gerar PDF
          </Button>
          {podeAdicionarFila && (
            <Button onClick={() => setShowFilaModal(true)} className="gap-2 bg-orange-500 hover:bg-orange-600 text-white">
              <ListPlus className="w-4 h-4" /> Adicionar à Fila
            </Button>
          )}
          {naFila && (
            <Button variant="outline" disabled className="gap-2 text-orange-600 border-orange-300 cursor-default">
              <Clock className="w-4 h-4" /> Na Fila de Espera
            </Button>
          )}
          <Button variant="destructive" onClick={handleDischarge} disabled={deleteMutation.isPending || patient.status === "Alta"} className="gap-2">
            <UserMinus className="w-4 h-4" /> Dar Alta
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">

          {/* Dados pessoais */}
          <Card className="p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <FileText className="w-32 h-32" />
            </div>
            <h2 className="text-xl font-bold font-display mb-6 border-b border-border pb-4">Dados Pessoais</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-12">
              <div>
                <p className="text-sm font-semibold text-muted-foreground">Nascimento</p>
                <p className="text-lg">{formatDate(patient.dateOfBirth)}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground">CPF</p>
                <p className="text-lg">{patient.cpf || "-"}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground">Telefone</p>
                <p className="text-lg">{patient.phone || "-"}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground">Email</p>
                <p className="text-lg">{patient.email || "-"}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-sm font-semibold text-muted-foreground">Responsável</p>
                <p className="text-lg">{patient.guardianName || "-"} <span className="text-muted-foreground text-sm ml-2">{patient.guardianPhone}</span></p>
              </div>
            </div>

            <h2 className="text-xl font-bold font-display mt-10 mb-6 border-b border-border pb-4">Quadro Clínico</h2>
            <div>
              <p className="text-sm font-semibold text-muted-foreground">Diagnóstico / Motivo</p>
              <p className="text-lg mt-1">{patient.diagnosis || "Não informado"}</p>
            </div>
            <div className="mt-6">
              <p className="text-sm font-semibold text-muted-foreground">Observações</p>
              <div className="p-4 bg-secondary/30 rounded-xl mt-2 min-h-24">
                {patient.notes || "Sem observações adicionais."}
              </div>
            </div>
          </Card>

          {/* ── Triagem ── */}
          <Card className={cn("p-6 border-2 transition-colors", triagemFeita ? "border-emerald-400/40" : "border-amber-400/40 bg-amber-50/5")}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center", triagemFeita ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600")}>
                  {triagemFeita ? <CheckCircle2 className="w-5 h-5" /> : <ClipboardCheck className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-bold font-display text-lg">Triagem Clínica</h3>
                  <p className={cn("text-sm font-semibold", triagemFeita ? "text-emerald-600" : "text-amber-600")}>
                    {triagemFeita ? "Triagem realizada — paciente apto para a fila" : "Aguardando triagem para entrar na fila"}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={openTriagemEdit} className="gap-2">
                <ClipboardCheck className="w-4 h-4" />
                {triagemFeita ? "Editar Triagem" : "Registrar Triagem"}
              </Button>
            </div>

            {triagemFeita ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div className="p-3 bg-secondary/30 rounded-xl">
                  <p className="text-muted-foreground font-semibold mb-1">Score Clínico</p>
                  <p className="text-2xl font-bold text-foreground">{(patient as any).triagemScore}<span className="text-sm text-muted-foreground">/100</span></p>
                </div>
                <div className="p-3 bg-secondary/30 rounded-xl">
                  <p className="text-muted-foreground font-semibold mb-1">Escola Pública</p>
                  <p className="font-bold">{ep ? "✅ Sim" : "❌ Não"}</p>
                </div>
                <div className="p-3 bg-secondary/30 rounded-xl">
                  <p className="text-muted-foreground font-semibold mb-1">Trabalho na Roça</p>
                  <p className="font-bold">{tnr ? "✅ Sim" : "❌ Não"}</p>
                </div>
                {previewPriority && (
                  <div className="col-span-2 md:col-span-3 p-3 rounded-xl border" style={{ background: "transparent" }}>
                    <p className="text-muted-foreground font-semibold text-xs uppercase tracking-wider mb-1">Prioridade calculada para a fila</p>
                    <span className={cn("text-sm font-bold px-3 py-1 rounded-full border", PRIORITY_STYLE[previewPriority])}>
                      {PRIORITY_LABEL[previewPriority]}
                      {previewPriority === "alta" && " — Encaminhar com urgência"}
                      {previewPriority === "media" && " — Encaminhar em breve"}
                      {previewPriority === "baixa" && " — Aguardar disponibilidade"}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Registre a triagem com o score clínico e os critérios de vulnerabilidade para liberar o botão <strong>"Adicionar à Fila"</strong>.
              </p>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card className={cn("p-6 border-2 transition-colors", hasWarning ? "border-rose-400 bg-rose-50/10" : "border-transparent")}>
            <div className="flex items-center gap-3 mb-6">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", hasWarning ? "bg-rose-200 text-rose-600" : "bg-secondary text-foreground")}>
                {hasWarning ? <AlertCircle className="w-6 h-6" /> : <CalendarX className="w-6 h-6" />}
              </div>
              <div>
                <h3 className={cn("font-bold font-display text-lg", hasWarning && "text-rose-900 dark:text-rose-400")}>Faltas</h3>
                <p className={cn("text-sm", hasWarning ? "text-rose-700 font-semibold" : "text-muted-foreground")}>
                  {patient.absenceCount} registradas
                </p>
              </div>
            </div>
            {hasWarning && (
              <div className="p-3 bg-rose-100 text-rose-800 rounded-lg text-sm font-medium mb-4">
                ⚠️ Alerta: Limite de faltas excedido. Considere repassar as regras da clínica.
              </div>
            )}
            <div className="space-y-3">
              {absenceInfo?.absences?.length ? (
                absenceInfo.absences.map((abs: any, i: number) => (
                  <div key={i} className="flex justify-between text-sm p-2 border-b border-border/50 last:border-0">
                    <span className="font-medium text-foreground">{formatDate(abs.date)}</span>
                    <span className="text-muted-foreground">{abs.time}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-center text-muted-foreground italic">Nenhum histórico de falta.</p>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Modal: Registrar/Editar Triagem */}
      {triagemEdit && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <MotionCard className="w-full max-w-md p-6" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <h2 className="text-2xl font-bold font-display mb-1">{triagemFeita ? "Editar Triagem" : "Registrar Triagem"}</h2>
            <p className="text-sm text-muted-foreground mb-6">Score clínico (0–100) e critérios de vulnerabilidade.</p>
            <div className="space-y-5">
              <div>
                <Label>Score Clínico <span className="text-muted-foreground">(0 = sem indicativo, 100 = máximo indicativo)</span></Label>
                <Input
                  type="number" min={0} max={100}
                  value={triagemScore}
                  onChange={e => setTriagemScore(e.target.value)}
                  placeholder="Ex.: 72"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  ≥ 65 → prioridade alta · 35–64 → média · &lt; 35 → baixa (pode subir por vulnerabilidade)
                </p>
              </div>

              <div className="space-y-3">
                <Label>Critérios de Vulnerabilidade</Label>
                <label className="flex items-center gap-3 p-3 rounded-xl border border-border cursor-pointer hover:bg-secondary/30 transition-colors">
                  <input type="checkbox" checked={escolaPublica ?? false} onChange={e => setEscolaPublica(e.target.checked)} className="w-5 h-5 rounded" />
                  <div>
                    <p className="font-semibold text-sm">Escola Pública</p>
                    <p className="text-xs text-muted-foreground">Aluno de escola da rede pública</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-3 rounded-xl border border-border cursor-pointer hover:bg-secondary/30 transition-colors">
                  <input type="checkbox" checked={trabalhoNaRoca ?? false} onChange={e => setTrabalhoNaRoca(e.target.checked)} className="w-5 h-5 rounded" />
                  <div>
                    <p className="font-semibold text-sm">Trabalho na Roça / Informal</p>
                    <p className="text-xs text-muted-foreground">Responsável com trabalho rural ou informal</p>
                  </div>
                </label>
              </div>

              {triagemScore && !isNaN(parseInt(triagemScore)) && (
                <div className="p-3 bg-secondary/30 rounded-xl text-sm">
                  <p className="text-muted-foreground font-semibold mb-1">Prioridade que será calculada:</p>
                  <span className={cn("font-bold px-3 py-1 rounded-full border text-sm", PRIORITY_STYLE[calcPriority(parseInt(triagemScore), escolaPublica ?? false, trabalhoNaRoca ?? false)])}>
                    {PRIORITY_LABEL[calcPriority(parseInt(triagemScore), escolaPublica ?? false, trabalhoNaRoca ?? false)]}
                  </span>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button type="button" variant="ghost" onClick={() => setTriagemEdit(false)}>Cancelar</Button>
              <Button onClick={saveTriagem} disabled={savingTriagem}>{savingTriagem ? "Salvando..." : "Salvar Triagem"}</Button>
            </div>
          </MotionCard>
        </div>
      )}

      {/* Modal: Adicionar à Fila */}
      {showFilaModal && previewPriority && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <MotionCard className="w-full max-w-md p-6" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <h2 className="text-2xl font-bold font-display mb-1">Adicionar à Fila de Espera</h2>
            <p className="text-sm text-muted-foreground mb-5">A prioridade é calculada automaticamente com base na triagem.</p>

            <div className="p-4 rounded-xl border mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-semibold">Prioridade calculada</p>
                <span className={cn("font-bold px-3 py-1 rounded-full border text-sm mt-1 inline-block", PRIORITY_STYLE[previewPriority])}>
                  {PRIORITY_LABEL[previewPriority]}
                </span>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                <p>Score: <strong>{(patient as any).triagemScore}/100</strong></p>
                <p>Escola Pública: <strong>{ep ? "Sim" : "Não"}</strong></p>
                <p>Trabalho na Roça: <strong>{tnr ? "Sim" : "Não"}</strong></p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label>Especialidade Preferencial (Opcional)</Label>
                <Select value={filaProfId} onChange={e => setFilaProfId(e.target.value)}>
                  <option value="">Qualquer Especialidade</option>
                  {professionals?.map(p => (
                    <option key={p.id} value={p.id}>{p.specialty} – {p.name}</option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Button type="button" variant="ghost" onClick={() => setShowFilaModal(false)}>Cancelar</Button>
              <Button onClick={handleAddToFila} disabled={addingToFila} className="gap-2 bg-orange-500 hover:bg-orange-600 text-white">
                <ListPlus className="w-4 h-4" />
                {addingToFila ? "Adicionando..." : "Confirmar e Adicionar"}
              </Button>
            </div>
          </MotionCard>
        </div>
      )}
    </div>
  );
}
