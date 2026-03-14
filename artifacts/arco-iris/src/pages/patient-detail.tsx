import { useState } from "react";
import { useParams, Link } from "wouter";
import { 
  useGetPatient, 
  useGetPatientPdf, 
  useDeletePatient, 
  useGetProfessionalVacancyAlert,
  useGetPatientAbsences
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, Button, Badge, MotionCard } from "@/components/ui-custom";
import { generatePatientPdf } from "@/hooks/use-pdf";
import { ArrowLeft, Download, UserMinus, AlertCircle, FileText, CalendarX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getStatusColor, formatDate } from "@/lib/utils";
import { AnimatePresence } from "framer-motion";

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>();
  const patientId = parseInt(id || "0");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: patient, isLoading } = useGetPatient(patientId);
  const { data: pdfData } = useGetPatientPdf(patientId);
  const { data: absenceInfo } = useGetPatientAbsences(patientId);
  const deleteMutation = useDeletePatient();
  
  const [showVacancyAlert, setShowVacancyAlert] = useState<{show: boolean, data: any}>({ show: false, data: null });
  const { refetch: checkVacancy } = useGetProfessionalVacancyAlert(patient?.professionalId || 0, { query: { enabled: false } });

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

  if (isLoading || !patient) return <div className="p-8 text-center animate-pulse">Carregando prontuário...</div>;

  const hasWarning = patient.absenceCount >= 3;

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

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <Link href="/patients" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Link>
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-display font-bold text-foreground">{patient.name}</h1>
            <Badge className={getStatusColor(patient.status)}>{patient.status}</Badge>
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleDownloadPdf} disabled={!pdfData} className="gap-2">
            <Download className="w-4 h-4" /> Gerar PDF
          </Button>
          <Button variant="destructive" onClick={handleDischarge} disabled={deleteMutation.isPending || patient.status === 'alta'} className="gap-2">
            <UserMinus className="w-4 h-4" /> Dar Alta
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
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
        </div>

        <div className="space-y-6">
          <Card className={cn("p-6 border-2 transition-colors", hasWarning ? "border-rose-400 bg-rose-50" : "border-transparent")}>
            <div className="flex items-center gap-3 mb-6">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", hasWarning ? "bg-rose-200 text-rose-600" : "bg-secondary text-foreground")}>
                {hasWarning ? <AlertCircle className="w-6 h-6" /> : <CalendarX className="w-6 h-6" />}
              </div>
              <div>
                <h3 className={cn("font-bold font-display text-lg", hasWarning && "text-rose-900")}>Faltas</h3>
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
                absenceInfo.absences.map((abs, i) => (
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
    </div>
  );
}
