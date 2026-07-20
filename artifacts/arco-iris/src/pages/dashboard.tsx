import { useState, useMemo, useCallback, useEffect } from "react";
import {
  listPatients,
  listProfessionals,
  listAppointmentsToday,
  listAppointments,
  listWaitingList,
  getAppointmentsStats,
  listProfessionalsCapacity,
  listLongAttendancePatients,
  listPausedOverview,
  type Patient,
  type Professional as ArcoProfessional,
  type AppointmentToday,
  type AppointmentListItem,
  type WaitingListEntry,
  type LongAttendancePatient,
  type PausedOverviewItem,
} from "@/lib/arco-rpc";
import { Users, UserRound, ClipboardList, AlertCircle, ListTodo, TrendingUp, CalendarDays, Activity, Briefcase, HeartPulse, CheckCircle2, XCircle, AlertTriangle, Hourglass, Trophy, Star, BarChart3, Snowflake, Clock, ChevronLeft, ChevronRight, HeartHandshake } from "lucide-react";
import { Card, MotionCard, Badge, Button } from "@/components/ui-custom";
import { Link } from "wouter";
import { cn, getStatusColor, calcIdade, formatDate } from "@/lib/utils";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { specialtyTone, specialtyShortLabel } from "@/lib/specialty-colors";
import { upcomingAwareness, dateLabel, CATEGORY_COLOR } from "@/lib/awareness-dates";
import { useVisibleInterval } from "@/hooks/usePageVisible";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { format, startOfMonth, endOfMonth, addMonths, subMonths, startOfWeek, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";

// ── Faixas Etárias ────────────────────────────────────────────────────────────
const FAIXAS = [
  { key: "bebe",      label: "Bebês",           emoji: "🍼", range: "0–2 anos",   min: 0,  max: 2,  cor: "#c084fc" },
  { key: "inf1",      label: "1ª Infância",     emoji: "🧒", range: "3–6 anos",   min: 3,  max: 6,  cor: "#4ade80" },
  { key: "inf2",      label: "2ª Infância",     emoji: "📚", range: "7–10 anos",  min: 7,  max: 10, cor: "#38bdf8" },
  { key: "adol",      label: "Adolescentes",    emoji: "🎓", range: "11–18 anos", min: 11, max: 18, cor: "#fb923c", alerta: true },
  { key: "adulto",    label: "Adultos",         emoji: "🧑‍🦱", range: "18+ anos",   min: 19, max: 999,cor: "#f43f5e" },
  { key: "sem_data",  label: "Sem data nasc.",  emoji: "❓", range: "—",          min: -1, max: -1, cor: "#64748b" },
] as const;

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

type CapacityStatus = "poucos" | "disponivel" | "proximo" | "lotado";

type Ocupacao = {
  id: number; name: string; specialty: string; cargaHoraria: string;
  pacientesAtivos: number; capacidade: number;
  pct: number; status: CapacityStatus;
};

const POLL_MS = 30_000; // 30 s
const TERMINAL_PT_STATUSES = new Set(["alta", "obito", "óbito", "desistencia", "desistência"]);

export default function Dashboard() {
  useDocumentTitle("Dashboard");

  const [patients, setPatients] = useState<Patient[]>([]);
  const [professionals, setProfessionals] = useState<ArcoProfessional[]>([]);
  const [todayAppointments, setTodayAppointments] = useState<AppointmentToday[]>([]);
  const [waitingList, setWaitingList] = useState<WaitingListEntry[]>([]);
  const [aptStats, setAptStats] = useState<Stats | null>(null);
  const [ocupacao, setOcupacao] = useState<Ocupacao[]>([]);
  const [longAttendance, setLongAttendance] = useState<LongAttendancePatient[]>([]);
  const [perfFilter, setPerfFilter] = useState<"mes" | "total">("mes");
  const [histFilter, setHistFilter] = useState<"ano" | "acumulado">("ano");
  const [dashMonth, setDashMonth] = useState<Date>(new Date());
  // Semana selecionada no card "Atendimentos da Semana" (segunda-feira)
  const [multiWeek, setMultiWeek] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [weekAppointments, setWeekAppointments] = useState<AppointmentListItem[]>([]);
  // Atendimentos do ano corrente (01/01 → hoje) — card "por especialidade no ano".
  const [yearAppointments, setYearAppointments] = useState<AppointmentListItem[]>([]);
  const [monthAppointments, setMonthAppointments] = useState<Array<{ patientId: number; patientName: string; professionalId: number; professionalName: string; date: string; time: string; status: string; notes?: string | null }>>([]);
  // Mês corrente (fixo em "hoje"), independente do navegador da Visão Mensal —
  // usado na Performance dos Profissionais (aba "Mês Atual").
  const [currentMonthAppointments, setCurrentMonthAppointments] = useState<Array<{ patientId: number; patientName: string; professionalId: number; professionalName: string; date: string; time: string; status: string; notes?: string | null }>>([]);

  // Leitura completa de agendamentos (carregada uma vez) — usada para o perfil
  // de faixa etária por profissional, que deve refletir a MESMA base da ocupação
  // (pacientes com agendamento ativo/futuro), não a atribuição bruta do cadastro.
  const [allAppointments, setAllAppointments] = useState<AppointmentListItem[]>([]);

  // Faltas por profissional (não geral)
  type AbsenceByProf = { patientId: number; patientName: string; professionalName: string; specialty: string; count: number };
  const [absencesByProf, setAbsencesByProf] = useState<AbsenceByProf[]>([]);

  // Dados "vivos" — atualizados a cada 30s (cards de hoje, fila e presença).
  const fetchLive = useCallback(() => {
    listAppointmentsToday().then(setTodayAppointments).catch(console.error);
    listWaitingList().then(setWaitingList).catch(console.error);
    getAppointmentsStats().then(setAptStats).catch(console.error);
  }, []);

  // Dados que mudam pouco na sessão — carregados UMA vez (sem polling de 30s):
  // pacientes, profissionais, longa permanência e os alertas de faltas.
  useEffect(() => {
    listPatients().then(setPatients).catch(console.error);
    listLongAttendancePatients(12).then(setLongAttendance).catch(() => setLongAttendance([]));

    // Profissionais + agendamentos em paralelo, uma única vez.
    // Em vez de puxar a tabela inteira de agendamentos (dezenas de milhares de
    // linhas, incluindo recorrências futuras até anos à frente — o que deixava o
    // Dashboard lento), buscamos só janelas relevantes:
    //  - passado (faltas só acontecem em datas já passadas)
    //  - futuro próximo (pacientes ativos para o perfil de faixa etária)
    const hoje = new Date();
    const histFrom = format(subMonths(hoje, 12), "yyyy-MM-dd");
    const hojeStr = format(hoje, "yyyy-MM-dd");
    const futTo = format(addMonths(hoje, 6), "yyyy-MM-dd");
    Promise.allSettled([
      listProfessionals(),
      listAppointments({ dateFrom: histFrom, dateTo: hojeStr }),
      listAppointments({ dateFrom: hojeStr, dateTo: futTo }),
    ]).then(([pr, pastRes, futRes]) => {
      const profs = pr.status === "fulfilled" ? pr.value : [];
      setProfessionals(profs);
      const pastApts = pastRes.status === "fulfilled" ? pastRes.value : [];
      const futApts = futRes.status === "fulfilled" ? futRes.value : [];
      if (pastRes.status !== "fulfilled" && futRes.status !== "fulfilled") {
        setAbsencesByProf([]); setAllAppointments([]); return;
      }
      setAllAppointments([...pastApts, ...futApts]);
      // Faltas POR PROFISSIONAL — só alerta quando >= 3 com o MESMO profissional
      const ABSENCE = ["ausente", "falta_nao_justificada"];
      const specMap = new Map(profs.map(p => [p.name, p.specialty || "—"]));
      const map = new Map<string, { patientId: number; patientName: string; professionalName: string; count: number }>();
      for (const a of pastApts) {
        const st = (a.status || "").toLowerCase();
        if (!ABSENCE.includes(st)) continue;
        const k = `${a.patientId}|${a.professionalId}`;
        const entry = map.get(k) || { patientId: a.patientId, patientName: a.patientName, professionalName: a.professionalName, count: 0 };
        entry.count++;
        map.set(k, entry);
      }
      const alerts: AbsenceByProf[] = [];
      for (const v of map.values()) {
        if (v.count >= 3) alerts.push({ ...v, specialty: specMap.get(v.professionalName) || "—" });
      }
      setAbsencesByProf(alerts);
    });
  }, []);

  // ── Fetch appointments do mês selecionado (com dateFrom/dateTo para trazer TODOS) ──
  useEffect(() => {
    const mFrom = format(startOfMonth(dashMonth), "yyyy-MM-dd");
    const mTo = format(endOfMonth(dashMonth), "yyyy-MM-dd");
    listAppointments({ dateFrom: mFrom, dateTo: mTo })
      .then(apts => setMonthAppointments(apts))
      .catch(() => setMonthAppointments([]));
  }, [dashMonth]);

  // ── Fetch appointments da semana selecionada (card Multi/Total semanal) ──
  useEffect(() => {
    const wFrom = format(multiWeek, "yyyy-MM-dd");
    const wTo = format(addDays(multiWeek, 4), "yyyy-MM-dd"); // Seg–Sex
    listAppointments({ dateFrom: wFrom, dateTo: wTo })
      .then(apts => setWeekAppointments(apts))
      .catch(() => setWeekAppointments([]));
  }, [multiWeek]);

  // ── Fetch appointments do ano corrente (01/01 → hoje) ──
  useEffect(() => {
    const now = new Date();
    const yFrom = `${now.getFullYear()}-01-01`;
    const yTo = format(now, "yyyy-MM-dd");
    listAppointments({ dateFrom: yFrom, dateTo: yTo })
      .then(apts => setYearAppointments(apts))
      .catch(() => setYearAppointments([]));
  }, []);

  // ── Fetch appointments do mês corrente (fixo em hoje) ──
  // Só busca quando a Visão Mensal está navegada para outro mês; quando está no
  // mês atual (padrão), reusamos monthAppointments para evitar query duplicada.
  useEffect(() => {
    const now = new Date();
    const sameMonth = format(dashMonth, "yyyy-MM") === format(now, "yyyy-MM");
    if (sameMonth) { setCurrentMonthAppointments([]); return; }
    const mFrom = format(startOfMonth(now), "yyyy-MM-dd");
    const mTo = format(endOfMonth(now), "yyyy-MM-dd");
    listAppointments({ dateFrom: mFrom, dateTo: mTo })
      .then(apts => setCurrentMonthAppointments(apts))
      .catch(() => setCurrentMonthAppointments([]));
  }, [dashMonth]);

  const fetchOcupacao = useCallback(() => {
    listProfessionalsCapacity()
      .then((rows) => {
        const mapped: Ocupacao[] = rows.map((r) => {
          const max = r.maxPatients || (r.cargaHoraria.startsWith("20") ? 25 : 35);
          const cur = r.currentPatients;
          const pct = max > 0 ? Math.round((cur / max) * 100) : 0;
          let status: CapacityStatus = "poucos";
          if (pct >= 100) status = "lotado";
          else if (pct >= 86) status = "proximo";
          else if (pct >= 60) status = "disponivel";
          return {
            id: r.id,
            name: r.name,
            specialty: r.specialty || "",
            cargaHoraria: r.cargaHoraria,
            pacientesAtivos: cur,
            capacidade: max,
            pct,
            status,
          };
        });
        setOcupacao(mapped);
      })
      .catch(() => setOcupacao([]));
  }, []);

  // Visibility-aware: pausa polling quando a aba está oculta
  useVisibleInterval(fetchLive, POLL_MS);
  useVisibleInterval(fetchOcupacao, POLL_MS);

  const totalPatients = patients?.length || 0;
  const totalProfessionals = professionals?.length || 0;

  // Pacientes ATIVOS em atendimento (naquele momento): distintos com agendamento
  // ativo/futuro. Difere do total de CADASTROS (todos já cadastrados na base).
  const activePatients = useMemo(() => {
    const hojeStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const ACTIVE = new Set(["agendado", "atendimento", "em_atendimento", "em atendimento", "presente", "remanejado", "remarcado"]);
    const ids = new Set<number>();
    for (const a of allAppointments) {
      if ((a.date || "") < hojeStr) continue;
      if (!ACTIVE.has((a.status || "").toLowerCase())) continue;
      ids.add(a.patientId);
    }
    return ids.size;
  }, [allAppointments]);
  const todayCount = (todayAppointments || []).filter(a => {
    const st = (a.status || "agendado").toLowerCase();
    return st !== "desmarcado" && st !== "cancelado";
  }).length;
  const waitingCount = waitingList?.length || 0;

  // Agrupar alertas por paciente (pode ter múltiplos profissionais com >= 3 faltas)
  const absentByPatient = useMemo(() => {
    const grouped = new Map<number, { patientId: number; patientName: string; profs: Array<{ professionalName: string; specialty: string; count: number }> }>();
    for (const a of absencesByProf) {
      const entry = grouped.get(a.patientId) || { patientId: a.patientId, patientName: a.patientName, profs: [] };
      entry.profs.push({ professionalName: a.professionalName, specialty: a.specialty, count: a.count });
      grouped.set(a.patientId, entry);
    }
    return Array.from(grouped.values());
  }, [absencesByProf]);

  // ── Navegação Mensal ─────────────────────────────────────────────────────
  const dashMonthLabel = format(dashMonth, "MMMM yyyy", { locale: ptBR });
  const isCurrentMonth = format(dashMonth, "yyyy-MM") === format(new Date(), "yyyy-MM");

  const monthlyStats = useMemo(() => {
    // Só conta atendimentos que REALMENTE aconteceram ou foram registrados —
    // NÃO inclui "agendado" (futuro/pendente), "remanejado", "remarcado", "pausado"
    // que são status transitórios e inflam a contagem.
    const REALIZADOS_ST = ["atendimento", "em_atendimento", "em atendimento", "presente", "alta"];
    const FALTAS_ST = ["ausente", "falta_justificada", "falta_nao_justificada"];
    const CANCELADOS_ST = ["cancelado", "desmarcado"];

    // Deduplica: mesmo paciente+data+hora conta uma vez (evita dupla do Multi)
    const seen = new Set<string>();
    const unique = monthAppointments.filter(a => {
      const key = `${a.patientId}-${a.date}-${a.time}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Realizados/faltas só contam até hoje — agendamentos futuros (recorrências do mês)
    // não devem inflar a contagem de já realizados (mesma regra da RPC, migração 0040).
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const upToToday = unique.filter(a => (a.date || "") <= todayStr);

    const realizados = upToToday.filter(a => REALIZADOS_ST.includes((a.status || "").toLowerCase())).length;
    const faltas = upToToday.filter(a => FALTAS_ST.includes((a.status || "").toLowerCase())).length;
    const cancelados = upToToday.filter(a => CANCELADOS_ST.includes((a.status || "").toLowerCase())).length;
    // "Agendados" conta por PACIENTE (criança), não por dia/ocorrência: um mesmo
    // paciente com recorrência semanal aparece várias vezes no mês, mas deve
    // contar 1. Deduplica pelo paciente.
    const agendados = new Set(
      unique
        .filter(a => (a.status || "").toLowerCase() === "agendado")
        .map(a => a.patientId)
    ).size;

    return { total: realizados + faltas, realizados, faltas, cancelados, agendados };
  }, [monthAppointments]);

  // ── Relatório semanal por profissional (Total + Multi) ────────────────────
  const weeklyReport = useMemo(() => {
    const byProf = new Map<number, { name: string; total: number; multi: number }>();
    for (const a of weekAppointments) {
      if (TERMINAL_PT_STATUSES.has((a.patientStatus || "").toLowerCase())) continue;
      const entry = byProf.get(a.professionalId) || { name: a.professionalName, total: 0, multi: 0 };
      entry.total++;
      const notes = (a.notes || "").toLowerCase();
      if (notes.startsWith("atendimento multi com")) entry.multi++;
      byProf.set(a.professionalId, entry);
    }
    return Array.from(byProf.values()).sort((a, b) => b.total - a.total);
  }, [weekAppointments]);
  const multiWeekLabel = `${format(multiWeek, "dd/MM")} – ${format(addDays(multiWeek, 4), "dd/MM")}`;
  const isCurrentWeek = format(multiWeek, "yyyy-MM-dd") === format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");

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
      if (st !== "cancelado" && st !== "desmarcado") {
        const k = (a.professionalSpecialty || "—").trim() || "—";
        porEspecialidade[k] = (porEspecialidade[k] || 0) + 1;
      }
    }
    const fechados = realizado + falta;
    const taxaPresenca = fechados > 0 ? Math.round((realizado / fechados) * 100) : null;
    return { realizado, falta, pendente, cancelado, taxaPresenca, porEspecialidade };
  }, [todayAppointments]);

  // ── Atendimentos por especialidade no ano (01/01 → hoje) ─────────────────
  // Conta sessões realizadas de fato (atendimento/presente/alta); a especialidade
  // vem do profissional do agendamento. Dedup por prof+paciente+data+hora.
  const atendimentosAno = useMemo(() => {
    const REALIZADOS_ST = ["atendimento", "em_atendimento", "em atendimento", "presente", "alta"];
    const specById = new Map<number, string>();
    for (const p of professionals || []) specById.set(p.id, (p.specialty || "").trim());
    const porEspecialidade: Record<string, number> = {};
    let total = 0;
    const seen = new Set<string>();
    for (const a of yearAppointments || []) {
      if (!REALIZADOS_ST.includes((a.status || "").toLowerCase())) continue;
      const key = `${a.professionalId}-${a.patientId}-${a.date}-${a.time}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const k = specById.get(a.professionalId) || "—";
      const kk = k || "—";
      porEspecialidade[kk] = (porEspecialidade[kk] || 0) + 1;
      total++;
    }
    return { porEspecialidade, total };
  }, [yearAppointments, professionals]);

  // ── Status da fila (cor por prioridade clínica) ──────────────────────────
  const filaPorCor = useMemo(() => {
    const buckets = { maxima: 0, vermelho: 0, laranja: 0, azul: 0, verde: 0, sem: 0 };
    for (const w of waitingList || []) {
      const p = (w.priority || "").toLowerCase();
      if (p === "maxima" || p === "máxima") buckets.maxima++;
      else if (p === "elevado" || p === "alto") buckets.vermelho++;
      else if (p === "moderado") buckets.laranja++;
      else if (p === "leve") buckets.azul++;
      else if (p === "baixo") buckets.verde++;
      else buckets.sem++;
    }
    return buckets;
  }, [waitingList]);

  // ── Fila por especialidade (contagem por área) ───────────────────────────
  const filaPorEspecialidade = useMemo(() => {
    const map: Record<string, number> = {};
    for (const w of waitingList || []) {
      const k = (w.specialty || "").trim() || "Sem especialidade";
      map[k] = (map[k] || 0) + 1;
    }
    return map;
  }, [waitingList]);

  const presencaDonut = [
    { name: "Realizados", value: heartbeat.realizado, fill: "#34d399" },
    { name: "Faltas", value: heartbeat.falta, fill: "#f87171" },
  ];

  // ── Performance dos Profissionais ─────────────────────────────────────────
  const performanceData = useMemo(() => {
    const now = new Date();
    const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const profMap: Record<number, { name: string; specialty: string; altas: number; atendimentos: number }> = {};
    for (const prof of professionals || []) {
      profMap[prof.id] = { name: prof.name, specialty: prof.specialty || "", altas: 0, atendimentos: 0 };
    }

    for (const p of patients || []) {
      if (!p.professionalId || !profMap[p.professionalId]) continue;
      const isAlta = (p.status || "").toLowerCase() === "alta";
      if (isAlta) {
        if (perfFilter === "total") {
          profMap[p.professionalId].altas++;
        } else {
          const updStr = p.updatedAt || p.createdAt || "";
          if (updStr.slice(0, 7) === mesAtual) {
            profMap[p.professionalId].altas++;
          }
        }
      }
    }

    if (perfFilter === "total") {
      // Total geral: caseload atual em atendimento por profissional.
      for (const p of patients || []) {
        if (!p.professionalId || !profMap[p.professionalId]) continue;
        const st = (p.status || "").toLowerCase();
        if (st === "atendimento" || st === "em atendimento") {
          profMap[p.professionalId].atendimentos++;
        }
      }
    } else {
      // Mês atual: atendimentos REALIZADOS no mês, contando só até hoje
      // (recorrências futuras não entram). Dedup por prof+paciente+data+hora.
      const REALIZADOS_ST = ["atendimento", "em_atendimento", "em atendimento", "presente", "alta"];
      const todayStr = format(new Date(), "yyyy-MM-dd");
      // No mês atual reusa monthAppointments; se navegado, usa o dataset dedicado.
      const perfApts = isCurrentMonth ? monthAppointments : currentMonthAppointments;
      const seenAtend = new Set<string>();
      for (const a of perfApts || []) {
        const profId = a.professionalId;
        if (!profId || !profMap[profId]) continue;
        if ((a.date || "") > todayStr) continue;
        if (!REALIZADOS_ST.includes((a.status || "").toLowerCase())) continue;
        const key = `${profId}-${a.patientId}-${a.date}-${a.time}`;
        if (seenAtend.has(key)) continue;
        seenAtend.add(key);
        profMap[profId].atendimentos++;
      }
    }

    const arr = Object.entries(profMap).map(([id, d]) => ({
      id: Number(id),
      name: d.name.split(" ")[0],
      fullName: d.name,
      specialty: d.specialty,
      altas: d.altas,
      atendimentos: perfFilter === "total" ? d.atendimentos : d.atendimentos,
    }));

    const byAltas = [...arr].sort((a, b) => b.altas - a.altas).filter(x => x.altas > 0);
    const byAtend = [...arr].sort((a, b) => b.atendimentos - a.atendimentos).filter(x => x.atendimentos > 0);

    return { byAltas, byAtend, chartData: arr.filter(x => x.altas > 0 || x.atendimentos > 0).sort((a, b) => (b.altas + b.atendimentos) - (a.altas + a.atendimentos)).slice(0, 10) };
  }, [patients, professionals, isCurrentMonth, monthAppointments, currentMonthAppointments, perfFilter]);

  // ── Perfil de pacientes por profissional ──────────────────────────────────
  // Reflete a MESMA base da ocupação (list_professionals_capacity): pacientes
  // DISTINTOS com agendamento ATIVO e FUTURO (date >= hoje, status agendado/
  // atendimento/presente) por profissional — não a atribuição bruta do cadastro.
  // Assim, ao apagar os agendamentos, o perfil zera junto com a ocupação.
  const profPerfil = useMemo(() => {
    const perfil: Record<number, Record<string, number>> = {};
    const patById = new Map((patients || []).map(p => [p.id, p]));
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const ACTIVE = ["agendado", "atendimento", "presente"];
    const seen = new Set<string>();
    for (const a of allAppointments || []) {
      const profId = a.professionalId;
      if (!profId) continue;
      if ((a.date || "") < todayStr) continue;
      if (!ACTIVE.includes((a.status || "").toLowerCase())) continue;
      const key = `${profId}-${a.patientId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!perfil[profId]) { for (const f of FAIXAS) perfil[profId] = { ...(perfil[profId] || {}), [f.key]: 0 }; }
      const faixa = faixaDeIdade(patById.get(a.patientId)?.dateOfBirth);
      perfil[profId][faixa] = (perfil[profId][faixa] || 0) + 1;
    }
    return perfil;
  }, [allAppointments, patients]);

  // Considera triado quem tem QUALQUER score por especialidade definido,
  // nao apenas o triagem_score agregado (que pode estar null em pacientes
  // antigos cadastrados antes da migracao de score sincrono).
  const SPECIALTY_KEYS: ReadonlyArray<keyof Patient> = [
    "scorePsicologia", "scorePsicomotricidade", "scoreFisioterapia",
    "scorePsicopedagogia", "scoreEdFisica", "scoreFonoaudiologia",
    "scoreTO", "scoreNutricionista",
  ];
  const triadPatients = (patients || []).filter(p =>
    p.triagemScore != null || SPECIALTY_KEYS.some(k => (p[k] as number | null) != null)
  );
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
  ].map(d => ({ ...d, pct: Math.round((d.score / 45) * 100) }));

  // Historical count by year — prefer entryDate, fallback to createdAt
  const byYear: Record<number, number> = {};
  for (const p of patients || []) {
    const dateStr = p.entryDate || p.createdAt;
    const yr = new Date(dateStr).getFullYear();
    byYear[yr] = (byYear[yr] || 0) + 1;
  }
  const anos = [2023, 2024, 2025, 2026];

  const topCards = [
    { title: "Total de Cadastros", subtitle: "todos os pacientes na base", value: totalPatients, icon: Users, color: "text-[#a855f7]", bg: "bg-[#a855f7]/10" },
    { title: "Em Atendimento", subtitle: "pacientes com agendamento ativo", value: activePatients, icon: HeartPulse, color: "text-[#00d4ff]", bg: "bg-[#00d4ff]/10" },
    { title: "Fila de Espera", subtitle: "aguardando vaga", value: waitingCount, icon: ListTodo, color: "text-[#ff9f20]", bg: "bg-[#ff9f20]/10" },
    { title: "Profissionais", subtitle: "equipe ativa", value: totalProfessionals, icon: UserRound, color: "text-primary", bg: "bg-primary/10" },
  ];

  const periodCards = [
    { label: "Esta semana", value: aptStats?.semanal ?? "—" },
    { label: "Este mês", value: aptStats?.mensal ?? "—" },
    { label: "Trimestre", value: aptStats?.trimestral ?? "—" },
    { label: "Semestre", value: aptStats?.semestral ?? "—" },
    { label: "Este ano", value: aptStats?.anual ?? "—" },
  ];

  const awarenessTodayISO = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const awarenessUpcoming = upcomingAwareness(awarenessTodayISO, 3);

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
        porEspecialidadeAno={atendimentosAno.porEspecialidade}
        totalAno={atendimentosAno.total}
        filaPorCor={filaPorCor}
        filaPorEspecialidade={filaPorEspecialidade}
        waitingCount={waitingCount}
      />

      {/* Top Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {topCards.map((stat, i) => (
          <MotionCard key={i} className="p-6 relative overflow-hidden" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-muted-foreground mb-1">{stat.title}</p>
                <p className="text-3xl font-bold font-display">{stat.value}</p>
                {stat.subtitle && <p className="text-[11px] text-muted-foreground/70 mt-1">{stat.subtitle}</p>}
              </div>
              <div className={cn("p-4 rounded-2xl", stat.bg)}>
                <stat.icon className={cn("w-6 h-6", stat.color)} />
              </div>
            </div>
            <div className={cn("absolute -bottom-4 -right-4 w-24 h-24 rounded-full blur-2xl opacity-20", stat.bg)} />
          </MotionCard>
        ))}
      </div>

      {/* Datas de conscientização — lembrete das próximas */}
      <Link href="/datas-conscientizacao">
        <MotionCard className="p-5 cursor-pointer">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-foreground flex items-center gap-2">
              <HeartHandshake className="w-5 h-5 text-primary" />
              Datas de Conscientização
            </h3>
            <span className="text-xs text-primary font-semibold">Ver calendário →</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {awarenessUpcoming.map(({ date, when, daysUntil }, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 rounded-xl border border-border p-3"
                style={daysUntil === 0 ? { borderColor: "rgba(168,85,247,0.5)", background: "rgba(168,85,247,0.06)" } : undefined}
              >
                <div className="rounded-lg px-2 py-1 text-white text-[11px] font-bold shrink-0" style={{ background: CATEGORY_COLOR[date.category] }}>
                  {dateLabel(date)}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-foreground text-xs leading-tight truncate" title={date.title}>{date.title}</div>
                  <div className="text-[11px] text-muted-foreground">{when}</div>
                </div>
              </div>
            ))}
          </div>
        </MotionCard>
      </Link>

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

      {/* Navegação Mensal */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold font-display">Visão Mensal</h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDashMonth(prev => subMonths(prev, 1))}
              className="p-1.5 rounded-lg hover:bg-secondary/60 transition-colors"
              title="Mês anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm font-bold capitalize min-w-[120px] text-center">{dashMonthLabel}</span>
            <button
              onClick={() => setDashMonth(prev => addMonths(prev, 1))}
              className="p-1.5 rounded-lg hover:bg-secondary/60 transition-colors"
              title="Próximo mês"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            {!isCurrentMonth && (
              <button
                onClick={() => setDashMonth(new Date())}
                className="text-xs text-primary hover:underline ml-2"
              >
                Hoje
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-secondary/30 rounded-2xl p-4 text-center border border-border/50">
            <p className="text-2xl font-bold font-display text-foreground">{monthlyStats.total}</p>
            <p className="text-xs font-semibold text-muted-foreground mt-1">Total</p>
          </div>
          <div className="bg-emerald-500/10 rounded-2xl p-4 text-center border border-emerald-500/20">
            <p className="text-2xl font-bold font-display text-emerald-400">{monthlyStats.realizados}</p>
            <p className="text-xs font-semibold text-muted-foreground mt-1">Realizados</p>
          </div>
          <div className="bg-red-500/10 rounded-2xl p-4 text-center border border-red-500/20">
            <p className="text-2xl font-bold font-display text-red-400">{monthlyStats.faltas}</p>
            <p className="text-xs font-semibold text-muted-foreground mt-1">Faltas</p>
          </div>
          <div className="bg-amber-500/10 rounded-2xl p-4 text-center border border-amber-500/20">
            <p className="text-2xl font-bold font-display text-amber-400">{monthlyStats.agendados}</p>
            <p className="text-xs font-semibold text-muted-foreground mt-1">Agendados</p>
          </div>
        </div>
      </Card>

      {/* Relatório Semanal (Total + Multi) */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-bold font-display">Atendimentos da Semana</h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMultiWeek(prev => addDays(prev, -7))}
              className="p-1.5 rounded-lg hover:bg-secondary/60 transition-colors"
              title="Semana anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm font-bold min-w-[110px] text-center">{multiWeekLabel}</span>
            <button
              onClick={() => setMultiWeek(prev => addDays(prev, 7))}
              className="p-1.5 rounded-lg hover:bg-secondary/60 transition-colors"
              title="Próxima semana"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            {!isCurrentWeek && (
              <button
                onClick={() => setMultiWeek(startOfWeek(new Date(), { weekStartsOn: 1 }))}
                className="text-xs text-primary hover:underline ml-2"
              >
                Hoje
              </button>
            )}
          </div>
        </div>
        {weeklyReport.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Users className="w-10 h-10 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum atendimento nesta semana.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-3 py-1 text-xs font-bold uppercase text-muted-foreground">
              <span>Profissional</span>
              <span className="text-right w-16">Total</span>
              <span className="text-right w-16">Multi</span>
            </div>
            {weeklyReport.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-4 px-3 py-2.5 rounded-lg bg-cyan-500/5 border border-cyan-500/10">
                <span className="text-sm font-semibold text-foreground">{r.name}</span>
                <span className="text-sm font-bold text-foreground text-right w-16">{r.total}</span>
                <span className="text-sm font-bold text-cyan-400 text-right w-16">{r.multi}</span>
              </div>
            ))}
            <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-3 py-2 border-t border-border mt-2 pt-3">
              <span className="text-sm font-bold text-muted-foreground">Totais</span>
              <span className="text-lg font-bold text-foreground text-right w-16">{weeklyReport.reduce((s, r) => s + r.total, 0)}</span>
              <span className="text-lg font-bold text-cyan-400 text-right w-16">{weeklyReport.reduce((s, r) => s + r.multi, 0)}</span>
            </div>
          </div>
        )}
      </Card>

      {/* Perfil Multidisciplinar – Teia de Aranha */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold font-display">Perfil Multidisciplinar</h2>
          <span className="ml-auto text-xs text-muted-foreground font-semibold">Média dos {triadPatients.length} pacientes triados</span>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Média do score por área terapêutica (% do máximo 45 pts por área)</p>
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
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9, fill: "rgba(150,180,220,0.6)" }} tickCount={4} />
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
                  <span className="w-12 text-right text-xs font-bold text-foreground">{d.score}/45</span>
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

      {/* Histórico de Crescimento + Performance dos Profissionais */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Histórico por ano */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-bold font-display">Histórico de Pacientes</h2>
            </div>
            <div className="flex gap-1">
              <button onClick={() => setHistFilter("ano")} className={cn("px-2 py-1 rounded-lg text-[10px] font-bold uppercase transition-all", histFilter === "ano" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground")}>
                Por Ano
              </button>
              <button onClick={() => setHistFilter("acumulado")} className={cn("px-2 py-1 rounded-lg text-[10px] font-bold uppercase transition-all", histFilter === "acumulado" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground")}>
                Acumulado
              </button>
            </div>
          </div>
          <div className="space-y-3">
            {histFilter === "ano" ? (
              <>
                {anos.map(ano => (
                  <div key={ano} className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-border/50">
                    <span className="font-semibold text-foreground">{ano}</span>
                    <span className="font-bold text-lg text-primary">{byYear[ano] || 0}</span>
                  </div>
                ))}
              </>
            ) : (
              <>
                {anos.map((ano, i) => {
                  const acum = anos.slice(0, i + 1).reduce((s, a) => s + (byYear[a] || 0), 0);
                  return (
                    <div key={ano} className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-border/50">
                      <span className="font-semibold text-foreground">Até {ano}</span>
                      <span className="font-bold text-lg text-primary">{acum}</span>
                    </div>
                  );
                })}
              </>
            )}
            <div className="flex items-center justify-between p-3 rounded-xl bg-primary/10 border border-primary/20 mt-2">
              <span className="font-bold text-foreground">Total geral</span>
              <span className="font-bold text-xl text-primary">{totalPatients}</span>
            </div>
          </div>
        </Card>

        {/* Performance dos Profissionais */}
        <Card className="lg:col-span-2 p-6 flex flex-col border-[rgba(168,85,247,0.25)] shadow-[0_0_28px_rgba(168,85,247,0.08)]">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <h2 className="text-xl font-bold font-display flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" style={{ filter: "drop-shadow(0 0 6px rgba(251,191,36,0.7))" }} />
              Performance dos Profissionais
            </h2>
            <div className="flex gap-1">
              <button onClick={() => setPerfFilter("mes")} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all", perfFilter === "mes" ? "bg-amber-500/20 text-amber-400 border border-amber-400/40" : "text-muted-foreground hover:text-foreground border border-transparent")}>
                Mês Atual
              </button>
              <button onClick={() => setPerfFilter("total")} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all", perfFilter === "total" ? "bg-amber-500/20 text-amber-400 border border-amber-400/40" : "text-muted-foreground hover:text-foreground border border-transparent")}>
                Total Geral
              </button>
            </div>
          </div>

          {performanceData.chartData.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 py-12 text-center">
              <Trophy className="w-10 h-10 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum dado de performance disponível{perfFilter === "mes" ? " este mês" : ""}.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-6 flex-1">
              {/* Gráfico de barras */}
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={performanceData.chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "rgba(210,230,255,0.7)" }} />
                    <YAxis tick={{ fontSize: 10, fill: "rgba(150,180,220,0.6)" }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "hsl(222 50% 8%)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: 12, color: "#e0f0ff", boxShadow: "0 0 20px rgba(168,85,247,0.1)" }} />
                    <Bar dataKey="altas" name="Altas" fill="#a855f7" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="atendimentos" name="Atendimentos" fill="#22d3ee" radius={[6, 6, 0, 0]} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "rgba(210,230,255,0.7)" }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Rankings lado a lado */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Ranking Altas */}
                <div>
                  <p className="text-xs font-bold uppercase text-purple-400 mb-2 flex items-center gap-1"><Star className="w-3 h-3" /> Quem mais dá Alta</p>
                  <div className="space-y-1.5">
                    {performanceData.byAltas.slice(0, 5).map((p, i) => (
                      <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: i === 0 ? "rgba(168,85,247,0.12)" : "rgba(168,85,247,0.04)", border: `1px solid ${i === 0 ? "rgba(168,85,247,0.4)" : "rgba(168,85,247,0.1)"}` }}>
                        <span className="text-sm font-bold w-5" style={{ color: i === 0 ? "#fbbf24" : i === 1 ? "#94a3b8" : i === 2 ? "#d97706" : "#64748b" }}>
                          {i === 0 ? "\ud83e\udd47" : i === 1 ? "\ud83e\udd48" : i === 2 ? "\ud83e\udd49" : `${i + 1}`}
                        </span>
                        <span className="text-xs font-semibold text-foreground flex-1 truncate">{p.fullName}</span>
                        <span className="text-sm font-bold text-purple-400">{p.altas}</span>
                      </div>
                    ))}
                    {performanceData.byAltas.length === 0 && <p className="text-xs text-muted-foreground italic px-3">Nenhuma alta registrada</p>}
                  </div>
                </div>
                {/* Ranking Atendimentos */}
                <div>
                  <p className="text-xs font-bold uppercase text-cyan-400 mb-2 flex items-center gap-1"><BarChart3 className="w-3 h-3" /> Quem mais atende</p>
                  <div className="space-y-1.5">
                    {performanceData.byAtend.slice(0, 5).map((p, i) => (
                      <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: i === 0 ? "rgba(34,211,238,0.12)" : "rgba(34,211,238,0.04)", border: `1px solid ${i === 0 ? "rgba(34,211,238,0.4)" : "rgba(34,211,238,0.1)"}` }}>
                        <span className="text-sm font-bold w-5" style={{ color: i === 0 ? "#fbbf24" : i === 1 ? "#94a3b8" : i === 2 ? "#d97706" : "#64748b" }}>
                          {i === 0 ? "\ud83e\udd47" : i === 1 ? "\ud83e\udd48" : i === 2 ? "\ud83e\udd49" : `${i + 1}`}
                        </span>
                        <span className="text-xs font-semibold text-foreground flex-1 truncate">{p.fullName}</span>
                        <span className="text-sm font-bold text-cyan-400">{p.atendimentos}</span>
                      </div>
                    ))}
                    {performanceData.byAtend.length === 0 && <p className="text-xs text-muted-foreground italic px-3">Nenhum atendimento registrado</p>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Status da Equipe — Capacidade dos profissionais */}
      {ocupacao.length > 0 && (() => {
        const STATUS_META: Record<CapacityStatus, { label: string; color: string; bg: string; border: string; icon: string }> = {
          poucos:     { label: "Precisa de mais pacientes", color: "#00f0ff", bg: "rgba(0,240,255,0.06)",  border: "rgba(0,240,255,0.30)",  icon: "⚠️" },
          disponivel: { label: "Disponível",                 color: "#34d399", bg: "rgba(52,211,153,0.06)", border: "rgba(52,211,153,0.30)", icon: "✅" },
          proximo:    { label: "Próximo do limite",           color: "#f97316", bg: "rgba(249,115,22,0.07)", border: "rgba(249,115,22,0.35)", icon: "⚡" },
          lotado:     { label: "Lotado",                     color: "#ef4444", bg: "rgba(239,68,68,0.07)",  border: "rgba(239,68,68,0.35)",  icon: "🔴" },
        };
        const algumPoucos = ocupacao.some(o => o.status === "poucos");
        return (
          <Card className={cn("p-6", algumPoucos ? "border-[rgba(0,240,255,0.30)] shadow-[0_0_24px_rgba(0,240,255,0.08)]" : "")}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold font-display flex items-center gap-2"
                style={algumPoucos ? { color: "#00f0ff", textShadow: "0 0 12px rgba(0,240,255,0.4)" } : {}}>
                <Briefcase className="w-5 h-5" />
                Status da Equipe
              </h2>
              <span className="text-xs text-muted-foreground font-semibold">20h → 25 pacientes · 30h → 35 pacientes</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {ocupacao.map(o => {
                const meta = STATUS_META[o.status];
                return (
                  <div key={o.id}
                    className="p-4 rounded-xl flex flex-col gap-3 transition-all"
                    style={{ background: meta.bg, border: `1px solid ${meta.border}` }}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-sm text-foreground">{o.name}</p>
                        <p className="text-xs text-muted-foreground">{o.specialty || "—"} · {o.cargaHoraria}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold font-display" style={{ color: meta.color }}>{o.pacientesAtivos}<span className="text-sm text-muted-foreground">/{o.capacidade}</span></p>
                        <p className="text-[10px] text-muted-foreground">Ocupação: {o.pct}%</p>
                      </div>
                    </div>
                    {/* Barra de progresso */}
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{
                        width: `${Math.min(100, o.pct)}%`,
                        background: `linear-gradient(90deg, ${meta.color}99, ${meta.color})`,
                        boxShadow: `0 0 8px ${meta.color}66`,
                      }} />
                    </div>
                    <p className="text-xs font-bold" style={{ color: meta.color }}>
                      {meta.icon} {meta.label}
                    </p>
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
        );
      })()}

      {/* Atencao: Revisao de Casos (Permanencia > 1 ano) */}
      {longAttendance.length > 0 && (
        <Card className="p-6 border-[rgba(255,159,32,0.35)] shadow-[0_0_24px_rgba(255,159,32,0.08)]">
          <h2 className="text-xl font-bold font-display flex items-center gap-2 text-[#ff9f20] mb-2" style={{ textShadow: "0 0 12px rgba(255,159,32,0.5)" }}>
            <Hourglass className="w-5 h-5" />
            Atenção: Revisão de Casos
            <span className="ml-2 text-xs font-semibold text-muted-foreground">Permanência &gt; 1 ano</span>
            <Badge className="ml-auto bg-[rgba(255,159,32,0.15)] text-[#ff9f20] border border-[rgba(255,159,32,0.4)]">
              {longAttendance.length}
            </Badge>
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            Pacientes em atendimento há 12+ meses. Considere revisar prontuário, plano terapêutico ou alta.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {longAttendance.map((p) => (
              <div key={p.id} className="p-4 rounded-xl bg-[rgba(255,159,32,0.06)] border border-[rgba(255,159,32,0.2)] flex flex-col gap-2">
                <div className="flex justify-between items-start gap-2">
                  <p className="font-semibold text-foreground">{p.name}</p>
                  <Badge className="shrink-0 bg-[rgba(255,159,32,0.18)] text-[#ff9f20] border border-[rgba(255,159,32,0.45)]">
                    {p.yearsLabel}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground/80">Profissional: </span>
                  {p.professionalName ?? "—"}
                  {p.professionalSpecialty ? <span className="opacity-70"> · {p.professionalSpecialty}</span> : null}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Início: {p.firstAttendanceDate ? new Date(p.firstAttendanceDate + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                </p>
                <Link href={`/patients/${p.id}`}>
                  <Button variant="outline" className="w-full text-xs h-8 mt-1 border-[rgba(255,159,32,0.4)] text-[#ff9f20] hover:bg-[rgba(255,159,32,0.08)] hover:shadow-[0_0_14px_rgba(255,159,32,0.35)]">
                    Ver Ficha
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Pacientes Pausados — Fila + Agenda */}
      <PausedOverviewWidget />

      {/* Alertas de Faltas — por profissional */}
      {absentByPatient.length > 0 && (
        <Card className="p-6 border-[rgba(255,30,90,0.3)] shadow-[0_0_24px_rgba(255,30,90,0.08)]">
          <h2 className="text-xl font-bold font-display flex items-center gap-2 text-[#ff2060] mb-6" style={{ textShadow: "0 0 12px rgba(255,30,90,0.5)" }}>
            <AlertCircle className="w-5 h-5" />
            Atenção: Pacientes com Faltas
          </h2>
          <p className="text-xs text-muted-foreground mb-4">Alerta quando o paciente atinge 3+ faltas com o <strong>mesmo profissional</strong>.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {absentByPatient.map(p => (
              <div key={p.patientId} className="p-4 rounded-xl bg-[rgba(255,30,90,0.06)] border border-[rgba(255,30,90,0.2)] flex flex-col gap-2">
                <p className="font-semibold text-foreground">{p.patientName}</p>
                {p.profs.map((pr, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">{pr.specialty}: <span className="text-foreground font-medium">{pr.professionalName}</span></span>
                    <Badge className="badge-neon-red text-[10px] px-1.5 py-0.5">{pr.count} faltas</Badge>
                  </div>
                ))}
                <Link href={`/patients/${p.patientId}`}>
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

// ── PausedOverviewWidget ────────────────────────────────────────────────────
// Widget centralizado de pacientes pausados (Fila de Espera + Agenda).
// Exibe motivo, data de retorno prevista e alertas visuais.

function PausedOverviewWidget() {
  const [items, setItems] = useState<{ fila: PausedOverviewItem[]; agenda: PausedOverviewItem[] }>({ fila: [], agenda: [] });
  const [loading, setLoading] = useState(true);

  const fetchPaused = useCallback(() => {
    listPausedOverview()
      .then(setItems)
      .catch(() => setItems({ fila: [], agenda: [] }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchPaused(); }, [fetchPaused]);
  useVisibleInterval(fetchPaused, 30_000);

  const all = [...items.fila, ...items.agenda];
  if (loading || all.length === 0) return null;

  const today = new Date().toISOString().slice(0, 10);

  const isNearReturn = (d: string | null) => {
    if (!d) return false;
    const diff = (new Date(d + "T12:00:00").getTime() - new Date(today + "T12:00:00").getTime()) / 86_400_000;
    return diff >= 0 && diff <= 7;
  };

  return (
    <Card className="p-6 border-sky-500/30 shadow-[0_0_24px_rgba(56,189,248,0.08)]">
      <h2 className="text-xl font-bold font-display flex items-center gap-2 text-sky-400 mb-2" style={{ textShadow: "0 0 12px rgba(56,189,248,0.5)" }}>
        <Snowflake className="w-5 h-5" />
        Pacientes Pausados ({all.length})
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        Consolidação de pausas na Fila de Espera (Busca Ativa) e Agenda (Pausa Temporária).
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {all.map((item) => {
          const overdue = item.returnOverdue;
          const near = isNearReturn(item.pausedReturnDate);
          const borderColor = overdue ? "rgba(239,68,68,0.4)" : near ? "rgba(234,179,8,0.4)" : "rgba(56,189,248,0.2)";
          const bgColor = overdue ? "rgba(239,68,68,0.06)" : near ? "rgba(234,179,8,0.06)" : "rgba(56,189,248,0.04)";

          return (
            <div
              key={`${item.source}-${item.id}`}
              className="p-4 rounded-xl flex flex-col gap-2"
              style={{ background: bgColor, border: `1px solid ${borderColor}` }}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-foreground text-sm">{item.patientName}</p>
                <Badge className={cn(
                  "text-[10px] px-1.5 py-0.5 uppercase font-bold",
                  item.source === "fila" ? "bg-sky-500/20 text-sky-300 border border-sky-500/30" : "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                )}>
                  {item.source === "fila" ? "Fila" : "Agenda"}
                </Badge>
              </div>

              {item.professionalName && (
                <p className="text-xs text-muted-foreground">
                  Profissional: <span className="text-foreground font-medium">{item.professionalName}</span>
                  {item.specialty && <span className="text-muted-foreground"> ({item.specialty})</span>}
                </p>
              )}

              <p className="text-xs text-muted-foreground">
                Motivo: <span className="text-foreground font-medium">{item.pausedReason || "—"}</span>
              </p>

              {item.pausedAt && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Snowflake className="w-3 h-3 text-sky-400" />
                  Pausado em: {formatDate(item.pausedAt)}
                </p>
              )}

              {item.pausedReturnDate && (
                <p className={cn("text-xs font-semibold flex items-center gap-1", overdue ? "text-red-400" : near ? "text-yellow-400" : "text-muted-foreground")}>
                  <Clock className="w-3 h-3" />
                  Retorno: {formatDate(item.pausedReturnDate)}
                  {overdue && <span className="ml-1">⚠ VENCIDO</span>}
                  {near && !overdue && <span className="ml-1">⏰ Próximo</span>}
                </p>
              )}

              <Link href={`/patients/${item.patientId}`}>
                <Button variant="outline" className="w-full text-xs h-8 mt-1 border-sky-500/40 text-sky-400 hover:bg-sky-500/8 hover:shadow-[0_0_14px_rgba(56,189,248,0.35)]">
                  Ver Ficha
                </Button>
              </Link>
            </div>
          );
        })}
      </div>
    </Card>
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
  porEspecialidadeAno: Record<string, number>;
  totalAno: number;
  filaPorCor: { maxima: number; vermelho: number; laranja: number; azul: number; verde: number; sem: number };
  filaPorEspecialidade: Record<string, number>;
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
  porEspecialidadeAno,
  totalAno,
  filaPorCor,
  filaPorEspecialidade,
  waitingCount,
}: HeartbeatProps) {
  const especialidades = Object.entries(porEspecialidadeAno)
    .sort((a, b) => b[1] - a[1]);
  const filaEspecialidades = Object.entries(filaPorEspecialidade)
    .sort((a, b) => b[1] - a[1]);

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
        {filaPorCor.maxima > 0 && (
          <div className="mb-2">
            <FilaBucket label="🔴 MÁXIMA" hint="Idade<5 ou Abrigo" value={filaPorCor.maxima} fg="#ff4dd2" bg="rgba(255,0,170,0.14)" border="rgba(255,0,170,0.55)" glow="rgba(255,0,170,0.6)" />
          </div>
        )}
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

      {/* Card: Fila de Espera por especialidade — full width */}
      {filaEspecialidades.length > 0 && (
        <Card className="p-6 lg:col-span-3 relative overflow-hidden border-[rgba(255,159,32,0.25)] shadow-[0_0_28px_rgba(255,159,32,0.08)]">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <ListTodo className="w-5 h-5 text-[#ff9f20]" style={{ filter: "drop-shadow(0 0 6px rgba(255,159,32,0.7))" }} />
              <h2 className="text-base font-display font-bold text-foreground">Fila de espera por especialidade</h2>
            </div>
            <span className="text-xs text-muted-foreground">{waitingCount} na fila · cor neon de cada área</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {filaEspecialidades.map(([k, n]) => {
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

      {/* Card 4: Atendimentos no ano por especialidade — full width */}
      {especialidades.length > 0 && (
        <Card className="p-6 lg:col-span-3">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-base font-display font-bold text-foreground">Atendimentos no ano por especialidade</h2>
            <span className="text-xs text-muted-foreground">{totalAno} atendimento{totalAno !== 1 ? "s" : ""} desde 01/01 · cor neon de cada área</span>
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
