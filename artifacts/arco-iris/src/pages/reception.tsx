import { useState } from "react";
import { useGetTodayAppointments, useUpdateAppointmentStatus, useGetProfessionals } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, Badge, Button, Select, MotionCard } from "@/components/ui-custom";
import { getStatusColor } from "@/lib/utils";
import { Check, X, CalendarClock, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Reception() {
  const [profIdFilter, setProfIdFilter] = useState<string>("");
  const { data: professionals } = useGetProfessionals();
  const { data: appointments, isLoading } = useGetTodayAppointments(profIdFilter ? { professionalId: parseInt(profIdFilter) } : undefined);
  const updateStatus = useUpdateAppointmentStatus();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleStatusChange = async (id: number, status: string) => {
    try {
      await updateStatus.mutateAsync({ id, data: { status } });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] }); // Faltas might update
      toast({ title: "Status Atualizado", description: `Consulta marcada como ${status}.` });
    } catch {
      toast({ title: "Erro", description: "Não foi possível atualizar o status.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Recepção</h1>
        <p className="text-muted-foreground mt-1">Gestão diária de presenças e faltas.</p>
      </div>

      <Card className="p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4 border-b border-border pb-6">
          <h2 className="text-xl font-bold font-display">Consultas de Hoje</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-muted-foreground">Filtrar:</span>
            <Select className="w-48" value={profIdFilter} onChange={(e) => setProfIdFilter(e.target.value)}>
              <option value="">Todos os Profissionais</option>
              {professionals?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
        </div>

        <div className="space-y-4">
          {isLoading ? (
            <div className="text-center py-12 animate-pulse text-muted-foreground">Carregando agenda do dia...</div>
          ) : appointments?.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
                <CalendarClock className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-lg font-bold text-foreground">Agenda Vazia</p>
              <p className="text-muted-foreground">Nenhuma consulta encontrada para os filtros selecionados.</p>
            </div>
          ) : (
            appointments?.map((apt, i) => {
              const hasWarning = apt.patientAbsenceCount >= 3;
              return (
                <MotionCard key={apt.id} className="p-4 border border-border/50 hover:border-primary/30 transition-colors" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    
                    <div className="flex items-center gap-6">
                      <div className="w-16 h-16 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-display font-bold text-xl shadow-inner">
                        {apt.time}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-lg text-foreground">{apt.patientName}</h3>
                          {hasWarning && (
                            <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-700">
                              <AlertCircle className="w-3 h-3" /> Faltas: {apt.patientAbsenceCount}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{apt.professionalName} • {apt.professionalSpecialty}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Badge className={getStatusColor(apt.status)}>{apt.status}</Badge>
                      
                      <div className="flex gap-2 ml-4 pl-4 border-l border-border">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-9 w-9 p-0 border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                          onClick={() => handleStatusChange(apt.id, "presente")}
                          title="Marcar como Presente"
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-9 w-9 p-0 border-rose-200 text-rose-600 hover:bg-rose-50"
                          onClick={() => handleStatusChange(apt.id, "ausente")}
                          title="Marcar Falta"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-9 px-3 border-amber-200 text-amber-600 hover:bg-amber-50 font-bold"
                          onClick={() => handleStatusChange(apt.id, "remarcado")}
                        >
                          Remarcar
                        </Button>
                      </div>
                    </div>

                  </div>
                </MotionCard>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}
