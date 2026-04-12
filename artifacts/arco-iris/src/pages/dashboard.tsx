import { useEffect, useState } from "react";
import { useGetPatients, useGetProfessionals, useGetTodayAppointments, useGetWaitingList } from "@workspace/api-client-react";
import { Users, UserRound, ClipboardList, AlertCircle, ListTodo, TrendingUp, CalendarDays, Activity } from "lucide-react";
import { Card, MotionCard, Badge, Button } from "@/components/ui-custom";
import { Link } from "wouter";
import { cn, getStatusColor } from "@/lib/utils";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from "recharts";

type Stats = { semanal: number; mensal: number; trimestral: number; semestral: number; anual: number };

const POLL_MS = 30_000; // 30 s

export default function Dashboard() {
  const { data: patients } = useGetPatients({} as any, { refetchInterval: POLL_MS } as any);
  const { data: professionals } = useGetProfessionals({} as any, { refetchInterval: POLL_MS } as any);
  const { data: todayAppointments } = useGetTodayAppointments({} as any, { refetchInterval: POLL_MS } as any);
  const { data: waitingList } = useGetWaitingList({} as any, { refetchInterval: POLL_MS } as any);
  const [aptStats, setAptStats] = useState<Stats | null>(null);

  const fetchStats = () =>
    fetch("/api/appointments/stats").then(r => r.json()).then(setAptStats).catch(console.error);

  useEffect(() => {
    fetchStats();
    const id = setInterval(fetchStats, POLL_MS);
    return () => clearInterval(id);
  }, []);

  const totalPatients = patients?.length || 0;
  const preCadastros = patients?.filter(p => p.status === "pré-cadastro").length || 0;
  const totalProfessionals = professionals?.length || 0;
  const todayCount = todayAppointments?.length || 0;
  const waitingCount = waitingList?.length || 0;

  const absentPatients = patients?.filter(p => p.absenceCount >= 3) || [];

  const triadPatients = (patients || []).filter(p => (p as any).triagemScore != null);
  const radarData = [
    { area: "Psicologia", score: triadPatients.length ? Math.round(triadPatients.reduce((s, p) => s + ((p as any).scorePsicologia || 0), 0) / triadPatients.length) : 0, max: 72 },
    { area: "Psicomotr.", score: triadPatients.length ? Math.round(triadPatients.reduce((s, p) => s + ((p as any).scorePsicomotricidade || 0), 0) / triadPatients.length) : 0, max: 72 },
    { area: "Fisioterapia", score: triadPatients.length ? Math.round(triadPatients.reduce((s, p) => s + ((p as any).scoreFisioterapia || 0), 0) / triadPatients.length) : 0, max: 72 },
    { area: "Psicoped.", score: triadPatients.length ? Math.round(triadPatients.reduce((s, p) => s + ((p as any).scorePsicopedagogia || 0), 0) / triadPatients.length) : 0, max: 72 },
    { area: "Ed. Física", score: triadPatients.length ? Math.round(triadPatients.reduce((s, p) => s + ((p as any).scoreEdFisica || 0), 0) / triadPatients.length) : 0, max: 72 },
  ].map(d => ({ ...d, pct: Math.round((d.score / 72) * 100) }));

  // Historical count by year — prefer entryDate, fallback to createdAt
  const byYear: Record<number, number> = {};
  for (const p of patients || []) {
    const dateStr = (p as any).entryDate || p.createdAt;
    const yr = new Date(dateStr).getFullYear();
    byYear[yr] = (byYear[yr] || 0) + 1;
  }
  const anos = [2023, 2024, 2025, 2026];

  const topCards = [
    { title: "Total de Pacientes", value: totalPatients, icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
    { title: "Pré-Cadastros", value: preCadastros, icon: ClipboardList, color: "text-violet-500", bg: "bg-violet-500/10" },
    { title: "Profissionais", value: totalProfessionals, icon: UserRound, color: "text-purple-500", bg: "bg-purple-500/10" },
    { title: "Fila de Espera", value: waitingCount, icon: ListTodo, color: "text-amber-500", bg: "bg-amber-500/10" },
  ];

  const periodCards = [
    { label: "Esta semana", value: aptStats?.semanal ?? "—" },
    { label: "Este mês", value: aptStats?.mensal ?? "—" },
    { label: "Trimestre", value: aptStats?.trimestral ?? "—" },
    { label: "Semestre", value: aptStats?.semestral ?? "—" },
    { label: "Este ano", value: aptStats?.anual ?? "—" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Visão Geral</h1>
        <p className="text-muted-foreground mt-1">Bem-vindo ao NFS – Gestão Terapêutica.</p>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {topCards.map((stat, i) => (
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

      {/* Atendimentos Terapêuticos por período */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-5">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold font-display">Atendimentos Terapêuticos</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {periodCards.map((c, i) => (
            <div key={i} className="bg-secondary/30 rounded-2xl p-4 text-center border border-border/50">
              <p className="text-2xl font-bold font-display text-foreground">{c.value}</p>
              <p className="text-xs font-semibold text-muted-foreground mt-1">{c.label}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Perfil Multidisciplinar – Teia de Aranha */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold font-display">Perfil Multidisciplinar</h2>
          <span className="ml-auto text-xs text-muted-foreground font-semibold">Média dos {triadPatients.length} pacientes triados</span>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Média do score por área terapêutica (% do máximo 72 pts por área)</p>
        {triadPatients.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center">
            <Activity className="w-10 h-10 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum paciente com triagem registrada ainda.</p>
            <p className="text-xs text-muted-foreground mt-1">Registre a triagem de um paciente para ver o gráfico.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="area" tick={{ fontSize: 12, fill: "hsl(var(--foreground))", fontWeight: 600 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickCount={4} unit="%" />
                  <Radar name="Média" dataKey="pct" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.25} strokeWidth={2} dot={{ r: 4, fill: "hsl(var(--primary))" }} />
                  <Tooltip formatter={(v: any) => [`${v}%`, "Média"]} contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {radarData.map(d => (
                <div key={d.area} className="flex items-center gap-3">
                  <span className="w-24 text-xs font-semibold text-muted-foreground shrink-0">{d.area}</span>
                  <div className="flex-1 h-2.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${d.pct}%` }} />
                  </div>
                  <span className="w-12 text-right text-xs font-bold text-foreground">{d.score}/72</span>
                  <span className="w-10 text-right text-xs text-muted-foreground">{d.pct}%</span>
                </div>
              ))}
              <div className="mt-3 pt-3 border-t border-border flex justify-between text-sm">
                <span className="font-semibold text-muted-foreground">Score Médio Total</span>
                <span className="font-bold text-primary">{Math.round(radarData.reduce((s, d) => s + d.score, 0))}/360</span>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Histórico de Crescimento + Pacientes de Hoje */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Histórico por ano */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-5">
            <CalendarDays className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold font-display">Histórico de Pacientes</h2>
          </div>
          <div className="space-y-3">
            {anos.map(ano => (
              <div key={ano} className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-border/50">
                <span className="font-semibold text-foreground">{ano}</span>
                <span className="font-bold text-lg text-primary">{byYear[ano] || 0}</span>
              </div>
            ))}
            <div className="flex items-center justify-between p-3 rounded-xl bg-primary/10 border border-primary/20 mt-2">
              <span className="font-bold text-foreground">Total geral</span>
              <span className="font-bold text-xl text-primary">{totalPatients}</span>
            </div>
          </div>
        </Card>

        {/* Atendimentos Hoje */}
        <Card className="lg:col-span-2 p-6 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold font-display flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-primary" />
              Atendimentos Hoje
            </h2>
            <Link href="/reception" className="text-sm font-semibold text-primary hover:underline">Ver Recepção</Link>
          </div>

          <div className="flex-1 overflow-auto max-h-[400px]">
            {todayCount === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                  <ClipboardList className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-foreground font-semibold">Nenhum atendimento hoje</p>
                <p className="text-sm text-muted-foreground">A agenda está livre por enquanto.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {todayAppointments?.slice(0, 6).map(apt => (
                  <div key={apt.id} className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-secondary/20 hover:bg-secondary/40 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold font-display text-sm">
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
            )}
          </div>
        </Card>
      </div>

      {/* Alertas de Faltas */}
      {absentPatients.length > 0 && (
        <Card className="p-6 border-rose-200 shadow-[0_0_20px_-5px_rgba(244,63,94,0.1)]">
          <h2 className="text-xl font-bold font-display flex items-center gap-2 text-rose-600 mb-6">
            <AlertCircle className="w-5 h-5" />
            Atenção: Pacientes com Faltas
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {absentPatients.map(p => (
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
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
