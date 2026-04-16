import { useEffect, useState, useMemo } from "react";
import { useGetPatients, useGetProfessionals, useGetTodayAppointments, useGetWaitingList } from "@workspace/api-client-react";
import type { Patient } from "@workspace/api-zod";
import { Users, UserRound, ClipboardList, AlertCircle, ListTodo, TrendingUp, CalendarDays, Activity, Briefcase, Baby, MapPin } from "lucide-react";
import { Card, MotionCard, Badge, Button } from "@/components/ui-custom";
import { Link } from "wouter";
import { cn, getStatusColor } from "@/lib/utils";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell, Legend } from "recharts";

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
  const { data: patients } = useGetPatients({} as any, { refetchInterval: POLL_MS } as any);
  const { data: professionals } = useGetProfessionals({} as any, { refetchInterval: POLL_MS } as any);
  const { data: todayAppointments } = useGetTodayAppointments({} as any, { refetchInterval: POLL_MS } as any);
  const { data: waitingList } = useGetWaitingList({} as any, { refetchInterval: POLL_MS } as any);
  const [aptStats, setAptStats] = useState<Stats | null>(null);
  const [ocupacao, setOcupacao] = useState<Ocupacao[]>([]);

  const fetchStats = () =>
    fetch("/api/appointments/stats").then(r => r.json()).then(setAptStats).catch(console.error);
  const fetchOcupacao = () =>
    fetch("/api/professionals/ocupacao").then(r => r.json()).then(setOcupacao).catch(console.error);

  useEffect(() => {
    fetchStats();
    fetchOcupacao();
    const id1 = setInterval(fetchStats, POLL_MS);
    const id2 = setInterval(fetchOcupacao, POLL_MS);
    return () => { clearInterval(id1); clearInterval(id2); };
  }, []);

  const totalPatients = patients?.length || 0;
  const preCadastros = patients?.filter(p => p.status === "pré-cadastro").length || 0;
  const totalProfessionals = professionals?.length || 0;
  const todayCount = todayAppointments?.length || 0;
  const waitingCount = waitingList?.length || 0;

  const absentPatients = patients?.filter(p => p.absenceCount >= 3) || [];

  // ── Censo por faixa etária ────────────────────────────────────────────────
  const censo = useMemo(() => {
    const ativos = (patients || []).filter(p =>
      !["Alta", "Óbito", "Desistência"].includes(p.status)
    );
    const counts: Record<string, number> = {};
    const redeCounts: Record<string, number> = {};
    for (const f of FAIXAS) { counts[f.key] = 0; redeCounts[f.key] = 0; }
    for (const p of ativos) {
      const faixa = faixaDeIdade(p.dateOfBirth);
      counts[faixa] = (counts[faixa] || 0) + 1;
      if (p.escolaPublica) redeCounts[faixa] = (redeCounts[faixa] || 0) + 1;
    }
    const totalAtivos = ativos.length;
    const totalRede = ativos.filter(p => p.escolaPublica).length;
    const comData = ativos.filter(p => p.dateOfBirth).length;
    return { counts, redeCounts, totalAtivos, totalRede, comData };
  }, [patients]);

  // Pie chart data (só faixas com pacientes)
  const pieData = FAIXAS
    .filter(f => f.key !== "sem_data" && censo.counts[f.key] > 0)
    .map(f => ({ name: f.label, value: censo.counts[f.key], cor: f.cor }));

  // ── Contador PCD – Ibiúna ─────────────────────────────────────────────────
  const pcdStats = useMemo(() => {
    const all = (patients || []);
    const censoMunicipal = all.filter(p => p.tipoRegistro === "Registro Censo Municipal");
    const unidade = all.filter(p => p.tipoRegistro !== "Registro Censo Municipal");
    const localCounts: Record<string, number> = {};
    for (const p of censoMunicipal) {
      const rawLoc = p.localAtendimento || "Não informado";
      const loc = rawLoc === "Nenhum" ? "Sem Atendimento" : rawLoc;
      localCounts[loc] = (localCounts[loc] || 0) + 1;
    }
    // Disability type breakdown from diagnosis field (all patients)
    const diagCounts: Record<string, number> = {
      "TEA / Autismo": 0,
      "Paralisia Cerebral": 0,
      "Síndrome de Down": 0,
      "Def. Intelectual": 0,
      "Def. Auditiva": 0,
      "Cadeira de Rodas": 0,
      "Outros / Sem CID": 0,
    };
    for (const p of all) {
      const d = (p.diagnosis || "").toLowerCase();
      if (!d) { diagCounts["Outros / Sem CID"]++; continue; }
      const hasCadeira = /cadeira.?de.?rodas|cadeirante|mobilidade.?reduzida/.test(d);
      if (hasCadeira) diagCounts["Cadeira de Rodas"]++;
      if (/tea|autis|espectro/.test(d)) { diagCounts["TEA / Autismo"]++; }
      else if (/paralisia cerebral|\bpc\b|disfun/.test(d)) { diagCounts["Paralisia Cerebral"]++; }
      else if (/down|trissomia/.test(d)) { diagCounts["Síndrome de Down"]++; }
      else if (/intelectual|\bdi\b/.test(d)) { diagCounts["Def. Intelectual"]++; }
      else if (/audit|surdez|surdo/.test(d)) { diagCounts["Def. Auditiva"]++; }
      else if (!hasCadeira) { diagCounts["Outros / Sem CID"]++; }
    }
    return { total: all.length, censoMunicipal: censoMunicipal.length, unidade: unidade.length, localCounts, diagCounts };
  }, [patients]);

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
    { title: "Total de Pacientes", value: totalPatients, icon: Users, color: "text-[#00d4ff]", bg: "bg-[#00d4ff]/10" },
    { title: "Pré-Cadastros", value: preCadastros, icon: ClipboardList, color: "text-[#00ff88]", bg: "bg-[#00ff88]/10" },
    { title: "Profissionais", value: totalProfessionals, icon: UserRound, color: "text-primary", bg: "bg-primary/10" },
    { title: "Fila de Espera", value: waitingCount, icon: ListTodo, color: "text-[#ff9f20]", bg: "bg-[#ff9f20]/10" },
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

      {/* Contador PCD – Ibiúna */}
      <Card className="p-6 border-violet-500/30" style={{ background: "rgba(139,92,246,0.04)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <h2 className="text-xl font-bold font-display flex items-center gap-2" style={{ color: "#a78bfa" }}>
            <MapPin className="w-5 h-5" />
            Contador PCD – Ibiúna
          </h2>
          <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.3)", color: "#a78bfa" }}>
            Busca Ativa Municipal
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div className="p-4 rounded-2xl text-center" style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.25)" }}>
            <p className="text-3xl font-bold font-display" style={{ color: "#a78bfa", textShadow: "0 0 20px rgba(139,92,246,0.5)" }}>{pcdStats.total}</p>
            <p className="text-xs font-semibold text-muted-foreground mt-1">Total Cadastrados</p>
          </div>
          <div className="p-4 rounded-2xl text-center" style={{ background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.2)" }}>
            <p className="text-3xl font-bold font-display" style={{ color: "#00d4ff" }}>{pcdStats.unidade}</p>
            <p className="text-xs font-semibold text-muted-foreground mt-1">🏥 Pacientes da Unidade</p>
          </div>
          <div className="p-4 rounded-2xl text-center" style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.3)" }}>
            <p className="text-3xl font-bold font-display" style={{ color: "#c084fc" }}>{pcdStats.censoMunicipal}</p>
            <p className="text-xs font-semibold text-muted-foreground mt-1">🏛️ Censo Municipal</p>
          </div>
        </div>
        <div className="mb-4">
          <p className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wider">Tipos de Deficiência (todos os cadastros)</p>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {Object.entries(pcdStats.diagCounts).map(([label, count]) => (
              <div key={label} className="p-2 rounded-xl text-center" style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.2)" }}>
                <p className="text-xl font-bold font-display" style={{ color: "#a78bfa" }}>{count}</p>
                <p className="text-[10px] font-semibold text-muted-foreground mt-0.5 leading-tight">{label}</p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wider">Onde estão sendo atendidos (Censo Municipal)</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { key: "Sem Atendimento", label: "🚨 Sem Atendimento", color: "#ef4444", bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.3)" },
              { key: "CAPS",         label: "💙 CAPS",            color: "#60a5fa", bg: "rgba(96,165,250,0.08)",  border: "rgba(96,165,250,0.3)" },
              { key: "Reabilitação", label: "💚 Reabilitação",    color: "#34d399", bg: "rgba(52,211,153,0.08)", border: "rgba(52,211,153,0.3)" },
              { key: "Particular",   label: "💛 Particular",      color: "#fbbf24", bg: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.3)" },
            ].map(({ key, label, color, bg, border }) => (
              <div key={key} className="p-3 rounded-xl text-center" style={{ background: bg, border: `1px solid ${border}` }}>
                <p className="text-2xl font-bold font-display" style={{ color }}>{pcdStats.localCounts[key] ?? 0}</p>
                <p className="text-[11px] font-semibold mt-0.5" style={{ color }}>{label}</p>
              </div>
            ))}
          </div>
          {pcdStats.censoMunicipal === 0 && (
            <p className="text-xs text-muted-foreground mt-2">Nenhum registro do Censo Municipal cadastrado ainda.</p>
          )}
        </div>
      </Card>

      {/* Censo por Faixa Etária */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h2 className="text-xl font-bold font-display flex items-center gap-2">
            <Baby className="w-5 h-5 text-primary" />
            Censo por Faixa Etária
          </h2>
          <div className="flex gap-3 flex-wrap text-xs font-semibold">
            <span className="px-3 py-1.5 rounded-xl bg-secondary border border-border text-muted-foreground">
              🏥 <strong className="text-foreground">{censo.totalAtivos}</strong> ativos
            </span>
            <span className="px-3 py-1.5 rounded-xl border" style={{ background: "rgba(52,211,153,0.07)", borderColor: "rgba(52,211,153,0.25)", color: "#34d399" }}>
              🏫 <strong>{censo.totalRede}</strong> Rede Municipal
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-secondary border border-border text-muted-foreground">
              📅 {censo.comData} com data nascimento
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* Barras neon */}
          <div className="space-y-3">
            {FAIXAS.map(f => {
              const n = censo.counts[f.key] || 0;
              const rede = censo.redeCounts[f.key] || 0;
              const pct = censo.totalAtivos > 0 ? Math.round((n / censo.totalAtivos) * 100) : 0;
              if (n === 0 && f.key === "sem_data") return null;
              return (
                <div key={f.key} className="group">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-base leading-none">{f.emoji}</span>
                      <span className="text-sm font-semibold text-foreground">{f.label}</span>
                      <span className="text-xs text-muted-foreground">({f.range})</span>
                      {(f as any).alerta && n > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: "rgba(249,115,22,0.12)", color: "#f97316", border: "1px solid rgba(249,115,22,0.3)" }}>
                          ⚠️ Limite
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-bold font-display" style={{ color: f.cor, textShadow: `0 0 12px ${f.cor}66` }}>{n}</span>
                      {rede > 0 && <span className="text-xs text-muted-foreground ml-1">({rede} mun.)</span>}
                    </div>
                  </div>
                  <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{
                      width: `${pct}%`,
                      background: `linear-gradient(90deg, ${f.cor}88, ${f.cor})`,
                      boxShadow: `0 0 10px ${f.cor}66`,
                    }} />
                  </div>
                  {rede > 0 && (
                    <div className="h-1 bg-secondary rounded-full overflow-hidden mt-0.5 opacity-50">
                      <div className="h-full rounded-full" style={{
                        width: `${Math.round((rede / (n || 1)) * 100)}%`,
                        background: "#34d399",
                      }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pizza */}
          {pieData.length > 0 ? (
            <div className="flex flex-col items-center">
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                      dataKey="value" nameKey="name" paddingAngle={3}>
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.cor}
                          style={{ filter: `drop-shadow(0 0 8px ${entry.cor}88)` }} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: any, name: any) => [`${v} pacientes`, name]}
                      contentStyle={{ background: "hsl(222 50% 8%)", border: "1px solid rgba(0,240,255,0.2)", borderRadius: 12, color: "#e0f0ff" }}
                    />
                    <Legend formatter={(v) => <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {censo.totalRede > 0 && (
                <p className="text-xs text-center text-muted-foreground mt-1">
                  <span style={{ color: "#34d399" }}>●</span> {censo.totalRede} da Rede Municipal Ibiúna ({Math.round((censo.totalRede / (censo.totalAtivos || 1)) * 100)}% do total)
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-56 text-center">
              <Baby className="w-10 h-10 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">Preencha as datas de nascimento<br/>dos pacientes para ver o gráfico.</p>
            </div>
          )}
        </div>
      </Card>

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
