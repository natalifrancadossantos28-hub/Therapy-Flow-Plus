import { useEffect, useState, useMemo } from "react";
import {
  listPatients,
  listProfessionals,
  listAppointmentsToday,
  listWaitingList,
  getAppointmentsStats,
  type Patient,
  type Professional as ArcoProfessional,
  type AppointmentToday,
  type WaitingListEntry,
} from "@/lib/arco-rpc";
import { Users, UserRound, ClipboardList, AlertCircle, ListTodo, TrendingUp, CalendarDays, Activity, Briefcase, HeartPulse, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Card, MotionCard, Badge, Button } from "@/components/ui-custom";
import { Link } from "wouter";
import { cn, getStatusColor } from "@/lib/utils";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell } from "recharts";
import { specialtyTone, specialtyShortLabel } from "@/lib/specialty-colors";

// ── Faixas Etárias ────────────────────────────────────────────────────────────
const FAIXAS = [
  { key: "bebe",      label: "Bebês",           emoji: "👶", range: "0–2 anos",   min: 0,  max: 2,  cor: "#a78bfa" },
  { key: "inf1",      label: "1ª Infância",     emoji: "🧒", range: "3–6 anos",   min: 3,  max: 6,  cor: "#34d399" },
  { key: "inf2",      label: "2ª Infância",     emoji: "🧒", range: "7–10 anos",  min: 7,  max: 10, cor: "#00d4ff" },
  { key: "adol",      label: "Adolescentes",    emoji: "🧑", range: "11–18 anos", min: 11, max: 18, cor: "#f97316", alerta: true },
  { key: "adulto",    label: "Adultos",         emoji: "👤", range: "18+ anos",   min: 19, max: 999,cor: "#ff2060" },
  { key: "sem_data",  label: "Sem data nasc.",  emoji: "❓", range: "—",          min: -1, max: -1, cor: "#64748b" },
] as const;

function calcIdade(dob: string): number {
  const d = new Date(dob + "T00:00:00");
  const hoje = new Date();
  let a = hoje.getFullYear() - d.getFullYear();
  const m = hoje.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < d.getDate())) a--;
  return a;
}

function faixaDeIdade(dob: string | null | undefined): string {
  if (!dob) return "sem_data";
  const idade = calcIdade(dob);
  for (const f of FAIXAS) {
    if (f.key === "sem_data") continue;
    if (idade >= f.min && idade <= f.max) return f.key;
  }
  return "sem_data";
}

type Stats = { semanal: number; mensal: number; trimestral: number; semestral: number; anual: number };

type Ocupacao = {
  id: number; name: string; specialty: string; cargaHoraria: string;
  pacientesAtivos: number; capacidade: number; meta: number; metaMin: number;
  pct: number; vagasAbertas: boolean; alerta: string | null;
};

const POLL_MS = 30_000; // 30 s

