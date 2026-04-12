import { useGetPontoEmployees, useGetPontoRecords, useGetPontoSummary } from "@workspace/api-client-react";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Users, Clock, TrendingUp, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

function parseHours(hhmm: string | null): number {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(":").map(Number);
  return h + m / 60;
}

export default function Dashboard() {
  const today = format(new Date(), "yyyy-MM-dd");
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");

  const { data: employees = [] } = useGetPontoEmployees();
  const { data: todaySummary = [] } = useGetPontoSummary({ date: today });
  const { data: allRecords = [] } = useGetPontoRecords();

  const weekDays = eachDayOfInterval({
    start: parseISO(weekStart),
    end: parseISO(weekEnd),
  }).map(d => format(d, "yyyy-MM-dd"));

  const weekSummariesByEmployee: Record<number, number> = {};
  for (const day of weekDays) {
    const dayRecords = allRecords.filter(r => r.date === day);
    const byEmployee: Record<number, typeof dayRecords> = {};
    for (const r of dayRecords) {
      if (!byEmployee[r.employeeId]) byEmployee[r.employeeId] = [];
      byEmployee[r.employeeId].push(r);
    }
    for (const [eid, recs] of Object.entries(byEmployee)) {
      const sorted = [...recs].sort((a, b) => new Date(a.punchedAt).getTime() - new Date(b.punchedAt).getTime());
      const entradas = sorted.filter(r => r.type === "entrada");
      const saidas = sorted.filter(r => r.type === "saida");
      let ms = 0;
      const pairs = Math.min(entradas.length, saidas.length);
      for (let i = 0; i < pairs; i++) {
        ms += new Date(saidas[i].punchedAt).getTime() - new Date(entradas[i].punchedAt).getTime();
      }
      weekSummariesByEmployee[Number(eid)] = (weekSummariesByEmployee[Number(eid)] || 0) + ms / 3600000;
    }
  }

  const presentEmployees = todaySummary.filter(s => {
    const sorted = [...s.records].sort((a, b) => new Date(b.punchedAt).getTime() - new Date(a.punchedAt).getTime());
    return sorted.length > 0 && sorted[0].type === "entrada";
  });

  const activeEmployees = employees.filter(e => e.active);
  const presentCount = presentEmployees.length;
  const absentCount = activeEmployees.length - presentCount;

  const totalWorkedToday = todaySummary.reduce((sum, s) => sum + parseHours(s.totalHours), 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">
          {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="glass-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-muted-foreground">Presentes</p>
              <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
              </div>
            </div>
            <p className="text-3xl font-bold font-display text-foreground">{presentCount}</p>
            <p className="text-xs text-muted-foreground mt-1">funcionários no momento</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-muted-foreground">Ausentes</p>
              <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center">
                <XCircle className="w-5 h-5 text-destructive" />
              </div>
            </div>
            <p className="text-3xl font-bold font-display text-foreground">{absentCount}</p>
            <p className="text-xs text-muted-foreground mt-1">de {activeEmployees.length} ativos</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-muted-foreground">Horas Hoje</p>
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-primary" />
              </div>
            </div>
            <p className="text-3xl font-bold font-display text-foreground">{totalWorkedToday.toFixed(1)}h</p>
            <p className="text-xs text-muted-foreground mt-1">total acumulado hoje</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-muted-foreground">Equipe</p>
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-400" />
              </div>
            </div>
            <p className="text-3xl font-bold font-display text-foreground">{activeEmployees.length}</p>
            <p className="text-xs text-muted-foreground mt-1">funcionários ativos</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Presença em tempo real */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              Status em Tempo Real
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeEmployees.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">Nenhum funcionário ativo.</p>
            ) : (
              activeEmployees.map(emp => {
                const isPresent = presentEmployees.some(p => p.employeeId === emp.id);
                const todaySummaryEntry = todaySummary.find(s => s.employeeId === emp.id);
                return (
                  <div key={emp.id} className="flex items-center gap-3 p-3 rounded-xl bg-background/40 border border-white/5 hover:bg-white/5 transition-colors">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-secondary border border-border flex-shrink-0">
                      {emp.photo ? (
                        <img src={emp.photo} alt={emp.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-sm font-medium text-muted-foreground">
                          {emp.name.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground text-sm truncate">{emp.name}</p>
                      <p className="text-xs text-muted-foreground">{emp.role}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {todaySummaryEntry?.totalHours && (
                        <span className="text-xs font-mono text-primary">{todaySummaryEntry.totalHours}</span>
                      )}
                      <Badge
                        variant="outline"
                        className={isPresent
                          ? "border-green-500/40 text-green-400 bg-green-500/10 text-xs"
                          : "border-muted-foreground/30 text-muted-foreground bg-muted/20 text-xs"
                        }
                      >
                        {isPresent ? "● Presente" : "○ Ausente"}
                      </Badge>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Banco de Horas Semanal */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Banco de Horas – Semana Atual
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeEmployees.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">Nenhum funcionário ativo.</p>
            ) : (
              activeEmployees.map(emp => {
                const worked = weekSummariesByEmployee[emp.id] || 0;
                const target = emp.weeklyHours ?? 44;
                const percent = Math.min((worked / target) * 100, 100);
                const isOver = worked > target;
                const extraHours = worked - target;

                return (
                  <div key={emp.id} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{emp.name}</span>
                        {isOver && (
                          <div className="flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                            <AlertTriangle className="w-3 h-3" />
                            +{extraHours.toFixed(1)}h extra
                          </div>
                        )}
                      </div>
                      <span className={`font-mono text-xs font-semibold ${isOver ? "text-red-400" : "text-primary"}`}>
                        {worked.toFixed(1)}h / {target}h
                      </span>
                    </div>
                    <div className="relative">
                      <Progress
                        value={percent}
                        className={`h-2 ${isOver ? "[&>div]:bg-red-500" : "[&>div]:bg-primary"}`}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
