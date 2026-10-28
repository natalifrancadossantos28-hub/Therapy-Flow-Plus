import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { addDays, format } from "date-fns";
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { Users, CalendarCheck2, UserX, ListTodo, DoorOpen, Snowflake, ChevronLeft, ChevronRight, ChevronDown, Info, LayoutGrid, FileText } from "lucide-react";
import { Card } from "@/components/ui-custom";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { cn } from "@/lib/utils";
import {
  listPatients, listProfessionals, listProfessionalsCapacity, listWaitingList, listAppointments, listPausedOverview,
  type Patient, type Professional, type ProfessionalCapacity, type WaitingListEntry, type AppointmentListItem, type PausedOverviewItem,
} from "@/lib/arco-rpc";
import { isTransportSpecialty, SPECIALTIES } from "@/lib/specialty-colors";
import {
  type PeriodKind, periodRange, shiftPeriod, resumoAgenda, dedupeApts, statusOf, capacidadeMax, abaixoDaMeta, CAPACIDADE_META, CAPACIDADE_MAX, hojeISO, fmtPct, NAO_AVALIADO,
  ST_REALIZADO, ST_FALTA, ST_AGENDA_ATIVA, ST_PACIENTE_ENCERRADO, ST_PACIENTE_VINCULO,
} from "@/lib/indicadores";

type Paused = { fila: PausedOverviewItem[]; agenda: PausedOverviewItem[] };