export default function Dashboard() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [professionals, setProfessionals] = useState<ArcoProfessional[]>([]);
  const [todayAppointments, setTodayAppointments] = useState<AppointmentToday[]>([]);
  const [waitingList, setWaitingList] = useState<WaitingListEntry[]>([]);
  const [aptStats, setAptStats] = useState<Stats | null>(null);
  const [ocupacao, setOcupacao] = useState<Ocupacao[]>([]);

  const fetchAll = () => {
    listPatients().then(setPatients).catch(console.error);
    listProfessionals().then(setProfessionals).catch(console.error);
    listAppointmentsToday().then(setTodayAppointments).catch(console.error);
    listWaitingList().then(setWaitingList).catch(console.error);
    getAppointmentsStats().then(setAptStats).catch(console.error);
  };
  const fetchOcupacao = () =>
    fetch("/api/professionals/ocupacao").then(r => r.json()).then(setOcupacao).catch(() => setOcupacao([]));

  useEffect(() => {
    fetchAll();
    fetchOcupacao();
    const id1 = setInterval(fetchAll, POLL_MS);
    const id2 = setInterval(fetchOcupacao, POLL_MS);
    return () => { clearInterval(id1); clearInterval(id2); };
  }, []);

  const totalPatients = patients?.length || 0;
  const totalProfessionals = professionals?.length || 0;
  const todayCount = todayAppointments?.length || 0;
  const waitingCount = waitingList?.length || 0;

  const absentPatients = patients?.filter(p => p.absenceCount >= 3) || [];

  // ── Batimento cardíaco da clínica (hoje) ─────────────────────────────────
  // Realizado: atendimento concluído (em andamento, presente ou alta naquele dia).
  // Falta: ausência registrada (justificada ou não).
  // Pendente: ainda não fechado (agendado, remanejado, remarcado).
  const heartbeat = useMemo(() => {
    let realizado = 0;
    let falta = 0;
    let pendente = 0;
    let cancelado = 0;
    const porEspecialidade: Record<string, number> = {};
    for (const a of todayAppointments || []) {
      const st = (a.status || "agendado").toLowerCase();
      if (st === "atendimento" || st === "presente" || st === "alta") realizado++;
      else if (st === "ausente" || st === "falta_justificada" || st === "falta_nao_justificada") falta++;
      else if (st === "cancelado" || st === "desmarcado") cancelado++;
      else pendente++;
      const k = (a.professionalSpecialty || "—").trim() || "—";
      porEspecialidade[k] = (porEspecialidade[k] || 0) + 1;
    }
    const fechados = realizado + falta;
    const taxaPresenca = fechados > 0 ? Math.round((realizado / fechados) * 100) : null;
    return { realizado, falta, pendente, cancelado, taxaPresenca, porEspecialidade };
  }, [todayAppointments]);

  // ── Status da fila (cor por prioridade clínica) ──────────────────────────
  const filaPorCor = useMemo(() => {
    const buckets = { vermelho: 0, laranja: 0, azul: 0, verde: 0, sem: 0 };
    for (const w of waitingList || []) {
      const p = (w.priority || "").toLowerCase();
      if (p === "elevado" || p === "alto") buckets.vermelho++;
      else if (p === "moderado") buckets.laranja++;
      else if (p === "leve") buckets.azul++;
      else if (p === "baixo") buckets.verde++;
      else buckets.sem++;
    }
    return buckets;
  }, [waitingList]);

  const presencaDonut = [
    { name: "Realizados", value: heartbeat.realizado, fill: "#34d399" },
    { name: "Faltas", value: heartbeat.falta, fill: "#f87171" },
  ];


  // ── Perfil de pacientes por profissional ──────────────────────────────────
  const profPerfil = useMemo(() => {
    const perfil: Record<number, Record<string, number>> = {};
    for (const p of patients || []) {
      const profId = p.professionalId;
      if (!profId) continue;
      if (!perfil[profId]) {
        for (const f of FAIXAS) { perfil[profId] = {}; }
        for (const f of FAIXAS) perfil[profId][f.key] = 0;
      }
      const faixa = faixaDeIdade(p.dateOfBirth);
      perfil[profId][faixa] = (perfil[profId][faixa] || 0) + 1;
    }
    return perfil;
  }, [patients]);

  const triadPatients = (patients || []).filter(p => p.triagemScore != null);
  const avg = (key: keyof Patient) => triadPatients.length ? Math.round(triadPatients.reduce((s, p) => s + ((p[key] as number) || 0), 0) / triadPatients.length) : 0;
  const radarData = [
    { area: "Psicologia", score: avg("scorePsicologia") },
    { area: "Psicomotr.", score: avg("scorePsicomotricidade") },
    { area: "Fisioterapia", score: avg("scoreFisioterapia") },
    { area: "Psicoped.", score: avg("scorePsicopedagogia") },
    { area: "Ed. Física", score: avg("scoreEdFisica") },
    { area: "Fonoaud.", score: avg("scoreFonoaudiologia") },
    { area: "T.O.", score: avg("scoreTO") },
    { area: "Nutrição", score: avg("scoreNutricionista") },
  ].map(d => ({ ...d, pct: Math.round((d.score / 72) * 100) }));

  // Historical count by year — prefer entryDate, fallback to createdAt
  const byYear: Record<number, number> = {};
  for (const p of patients || []) {
    const dateStr = p.entryDate || p.createdAt;
    const yr = new Date(dateStr).getFullYear();
    byYear[yr] = (byYear[yr] || 0) + 1;
  }
  const anos = [2023, 2024, 2025, 2026];

  const topCards = [
    { title: "Pacientes Ativos", value: totalPatients, icon: Users, color: "text-[#00d4ff]", bg: "bg-[#00d4ff]/10" },
    { title: "Fila de Espera", value: waitingCount, icon: ListTodo, color: "text-[#ff9f20]", bg: "bg-[#ff9f20]/10" },
    { title: "Profissionais", value: totalProfessionals, icon: UserRound, color: "text-primary", bg: "bg-primary/10" },
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

      {/* Batimento Cardíaco da Clínica — resumo do dia em 5s de leitura. */}
      <Heartbeat
        total={todayCount}
        realizado={heartbeat.realizado}
        falta={heartbeat.falta}
        pendente={heartbeat.pendente}
        cancelado={heartbeat.cancelado}
        taxaPresenca={heartbeat.taxaPresenca}
        donutData={presencaDonut}
        porEspecialidade={heartbeat.porEspecialidade}
        filaPorCor={filaPorCor}
        waitingCount={waitingCount}
      />

      {/* Top Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
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
                  <PolarGrid stroke="rgba(0,240,255,0.15)" />
                  <PolarAngleAxis dataKey="area" tick={{ fontSize: 11, fill: "rgba(210,230,255,0.85)", fontWeight: 600 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9, fill: "rgba(150,180,220,0.6)" }} tickCount={4} unit="%" />
                  <Radar name="Média" dataKey="pct" stroke="#00f0ff" fill="#00f0ff" fillOpacity={0.15} strokeWidth={2.5} dot={{ r: 4, fill: "#00f0ff", filter: "drop-shadow(0 0 6px #00f0ff)" }} />
                  <Tooltip formatter={(v: any) => [`${v}%`, "Média"]} contentStyle={{ background: "hsl(222 50% 8%)", border: "1px solid rgba(0,240,255,0.25)", borderRadius: 12, color: "#e0f0ff", boxShadow: "0 0 20px rgba(0,240,255,0.1)" }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {radarData.map(d => (
                <div key={d.area} className="flex items-center gap-3">
                  <span className="w-24 text-xs font-semibold text-muted-foreground shrink-0">{d.area}</span>
                  <div className="flex-1 h-2.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${d.pct}%`, background: "linear-gradient(90deg, #00b4d8, #00f0ff)", boxShadow: "0 0 8px rgba(0,240,255,0.5)" }} />
                  </div>
                  <span className="w-12 text-right text-xs font-bold text-foreground">{d.score}/72</span>
                  <span className="w-10 text-right text-xs text-muted-foreground">{d.pct}%</span>
                </div>
              ))}
              <div className="mt-3 pt-3 border-t border-border flex justify-between text-sm">
                <span className="font-semibold text-muted-foreground">Score Médio Total</span>
                <span className="font-bold text-primary">{Math.round((radarData.reduce((s, d) => s + d.score, 0) / 360) * 150)}/150</span>
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

      {/* Monitor de Ocupação */}
      {ocupacao.length > 0 && (
        <Card className={cn("p-6", ocupacao.some(o => o.vagasAbertas) ? "border-[rgba(249,115,22,0.35)] shadow-[0_0_24px_rgba(249,115,22,0.08)]" : "")}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold font-display flex items-center gap-2"
              style={ocupacao.some(o => o.vagasAbertas) ? { color: "#f97316", textShadow: "0 0 12px rgba(249,115,22,0.4)" } : {}}>
              <Briefcase className="w-5 h-5" />
              Monitor de Ocupação
              {ocupacao.some(o => o.vagasAbertas) && (
                <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded-lg animate-pulse"
                  style={{ background: "rgba(249,115,22,0.12)", border: "1px solid rgba(249,115,22,0.4)", color: "#f97316" }}>
                  Vagas Abertas
                </span>
              )}
            </h2>
            <span className="text-xs text-muted-foreground font-semibold">Meta: 28–30 pacientes/profissional</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ocupacao.map(o => {
              const cor = o.vagasAbertas
                ? o.pacientesAtivos < 20 ? "#ef4444" : "#f97316"
                : "#00f0ff";
              const bgCor = o.vagasAbertas
                ? o.pacientesAtivos < 20 ? "rgba(239,68,68,0.07)" : "rgba(249,115,22,0.07)"
                : "rgba(0,240,255,0.04)";
              const borderCor = o.vagasAbertas
                ? o.pacientesAtivos < 20 ? "rgba(239,68,68,0.25)" : "rgba(249,115,22,0.25)"
                : "rgba(0,240,255,0.12)";
              return (
                <div key={o.id}
                  className="p-4 rounded-xl flex flex-col gap-3 transition-all"
                  style={{ background: bgCor, border: `1px solid ${borderCor}` }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-sm text-foreground">{o.name}</p>
                      <p className="text-xs text-muted-foreground">{o.specialty || "—"} · {o.cargaHoraria}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold font-display" style={{ color: cor }}>{o.pacientesAtivos}</p>
                      <p className="text-[10px] text-muted-foreground">/ {o.meta} meta</p>
                    </div>
                  </div>
                  {/* Barra de progresso */}
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${o.pct}%`,
                      background: `linear-gradient(90deg, ${cor}99, ${cor})`,
                      boxShadow: `0 0 8px ${cor}66`,
                    }} />
                  </div>
                  {o.vagasAbertas ? (
                    <p className="text-xs font-bold" style={{ color: cor }}>
                      ⚠️ Agenda aberta — {o.meta - o.pacientesAtivos} vaga{o.meta - o.pacientesAtivos !== 1 ? "s" : ""} disponíve{o.meta - o.pacientesAtivos !== 1 ? "is" : "l"}
                    </p>
                  ) : (
                    <p className="text-xs font-semibold" style={{ color: "#00f0ff" }}>✅ Meta atingida</p>
                  )}
                  {/* Mini perfil de faixa etária */}
                  {profPerfil[o.id] && (
                    <div className="flex flex-wrap gap-1 pt-1 border-t border-border/40">
                      {FAIXAS.filter(f => f.key !== "sem_data" && (profPerfil[o.id]?.[f.key] || 0) > 0).map(f => (
                        <span key={f.key} className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                          style={{ background: `${f.cor}15`, border: `1px solid ${f.cor}40`, color: f.cor }}>
                          {f.emoji} {profPerfil[o.id]?.[f.key] || 0}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Alertas de Faltas */}
      {absentPatients.length > 0 && (
        <Card className="p-6 border-[rgba(255,30,90,0.3)] shadow-[0_0_24px_rgba(255,30,90,0.08)]">
          <h2 className="text-xl font-bold font-display flex items-center gap-2 text-[#ff2060] mb-6" style={{ textShadow: "0 0 12px rgba(255,30,90,0.5)" }}>
            <AlertCircle className="w-5 h-5" />
            Atenção: Pacientes com Faltas
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {absentPatients.map(p => (
              <div key={p.id} className="p-4 rounded-xl bg-[rgba(255,30,90,0.06)] border border-[rgba(255,30,90,0.2)] flex flex-col gap-2">
                <div className="flex justify-between items-start">
                  <p className="font-semibold text-foreground">{p.name}</p>
                  <Badge className="badge-neon-red">{p.absenceCount} Faltas</Badge>
                </div>
                <Link href={`/patients/${p.id}`}>
                  <Button variant="outline" className="w-full text-xs h-8 mt-2 border-[rgba(255,30,90,0.4)] text-[#ff2060] hover:bg-[rgba(255,30,90,0.08)] hover:shadow-[0_0_14px_rgba(255,30,90,0.35)]">
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

// ── Heartbeat ───────────────────────────────────────────────────────────────
// Cards neon de "batimento cardíaco" da clínica:
//   • Atendimentos hoje (realizados / agendados)
//   • Taxa de presença (donut)
//   • Status da fila (count por cor de prioridade clínica)
//   • Mini-listagem de atendimentos por especialidade

type HeartbeatProps = {
  total: number;
  realizado: number;
  falta: number;
  pendente: number;
  cancelado: number;
  taxaPresenca: number | null;
  donutData: Array<{ name: string; value: number; fill: string }>;
  porEspecialidade: Record<string, number>;
  filaPorCor: { vermelho: number; laranja: number; azul: number; verde: number; sem: number };
  waitingCount: number;
};

function Heartbeat({
  total,
  realizado,
  falta,
  pendente,
  cancelado,
  taxaPresenca,
  donutData,
  porEspecialidade,
  filaPorCor,
  waitingCount,
}: HeartbeatProps) {
  const especialidades = Object.entries(porEspecialidade)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Card 1: Atendimentos do dia */}
      <Card className="p-6 relative overflow-hidden border-[rgba(0,240,255,0.25)] shadow-[0_0_28px_rgba(0,240,255,0.08)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <HeartPulse className="w-5 h-5 text-[#00f0ff]" style={{ filter: "drop-shadow(0 0 6px rgba(0,240,255,0.7))" }} />
            <h2 className="text-base font-display font-bold text-foreground">Atendimentos hoje</h2>
          </div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Pulso</span>
        </div>
        <div className="flex items-end gap-2">
          <span className="text-5xl font-bold font-display leading-none" style={{ color: "#00f0ff", textShadow: "0 0 18px rgba(0,240,255,0.45)" }}>
            {realizado}
          </span>
          <span className="text-2xl font-display text-muted-foreground mb-1">/ {total}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1 font-medium">realizados de {total} agendados hoje</p>
        <div className="grid grid-cols-3 gap-2 mt-5">
          <PulseStat label="Pendentes" value={pendente} fg="#fdba74" bg="rgba(251,146,60,0.12)" border="rgba(251,146,60,0.45)" />
          <PulseStat label="Faltas"    value={falta}    fg="#fca5a5" bg="rgba(248,113,113,0.12)" border="rgba(248,113,113,0.45)" />
          <PulseStat label="Cancel."   value={cancelado} fg="#cbd5e1" bg="rgba(148,163,184,0.12)" border="rgba(148,163,184,0.4)" />
        </div>
        <div className="absolute -bottom-10 -right-10 w-40 h-40 rounded-full blur-3xl opacity-30" style={{ background: "rgba(0,240,255,0.35)" }} />
      </Card>

      {/* Card 2: Taxa de presença */}
      <Card className="p-6 relative overflow-hidden border-[rgba(74,222,128,0.25)] shadow-[0_0_28px_rgba(74,222,128,0.08)]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-[#34d399]" style={{ filter: "drop-shadow(0 0 6px rgba(74,222,128,0.7))" }} />
            <h2 className="text-base font-display font-bold text-foreground">Taxa de presença</h2>
          </div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Hoje</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative w-32 h-32 shrink-0">
            {(realizado + falta) === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-3xl font-display font-bold text-muted-foreground/60">—</p>
                  <p className="text-[10px] text-muted-foreground mt-1">sem dados</p>
                </div>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      dataKey="value"
                      innerRadius={42}
                      outerRadius={60}
                      stroke="none"
                      startAngle={90}
                      endAngle={-270}
                      isAnimationActive
                    >
                      {donutData.map((d, i) => (
                        <Cell key={i} fill={d.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <p className="text-2xl font-display font-bold" style={{ color: "#34d399", textShadow: "0 0 12px rgba(74,222,128,0.5)" }}>
                      {taxaPresenca ?? 0}%
                    </p>
                    <p className="text-[10px] text-muted-foreground -mt-0.5">presença</p>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="flex-1 space-y-2">
            <DonutLegend dot="#34d399" label="Realizados" value={realizado} />
            <DonutLegend dot="#f87171" label="Faltas" value={falta} />
            <p className="text-[11px] text-muted-foreground/80 mt-2 leading-snug">
              Considera apenas atendimentos já fechados (realizados ou faltas).
            </p>
          </div>
        </div>
        <div className="absolute -bottom-10 -right-10 w-40 h-40 rounded-full blur-3xl opacity-30" style={{ background: "rgba(74,222,128,0.35)" }} />
      </Card>

      {/* Card 3: Status da fila por cor */}
      <Card className="p-6 relative overflow-hidden border-[rgba(255,30,90,0.25)] shadow-[0_0_28px_rgba(255,30,90,0.08)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-[#ff2060]" style={{ filter: "drop-shadow(0 0 6px rgba(255,30,90,0.7))" }} />
            <h2 className="text-base font-display font-bold text-foreground">Status da fila</h2>
          </div>
          <Link href="/waiting-list" className="text-[10px] uppercase tracking-wider text-primary font-bold hover:underline">
            Ver fila
          </Link>
        </div>
        <p className="text-xs text-muted-foreground mb-4">{waitingCount} aguardando vaga · classificação clínica</p>
        <div className="grid grid-cols-2 gap-2">
          <FilaBucket label="Vermelho" hint="Elevado" value={filaPorCor.vermelho} fg="#fca5a5" bg="rgba(248,113,113,0.12)" border="rgba(248,113,113,0.5)" glow="rgba(248,113,113,0.4)" />
          <FilaBucket label="Laranja"  hint="Moderado" value={filaPorCor.laranja} fg="#fdba74" bg="rgba(251,146,60,0.12)" border="rgba(251,146,60,0.5)" glow="rgba(251,146,60,0.4)" />
          <FilaBucket label="Azul"     hint="Leve"    value={filaPorCor.azul}    fg="#93c5fd" bg="rgba(96,165,250,0.12)" border="rgba(96,165,250,0.5)" glow="rgba(96,165,250,0.4)" />
          <FilaBucket label="Verde"    hint="Baixo"   value={filaPorCor.verde}   fg="#86efac" bg="rgba(74,222,128,0.12)" border="rgba(74,222,128,0.5)" glow="rgba(74,222,128,0.4)" />
        </div>
        {filaPorCor.sem > 0 && (
          <p className="text-[11px] text-muted-foreground/80 mt-3">
            {filaPorCor.sem} sem classificação ainda
          </p>
        )}
        <div className="absolute -bottom-10 -right-10 w-40 h-40 rounded-full blur-3xl opacity-25" style={{ background: "rgba(255,30,90,0.35)" }} />
      </Card>

      {/* Card 4: Atendimentos do dia por especialidade — full width */}
      {especialidades.length > 0 && (
        <Card className="p-6 lg:col-span-3">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-base font-display font-bold text-foreground">Hoje por especialidade</h2>
            <span className="text-xs text-muted-foreground">{total} atendimento{total !== 1 ? "s" : ""} · cor neon de cada área</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {especialidades.map(([k, n]) => {
              const tone = specialtyTone(k);
              const lbl = specialtyShortLabel(k);
              return (
                <div
                  key={k}
                  className="px-3 py-2 rounded-xl flex items-center gap-2 transition-all"
                  style={{
                    background: tone.bg,
                    border: `1px solid ${tone.border}`,
                    boxShadow: `0 0 12px ${tone.glow}`,
                  }}
                >
                  <span className="text-sm font-bold" style={{ color: tone.fg }}>
                    {lbl}
                  </span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-md" style={{ background: "rgba(0,0,0,0.3)", color: tone.fg }}>
                    {n}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

function PulseStat({ label, value, fg, bg, border }: { label: string; value: number; fg: string; bg: string; border: string }) {
  return (
    <div className="rounded-xl px-3 py-2 text-center" style={{ background: bg, border: `1px solid ${border}` }}>
      <p className="text-xl font-display font-bold leading-none" style={{ color: fg }}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1 font-semibold">{label}</p>
    </div>
  );
}

function DonutLegend({ dot, label, value }: { dot: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: dot, boxShadow: `0 0 6px ${dot}` }} />
      <span className="text-xs text-foreground font-medium flex-1">{label}</span>
      <span className="text-sm font-display font-bold text-foreground">{value}</span>
    </div>
  );
}

function FilaBucket({
  label, hint, value, fg, bg, border, glow,
}: { label: string; hint: string; value: number; fg: string; bg: string; border: string; glow: string }) {
  return (
    <div
      className="rounded-xl p-3 transition-all"
      style={{
        background: bg,
        border: `1px solid ${border}`,
        boxShadow: value > 0 ? `0 0 14px ${glow}` : undefined,
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold" style={{ color: fg }}>{label}</p>
        <p className="text-2xl font-display font-bold leading-none" style={{ color: fg, textShadow: value > 0 ? `0 0 10px ${glow}` : undefined }}>
          {value}
        </p>
      </div>
      <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>
    </div>
  );
}
