import { useState } from "react";
import {
  useGetTodayAppointments,
  useUpdateAppointmentStatus,
  useGetProfessionals,
  useDeletePatient,
  useGetProfessionalVacancyAlert,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, Badge, Button, Select, MotionCard } from "@/components/ui-custom";
import { getStatusColor, cn } from "@/lib/utils";
import { Check, X, CalendarClock, AlertCircle, UserMinus, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AnimatePresence } from "framer-motion";
import { Link } from "wouter";

type Appointment = {
  id: number;
  patientId: number;
  professionalId: number;
  patientName: string;
  patientPhone: string | null;
  patientAbsenceCount: number;
  professionalName: string;
  professionalSpecialty: string;
  time: string;
  status: string;
  date: string;
  notes: string | null;
  rescheduledTo: string | null;
  createdAt: string;
  updatedAt: string;
};

type DischargeAlert = {
  appointment: Appointment;
  newAbsenceCount: number;
};

type VacancyAlert = {
  professionalId: number;
  patientName: string;
  priority: string;
};

function DischargeModal({
  alert,
  onDischarge,
  onClose,
  isLoading,
}: {
  alert: DischargeAlert;
  onDischarge: () => void;
  onClose: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <MotionCard
        className="w-full max-w-md p-8 shadow-2xl"
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
      >
        <div className="flex flex-col items-center text-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-rose-100 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-rose-600" />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-foreground">Alerta de Faltas</h3>
            <p className="text-muted-foreground mt-1">
              <span className="font-semibold text-foreground">{alert.appointment.patientName}</span> acumulou{" "}
              <span className="font-bold text-rose-600">{alert.newAbsenceCount} faltas</span>.
            </p>
          </div>
        </div>

        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl mb-6 text-sm text-rose-800 font-medium">
          O protocolo da clínica indica que pacientes com 3 ou mais faltas devem ter alta avaliada. Deseja dar alta para este paciente e liberar a vaga?
        </div>

        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            Manter Paciente
          </Button>
          <Button
            variant="destructive"
            className="flex-1 gap-2"
            onClick={onDischarge}
            disabled={isLoading}
          >
            <UserMinus className="w-4 h-4" />
            {isLoading ? "Dando Alta..." : "Dar Alta"}
          </Button>
        </div>
      </MotionCard>
    </div>
  );
}

function VacancyModal({
  alert,
  onClose,
}: {
  alert: VacancyAlert;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <MotionCard
        className="w-full max-w-md p-8 shadow-2xl border-2 border-emerald-200"
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
      >
        <div className="flex flex-col items-center text-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center text-3xl">
            🎉
          </div>
          <div>
            <h3 className="text-2xl font-bold text-foreground">Vaga Liberada!</h3>
            <p className="text-muted-foreground mt-1">
              Uma nova vaga foi aberta. A lista de espera sugere chamar:
            </p>
          </div>
        </div>

        <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-xl mb-6 flex items-center justify-between">
          <div>
            <p className="font-bold text-lg text-emerald-900">{alert.patientName}</p>
            <p className="text-sm text-emerald-700 mt-0.5">
              Prioridade:{" "}
              <span className="font-semibold capitalize">{alert.priority}</span>
            </p>
          </div>
          <Link href="/waiting-list" onClick={onClose}>
            <Button variant="outline" className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-100">
              Ver Fila <ChevronRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>

        <Button variant="ghost" className="w-full" onClick={onClose}>
          Fechar
        </Button>
      </MotionCard>
    </div>
  );
}