export default function PainelGestao() {
  useDocumentTitle("Painel de Gestão");
  const [kind, setKind] = useState<PeriodKind>("mes");
  const [ref, setRef] = useState(() => new Date());
  const [esp, setEsp] = useState("__all__");
  const [profId, setProfId] = useState<number | null>(null);

  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [profs, setProfs] = useState<Professional[]>([]);
  const [cap, setCap] = useState<ProfessionalCapacity[] | null>(null);
  const [fila, setFila] = useState<WaitingListEntry[] | null>(null);
  const [paused, setPaused] = useState<Paused | null>(null);
  const [futuras, setFuturas] = useState<AppointmentListItem[] | null>(null);
  const [apts, setApts] = useState<AppointmentListItem[] | null>(null);
  const [aptsErro, setAptsErro] = useState(false);

  useEffect(() => {
    listPatients().then(setPatients).catch(() => setPatients(null));
    listProfessionals().then(setProfs).catch(() => setProfs([]));
    listProfessionalsCapacity().then(setCap).catch(() => setCap(null));
    listWaitingList().then(setFila).catch(() => setFila(null));
    listPausedOverview().then(setPaused).catch(() => setPaused(null));
    const hoje = hojeISO();
    listAppointments({ dateFrom: hoje, dateTo: format(addDays(new Date(), 60), "yyyy-MM-dd") }).then(setFuturas).catch(() => setFuturas(null));
  }, []);

  const periodo = useMemo(() => periodRange(kind, ref), [kind, ref]);
  useEffect(() => {
    const ate = periodo.to < hojeISO() ? periodo.to : hojeISO();
    setApts(null); setAptsErro(false);
    if (periodo.from > ate) { setApts([]); return; }
    listAppointments({ dateFrom: periodo.from, dateTo: ate }).then(setApts).catch(() => { setApts([]); setAptsErro(true); });
  }, [periodo.from, periodo.to]);

  const clinicos = useMemo(() => profs.filter((p) => !isTransportSpecialty(p.specialty)), [profs]);
  const specById = useMemo(() => new Map(profs.map((p) => [p.id, (p.specialty || "").trim()])), [profs]);
  const especialidades = useMemo(() => {
    const s = new Set<string>(SPECIALTIES);
    for (const p of clinicos) if (p.specialty) s.add(p.specialty.trim());
    return Array.from(s);
  }, [clinicos]);
  const profsFiltrados = clinicos.filter((p) => esp === "__all__" || (p.specialty || "").trim() === esp);

  const aptOk = (a: { professionalId: number }) => {
    const s = specById.get(a.professionalId) ?? "";
    if (isTransportSpecialty(s)) return false;
    if (profId != null) return a.professionalId === profId;
    return esp === "__all__" || s === esp;
  };
  const espDoFiltro = profId != null ? (specById.get(profId) || null) : esp === "__all__" ? null : esp;

  const aptsF = useMemo(() => (apts ?? []).filter(aptOk), [apts, esp, profId, specById]);
  const resumo = useMemo(() => resumoAgenda(aptsF), [aptsF]);

  const ativos = useMemo(() => {
    if (!futuras || !patients) return null;
    const encerrados = new Set(patients.filter((p) => ST_PACIENTE_ENCERRADO.has((p.status || "").toLowerCase())).map((p) => p.id));
    const ids = new Set<number>();
    const semFiltro = esp === "__all__" && profId == null;
    if (semFiltro) for (const p of patients) if (!encerrados.has(p.id) && ST_PACIENTE_VINCULO.has((p.status || "").toLowerCase())) ids.add(p.id);
    for (const a of futuras) {
      if (!aptOk(a) || encerrados.has(a.patientId)) continue;
      if (ST_AGENDA_ATIVA.has(statusOf(a))) ids.add(a.patientId);
    }
    return ids.size;
  }, [futuras, patients, esp, profId, specById]);

  const filaF = useMemo(() => (fila ?? []).filter((w) => !espDoFiltro || (w.specialty || "").trim() === espDoFiltro), [fila, espDoFiltro]);
  const filaAtiva = filaF.filter((w) => !w.paused);
  const filaCongelados = filaF.length - filaAtiva.length;

  const capF = useMemo(() => (cap ?? []).filter((c) => !isTransportSpecialty(c.specialty) && (profId != null ? c.id === profId : esp === "__all__" || (c.specialty || "").trim() === esp)), [cap, esp, profId]);
  const capTotal = capF.reduce((s, c) => s + capacidadeMax(c), 0);
  const capUsada = capF.reduce((s, c) => s + c.currentPatients, 0);
  const ocupacao = capTotal > 0 ? Math.round((capUsada / capTotal) * 100) : null;

  const pausedItems = useMemo(() => {
    if (!paused) return null;
    return [...paused.fila, ...paused.agenda].filter((i) => {
      if (profId != null) return i.source === "agenda" ? i.professionalId === profId : (i.specialty || "").trim() === espDoFiltro;
      return esp === "__all__" || (i.specialty || "").trim() === esp;
    });
  }, [paused, esp, profId, espDoFiltro]);

  const evolucao = useMemo(() => {
    const hoje = hojeISO();
    const rows = dedupeApts(aptsF);
    return periodo.buckets.map((b) => {
      if (b.from > hoje) return { label: b.label, realizados: null, faltas: null };
      let r = 0, f = 0;
      for (const a of rows) {
        if (a.date < b.from || a.date > b.to) continue;
        const st = statusOf(a);
        if (ST_REALIZADO.has(st)) r++; else if (ST_FALTA.has(st)) f++;
      }
      return { label: b.label, realizados: r, faltas: f };
    });
  }, [aptsF, periodo]);

  const porEspecialidade = useMemo(() => {
    const m = new Map<string, { realizados: number; faltas: number }>();
    for (const a of dedupeApts(aptsF)) {
      if (a.date > hojeISO()) continue;
      const k = specById.get(a.professionalId) || "Sem especialidade";
      const st = statusOf(a);
      const e = m.get(k) ?? { realizados: 0, faltas: 0 };
      if (ST_REALIZADO.has(st)) e.realizados++; else if (ST_FALTA.has(st)) e.faltas++; else continue;
      m.set(k, e);
    }
    return Array.from(m, ([k, v]) => ({ especialidade: k, ...v })).sort((a, b) => b.realizados - a.realizados);
  }, [aptsF, specById]);

  const porProfissional = useMemo(() => {
    const m = new Map<number, { realizados: number; faltas: number }>();
    for (const a of dedupeApts(aptsF)) {
      if (a.date > hojeISO()) continue;
      const st = statusOf(a);
      const e = m.get(a.professionalId) ?? { realizados: 0, faltas: 0 };
      if (ST_REALIZADO.has(st)) e.realizados++; else if (ST_FALTA.has(st)) e.faltas++;
      m.set(a.professionalId, e);
    }
    return m;
  }, [aptsF]);

  const v = (x: number | null | undefined, carregando: boolean) => (carregando ? "…" : x == null ? NAO_AVALIADO : x.toLocaleString("pt-BR"));
  const aptsLoading = apts === null;
  const kpis = [
    { icon: Users, label: "Pacientes ativos", value: v(ativos, futuras === null || patients === null), sub: "com vínculo ou agenda ativa", tone: "#38bdf8",
      origem: "Pacientes com status Atendimento + quem tem agendamento ativo nos próximos 60 dias (sem óbito/desistência). Com filtro, conta só pela agenda do filtro." },
    { icon: CalendarCheck2, label: "Atendimentos no período", value: aptsErro ? NAO_AVALIADO : v(resumo.realizados, aptsLoading), sub: `presença ${fmtPct(resumo.taxaPresenca)}`, tone: "#34d399",
      origem: "Sessões com presença marcada (Presente/Atendimento/Alta) até hoje. É presença administrativa, não registro do e-SUS. Presença = realizados ÷ (realizados + faltas)." },
    { icon: UserX, label: "Faltas", value: aptsErro ? NAO_AVALIADO : v(resumo.faltas, aptsLoading), sub: `${resumo.justificadas} justificadas à parte`, tone: "#f87171",
      origem: "Faltas não justificadas (Ausente) até hoje. Justificadas/abonadas não entram e aparecem embaixo." },
    { icon: ListTodo, label: "Fila de espera", value: v(fila ? filaAtiva.length : null, false), sub: filaCongelados > 0 ? `+${filaCongelados} congelados à parte` : "aguardando vaga", tone: "#fb923c",
      origem: "Pacientes ativos na fila (mesmo número da página Fila de Espera). Congelados não entram. Filtro por especialidade." },
    { icon: DoorOpen, label: "Ocupação da equipe", value: cap ? fmtPct(ocupacao) : v(null, false), sub: cap ? `${abaixoDaMeta(capF)} abaixo de ${CAPACIDADE_META} pacientes` : "", tone: "#a78bfa",
      origem: `Pacientes com agenda ativa ÷ capacidade (até ${CAPACIDADE_MAX} por profissional).` },
    { icon: Snowflake, label: "Pacientes pausados", value: v(pausedItems ? pausedItems.length : null, false), sub: pausedItems ? `${pausedItems.filter((i) => i.source === "fila").length} fila · ${pausedItems.filter((i) => i.source === "agenda").length} agenda` : "", tone: "#67e8f9",
      origem: "Pausas ativas na fila (congelados) e na agenda, da mesma lista da página Pausados / Busca Ativa." },
  ];

  const [aberto, setAberto] = useState<string | null>(null);
  const [origemAberta, setOrigemAberta] = useState(false);
  const sel = "rounded-xl border border-border bg-card/70 px-3 py-2 text-sm";
  const periodoAtual = periodRange(kind, new Date()).from === periodo.from;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-display font-bold">Painel de Gestão</h1>
          <p className="text-muted-foreground mt-1 text-sm">Visão do dia a dia · {periodo.label}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/prestacao-contas" className="rounded-xl border border-border px-3 py-2 text-sm font-semibold flex items-center gap-2 hover:bg-secondary"><FileText className="w-4 h-4" /> Prestação de contas</Link>
          <Link href="/dashboard-detalhes" className="rounded-xl border border-border px-3 py-2 text-sm font-semibold flex items-center gap-2 hover:bg-secondary"><LayoutGrid className="w-4 h-4" /> Painel detalhado</Link>
        </div>
      </div>

      <Card className="p-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-border overflow-hidden">
          {(["semana", "mes", "ano"] as PeriodKind[]).map((k) => (
            <button key={k} onClick={() => { setKind(k); setRef(new Date()); }} className={cn("px-3 py-2 text-sm font-semibold", kind === k ? "bg-primary text-primary-foreground" : "hover:bg-secondary")}>
              {k === "semana" ? "Semana" : k === "mes" ? "Mês" : "Ano"}
            </button>
          ))}
        </div>
        <button aria-label="Período anterior" onClick={() => setRef(shiftPeriod(kind, ref, -1))} className="p-2 rounded-lg hover:bg-secondary"><ChevronLeft className="w-4 h-4" /></button>
        <span className="text-sm font-semibold min-w-[150px] text-center capitalize">{periodo.label}</span>
        <button aria-label="Próximo período" disabled={periodoAtual} onClick={() => setRef(shiftPeriod(kind, ref, 1))} className="p-2 rounded-lg hover:bg-secondary disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
        <select className={sel} value={esp} onChange={(e) => { setEsp(e.target.value); setProfId(null); }}>
          <option value="__all__">Todas as especialidades</option>
          {especialidades.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={sel} value={profId ?? ""} onChange={(e) => setProfId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Todos os profissionais</option>
          {profsFiltrados.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {aptsLoading && <span className="text-xs text-muted-foreground animate-pulse">Carregando agenda…</span>}
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4 relative overflow-hidden" title={k.origem}>
            <div className="flex items-center gap-2 mb-3">
              <span className="p-2 rounded-xl" style={{ background: `${k.tone}22` }}><k.icon className="w-4 h-4" style={{ color: k.tone }} /></span>
              <span className="text-xs font-semibold text-muted-foreground leading-tight">{k.label}</span>
            </div>
            <p className={cn("font-display font-bold", k.value === NAO_AVALIADO ? "text-base text-muted-foreground italic" : "text-3xl")}>{k.value}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{k.sub}</p>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2">
          <h2 className="font-bold mb-1">Evolução no período</h2>
          <p className="text-xs text-muted-foreground mb-3">Atendimentos com presença e faltas não justificadas.</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={evolucao}>
                <defs>
                  <linearGradient id="gReal" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#34d399" stopOpacity={0.4} /><stop offset="100%" stopColor="#34d399" stopOpacity={0} /></linearGradient>
                  <linearGradient id="gFalta" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f87171" stopOpacity={0.35} /><stop offset="100%" stopColor="#f87171" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} />
                <Legend />
                <Area type="monotone" dataKey="realizados" name="Atendimentos" stroke="#34d399" fill="url(#gReal)" strokeWidth={2} connectNulls={false} />
                <Area type="monotone" dataKey="faltas" name="Faltas" stroke="#f87171" fill="url(#gFalta)" strokeWidth={2} connectNulls={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="font-bold mb-1">Por especialidade</h2>
          <p className="text-xs text-muted-foreground mb-3">Atendimentos no período.</p>
          {porEspecialidade.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-10 text-center">{aptsLoading ? "Carregando…" : NAO_AVALIADO}</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={porEspecialidade} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis type="category" dataKey="especialidade" width={110} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} />
                  <Bar dataKey="realizados" name="Atendimentos" fill="#38bdf8" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-2">
        <h2 className="font-bold text-sm text-muted-foreground uppercase tracking-wide">Detalhes (clique para abrir)</h2>
        <Detalhe id="prof" titulo="Ocupação e atendimentos por profissional" resumo={`${capF.length} profissionais`} aberto={aberto} setAberto={setAberto}>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground uppercase"><tr><th className="text-left py-2">Profissional</th><th className="text-left">Especialidade</th><th className="text-right">Pacientes</th><th className="text-right">Capacidade</th><th className="text-right">Atend. período</th><th className="text-right">Faltas</th></tr></thead>
            <tbody>
              {[...capF].sort((a, b) => a.name.localeCompare(b.name)).map((c) => {
                const pp = porProfissional.get(c.id);
                return (
                  <tr key={c.id} className="border-t border-border">
                    <td className="py-2">{c.name}</td><td>{c.specialty || "—"}</td><td className="text-right">{c.currentPatients}</td><td className="text-right">{capacidadeMax(c)}</td>
                    <td className="text-right">{pp ? pp.realizados : NAO_AVALIADO}</td><td className="text-right">{pp ? pp.faltas : NAO_AVALIADO}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Detalhe>
        <Detalhe id="fila" titulo="Fila de espera por especialidade" resumo={`${filaAtiva.length} ativos · ${filaCongelados} congelados`} aberto={aberto} setAberto={setAberto}>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground uppercase"><tr><th className="text-left py-2">Especialidade</th><th className="text-right">Ativos</th><th className="text-right">Congelados</th></tr></thead>
            <tbody>
              {Array.from(new Set(filaF.map((w) => (w.specialty || "").trim() || "Sem especialidade"))).sort().map((s) => (
                <tr key={s} className="border-t border-border"><td className="py-2">{s}</td>
                  <td className="text-right">{filaAtiva.filter((w) => ((w.specialty || "").trim() || "Sem especialidade") === s).length}</td>
                  <td className="text-right">{filaF.filter((w) => w.paused && ((w.specialty || "").trim() || "Sem especialidade") === s).length}</td></tr>
              ))}
            </tbody>
          </table>
          <Link href="/waiting-list" className="text-xs text-primary font-semibold mt-3 inline-block">Abrir Fila de Espera →</Link>
        </Detalhe>
        <Detalhe id="pausa" titulo="Pausados por motivo" resumo={`${pausedItems?.length ?? 0} pausas ativas`} aberto={aberto} setAberto={setAberto}>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground uppercase"><tr><th className="text-left py-2">Motivo</th><th className="text-right">Fila</th><th className="text-right">Agenda</th></tr></thead>
            <tbody>
              {Array.from(new Set((pausedItems ?? []).map((i) => i.pausedReason || "Sem motivo"))).sort().map((m) => (
                <tr key={m} className="border-t border-border"><td className="py-2">{m}</td>
                  <td className="text-right">{(pausedItems ?? []).filter((i) => i.source === "fila" && (i.pausedReason || "Sem motivo") === m).length}</td>
                  <td className="text-right">{(pausedItems ?? []).filter((i) => i.source === "agenda" && (i.pausedReason || "Sem motivo") === m).length}</td></tr>
              ))}
            </tbody>
          </table>
          <Link href="/pausados" className="text-xs text-primary font-semibold mt-3 inline-block">Abrir Pausados / Busca Ativa →</Link>
        </Detalhe>
      </div>

      <Card className="p-4">
        <button onClick={() => setOrigemAberta(!origemAberta)} className="flex items-center gap-2 text-sm font-semibold w-full text-left">
          <Info className="w-4 h-4 text-primary" /> De onde vem cada número
          <ChevronDown className={cn("w-4 h-4 ml-auto transition-transform", origemAberta && "rotate-180")} />
        </button>
        {origemAberta && (
          <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
            {kpis.map((k) => <li key={k.label}><b className="text-foreground">{k.label}:</b> {k.origem}</li>)}
            <li>"{NAO_AVALIADO}" aparece quando ainda não há dado para calcular (em vez de zero).</li>
          </ul>
        )}
      </Card>
    </div>
  );
}

function Detalhe({ id, titulo, resumo, aberto, setAberto, children }: { id: string; titulo: string; resumo: string; aberto: string | null; setAberto: (v: string | null) => void; children: React.ReactNode }) {
  const open = aberto === id;
  return (
    <Card className="p-0 overflow-hidden">
      <button onClick={() => setAberto(open ? null : id)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40">
        <span className="font-semibold text-sm">{titulo}</span>
        <span className="text-xs text-muted-foreground">{resumo}</span>
        <ChevronDown className={cn("w-4 h-4 ml-auto transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="px-4 pb-4 overflow-x-auto">{children}</div>}
    </Card>
  );
}
