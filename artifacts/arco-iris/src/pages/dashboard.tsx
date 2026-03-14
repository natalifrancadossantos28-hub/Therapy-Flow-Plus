import { useGetPatients, useGetProfessionals, useGetTodayAppointments, useGetWaitingList } from "@workspace/api-client-react";
import { Users, UserRound, ClipboardList, AlertCircle, ListTodo } from "lucide-react";
import { Card, MotionCard, Badge, Button } from "@/components/ui-custom";
import { Link } from "wouter";
import { cn, getStatusColor } from "@/lib/utils";

export default function Dashboard() {
  const { data: patients } = useGetPatients();
  const { data: professionals } = useGetProfessionals();
  const { data: todayAppointments } = useGetTodayAppointments();
  const { data: waitingList } = useGetWaitingList();

  const totalPatients = patients?.length || 0;
  const totalProfessionals = professionals?.length || 0;
  const todayCount = todayAppointments?.length || 0;
  const waitingCount = waitingList?.length || 0;

  const absentPatients = patients?.filter(p => p.absenceCount >= 3) || [];

  const stats = [
    { title: "Total de Pacientes", value: totalPatients, icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
    { title: "Profissionais", value: totalProfessionals, icon: UserRound, color: "text-purple-500", bg: "bg-purple-500/10" },
    { title: "Consultas Hoje", value: todayCount, icon: ClipboardList, color: "text-teal-500", bg: "bg-teal-500/10" },
    { title: "Fila de Espera", value: waitingCount, icon: ListTodo, color: "text-amber-500", bg: "bg-amber-500/10" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Visão Geral</h1>
        <p className="text-muted-foreground mt-1">Bem-vindo ao sistema de gestão terapêutica.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <MotionCard key={i} className="p-6 relative overflow-hidden" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-muted-foreground mb-1">{stat.title}</p>
                <p className="text-3xl font-bold font-display">{stat.value}</p>
              </div>
              <div className={cn("p-4 rounded-2xl", stat.bg)}>
                <stat.icon className={cn("w-6 h-6", stat.color)} />
              </div>
            </div>
            <div className={cn("absolute -bottom-4 -right-4 w-24 h-24 rounded-full blur-2xl opacity-20", stat.bg)} />
          </MotionCard>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold font-display flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-primary" />
              Próximas Consultas (Hoje)
            </h2>
            <Link href="/reception" className="text-sm font-semibold text-primary hover:underline">Ver Recepção</Link>
          </div>
          
          <div className="flex-1 overflow-auto max-h-[400px]">
            {todayAppointments && todayAppointments.length > 0 ? (
              <div className="space-y-3">
                {todayAppointments.slice(0, 5).map(apt => (
                  <div key={apt.id} className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-secondary/20 hover:bg-secondary/40 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold font-display">
                        {apt.time}
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{apt.patientName}</p>
                        <p className="text-sm text-muted-foreground">{apt.professionalName} • {apt.professionalSpecialty}</p>
                      </div>
                    </div>
                    <Badge className={getStatusColor(apt.status)}>{apt.status}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                  <ClipboardList className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-foreground font-semibold">Nenhuma consulta hoje</p>
                <p className="text-sm text-muted-foreground">A agenda está livre por enquanto.</p>
              </div>
            )}
          </div>
        </Card>

        <Card className="p-6 border-rose-200 shadow-[0_0_20px_-5px_rgba(244,63,94,0.1)]">
          <h2 className="text-xl font-bold font-display flex items-center gap-2 text-rose-600 mb-6">
            <AlertCircle className="w-5 h-5" />
            Atenção: Faltas
          </h2>
          <div className="space-y-4">
            {absentPatients.length > 0 ? (
              absentPatients.map(p => (
                <div key={p.id} className="p-4 rounded-xl bg-rose-50 border border-rose-100 flex flex-col gap-2">
                  <div className="flex justify-between items-start">
                    <p className="font-semibold text-rose-900">{p.name}</p>
                    <Badge className="bg-rose-200 text-rose-800 border-rose-300">{p.absenceCount} Faltas</Badge>
                  </div>
                  <Link href={`/patients/${p.id}`}>
                    <Button variant="outline" className="w-full text-xs h-8 mt-2 border-rose-200 text-rose-700 hover:bg-rose-100">
                      Ver Ficha
                    </Button>
                  </Link>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum paciente com 3 ou mais faltas.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