function AppointmentRow({
  apt,
  index,
  onStatusChange,
  onDischargeRequest,
  isUpdating,
}: {
  apt: Appointment;
  index: number;
  onStatusChange: (id: number, status: string) => Promise<number>;
  onDischargeRequest: (apt: Appointment, count: number) => void;
  isUpdating: boolean;
}) {
  const handleAbsent = async () => {
    const newCount = await onStatusChange(apt.id, "ausente");
    if (newCount >= 3) {
      onDischargeRequest(apt, newCount);
    }
  };

  const hasWarning = apt.patientAbsenceCount >= 3;

  return (
    <MotionCard
      className={cn(
        "p-4 border transition-colors",
        hasWarning
          ? "border-rose-300 bg-rose-50/50"
          : "border-border/50 hover:border-primary/30"
      )}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04 }}
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-lg shrink-0">
            {apt.time}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-lg text-foreground">{apt.patientName}</h3>
              {hasWarning && (
                <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-rose-200 text-rose-700">
                  <AlertCircle className="w-3 h-3" /> {apt.patientAbsenceCount} faltas
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {apt.professionalName} • {apt.professionalSpecialty}
            </p>
            {apt.patientPhone && (
              <p className="text-xs text-muted-foreground">{apt.patientPhone}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Badge className={getStatusColor(apt.status)}>{apt.status}</Badge>

          <div className="flex gap-2 ml-4 pl-4 border-l border-border">
            <button
              className="h-9 w-9 rounded-lg border border-emerald-200 text-emerald-600 hover:bg-emerald-50 flex items-center justify-center transition-colors disabled:opacity-40"
              onClick={() => onStatusChange(apt.id, "presente")}
              disabled={isUpdating}
              title="Marcar como Presente"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              className="h-9 w-9 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors disabled:opacity-40"
              onClick={handleAbsent}
              disabled={isUpdating}
              title="Marcar Falta"
            >
              <X className="w-4 h-4" />
            </button>
            <button
              className="h-9 px-3 rounded-lg border border-amber-200 text-amber-600 hover:bg-amber-50 text-sm font-bold transition-colors disabled:opacity-40"
              onClick={() => onStatusChange(apt.id, "remarcado")}
              disabled={isUpdating}
            >
              Remarcar
            </button>
          </div>
        </div>
      </div>
    </MotionCard>
  );
}

export default function Reception() {
  const [profIdFilter, setProfIdFilter] = useState<string>("");
  const { data: professionals } = useGetProfessionals();
  const { data: appointments, isLoading } = useGetTodayAppointments(
    profIdFilter ? { professionalId: parseInt(profIdFilter) } : undefined
  );
  const updateStatus = useUpdateAppointmentStatus();
  const deleteMutation = useDeletePatient();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [dischargeAlert, setDischargeAlert] = useState<DischargeAlert | null>(null);
  const [vacancyAlert, setVacancyAlert] = useState<VacancyAlert | null>(null);
  const [vacancyProfId, setVacancyProfId] = useState<number>(0);

  const { refetch: checkVacancy } = useGetProfessionalVacancyAlert(vacancyProfId, {
    query: { enabled: false },
  });

  const handleStatusChange = async (id: number, status: string): Promise<number> => {
    const apt = appointments?.find((a) => a.id === id);
    let newAbsenceCount = apt?.patientAbsenceCount ?? 0;

    try {
      await updateStatus.mutateAsync({ id, data: { status } });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });

      if (status === "ausente" && apt?.status !== "ausente") {
        newAbsenceCount = (apt?.patientAbsenceCount ?? 0) + 1;
      } else if (status !== "ausente" && apt?.status === "ausente") {
        newAbsenceCount = Math.max(0, (apt?.patientAbsenceCount ?? 1) - 1);
      }

      toast({
        title: "Status Atualizado",
        description: `Consulta de ${apt?.patientName} marcada como ${status}.`,
      });
    } catch {
      toast({ title: "Erro", description: "Não foi possível atualizar o status.", variant: "destructive" });
    }
    return newAbsenceCount;
  };

  const handleDischargeRequest = (apt: Appointment, count: number) => {
    setVacancyProfId(apt.professionalId);
    setDischargeAlert({ appointment: apt, newAbsenceCount: count });
  };

  const handleConfirmDischarge = async () => {
    if (!dischargeAlert) return;
    const { appointment } = dischargeAlert;

    try {
      await deleteMutation.mutateAsync({ id: appointment.patientId });
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/professionals"] });
      setDischargeAlert(null);

      toast({ title: "Alta Realizada", description: `${appointment.patientName} recebeu alta.` });

      const { data: alertData } = await checkVacancy();
      if (alertData?.hasVacancy && alertData?.nextWaitingPatient) {
        setVacancyAlert({
          professionalId: appointment.professionalId,
          patientName: alertData.nextWaitingPatient.patientName,
          priority: alertData.nextWaitingPatient.priority,
        });
      }
    } catch {
      toast({ title: "Erro", description: "Não foi possível dar alta.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Recepção</h1>
        <p className="text-muted-foreground mt-1">Gestão diária de presenças e faltas.</p>
      </div>

      <Card className="p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4 border-b border-border pb-6">
          <h2 className="text-xl font-bold">Atendimentos Terapêuticos – Hoje</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-muted-foreground">Filtrar:</span>
            <Select
              className="w-48"
              value={profIdFilter}
              onChange={(e) => setProfIdFilter(e.target.value)}
            >
              <option value="">Todos os Profissionais</option>
              {professionals?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-4">
          {isLoading ? (
            <div className="text-center py-12 animate-pulse text-muted-foreground">
              Carregando agenda do dia...
            </div>
          ) : appointments?.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
                <CalendarClock className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-lg font-bold text-foreground">Agenda Vazia</p>
              <p className="text-muted-foreground">
                Nenhuma consulta encontrada para os filtros selecionados.
              </p>
            </div>
          ) : (
            appointments?.map((apt, i) => (
              <AppointmentRow
                key={apt.id}
                apt={apt as Appointment}
                index={i}
                onStatusChange={handleStatusChange}
                onDischargeRequest={handleDischargeRequest}
                isUpdating={updateStatus.isPending || deleteMutation.isPending}
              />
            ))
          )}
        </div>
      </Card>

      <AnimatePresence>
        {dischargeAlert && (
          <DischargeModal
            alert={dischargeAlert}
            onDischarge={handleConfirmDischarge}
            onClose={() => setDischargeAlert(null)}
            isLoading={deleteMutation.isPending}
          />
        )}
        {vacancyAlert && (
          <VacancyModal
            alert={vacancyAlert}
            onClose={() => setVacancyAlert(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
