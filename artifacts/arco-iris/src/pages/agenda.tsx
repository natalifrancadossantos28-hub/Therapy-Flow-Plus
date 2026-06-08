import { useState, useEffect, useRef } from "react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Card, Select, Button, Label } from "@/components/ui-custom";
import { format, startOfWeek, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Calendar as CalendarIcon, Clock, Lock, ShieldCheck, ExternalLink,
  X, MessageCircle, CheckCircle, Activity, RotateCcw, LogOut, AlertTriangle,
  ChevronLeft, ChevronRight, ArrowRightLeft, UserPlus, UserX, XOctagon, Download, Trash2, Users, Repeat, Undo2, Snowflake, Play
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn, getStatusColor, getStatusLabel } from "@/lib/utils";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import BookingModal from "@/components/BookingModal";
import {
  listProfessionals,
  verifyProfessionalPin,
  listAppointments,
  updateAppointment,
  deleteAppointmentAlta,
  deleteRecurrenceForward,
  createNotificacao,
  createAppointments,
  listWaitingList,
  deleteWaitingListEntry,
  addPatientToFila,
  upsertPatient,
  getPatient,
  updateRecurrenceFrequency,
  materializeVirtualAppointment,
  type Professional as ArcoProfessional,
} from "@/lib/arco-rpc";

const TIME_SLOTS = [
  "07:10", "08:00", "08:50", "09:40", "10:30", "11:20",
  "12:10",
  "13:10", "14:00", "14:50", "15:40", "16:30",
];

function getWeekDays(ref: Date): Date[] {
  const monday = startOfWeek(ref, { weekStartsOn: 1 });
  return Array.from({ length: 5 }, (_, i) => addDays(monday, i));
}

const TERMINAL_STATUSES = ["alta", "desistência", "óbito", "desistencia"];
const INACTIVE_STATUSES = [...TERMINAL_STATUSES, "desmarcado", "cancelado", "remanejado", "remarcado"];

/** Abbreviate long names keeping first + second name: "Isis Godinho Lima" → "Isis Godinho L." */
function abbreviateName(name: string | undefined | null, maxLen = 22): string {
  if (!name) return "";
  if (name.length <= maxLen) return name;
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 2) return name;
  const abbreviated = parts[0] + " " + parts[1] + " " + parts.slice(2).map(p => p[0]?.toUpperCase() + ".").join(" ");
  return abbreviated;
}

/** Deterministic negative ID for virtual appointments so menus stay open across re-renders. */
function stableVirtualId(date: string, time: string, patientId: number, groupId: string): number {
  let h = 0;
  const s = `${date}|${time}|${patientId}|${groupId}`;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return h < 0 ? h : -(h || 1);
}

/** Number of whole weeks between two YYYY-MM-DD dates (robust across year boundaries). */
function weeksBetween(dateA: string, dateB: string): number {
  const msA = new Date(dateA + "T12:00:00").getTime();
  const msB = new Date(dateB + "T12:00:00").getTime();
  return Math.round((msB - msA) / (7 * 86_400_000));
}

/** Returns true if the target date is an "allowed" week for the given frequency relative to refDate. */
function isAllowedWeek(refDate: string, targetDate: string, freq: string): boolean {
  if (freq === "semanal") return true;
  const weeks = weeksBetween(refDate, targetDate);
  if (freq === "quinzenal") return weeks % 2 === 0;
  if (freq === "mensal") return weeks % 4 === 0;
  return true;
}

/** Projects recurring appointments into weeks that have no real DB row yet. */
function expandRecurrence<T extends { date: string; time: string; patientId: number; recurrenceGroupId?: string | null; status: string; frequency?: string | null }>(
  allApts: T[],
  weekDates: string[],
): T[] {
  if (weekDates.length === 0) return allApts;
  const existing = new Set(allApts.filter(a => weekDates.includes(a.date)).map(a => `${a.date}|${a.time}|${a.patientId}`));
  const groups = new Map<string, T[]>();
  for (const a of allApts) {
    if (!a.recurrenceGroupId) continue;
    let g = groups.get(a.recurrenceGroupId);
    if (!g) { g = []; groups.set(a.recurrenceGroupId, g); }
    g.push(a);
  }
  const virtual: T[] = [];
  for (const [, gApts] of groups) {
    const sorted = [...gApts].sort((a, b) => a.date.localeCompare(b.date));
    const allTerminal = sorted.every(a => TERMINAL_STATUSES.includes(a.status.toLowerCase()));
    if (allTerminal) continue;
    const nonTerminalApts = sorted.filter(a => !TERMINAL_STATUSES.includes(a.status.toLowerCase()));
    const activeApts = sorted.filter(a => !INACTIVE_STATUSES.includes(a.status.toLowerCase()));
    // "Schedule reference" = active OR remanejado (definitivo). Excludes remarcado (pontual).
    const PONTUAL_STATUSES = ["remarcado", "desmarcado", "cancelado"];
    const scheduleRefApts = nonTerminalApts.filter(a => !PONTUAL_STATUSES.includes(a.status.toLowerCase()));
    // Use LAST schedule-reference appointment for day/time so remanejamentos propagate forward.
    const refApt = scheduleRefApts.at(-1) ?? activeApts.at(-1) ?? nonTerminalApts.at(-1) ?? sorted.at(-1)!;
    const refDow = new Date(refApt.date + "T12:00:00").getDay();
    const target = weekDates.find(d => new Date(d + "T12:00:00").getDay() === refDow);
    if (!target) continue;
    if (target < (activeApts[0] ?? nonTerminalApts[0] ?? sorted[0]).date) continue;
    if (gApts.some(a => weekDates.includes(a.date))) continue;

    // Allow projection up to 4 weeks beyond the last schedule-reference appointment.
    const lastRefDate = (scheduleRefApts.at(-1) ?? nonTerminalApts.at(-1) ?? sorted.at(-1)!).date;
    const lastRefMs = new Date(lastRefDate + "T12:00:00").getTime();
    const targetMs = new Date(target + "T12:00:00").getTime();
    if (targetMs > lastRefMs + 28 * 86_400_000) continue;

    const freq = (refApt as any).frequency ?? "semanal";
    if (!isAllowedWeek(sorted[0].date, target, freq)) continue;

    const key = `${target}|${refApt.time}|${refApt.patientId}`;
    if (existing.has(key)) continue;
    existing.add(key);
    const hasAtendimento = (scheduleRefApts.length > 0 ? scheduleRefApts : activeApts).some(a => ["atendimento", "em_atendimento", "em atendimento", "remanejado"].includes(a.status.toLowerCase()));
    const virtualStatus = hasAtendimento ? "atendimento" : "agendado";
    virtual.push({ ...refApt, date: target, status: virtualStatus, id: stableVirtualId(target, refApt.time, refApt.patientId, refApt.recurrenceGroupId!) } as T);
  }
  return [...allApts, ...virtual];
}

/**
 * Filters out appointments that fall on "wrong" weeks for their frequency.
 * Hides ALL appointments in wrong weeks (regardless of status) so quinzenal/mensal
 * patients only appear on the correct weeks.
 */
function applyFrequencyFilter<T extends { date: string; recurrenceGroupId?: string | null; status: string; frequency?: string | null }>(
  allApts: T[],
  weekDates: string[],
): T[] {
  if (weekDates.length === 0) return allApts;
  const groups = new Map<string, T[]>();
  for (const a of allApts) {
    if (!a.recurrenceGroupId) continue;
    const g = groups.get(a.recurrenceGroupId) ?? [];
    g.push(a);
    groups.set(a.recurrenceGroupId, g);
  }
  const hide = new Set<T>();
  for (const [, gApts] of groups) {
    const sorted = [...gApts].sort((a, b) => a.date.localeCompare(b.date));
    const freq = (sorted[0] as any).frequency ?? "semanal";
    if (freq === "semanal") continue;
    const refDate = sorted[0].date;
    for (const apt of gApts) {
      if (!weekDates.includes(apt.date)) continue;
      if (!isAllowedWeek(refDate, apt.date, freq)) hide.add(apt);
    }
  }
  return allApts.filter(a => !hide.has(a));
}

function isoWeekNumber(dateStr: string): number {
  const d = new Date(dateStr + "T12:00:00");
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil((((+target - +yearStart) / 86_400_000) + 1) / 7);
}

function computeCiclo(frequency: string | null | undefined, date: string): "A" | "B" | "M" | null {
  if (frequency === "quinzenal") {
    return isoWeekNumber(date) % 2 === 1 ? "A" : "B";
  }
  if (frequency === "mensal") return "M";
  return null;
}

function withCiclo<T extends { frequency?: string | null; date: string }>(
  items: T[]
): (T & { ciclo: "A" | "B" | "M" | null })[] {
  return items.map((a) => ({ ...a, ciclo: computeCiclo(a.frequency ?? null, a.date) }));
}

type Appointment = {
  id: number;
  patientId: number;
  patientName?: string | null;
  patientStatus?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  professionalName?: string | null;
  professionalId: number;
  date: string;
  time: string;
  status: string;
  recurrenceGroupId?: string | null;
  frequency?: string | null;
  ciclo?: "A" | "B" | "M" | null;
  escolaPublica?: boolean | null;
  trabalhoNaRoca?: boolean | null;
  consecutiveUnjustifiedAbsences?: number | null;
  prontuario?: string | null;
  notes?: string | null;
  paused?: boolean;
  pausedAt?: string | null;
  pausedReason?: string | null;
  pausedReturnDate?: string | null;
};

type AbsenceAlert = {
  apt: Appointment;
  patientName: string;
  professionalName: string;
  professionalSpecialty: string;
  consecutive: number;
  escolaPublica: boolean;
  trabalhoNaRoca: boolean;
};

type CancelDialog = {
  apt: Appointment;
  profName: string;
  originalStatus: string;
};

type RemanejFlow = {
  apt: Appointment;
  kind: "remanejar" | "remarcar";
  step: "slot" | "carla";
  weekRef: Date;
  newDate?: string;
  newTime?: string;
};

// ── Neon button styles ──────────────────────────────────────────────
const NEON: Record<string, React.CSSProperties> = {
  yellow: {
    background: "rgba(10,8,0,0.92)",
    border: "1px solid #eab308",
    color: "#fde047",
    boxShadow: "0 0 14px rgba(234,179,8,0.55), inset 0 0 8px rgba(234,179,8,0.12)",
    textShadow: "0 0 8px rgba(253,224,71,0.9)",
    borderRadius: "10px",
    padding: "8px 14px",
    fontWeight: 700,
    fontSize: "12px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    width: "100%",
    transition: "all 0.15s",
  },
  green: {
    background: "rgba(5,10,5,0.92)",
    border: "1px solid #22c55e",
    color: "#4ade80",
    boxShadow: "0 0 14px rgba(34,197,94,0.55), inset 0 0 8px rgba(34,197,94,0.12)",
    textShadow: "0 0 8px rgba(74,222,128,0.9)",
    borderRadius: "10px",
    padding: "8px 14px",
    fontWeight: 700,
    fontSize: "12px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    width: "100%",
    transition: "all 0.15s",
  },
  orange: {
    background: "rgba(10,5,0,0.92)",
    border: "1px solid #f97316",
    color: "#fb923c",
    boxShadow: "0 0 14px rgba(249,115,22,0.55), inset 0 0 8px rgba(249,115,22,0.12)",
    textShadow: "0 0 8px rgba(251,146,60,0.9)",
    borderRadius: "10px",
    padding: "8px 14px",
    fontWeight: 700,
    fontSize: "12px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    width: "100%",
    transition: "all 0.15s",
  },
  blue: {
    background: "rgba(0,5,15,0.92)",
    border: "1px solid #3b82f6",
    color: "#60a5fa",
    boxShadow: "0 0 14px rgba(59,130,246,0.55), inset 0 0 8px rgba(59,130,246,0.12)",
    textShadow: "0 0 8px rgba(96,165,250,0.9)",
    borderRadius: "10px",
    padding: "8px 14px",
    fontWeight: 700,
    fontSize: "12px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    width: "100%",
    transition: "all 0.15s",
  },
  red: {
    background: "rgba(10,0,0,0.92)",
    border: "1px solid #ef4444",
    color: "#f87171",
    boxShadow: "0 0 14px rgba(239,68,68,0.55), inset 0 0 8px rgba(239,68,68,0.12)",
    textShadow: "0 0 8px rgba(248,113,113,0.9)",
    borderRadius: "10px",
    padding: "8px 14px",
    fontWeight: 700,
    fontSize: "12px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    width: "100%",
    transition: "all 0.15s",
  },
  fuchsia: {
    background: "rgba(10,0,10,0.92)",
    border: "1px solid #c026d3",
    color: "#e879f9",
    boxShadow: "0 0 14px rgba(192,38,211,0.55), inset 0 0 8px rgba(192,38,211,0.12)",
    textShadow: "0 0 8px rgba(232,121,249,0.9)",
    borderRadius: "10px",
    padding: "8px 14px",
    fontWeight: 700,
    fontSize: "12px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    width: "100%",
    transition: "all 0.15s",
  },
  cyan: {
    background: "rgba(0,8,10,0.92)",
    border: "1px solid #06b6d4",
    color: "#67e8f9",
    boxShadow: "0 0 14px rgba(6,182,212,0.55), inset 0 0 8px rgba(6,182,212,0.12)",
    textShadow: "0 0 8px rgba(103,232,249,0.9)",
    borderRadius: "10px",
    padding: "8px 14px",
    fontWeight: 700,
    fontSize: "12px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    width: "100%",
    transition: "all 0.15s",
  },
};

const SPECIALTIES = [
  "Psicologia", "Psicologia Parental", "Psicomotricidade", "Fisioterapia", "Terapia Ocupacional",
  "Fonoaudiologia", "Nutrição", "Psicopedagogia", "Educação Física",
];

const isAdminSession = (): boolean => {
  try {
    const raw = sessionStorage.getItem("nfs_ponto_session");
    if (raw) {
      const s = JSON.parse(raw);
      if (s?.type === "master") return true;
      if (s?.type === "company" && s.moduleArcoIris) return true;
    }
  } catch { /* ignore */ }
  return sessionStorage.getItem("nfs_admin_auth") === "true";
};

export default function Agenda() {
  useDocumentTitle("Agenda Geral");
  const isAdmin = isAdminSession();
  const [selectedProfId, setSelectedProfId] = useState<string>("");
  const [pinInput, setPinInput] = useState("");
  const [pinVerified, setPinVerified] = useState(false);
  const [pinError, setPinError] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  // No sabado/domingo, abrir ja na proxima semana (segunda seguinte).
  const [weekRef, setWeekRef] = useState(() => {
    const d = new Date();
    const dow = d.getDay(); // 0 = domingo, 6 = sabado
    if (dow === 0) d.setDate(d.getDate() + 1);
    else if (dow === 6) d.setDate(d.getDate() + 2);
    return d;
  });
  // Espelha weekRef num ref para que recargas de Realtime/polling/foco usem
  // sempre a semana visível atual (evita closure "presa" numa semana antiga).
  const weekRefLatest = useRef(weekRef);
  weekRefLatest.current = weekRef;
  const goPrevWeek = () => setWeekRef(prev => addDays(prev, -7));
  const goNextWeek = () => setWeekRef(prev => addDays(prev, 7));
  const goThisWeek = () => {
    const d = new Date();
    const dow = d.getDay();
    if (dow === 0) d.setDate(d.getDate() + 1);
    else if (dow === 6) d.setDate(d.getDate() + 2);
    setWeekRef(d);
  };
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [bookingSlot, setBookingSlot] = useState<{ date: string; time: string } | null>(null);
  const [cancelDialog, setCancelDialog] = useState<CancelDialog | null>(null);
  const [notifySending, setNotifySending] = useState(false);
  const [notifyDone, setNotifyDone] = useState(false);
  const [actionMenuId, setActionMenuId] = useState<number | null>(null);
  const [altaConfirm, setAltaConfirm] = useState<Appointment | null>(null);
  const [altaMotivo, setAltaMotivo] = useState("");
  const [saidaTipo, setSaidaTipo] = useState<"Alta" | "Óbito" | "Desistência">("Alta");
  const [absenceAlert, setAbsenceAlert] = useState<AbsenceAlert | null>(null);
  const [remanejFlow, setRemanejFlow] = useState<RemanejFlow | null>(null);
  const [remanejSending, setRemanejSending] = useState(false);
  const [remanejDone, setRemanejDone] = useState(false);
  const [excluirConfirm, setExcluirConfirm] = useState<Appointment | null>(null);
  const [excluirSending, setExcluirSending] = useState(false);
  const [pauseModal, setPauseModal] = useState<Appointment | null>(null);
  const [pauseReason, setPauseReason] = useState("");
  const [pauseReturnDate, setPauseReturnDate] = useState("");
  const [pauseSending, setPauseSending] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [professionals, setProfessionals] = useState<ArcoProfessional[]>([]);
  const { toast } = useToast();

  // Atendimento Multi
  const [multiApt, setMultiApt] = useState<Appointment | null>(null);
  const [multiProfId, setMultiProfId] = useState<string>("");
  const [multiSending, setMultiSending] = useState(false);
  const [multiErro, setMultiErro] = useState("");

  // Frequência (Periodicidade)
  const [freqSending, setFreqSending] = useState(false);

  // Encaminhamento Interno
  const [encApt, setEncApt] = useState<Appointment | null>(null);
  const [encEspecialidade, setEncEspecialidade] = useState("");
  const [encMotivo, setEncMotivo] = useState("");
  const [encErro, setEncErro] = useState("");
  const [encSending, setEncSending] = useState(false);
  const [encManterAgenda, setEncManterAgenda] = useState(true);

  useEffect(() => {
    listProfessionals().then(setProfessionals).catch(console.error);
  }, []);

  const canView = isAdmin || pinVerified;
  const weekDays = getWeekDays(weekRef);
  const weekDates = weekDays.map(d => format(d, "yyyy-MM-dd"));
  const today = format(new Date(), "yyyy-MM-dd");

  const loadedRangeRef = useRef<{ from: string; to: string } | null>(null);

  const fetchAppointments = (refDate?: Date) => {
    if (!selectedProfId) return;
    const ref = refDate ?? weekRef;
    const rangeStart = addDays(startOfWeek(ref, { weekStartsOn: 1 }), -56);
    const rangeEnd = addDays(startOfWeek(ref, { weekStartsOn: 1 }), 60);
    const dateFrom = format(rangeStart, "yyyy-MM-dd");
    const dateTo = format(rangeEnd, "yyyy-MM-dd");
    loadedRangeRef.current = { from: dateFrom, to: dateTo };
    listAppointments({
      professionalId: parseInt(selectedProfId),
      dateFrom,
      dateTo,
    })
      .then((list) => setAppointments(
        withCiclo(
          // Oculta pacientes com status terminal (Alta/Óbito/Desistência):
          // mesmo com agendamento, não devem aparecer na agenda (evita "fantasmas").
          list.filter(a => !TERMINAL_STATUSES.includes((a.patientStatus ?? "").toLowerCase()))
        ) as Appointment[]
      ))
      .catch((err) => {
        console.error("fetchAppointments error:", err);
        toast({ title: "Erro ao carregar agenda", description: err?.message || String(err), variant: "destructive" });
      });
  };

  useEffect(() => {
    if (canView && selectedProfId) fetchAppointments();
  }, [selectedProfId, canView]);

  // Re-fetch when navigating outside the loaded date window
  useEffect(() => {
    if (!canView || !selectedProfId) return;
    const range = loadedRangeRef.current;
    if (!range) return;
    const viewStart = weekDates[0];
    const viewEnd = weekDates[weekDates.length - 1];
    const margin = 14;
    const marginFrom = format(addDays(new Date(range.from + "T12:00:00"), margin), "yyyy-MM-dd");
    const marginTo = format(addDays(new Date(range.to + "T12:00:00"), -margin), "yyyy-MM-dd");
    if (viewStart < marginFrom || viewEnd > marginTo) {
      fetchAppointments(weekRef);
    }
  }, [weekRef, canView, selectedProfId]);

  // Realtime: recarrega a agenda quando qualquer appointment desse profissional muda
  // (agendamento, remanejamento pelo profissional, mudança de status, etc.).
  // Garante a "interligação total" pedida: ADM/Profissional/Recepção vêem mudanças em tempo real.
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!supabase || !canView || !selectedProfId) return;
    const profId = parseInt(selectedProfId);
    const scheduleReload = () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = setTimeout(() => { fetchAppointments(weekRefLatest.current); }, 400);
    };
    const channel = supabase
      .channel(`agenda-recepcao-${profId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments", filter: `professional_id=eq.${profId}` },
        scheduleReload
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "waiting_list" },
        scheduleReload
      )
      .subscribe();
    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      void supabase?.removeChannel(channel);
    };
  }, [selectedProfId, canView]);

  // Rede de segurança da sincronia: além do Realtime (instantâneo), garante que
  // a agenda convirja mesmo se um evento Realtime se perder ou a aba ficar em
  // segundo plano. Recarrega ao voltar o foco/visibilidade da aba e a cada 30s.
  useEffect(() => {
    if (!canView || !selectedProfId) return;
    const reloadNow = () => fetchAppointments(weekRefLatest.current);
    const onVisible = () => { if (document.visibilityState === "visible") reloadNow(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", reloadNow);
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") reloadNow();
    }, 30_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", reloadNow);
      clearInterval(poll);
    };
  }, [selectedProfId, canView]);

  // Close action menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActionMenuId(null);
      }
    };
    if (actionMenuId !== null) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [actionMenuId]);

  const handleProfChange = (id: string) => {
    setSelectedProfId(id);
    if (!isAdmin) { setPinVerified(false); setPinInput(""); setPinError(""); }
  };

  const verifyPin = async () => {
    if (!selectedProfId || pinInput.length !== 4) return;
    setPinLoading(true); setPinError("");
    try {
      const prof = await verifyProfessionalPin(parseInt(selectedProfId), pinInput);
      if (prof) { setPinVerified(true); }
      else { setPinError("PIN incorreto"); setPinInput(""); }
    } catch { setPinError("Erro ao verificar PIN."); }
    finally { setPinLoading(false); }
  };

  // ── Patch status (single occurrence) ──
  // Quando vira "atendimento" e a sessao e parte de uma recorrencia,
  // o servidor propaga para as semanas futuras "agendado" do mesmo grupo.
  // Atualiza o estado local de forma otimista para refletir o mesmo.
  // Se o appointment for virtual (id negativo = projeção de recorrência),
  // materializa-o primeiro no banco preservando recurrence_group_id.
  const patchStatus = async (apt: Appointment, status: string) => {
    let realId = apt.id;

    // Virtual appointment: materializar no banco antes de prosseguir
    if (apt.id < 0 && selectedProfId) {
      const mat = await materializeVirtualAppointment({
        patientId: apt.patientId,
        professionalId: parseInt(selectedProfId),
        date: apt.date,
        time: apt.time,
        recurrenceGroupId: apt.recurrenceGroupId,
        frequency: (apt.frequency as "semanal" | "quinzenal" | "mensal") ?? "semanal",
        notes: apt.notes,
      });
      realId = mat.id;
    }

    const data = await updateAppointment(realId, { status });
    setAppointments(prev => prev.map(a => {
      if (a.id === apt.id || a.id === realId) return { ...a, id: realId, status };
      if (
        status === "atendimento"
        && apt.recurrenceGroupId
        && a.recurrenceGroupId === apt.recurrenceGroupId
        && a.date > apt.date
        && (a.status?.toLowerCase() ?? "agendado") === "agendado"
      ) {
        return { ...a, status: "atendimento" };
      }
      return a;
    }));
    return data;
  };

  // ── Log na tabela Notificações_Recepção ──
  const logNotificacao = async (apt: Appointment, acao: string) => {
    try {
      await createNotificacao({
        appointmentId: apt.id,
        patientName: apt.patientName || `Paciente #${apt.patientId}`,
        patientPhone: apt.guardianPhone ?? null,
        professionalName: apt.professionalName || selectedProf?.name || "—",
        acao,
        dataConsulta: apt.date,
        horaConsulta: apt.time,
      });
    } catch { /* silencioso — log não crítico */ }
  };

  // ── Concluir (era Atendimento) ──
  const handleAtendimento = async (apt: Appointment) => {
    setActionMenuId(null);
    try {
      await patchStatus(apt, "atendimento");
      await logNotificacao(apt, "Concluir");
      toast({ title: "✅ Concluído", description: `${apt.patientName} confirmado na sessão.` });
    } catch {
      toast({ title: "Erro", description: "Não foi possível atualizar.", variant: "destructive" });
    }
  };

  // ── Desmarcar (single date) ──
  const handleDesmarcado = async (apt: Appointment, profName: string) => {
    setActionMenuId(null);
    const originalStatus = apt.status;
    try {
      const data = await patchStatus(apt, "desmarcado");
      const realApt = { ...apt, id: data.id, status: "desmarcado" };
      await logNotificacao(realApt, "Desmarcado");
      setNotifyDone(false);
      setCancelDialog({ apt: realApt, profName, originalStatus });
    } catch {
      toast({ title: "Erro", description: "Não foi possível desmarcar.", variant: "destructive" });
    }
  };

  // ── Reverter desmarcado ──
  const handleRevertClick = async (apt: Appointment) => {
    const revertTo = cancelDialog?.originalStatus || "agendado";
    try {
      await updateAppointment(apt.id, { status: revertTo });
      setAppointments(prev => prev.map(a => a.id === apt.id ? { ...a, status: revertTo } : a));
      setCancelDialog(null);
      toast({ title: "Revertido", description: `Agendamento voltou para "${revertTo}".` });
    } catch {
      toast({ title: "Erro", description: "Não foi possível reverter.", variant: "destructive" });
    }
  };

  // ── Falta Justificada ──
  const handleFaltaJustificada = async (apt: Appointment) => {
    setActionMenuId(null);
    try {
      await patchStatus(apt, "falta_justificada");
      await logNotificacao(apt, "Falta Justificada");
      toast({ title: "✅ Falta Justificada registrada", description: `${apt.patientName} — sequência de alertas zerada.` });
    } catch {
      toast({ title: "Erro", description: "Não foi possível registrar.", variant: "destructive" });
    }
  };

  // ── Falta Não Justificada ──
  const handleFaltaNaoJustificada = async (apt: Appointment) => {
    setActionMenuId(null);
    try {
      const result = await patchStatus(apt, "falta_nao_justificada");
      const consecutive: number = result?.consecutiveUnjustifiedAbsences ?? 1;
      await logNotificacao(apt, `Falta ${consecutive} — Não Justificada`);
      const profName = result?.professionalName || apt.professionalName || "";
      const profSpec = result?.professionalSpecialty || "";
      if (consecutive >= 2) {
        setAbsenceAlert({
          apt,
          patientName: apt.patientName ?? `Paciente #${apt.patientId}`,
          professionalName: profName,
          professionalSpecialty: profSpec,
          consecutive,
          escolaPublica: result?.escolaPublica ?? false,
          trabalhoNaRoca: result?.trabalhoNaRoca ?? false,
        });
      } else {
        toast({ title: "⚠️ Falta Não Justificada registrada", description: `${apt.patientName} — 1ª ausência sem justificativa em ${profSpec || "esta especialidade"}.` });
      }
    } catch {
      toast({ title: "Erro", description: "Não foi possível registrar.", variant: "destructive" });
    }
  };

  // ── Cancelar Falta (Admin/Recepção) ──
  const handleCancelarFalta = async (apt: Appointment) => {
    setActionMenuId(null);
    try {
      await patchStatus(apt, "agendado");
      await logNotificacao(apt, "Falta Cancelada");
      toast({ title: "Falta cancelada", description: `${apt.patientName} voltou para status "Agendado".` });
    } catch {
      toast({ title: "Erro", description: "Não foi possível cancelar a falta.", variant: "destructive" });
    }
  };

  // ── Pausar / Despausar agendamento ──
  const handleOpenPauseModal = (apt: Appointment) => {
    setActionMenuId(null);
    setPauseReason("");
    setPauseReturnDate("");
    setPauseModal(apt);
  };

  const confirmPause = async () => {
    if (!pauseModal) return;
    setPauseSending(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const reason = pauseReason || "Pausa temporária";
      const returnDate = pauseReturnDate || null;

      // 1. Busca TODOS os appointments futuros desse paciente+profissional
      const futureApts = await listAppointments({
        professionalId: pauseModal.professionalId,
        dateFrom: today,
      });
      const toUpdate = futureApts.filter(
        a => a.patientId === pauseModal.patientId &&
             !["cancelado", "desmarcado", "alta", "desistencia", "obito"].includes((a.status || "").toLowerCase())
      );

      // 2. Marca cada um como "pausado"
      for (const a of toUpdate) {
        await updateAppointment(a.id, { status: "pausado" });
      }

      // 3. Adiciona paciente na fila de espera com motivo e data de retorno
      const profSpec = professionals.find(p => p.id === pauseModal.professionalId)?.specialty || null;
      const notaFila = `Pausa: ${reason}${returnDate ? `. Retorno previsto: ${returnDate}` : ""}`;
      try {
        await addPatientToFila(pauseModal.patientId, profSpec, notaFila, true);
      } catch { /* Se já está na fila, ignora */ }

      await logNotificacao(pauseModal, "Pausa Temporária");
      // Refresh para refletir as mudanças
      fetchAppointments();
      toast({ title: "⏸ Pausado", description: `${pauseModal.patientName} foi pausado e movido para a fila de espera.` });
      setPauseModal(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Erro ao pausar", description: msg, variant: "destructive" });
    } finally {
      setPauseSending(false);
    }
  };

  const handleUnpause = async (apt: Appointment) => {
    setActionMenuId(null);
    try {
      const today = new Date().toISOString().slice(0, 10);

      // 1. Busca appointments pausados desse paciente+profissional
      const allApts = await listAppointments({
        professionalId: apt.professionalId,
        dateFrom: today,
      });
      const pausedApts = allApts.filter(
        a => a.patientId === apt.patientId && (a.status || "").toLowerCase() === "pausado"
      );

      // 2. Volta cada um para "agendado"
      for (const a of pausedApts) {
        await updateAppointment(a.id, { status: "agendado" });
      }

      // 3. Remove da fila de espera
      const profSpec = professionals.find(p => p.id === apt.professionalId)?.specialty || null;
      try {
        const fila = await listWaitingList();
        const entries = fila.filter(e =>
          e.patientId === apt.patientId &&
          (!profSpec || (e.specialty || "").toLowerCase().includes((profSpec || "").toLowerCase().slice(0, 5)))
        );
        for (const e of entries) {
          try { await deleteWaitingListEntry(e.id); } catch { /* silencioso */ }
        }
      } catch { /* silencioso */ }

      await logNotificacao(apt, "Retorno de Pausa");
      fetchAppointments();
      toast({ title: "▶ Retomado", description: `${apt.patientName} voltou para a agenda com status "Agendado".` });
    } catch {
      toast({ title: "Erro", description: "Não foi possível retomar.", variant: "destructive" });
    }
  };

  // ── Exclusão administrativa (sem vínculo clínico) ──
  const handleExcluirAdmin = (apt: Appointment) => {
    setActionMenuId(null);
    setExcluirConfirm(apt);
  };

  const confirmExcluirAdmin = async () => {
    if (!excluirConfirm) return;
    setExcluirSending(true);
    try {
      if (excluirConfirm.recurrenceGroupId) {
        // "Daqui para frente": deletes from selected date onward, preserves past history
        await deleteRecurrenceForward(
          excluirConfirm.recurrenceGroupId,
          excluirConfirm.date,
          excluirConfirm.patientId,
        );
      } else if (excluirConfirm.id > 0) {
        await deleteAppointmentAlta(excluirConfirm.id);
      }
      // Remove from local state: appointments in the same recurrence group from this date onward
      setAppointments(prev =>
        prev.filter(a => {
          if (a.recurrenceGroupId && a.recurrenceGroupId === excluirConfirm.recurrenceGroupId) {
            return a.date < excluirConfirm.date;
          }
          return a.id !== excluirConfirm.id;
        })
      );
      // Re-adiciona o paciente à fila de espera da especialidade do profissional
      try {
        const prof = professionals.find(p => p.id === excluirConfirm.professionalId);
        if (prof?.specialty) {
          await addPatientToFila(excluirConfirm.patientId, prof.specialty, null, true);
        }
      } catch { /* se falhar a re-inserção na fila, não bloqueia */ }
      toast({
        title: "Agendamento excluído",
        description: `${excluirConfirm.patientName} — horários de ${excluirConfirm.date} em diante excluídos. Histórico anterior preservado.`,
      });
      setExcluirConfirm(null);
      fetchAppointments();
    } catch (err: any) {
      toast({
        title: "Erro ao excluir",
        description: err?.message ?? "Não foi possível excluir o agendamento.",
        variant: "destructive",
      });
    } finally {
      setExcluirSending(false);
    }
  };

  // ── Saída (Alta / Óbito / Desistência) ──
  const handleSaida = (apt: Appointment, tipo: "Alta" | "Óbito" | "Desistência") => {
    setActionMenuId(null);
    setAltaMotivo("");
    setSaidaTipo(tipo);
    setAltaConfirm(apt);
  };

  const confirmSaida = async () => {
    if (!altaConfirm || !altaMotivo.trim()) return;
    const label = saidaTipo;
    try {
      if (altaConfirm.id > 0) {
        await deleteAppointmentAlta(altaConfirm.id);
      } else if (altaConfirm.recurrenceGroupId) {
        const realSibling = appointments.find(
          a => a.recurrenceGroupId === altaConfirm.recurrenceGroupId && a.id > 0
        );
        if (realSibling) await deleteAppointmentAlta(realSibling.id);
      }
      await logNotificacao(altaConfirm, `${label} — Motivo: ${altaMotivo.trim()}`);

      const todayStr = new Date().toISOString().split("T")[0];
      const profSpecialty = selectedProf?.specialty ?? null;

      // Check if patient still has active appointments with OTHER professionals
      let hasOtherActive = false;
      try {
        const allFuture = await listAppointments({ patientId: altaConfirm.patientId, dateFrom: todayStr });
        hasOtherActive = allFuture.some(a =>
          a.professionalId !== altaConfirm.professionalId &&
          (a.status === "agendado" || a.status === "atendimento" || a.status === "em_atendimento")
        );
      } catch { /* if check fails, be safe and don't change global status */ hasOtherActive = true; }

      // Persistência: salva motivo; só altera status global se não houver outros atendimentos
      try {
        const existing = await getPatient(altaConfirm.patientId);
        const prevNotes = existing?.notes ? `${existing.notes}\n` : "";
        const updatePayload: Record<string, unknown> = {
          notes: `${prevNotes}[${label.toUpperCase()} ${new Date().toLocaleDateString("pt-BR")} — ${profSpecialty ?? "Geral"}] Motivo: ${altaMotivo.trim()}`,
        };
        if (!hasOtherActive) {
          updatePayload.status = label;
        }
        await upsertPatient(altaConfirm.patientId, updatePayload);
      } catch {
        toast({ title: "Aviso", description: "Motivo registrado na notificação, mas houve falha ao gravar no prontuário.", variant: "destructive" });
      }

      // Remover apenas da fila da especialidade deste profissional (não de todas)
      try {
        const filaAtual = await listWaitingList();
        const entradas = filaAtual.filter(e =>
          e.patientId === altaConfirm.patientId &&
          (!profSpecialty || !e.specialty || e.specialty === profSpecialty)
        );
        for (const entry of entradas) {
          await deleteWaitingListEntry(entry.id);
        }
      } catch { /* silencioso — fila pode estar vazia */ }

      // Remove all appointments in the same recurrence group from local state
      setAppointments(prev => prev.filter(a =>
        a.id !== altaConfirm.id &&
        !(a.recurrenceGroupId && a.recurrenceGroupId === altaConfirm.recurrenceGroupId)
      ));
      setAltaConfirm(null);
      setAltaMotivo("");
      const statusMsg = hasOtherActive
        ? `${altaConfirm.patientName} — removido desta especialidade. Permanece ativo em outras.`
        : `${altaConfirm.patientName} — status alterado para ${label}.`;
      toast({ title: `${label} aplicada`, description: statusMsg });
      fetchAppointments();
    } catch {
      toast({ title: "Erro", description: `Não foi possível aplicar ${label.toLowerCase()}.`, variant: "destructive" });
    }
  };

  // ── Encaminhamento Interno ──
  const handleEncaminhamento = async (apt: Appointment) => {
    if (!isAdmin) {
      try {
        const allApts = await listAppointments({ patientId: apt.patientId, professionalId: selectedProf ? Number(selectedProf) : null });
        const completed = allApts.filter(a => a.status === "atendimento").length;
        if (completed < 2) {
          toast({ title: "Encaminhamento bloqueado", description: `Só é possível encaminhar após 2 atendimentos concluídos. Atualmente: ${completed}/2.`, variant: "destructive" });
          setActionMenuId(null);
          return;
        }
      } catch { /* se falhar a contagem, permite prosseguir */ }
    }
    setActionMenuId(null);
    setEncApt(apt);
    setEncEspecialidade("");
    setEncMotivo("");
    setEncErro("");
    setEncManterAgenda(true);
  };

  const confirmEncaminhamento = async () => {
    if (!encApt || !encEspecialidade) return;
    setEncErro("");
    setEncSending(true);
    try {
      const filaAtual = await listWaitingList();
      const jaExiste = filaAtual.some(
        (e) => e.patientId === encApt.patientId && e.specialty === encEspecialidade
      );
      if (jaExiste) {
        setEncErro("Este paciente já possui um encaminhamento ativo/está na fila para esta especialidade.");
        setEncSending(false);
        return;
      }
      // Admin ou prontuário antigo (< 500) pula exigência de triagem
      const prt = parseInt(encApt.prontuario ?? "", 10);
      const skipTriagem = isAdmin || (!isNaN(prt) && prt < 500);
      await addPatientToFila(encApt.patientId, encEspecialidade, encMotivo.trim() || null, skipTriagem);
      // Persistência: salva motivo do encaminhamento no prontuário do paciente
      try {
        const existing = await getPatient(encApt.patientId);
        const prevNotes = existing?.notes ? `${existing.notes}\n` : "";
        const motivoTexto = encMotivo.trim() ? ` — Motivo: ${encMotivo.trim()}` : "";
        await upsertPatient(encApt.patientId, {
          notes: `${prevNotes}[ENCAMINHAMENTO ${new Date().toLocaleDateString("pt-BR")}] ${encEspecialidade}${motivoTexto}`,
        });
      } catch { /* fila já registra o motivo como fallback */ }
      // Se escolheu remover da agenda atual, deleta os agendamentos futuros
      if (!encManterAgenda) {
        try {
          if (encApt.id > 0) {
            await deleteAppointmentAlta(encApt.id);
          } else if (encApt.recurrenceGroupId) {
            const realSibling = appointments.find(
              a => a.recurrenceGroupId === encApt.recurrenceGroupId && a.id > 0
            );
            if (realSibling) await deleteAppointmentAlta(realSibling.id);
          }
        } catch { /* best-effort */ }
      }
      setEncApt(null);
      toast({ title: "Encaminhamento realizado", description: `${encApt.patientName} adicionado à fila de ${encEspecialidade}.${encManterAgenda ? " Mantido na agenda atual." : " Removido da agenda atual."}` });
      fetchAppointments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha inesperada.";
      toast({ title: "Erro ao encaminhar", description: msg, variant: "destructive" });
    } finally {
      setEncSending(false);
    }
  };

  // ── Atendimento Multi (Admin) ──
  const handleMultiAtendimento = async (apt: Appointment) => {
    if (!isAdmin) {
      try {
        const allApts = await listAppointments({ patientId: apt.patientId, professionalId: selectedProf ? Number(selectedProf) : null });
        const completed = allApts.filter(a => a.status === "atendimento").length;
        if (completed < 2) {
          toast({ title: "Atendimento Multi bloqueado", description: `Só é possível após 2 atendimentos concluídos. Atualmente: ${completed}/2.`, variant: "destructive" });
          setActionMenuId(null);
          return;
        }
      } catch { /* se falhar a contagem, permite prosseguir */ }
    }
    setActionMenuId(null);
    setMultiApt(apt);
    setMultiProfId("");
    setMultiErro("");
  };

  const confirmMultiAtendimento = async () => {
    if (!multiApt || !multiProfId) return;
    setMultiErro("");
    setMultiSending(true);
    try {
      const secondProf = professionals.find(p => String(p.id) === multiProfId);
      if (!secondProf) { setMultiErro("Profissional não encontrado."); setMultiSending(false); return; }
      const currentProf = selectedProf;
      if (!currentProf) { setMultiErro("Profissional atual não identificado."); setMultiSending(false); return; }
      const spec1 = (currentProf.specialty || "").trim().toLowerCase();
      const spec2 = (secondProf.specialty || "").trim().toLowerCase();
      if (spec1 && spec2 && spec1 === spec2) {
        setMultiErro(`Bloqueado: ${currentProf.name} e ${secondProf.name} são da mesma especialidade (${currentProf.specialty}). Para Atendimento Multi, os profissionais devem ser de especialidades diferentes.`);
        setMultiSending(false);
        return;
      }

      // Se o appointment é virtual (projeção), materializar antes de prosseguir
      let realId = multiApt.id;
      if (multiApt.id < 0 && selectedProfId) {
        const mat = await materializeVirtualAppointment({
          patientId: multiApt.patientId,
          professionalId: parseInt(selectedProfId),
          date: multiApt.date,
          time: multiApt.time,
          recurrenceGroupId: multiApt.recurrenceGroupId,
          frequency: (multiApt.frequency as "semanal" | "quinzenal" | "mensal") ?? "semanal",
          notes: multiApt.notes,
        });
        realId = mat.id;
      }

      await createAppointments({
        patientId: multiApt.patientId,
        professionalId: secondProf.id,
        date: multiApt.date,
        time: multiApt.time,
        notes: `Atendimento Multi com ${currentProf.name} (${currentProf.specialty || "—"})`,
        frequency: (multiApt.frequency as "semanal" | "quinzenal" | "mensal") ?? "semanal",
      });
      // Marca o appointment original como Multi (propaga para toda a recorrência via DB)
      await updateAppointment(realId, { notes: `Atendimento Multi com ${secondProf.name} (${secondProf.specialty || "—"})` });
      await logNotificacao(multiApt, `Atendimento Multi — ${secondProf.name} (${secondProf.specialty || "—"}) adicionado ao horário de ${currentProf.name}`);
      setMultiApt(null);
      toast({ title: "Atendimento Multi criado", description: `${secondProf.name} adicionado ao horário de ${multiApt.patientName} às ${multiApt.time}.` });
      fetchAppointments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha inesperada.";
      toast({ title: "Erro ao criar Atendimento Multi", description: msg, variant: "destructive" });
    } finally {
      setMultiSending(false);
    }
  };

  // ── Alterar Periodicidade (Frequência) ──
  const handleChangeFrequency = async (apt: Appointment, newFreq: "semanal" | "quinzenal" | "mensal") => {
    if ((apt.frequency ?? "semanal") === newFreq) return;
    setFreqSending(true);
    try {
      if (apt.recurrenceGroupId) {
        await updateRecurrenceFrequency(apt.recurrenceGroupId, newFreq);
      } else if (apt.id > 0) {
        await updateAppointment(apt.id, { frequency: newFreq });
      }
      await logNotificacao(apt, `Periodicidade alterada para ${newFreq}`);
      toast({ title: "Periodicidade alterada", description: `${apt.patientName} agora é ${newFreq}.` });
      fetchAppointments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha inesperada.";
      toast({ title: "Erro ao alterar periodicidade", description: msg, variant: "destructive" });
    } finally {
      setFreqSending(false);
    }
  };

  // ── Remanejar (definitivo) / Remarcar (pontual) ──
  const handleStartRemanejar = (apt: Appointment) => {
    setActionMenuId(null);
    setRemanejFlow({ apt, kind: "remanejar", step: "slot", weekRef });
    setRemanejDone(false);
  };

  const handleStartRemarcar = (apt: Appointment) => {
    setActionMenuId(null);
    setRemanejFlow({ apt, kind: "remarcar", step: "slot", weekRef: new Date(apt.date + "T12:00:00") });
    setRemanejDone(false);
  };

  const handlePickRemanejSlot = (newDate: string, newTime: string) => {
    if (!remanejFlow) return;
    setRemanejFlow({ ...remanejFlow, step: "carla", newDate, newTime });
  };

  const confirmRemanejar = async (notifyCarla: boolean) => {
    if (!remanejFlow?.newDate || !remanejFlow?.newTime) return;
    const isRemarcar = remanejFlow.kind === "remarcar";
    const newStatus = isRemarcar ? "remarcado" : "remanejado";
    const acao = isRemarcar ? "Remarcado" : "Remanejado";
    setRemanejSending(true);
    try {
      await updateAppointment(remanejFlow.apt.id, {
        date: remanejFlow.newDate,
        time: remanejFlow.newTime,
        status: newStatus,
      });
      setAppointments(prev => prev.map(a =>
        a.id === remanejFlow.apt.id
          ? { ...a, date: remanejFlow.newDate!, time: remanejFlow.newTime!, status: newStatus }
          : a
      ));
      if (notifyCarla && remanejFlow.apt.guardianPhone) {
        const dayLabel = weekDays.find(d => format(d, "yyyy-MM-dd") === remanejFlow.newDate);
        const dayStr = dayLabel ? format(dayLabel, "EEEE dd/MM", { locale: ptBR }) : remanejFlow.newDate;
        await fetch("/api/whatsapp/cancel-notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            guardianPhone: remanejFlow.apt.guardianPhone,
            guardianName: remanejFlow.apt.guardianName || "Responsável",
            patientName: remanejFlow.apt.patientName || "Paciente",
            professionalName: selectedProf?.name || "",
            remanejadoPara: `${dayStr} às ${remanejFlow.newTime}`,
          }),
        });
      }
      await logNotificacao(
        { ...remanejFlow.apt, date: remanejFlow.newDate, time: remanejFlow.newTime },
        acao
      );
      setRemanejDone(true);
    } catch (err: any) {
      const raw = String(err?.message ?? "");
      if (raw.includes("JA_REMANEJADO_HOJE")) {
        toast({
          title: "🚫 Limite diário",
          description: `${remanejFlow.apt.patientName ?? "Este paciente"} já foi ${acao.toLowerCase()} hoje. Tente novamente amanhã.`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Erro", description: `Não foi possível ${acao.toLowerCase()}.`, variant: "destructive" });
      }
    } finally {
      setRemanejSending(false);
    }
  };

  // ── Cancel notification (Carla) ──
  const sendCancelNotification = async () => {
    if (!cancelDialog) return;
    const { apt, profName } = cancelDialog;
    if (!apt.guardianPhone) {
      toast({ title: "Sem telefone", description: "O responsável não tem telefone cadastrado.", variant: "destructive" });
      return;
    }
    setNotifySending(true);
    try {
      const res = await fetch("/api/whatsapp/cancel-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guardianPhone: apt.guardianPhone,
          guardianName: apt.guardianName || "Responsável",
          patientName: apt.patientName || "Paciente",
          professionalName: profName,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setNotifyDone(true);
        toast({ title: "Mensagem enviada!", description: `Carla avisou o responsável de ${apt.patientName}.` });
      } else {
        toast({ title: "Erro no envio", description: data.error || "Tente novamente.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Bot offline", description: "O WhatsApp não está conectado ainda.", variant: "destructive" });
    } finally {
      setNotifySending(false);
    }
  };

  // Expande recorrência: projeta agendamentos recorrentes em semanas sem linha real no banco.
  // Depois filtra: se frequência é quinzenal/mensal, esconde "agendado" nas semanas erradas.
  const expanded = applyFrequencyFilter(expandRecurrence(appointments, weekDates), weekDates);

  // Fase 5A: slots em grupo — um mesmo (date,time,profissional) pode ter varios pacientes.
  const getApts = (date: string, time: string) =>
    expanded.filter(a => a.date === date && a.time === time);
  const selectedProf = professionals?.find(p => String(p.id) === selectedProfId);
  const isPaula = selectedProf?.name?.toLowerCase().includes("paula");

  // Slots disponiveis para remanejar = sem qualquer paciente (vazio de verdade).
  const availableSlots = weekDates.flatMap(date =>
    TIME_SLOTS.filter(t => (isPaula || t !== "12:10") && getApts(date, t).length === 0)
              .map(time => ({ date, time }))
  );

  // ── Modal week for Remarcar (navigable) ──
  const modalWeekStart = remanejFlow?.kind === "remarcar" && remanejFlow.weekRef
    ? startOfWeek(remanejFlow.weekRef, { weekStartsOn: 1 })
    : startOfWeek(weekRef, { weekStartsOn: 1 });
  const modalWeekDays = Array.from({ length: 5 }, (_, i) => addDays(modalWeekStart, i));
  const modalWeekDates = modalWeekDays.map(d => format(d, "yyyy-MM-dd"));
  const modalAvailableSlots = remanejFlow?.kind === "remarcar"
    ? modalWeekDates.flatMap(date =>
        TIME_SLOTS.filter(t => (isPaula || t !== "12:10") && getApts(date, t).length === 0)
                  .map(time => ({ date, time }))
      )
    : availableSlots;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Agenda Semanal</h1>
          <p className="text-muted-foreground mt-1">
            Grade semanal — {weekDays.length > 0 && `${format(weekDays[0], "dd/MM")} a ${format(weekDays[4], "dd/MM/yyyy")}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrevWeek}
            className="w-9 h-9 rounded-xl border border-border bg-muted/40 hover:bg-primary/10 hover:border-primary/40 text-muted-foreground hover:text-primary transition-colors flex items-center justify-center"
            aria-label="Semana anterior"
            title="Semana anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={goThisWeek}
            className="text-xs text-primary hover:underline font-semibold px-2"
            title="Voltar para esta semana"
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={goNextWeek}
            className="w-9 h-9 rounded-xl border border-border bg-muted/40 hover:bg-primary/10 hover:border-primary/40 text-muted-foreground hover:text-primary transition-colors flex items-center justify-center"
            aria-label="Próxima semana"
            title="Próxima semana"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <Link href="/agenda-profissionais">
            <Button variant="outline" className="gap-2 text-sm">
              <ExternalLink className="w-4 h-4" /> Portal do Profissional
            </Button>
          </Link>
        </div>
      </div>

      <Card className="p-5 flex flex-col sm:flex-row items-start sm:items-end gap-4">
        <div className="flex-1">
          <Label className="mb-2 block">Profissional</Label>
          <Select value={selectedProfId} onChange={e => handleProfChange(e.target.value)}>
            <option value="">Selecione o profissional...</option>
            {professionals?.map(p => <option key={p.id} value={p.id}>{p.name} – {p.specialty}</option>)}
          </Select>
        </div>
        {selectedProfId && !canView && (
          <div className="flex-1">
            <Label className="mb-2 block flex items-center gap-1"><Lock className="w-3 h-3" /> PIN de acesso (4 dígitos)</Label>
            <div className="flex gap-2">
              <input
                type="password" maxLength={4} value={pinInput}
                onChange={e => setPinInput(e.target.value.replace(/\D/, ""))}
                onKeyDown={e => e.key === "Enter" && verifyPin()}
                placeholder="••••"
                className="border border-border rounded-xl px-3 py-2 w-28 text-center font-mono text-lg tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <Button onClick={verifyPin} disabled={pinInput.length !== 4 || pinLoading}>
                {pinLoading ? "..." : "Entrar"}
              </Button>
            </div>
            {pinError && <p className="text-destructive text-sm mt-1">{pinError}</p>}
          </div>
        )}
        {canView && selectedProfId && (
          <div className={`flex items-center gap-2 font-semibold text-sm px-4 py-2 rounded-xl border ${isAdmin ? "text-blue-700 bg-blue-50 border-blue-200" : "text-green-600 bg-green-50 border-green-200"}`}>
            <ShieldCheck className="w-4 h-4" />
            {isAdmin ? "Administrador – Acesso Total" : "Acesso liberado"}
          </div>
        )}
      </Card>

      {!selectedProfId ? (
        <Card className="p-16 text-center">
          <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-bold">Selecione um profissional</p>
          <p className="text-muted-foreground">
            {isAdmin ? "Escolha o profissional para visualizar a grade." : "Escolha o profissional e informe o PIN para visualizar a grade."}
          </p>
        </Card>
      ) : !canView ? (
        <Card className="p-16 text-center">
          <Lock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-bold">Informe o PIN</p>
          <p className="text-muted-foreground">Digite o PIN de 4 dígitos do profissional para acessar a agenda.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {selectedProf && (
            <div className="px-6 py-4 border-b border-border bg-primary/5">
              <p className="font-bold text-foreground text-lg">{selectedProf.name}</p>
              <p className="text-sm text-muted-foreground">{selectedProf.specialty} — Agendamento recorrente automático (52 semanas)</p>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left" style={{ tableLayout: "fixed" }}>
              <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border">
                <tr>
                  <th className="px-2 py-2 sticky left-0 bg-secondary/90 backdrop-blur z-10 border-r border-border" style={{ width: "60px" }}>Horário</th>
                  {weekDays.map((d, i) => (
                    <th key={i} className="px-1 py-2 text-center">
                      <span className="font-bold text-foreground capitalize text-sm">{format(d, "EEE", { locale: ptBR })}</span>
                      <div className="font-normal text-xs">{format(d, "dd/MM")}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TIME_SLOTS.map(time => {
                  const isLunch = time === "12:10" && !isPaula;
                  return (
                    <tr key={time} className="border-b border-border hover:bg-secondary/10 transition-colors">
                      <td className="px-2 py-2 font-display font-bold text-primary text-sm sticky left-0 bg-card/90 backdrop-blur z-10 border-r border-border">{time}</td>
                      {isLunch ? (
                        <td colSpan={5} className="px-4 py-3 bg-slate-50/50 text-center text-muted-foreground italic font-medium">Almoço — Pausa</td>
                      ) : (
                        weekDates.map((date, i) => {
                          const apts = getApts(date, time);
                          const isGroup = apts.length > 1;
                          return (
                            <td key={i} className="px-1.5 py-1.5 relative align-top">
                              {apts.length > 0 ? (
                                <div className="flex flex-col gap-1.5">
                                  {isGroup && (
                                    <span className="text-[9px] uppercase font-bold text-cyan-400 tracking-wider">
                                      · grupo ({apts.length})
                                    </span>
                                  )}
                                  {apts.map(apt => {
                                    const isDesmarcado = apt.status?.toLowerCase() === "desmarcado";
                                    const isAtendimento = apt.status?.toLowerCase() === "atendimento" || apt.status?.toLowerCase() === "presente";
                                    const isRemarcado = apt.status?.toLowerCase() === "remarcado";
                                    const isRemanejado = apt.status?.toLowerCase() === "remanejado";
                                    const isRescheduled = isRemarcado || isRemanejado;
                                    const isFaltaJustificada = apt.status?.toLowerCase() === "falta_justificada" || apt.status?.toLowerCase() === "justificado" || apt.status?.toLowerCase() === "abonado";
                                    const isFaltaNaoJustificada = apt.status?.toLowerCase() === "falta_nao_justificada" || apt.status?.toLowerCase() === "ausente";
                                    const isMulti = !!(apt.notes && apt.notes.startsWith("Atendimento Multi com "));
                                    const multiPartner = isMulti ? apt.notes!.replace("Atendimento Multi com ", "").replace(/\s*\(.*\)$/, "") : null;
                                    const multiPartnerSpec = isMulti ? (apt.notes!.match(/\(([^)]+)\)\s*$/) || [])[1] || null : null;
                                    const isMenuOpen = actionMenuId === apt.id;
                                    const isPastDate = date < today;
                                    const isGhost = !apt.patientName || apt.patientName.trim() === "";
                                    return (
                                <div key={apt.id} className="relative" ref={isMenuOpen ? menuRef : null}>
                                  {/* Appointment block */}
                                  <div
                                    onClick={() => setActionMenuId(isMenuOpen ? null : apt.id)}
                                    className={cn(
                                      "p-2 rounded-xl border flex flex-col gap-1 cursor-pointer transition-all select-none",
                                      isGhost && "bg-amber-950/20 border-amber-500/60 animate-pulse",
                                      !isGhost && isDesmarcado && "bg-red-950/10 border-red-500/40",
                                      !isGhost && isFaltaNaoJustificada && "bg-red-950/10 border-red-500/40",
                                      !isGhost && isAtendimento && "bg-green-950/10 border-green-400/40",
                                      !isGhost && isRemarcado && "bg-yellow-950/10 border-yellow-400/40",
                                      !isGhost && isRemanejado && "bg-orange-950/10 border-orange-400/40",
                                      !isGhost && isFaltaJustificada && "border-cyan-500/40",
                                      !isGhost && isMulti && !isDesmarcado && !isRescheduled && "border-violet-400/60 bg-violet-950/10",
                                      !isGhost && !isDesmarcado && !isAtendimento && !isRescheduled && !isFaltaJustificada && !isFaltaNaoJustificada && !isMulti && "bg-card border-border/50",
                                      isMenuOpen && "ring-2 ring-primary/40"
                                    )}
                                    style={{
                                      boxShadow: isDesmarcado || isFaltaNaoJustificada
                                        ? "0 0 8px rgba(239,68,68,0.25)"
                                        : isAtendimento
                                        ? "0 0 8px rgba(34,197,94,0.2)"
                                        : isRemarcado
                                        ? "0 0 8px rgba(250,204,21,0.2)"
                                        : isRemanejado
                                        ? "0 0 8px rgba(249,115,22,0.2)"
                                        : isFaltaJustificada
                                        ? "0 0 8px rgba(6,182,212,0.25)"
                                        : "none",
                                      background: isFaltaJustificada ? "rgba(6,182,212,0.04)" : undefined,
                                    }}
                                  >
                                    <span className="font-bold text-foreground truncate text-xs leading-tight" title={apt.patientName || undefined}>
                                      {apt.prontuario && <span className="text-cyan-400 font-extrabold mr-1">[{apt.prontuario}]</span>}
                                      {isGhost ? (
                                        <span className="text-amber-400">⚠ Sem dados</span>
                                      ) : (
                                        abbreviateName(apt.patientName) || `#${apt.patientId}`
                                      )}
                                    </span>
                                    <span className={cn("px-1.5 py-0.5 rounded text-[9px] uppercase font-bold w-max", getStatusColor(apt.status))}>
                                      {getStatusLabel(apt.status)}
                                    </span>
                                    {apt.paused && (
                                      <span className="px-1.5 py-0.5 rounded text-[9px] uppercase font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center gap-0.5">
                                        <Snowflake className="w-2.5 h-2.5" /> Pausado
                                      </span>
                                    )}
                                    {isDesmarcado && (
                                      <span className="text-[9px] text-orange-400 font-semibold">⚠ só esta data</span>
                                    )}
                                    {isRemanejado && (
                                      <span className="text-[9px] text-orange-400 font-semibold">↩ remanejado</span>
                                    )}
                                    {isRemarcado && (
                                      <span className="text-[9px] text-yellow-400 font-semibold">✎ remarcado</span>
                                    )}
                                    {isMulti && multiPartner && (
                                      <span className="text-[9px] text-violet-400 font-semibold flex items-center gap-0.5 flex-wrap">
                                        <Users className="w-2.5 h-2.5 shrink-0" /> Multi: {multiPartner}
                                      </span>
                                    )}
                                    {(apt.recurrenceGroupId || isMulti) && !isDesmarcado && !isRescheduled && (
                                      <span className="text-[9px] text-muted-foreground/50">
                                        {apt.frequency === "quinzenal" ? "↺ quinzenal" : apt.frequency === "mensal" ? "↺ mensal" : "↺ semanal"}
                                      </span>
                                    )}
                                    {/* Psicologia Parental: show guardian/mother name */}
                                    {apt.guardianName && selectedProf?.specialty?.toLowerCase().includes("parental") && (
                                      <span className="text-[9px] text-pink-400/80 font-semibold truncate">
                                        Mãe: {apt.guardianName}
                                      </span>
                                    )}
                                  </div>

                                  {/* Action menu */}
                                  {isMenuOpen && (
                                    <div
                                      className="absolute z-50 top-full mt-1 left-0 w-52 rounded-2xl overflow-hidden shadow-2xl"
                                      style={{
                                        background: "rgba(2,4,8,0.97)",
                                        border: "1px solid rgba(255,255,255,0.08)",
                                        backdropFilter: "blur(20px)",
                                        padding: "10px",
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: "6px",
                                      }}
                                    >
                                      <p className="text-[10px] text-white/40 uppercase font-bold mb-1 px-1">Ações — {apt.patientName || `Agendamento #${apt.id}`}</p>
                                      {isGhost && (
                                        <p className="text-[9px] text-amber-400/80 font-semibold px-1 mb-1">⚠ Paciente sem dados — clique em Excluir para limpar</p>
                                      )}
                                      {isPastDate && isAdmin && (
                                        <p className="text-[9px] text-amber-400/80 font-semibold px-1 mb-1">⏪ Ajuste Retroativo (Admin)</p>
                                      )}

                                      <button style={NEON.green} onClick={() => handleAtendimento(apt)}>
                                        <Activity className="w-3.5 h-3.5" /> Em Atendimento
                                      </button>

                                      {isAdmin && (
                                        <>
                                          <button style={NEON.yellow} onClick={() => handleFaltaJustificada(apt)}>
                                            <CheckCircle className="w-3.5 h-3.5" /> Falta Justificada
                                          </button>
                                          <button style={NEON.red} onClick={() => handleFaltaNaoJustificada(apt)}>
                                            <AlertTriangle className="w-3.5 h-3.5" /> Falta N. Justificada
                                          </button>
                                          <div style={{ height: "1px", background: "rgba(255,255,255,0.07)", margin: "2px 0" }} />
                                          <button style={NEON.red} onClick={() => handleDesmarcado(apt, selectedProf?.name || "")}>
                                            <AlertTriangle className="w-3.5 h-3.5" /> Desmarcar
                                          </button>
                                          {(isFaltaJustificada || isFaltaNaoJustificada) && (
                                            <>
                                              <div style={{ height: "1px", background: "rgba(255,255,255,0.07)", margin: "2px 0" }} />
                                              <button style={NEON.cyan} onClick={() => handleCancelarFalta(apt)}>
                                                <Undo2 className="w-3.5 h-3.5" /> Cancelar Falta
                                              </button>
                                            </>
                                          )}
                                        </>
                                      )}

                                      <button style={NEON.orange} onClick={() => handleStartRemanejar(apt)}>
                                        <RotateCcw className="w-3.5 h-3.5" /> Remanejar
                                      </button>
                                      <button style={NEON.yellow} onClick={() => handleStartRemarcar(apt)}>
                                        <CalendarIcon className="w-3.5 h-3.5" /> Remarcar
                                      </button>

                                      {/* ── Periodicidade (Frequência) Cards ── */}
                                      {(apt.recurrenceGroupId || isMulti) && isAdmin && (
                                        <>
                                          <div style={{ height: "1px", background: "rgba(255,255,255,0.07)", margin: "2px 0" }} />
                                          <p className="text-[9px] text-white/40 uppercase font-bold px-1">Periodicidade</p>
                                          <div className="grid grid-cols-3 gap-1">
                                            {(["semanal", "quinzenal", "mensal"] as const).map(freq => {
                                              const isActive = (apt.frequency ?? "semanal") === freq;
                                              const labels: Record<string, { label: string; desc: string }> = {
                                                semanal: { label: "Semanal", desc: "Toda semana" },
                                                quinzenal: { label: "Quinzenal", desc: "A cada 14 dias" },
                                                mensal: { label: "Mensal", desc: "1x por mês" },
                                              };
                                              return (
                                                <button
                                                  key={freq}
                                                  disabled={freqSending}
                                                  onClick={(e) => { e.stopPropagation(); handleChangeFrequency(apt, freq); }}
                                                  className="rounded-lg p-1.5 text-center transition-all"
                                                  style={{
                                                    background: isActive ? "rgba(0,240,255,0.12)" : "rgba(255,255,255,0.03)",
                                                    border: isActive ? "1px solid rgba(0,240,255,0.5)" : "1px solid rgba(255,255,255,0.08)",
                                                    color: isActive ? "#67e8f9" : "rgba(255,255,255,0.5)",
                                                    boxShadow: isActive ? "0 0 8px rgba(0,240,255,0.2)" : "none",
                                                    cursor: freqSending ? "wait" : "pointer",
                                                    opacity: freqSending ? 0.5 : 1,
                                                  }}
                                                >
                                                  <Repeat className="w-3 h-3 mx-auto mb-0.5" />
                                                  <span className="text-[9px] font-bold block">{labels[freq].label}</span>
                                                  <span className="text-[8px] block opacity-60">{labels[freq].desc}</span>
                                                </button>
                                              );
                                            })}
                                          </div>
                                        </>
                                      )}

                                      <div style={{ height: "1px", background: "rgba(255,255,255,0.07)", margin: "2px 0" }} />
                                      {apt.paused ? (
                                        <button style={NEON.green} onClick={() => handleUnpause(apt)}>
                                          <Play className="w-3.5 h-3.5" /> Retomar Atendimento
                                        </button>
                                      ) : (
                                        <button style={NEON.cyan} onClick={() => handleOpenPauseModal(apt)}>
                                          <Snowflake className="w-3.5 h-3.5" /> Pausar Atendimento
                                        </button>
                                      )}

                                      <div style={{ height: "1px", background: "rgba(255,255,255,0.07)", margin: "2px 0" }} />
                                      <p className="text-[9px] text-white/40 uppercase font-bold px-1">Saída</p>
                                      <button style={NEON.red} onClick={() => handleSaida(apt, "Alta")}>
                                        <LogOut className="w-3.5 h-3.5" /> Dar Alta
                                      </button>
                                      <button style={NEON.red} onClick={() => handleSaida(apt, "Desistência")}>
                                        <UserX className="w-3.5 h-3.5" /> Desistência
                                      </button>
                                      <button style={NEON.red} onClick={() => handleSaida(apt, "Óbito")}>
                                        <XOctagon className="w-3.5 h-3.5" /> Óbito
                                      </button>

                                      <div style={{ height: "1px", background: "rgba(255,255,255,0.07)", margin: "2px 0" }} />
                                      <button style={NEON.fuchsia} onClick={() => handleEncaminhamento(apt)}>
                                        <ArrowRightLeft className="w-3.5 h-3.5" /> Encaminhamento Interno
                                      </button>

                                      {isAdmin && (
                                        <button style={NEON.cyan} onClick={() => handleMultiAtendimento(apt)}>
                                          <UserPlus className="w-3.5 h-3.5" /> Atendimento Multi
                                        </button>
                                      )}

                                      {isAdmin && (
                                        <>
                                          <div style={{ height: "1px", background: "rgba(255,255,255,0.07)", margin: "2px 0" }} />
                                          <p className="text-[9px] text-white/40 uppercase font-bold px-1">Admin</p>
                                          <button style={NEON.red} onClick={() => handleExcluirAdmin(apt)}>
                                            <Trash2 className="w-3.5 h-3.5" /> Excluir Agendamento
                                          </button>
                                        </>
                                      )}

                                      {!isAdmin && (
                                        <p className="text-[9px] text-white/30 px-1 mt-1 italic leading-tight">
                                          Faltas e desmarcações ficam na Recepção.
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
                                    );
                                  })}
                                  {/* Admin pode empilhar outro paciente no mesmo slot (atendimento em grupo). */}
                                  {isAdmin && (
                                    <button
                                      onClick={() => setBookingSlot({ date, time })}
                                      className="w-full text-[10px] font-semibold py-1.5 rounded-lg border border-dashed border-cyan-500/30 text-cyan-400/70 hover:text-cyan-300 hover:border-cyan-400/60 hover:bg-cyan-500/5 transition-colors"
                                    >
                                      + adicionar ao grupo
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <button
                                  onClick={() => setBookingSlot({ date, time })}
                                  className="w-full h-full min-h-[54px] flex items-center justify-center border-2 border-dashed border-border/40 rounded-xl text-muted-foreground/40 hover:border-primary/40 hover:text-primary/60 hover:bg-primary/5 transition-colors text-[10px] font-semibold cursor-pointer"
                                >
                                  + Agendar
                                </button>
                              )}
                            </td>
                          );
                        })
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Resumo de Hoje ── */}
      {canView && selectedProfId && (
        <Card className="p-6">
          <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" /> Resumo de Hoje — {format(new Date(), "dd/MM/yyyy")}
          </h3>
          <div className="space-y-2">
            {TIME_SLOTS.filter(t => isPaula || t !== "12:10").map(time => {
              const apts = getApts(today, time);
              const apt = apts[0] ?? null;
              return (
                <div key={time} className={cn("flex items-center gap-4 px-4 py-3 rounded-xl text-sm", apt ? "bg-primary/10 border border-primary/20" : "bg-secondary/50 border border-border/50")}>
                  <span className="font-bold text-primary w-14 shrink-0">{time}</span>
                  <span className={apt ? "font-semibold text-foreground" : "text-muted-foreground italic"}>
                    {apt ? (apt.patientName || `Paciente #${apt.patientId}`) : "Livre"}
                  </span>
                  {apt && <span className={cn("ml-auto px-2 py-0.5 rounded text-[10px] uppercase font-bold", getStatusColor(apt.status))}>{getStatusLabel(apt.status)}</span>}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── BookingModal ── */}
      {bookingSlot && selectedProfId && (
        <BookingModal
          date={bookingSlot.date}
          time={bookingSlot.time}
          professionalId={Number(selectedProfId)}
          professionalName={selectedProf?.name || ""}
          professionalSpecialty={selectedProf?.specialty || ""}
          adminMode={isAdmin}
          onClose={() => setBookingSlot(null)}
          onSuccess={() => {
            setBookingSlot(null);
            fetchAppointments();
            toast({ title: "Agendado!", description: "Sessão(ões) criada(s) com sucesso." });
          }}
        />
      )}

      {/* ── Modal de Exclusão Administrativa (sem vínculo clínico) ── */}
      {excluirConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl" style={{ background: "rgba(5,0,0,0.97)", border: "1px solid rgba(239,68,68,0.3)" }}>
            <div className="px-6 py-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(239,68,68,0.15)", border: "1px solid #ef4444" }}>
                  <Trash2 className="w-5 h-5" style={{ color: "#f87171" }} />
                </div>
                <div>
                  <p className="font-bold" style={{ color: "#f87171", textShadow: "0 0 8px rgba(248,113,113,0.8)" }}>Excluir Agendamento</p>
                  <p className="text-xs text-white/50">Limpeza administrativa — sem vínculo clínico</p>
                </div>
              </div>
              <p className="text-sm text-white/80 mb-1">
                <strong className="text-white">{excluirConfirm.patientName}</strong> — {excluirConfirm.date} às {excluirConfirm.time}.
              </p>
              <p className="text-xs text-white/60 mt-2">
                O horário voltará a ficar disponível (+ Agendar). <strong className="text-white/80">Não</strong> gera alta, falta nem registro no prontuário.
              </p>
              {excluirConfirm.recurrenceGroupId && (
                <p className="text-xs text-orange-400/80 mt-2">
                  ⚠ Todos os horários de {excluirConfirm.date} em diante serão excluídos. O histórico anterior será preservado.
                </p>
              )}
              <div className="flex gap-3 mt-4">
                <button
                  onClick={confirmExcluirAdmin}
                  disabled={excluirSending}
                  style={{ ...NEON.red, flex: 1, justifyContent: "center", padding: "10px", opacity: excluirSending ? 0.4 : 1, cursor: excluirSending ? "not-allowed" : "pointer" }}
                >
                  <Trash2 className="w-4 h-4" />
                  {excluirSending ? "Excluindo..." : "Confirmar Exclusão"}
                </button>
                <Button variant="outline" className="flex-1 border-white/10 text-white/60 hover:text-white hover:bg-white/5" onClick={() => setExcluirConfirm(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de Pausa Temporária ── */}
      {pauseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl" style={{ background: "rgba(5,0,20,0.97)", border: "1px solid rgba(56,189,248,0.3)" }}>
            <div className="px-6 py-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(56,189,248,0.15)", border: "1px solid #38bdf8" }}>
                  <Snowflake className="w-5 h-5" style={{ color: "#7dd3fc" }} />
                </div>
                <div>
                  <p className="font-bold" style={{ color: "#7dd3fc", textShadow: "0 0 8px rgba(125,211,252,0.8)" }}>Pausar Atendimento</p>
                  <p className="text-xs text-white/50">Suspender temporariamente sem cancelar</p>
                </div>
              </div>
              <p className="text-sm text-white/80 mb-3">
                <strong className="text-white">{pauseModal.patientName}</strong> — {pauseModal.date} às {pauseModal.time}.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="text-[11px] text-white/50 uppercase font-bold mb-1 block">Motivo da Pausa</label>
                  <input
                    type="text"
                    value={pauseReason}
                    onChange={e => setPauseReason(e.target.value)}
                    placeholder="Ex: Licença, Viagem, Transição de profissional..."
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-white/50 uppercase font-bold mb-1 block">Data de Retorno Prevista (opcional)</label>
                  <input
                    type="date"
                    value={pauseReturnDate}
                    onChange={e => setPauseReturnDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-4">
                <button
                  onClick={confirmPause}
                  disabled={pauseSending}
                  style={{ ...NEON.cyan, flex: 1, justifyContent: "center", padding: "10px", opacity: pauseSending ? 0.4 : 1, cursor: pauseSending ? "not-allowed" : "pointer" }}
                >
                  <Snowflake className="w-4 h-4" />
                  {pauseSending ? "Pausando..." : "Confirmar Pausa"}
                </button>
                <Button variant="outline" className="flex-1 border-white/10 text-white/60 hover:text-white hover:bg-white/5" onClick={() => setPauseModal(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de Saída (Alta / Óbito / Desistência) ── */}
      {altaConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl" style={{ background: "rgba(5,0,0,0.97)", border: "1px solid rgba(239,68,68,0.3)" }}>
            <div className="px-6 py-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(239,68,68,0.15)", border: "1px solid #ef4444" }}>
                  {saidaTipo === "Alta" && <LogOut className="w-5 h-5" style={{ color: "#f87171" }} />}
                  {saidaTipo === "Desistência" && <UserX className="w-5 h-5" style={{ color: "#f87171" }} />}
                  {saidaTipo === "Óbito" && <XOctagon className="w-5 h-5" style={{ color: "#f87171" }} />}
                </div>
                <div>
                  <p className="font-bold" style={{ color: "#f87171", textShadow: "0 0 8px rgba(248,113,113,0.8)" }}>{saidaTipo === "Alta" ? "Dar Alta" : saidaTipo}</p>
                  <p className="text-xs text-white/50">Ação permanente e irreversível</p>
                </div>
              </div>
              <p className="text-sm text-white/80 mb-1">
                <strong className="text-white">{altaConfirm.patientName}</strong> será removido da agenda deste profissional
                e da fila desta especialidade. Agendamentos em outras especialidades não serão afetados.
              </p>
              <p className="text-xs text-white/50 mt-1">Status global só será alterado se não houver outros atendimentos ativos.</p>
              {altaConfirm.recurrenceGroupId && (
                <p className="text-xs text-orange-400/80 mt-2">
                  ⚠ Este é um agendamento recorrente. Todos os próximos serão cancelados.
                </p>
              )}
              <div className="mt-4">
                <label className="block text-xs font-bold mb-1" style={{ color: "#f87171" }}>Motivo {saidaTipo === "Alta" ? "da Alta" : saidaTipo === "Óbito" ? "do Óbito" : "da Desistência"} *</label>
                <textarea
                  value={altaMotivo}
                  onChange={e => setAltaMotivo(e.target.value)}
                  placeholder={saidaTipo === "Alta" ? "Ex.: Melhora clínica, mudou de cidade..." : saidaTipo === "Óbito" ? "Ex.: Falecimento..." : "Ex.: Mudou de cidade, família desistiu..."}
                  rows={3}
                  className="w-full rounded-xl text-sm p-3 resize-none"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(239,68,68,0.3)", color: "#fff", outline: "none" }}
                  onFocus={e => { e.currentTarget.style.borderColor = "#ef4444"; e.currentTarget.style.boxShadow = "0 0 10px rgba(239,68,68,0.3)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "rgba(239,68,68,0.3)"; e.currentTarget.style.boxShadow = "none"; }}
                />
              </div>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={confirmSaida}
                  disabled={!altaMotivo.trim()}
                  style={{ ...NEON.red, flex: 1, justifyContent: "center", padding: "10px", opacity: altaMotivo.trim() ? 1 : 0.4, cursor: altaMotivo.trim() ? "pointer" : "not-allowed" }}
                >
                  {saidaTipo === "Alta" && <LogOut className="w-4 h-4" />}
                  {saidaTipo === "Desistência" && <UserX className="w-4 h-4" />}
                  {saidaTipo === "Óbito" && <XOctagon className="w-4 h-4" />}
                  Confirmar {saidaTipo}
                </button>
                <Button variant="outline" className="flex-1 border-white/10 text-white/60 hover:text-white hover:bg-white/5" onClick={() => { setAltaConfirm(null); setAltaMotivo(""); }}>
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Encaminhamento Interno Modal ── */}
      {encApt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setEncApt(null)}>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl" style={{ background: "rgba(5,0,5,0.97)", border: "1px solid rgba(192,38,211,0.3)" }} onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(192,38,211,0.15)", border: "1px solid #c026d3" }}>
                  <ArrowRightLeft className="w-5 h-5" style={{ color: "#e879f9" }} />
                </div>
                <div>
                  <p className="font-bold" style={{ color: "#e879f9", textShadow: "0 0 8px rgba(232,121,249,0.8)" }}>Encaminhamento Interno</p>
                  <p className="text-xs text-white/50">{encApt.patientName}</p>
                </div>
              </div>

              {encErro && (
                <div className="rounded-xl p-3 mb-4 text-sm font-semibold" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.4)", color: "#f87171" }}>
                  {encErro}
                </div>
              )}

              <div className="mb-4">
                <label className="block text-xs font-bold mb-1" style={{ color: "#e879f9" }}>Especialidade de Destino *</label>
                <select
                  value={encEspecialidade}
                  onChange={e => { setEncEspecialidade(e.target.value); setEncErro(""); }}
                  className="w-full rounded-xl text-sm p-3"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(192,38,211,0.3)", color: "#fff", outline: "none" }}
                  onFocus={e => { e.currentTarget.style.borderColor = "#c026d3"; e.currentTarget.style.boxShadow = "0 0 10px rgba(192,38,211,0.3)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "rgba(192,38,211,0.3)"; e.currentTarget.style.boxShadow = "none"; }}
                >
                  <option value="" style={{ background: "#0a000a" }}>Selecione...</option>
                  {SPECIALTIES.map(s => (
                    <option key={s} value={s} style={{ background: "#0a000a" }}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="mb-4">
                <label className="block text-xs font-bold mb-1" style={{ color: "#e879f9" }}>Motivo do Encaminhamento</label>
                <textarea
                  value={encMotivo}
                  onChange={e => setEncMotivo(e.target.value)}
                  placeholder="Descreva o motivo do encaminhamento..."
                  rows={3}
                  className="w-full rounded-xl text-sm p-3 resize-none"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(192,38,211,0.3)", color: "#fff", outline: "none" }}
                  onFocus={e => { e.currentTarget.style.borderColor = "#c026d3"; e.currentTarget.style.boxShadow = "0 0 10px rgba(192,38,211,0.3)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "rgba(192,38,211,0.3)"; e.currentTarget.style.boxShadow = "none"; }}
                />
              </div>

              <div className="mb-4">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={encManterAgenda}
                    onChange={e => setEncManterAgenda(e.target.checked)}
                    className="w-4 h-4 rounded accent-fuchsia-500"
                  />
                  <span className="text-xs font-semibold" style={{ color: encManterAgenda ? "#e879f9" : "#f87171" }}>
                    {encManterAgenda ? "Manter na minha agenda" : "Remover da minha agenda"}
                  </span>
                </label>
                <p className="text-[10px] text-white/40 mt-1 ml-6">
                  {encManterAgenda
                    ? "O paciente continuará nos seus horários atuais."
                    : "Os agendamentos futuros com este profissional serão removidos."}
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={confirmEncaminhamento}
                  disabled={!encEspecialidade || encSending}
                  style={{ ...NEON.fuchsia, flex: 1, justifyContent: "center", padding: "10px", opacity: encEspecialidade && !encSending ? 1 : 0.4, cursor: encEspecialidade && !encSending ? "pointer" : "not-allowed" }}
                >
                  <ArrowRightLeft className="w-4 h-4" /> {encSending ? "Encaminhando..." : "Confirmar Encaminhamento"}
                </button>
                <Button variant="outline" className="flex-1 border-white/10 text-white/60 hover:text-white hover:bg-white/5" onClick={() => setEncApt(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Atendimento Multi Modal ── */}
      {multiApt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setMultiApt(null)}>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl" style={{ background: "rgba(0,8,10,0.97)", border: "1px solid rgba(6,182,212,0.3)" }} onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(6,182,212,0.15)", border: "1px solid #06b6d4" }}>
                  <UserPlus className="w-5 h-5" style={{ color: "#67e8f9" }} />
                </div>
                <div>
                  <p className="font-bold" style={{ color: "#67e8f9", textShadow: "0 0 8px rgba(103,232,249,0.8)" }}>Atendimento Multi</p>
                  <p className="text-xs text-white/50">{multiApt.patientName} — {multiApt.time}</p>
                </div>
              </div>

              {multiErro && (
                <div className="rounded-xl p-3 mb-4 text-sm font-semibold" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.4)", color: "#f87171" }}>
                  {multiErro}
                </div>
              )}

              <div className="mb-4">
                <label className="block text-xs font-bold mb-1" style={{ color: "#67e8f9" }}>Segundo Profissional *</label>
                <select
                  value={multiProfId}
                  onChange={e => { setMultiProfId(e.target.value); setMultiErro(""); }}
                  className="w-full rounded-xl text-sm p-3"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(6,182,212,0.3)", color: "#fff", outline: "none" }}
                  onFocus={e => { e.currentTarget.style.borderColor = "#06b6d4"; e.currentTarget.style.boxShadow = "0 0 10px rgba(6,182,212,0.3)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "rgba(6,182,212,0.3)"; e.currentTarget.style.boxShadow = "none"; }}
                >
                  <option value="" style={{ background: "#000a0c" }}>Selecione o profissional...</option>
                  {professionals
                    .filter(p => String(p.id) !== selectedProfId)
                    .map(p => (
                      <option key={p.id} value={String(p.id)} style={{ background: "#000a0c" }}>
                        {p.name} — {p.specialty || "Sem especialidade"}
                      </option>
                    ))}
                </select>
              </div>

              <p className="text-[10px] text-white/40 mb-4 leading-relaxed">
                O horário ficará bloqueado na agenda de ambos os profissionais. Profissionais da mesma especialidade não são permitidos.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={confirmMultiAtendimento}
                  disabled={!multiProfId || multiSending}
                  style={{ ...NEON.cyan, flex: 1, justifyContent: "center", padding: "10px", opacity: multiProfId && !multiSending ? 1 : 0.4, cursor: multiProfId && !multiSending ? "pointer" : "not-allowed" }}
                >
                  <UserPlus className="w-4 h-4" /> {multiSending ? "Criando..." : "Confirmar Multi"}
                </button>
                <Button variant="outline" className="flex-1 border-white/10 text-white/60 hover:text-white hover:bg-white/5" onClick={() => setMultiApt(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Alerta de Ausência ── */}
      {absenceAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl" style={{
            background: absenceAlert.consecutive >= 3 ? "rgba(10,0,0,0.97)" : "rgba(10,8,0,0.97)",
            border: absenceAlert.consecutive >= 3 ? "1px solid rgba(239,68,68,0.5)" : "1px solid rgba(234,179,8,0.5)",
          }}>
            <div className="px-6 py-5 space-y-4">
              {/* Cabeçalho */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{
                  background: absenceAlert.consecutive >= 3 ? "rgba(239,68,68,0.15)" : "rgba(234,179,8,0.15)",
                  border: absenceAlert.consecutive >= 3 ? "1px solid #ef4444" : "1px solid #eab308",
                }}>
                  <span className="text-xl">{absenceAlert.consecutive >= 3 ? "🚨" : "⚠️"}</span>
                </div>
                <div>
                  <p className="font-bold text-base" style={{
                    color: absenceAlert.consecutive >= 3 ? "#f87171" : "#fde047",
                    textShadow: absenceAlert.consecutive >= 3 ? "0 0 8px rgba(248,113,113,0.8)" : "0 0 8px rgba(253,224,71,0.8)",
                  }}>
                    {absenceAlert.consecutive >= 3 ? "Protocolo de Gestão de Vagas" : "Alerta de Evasão"}
                  </p>
                  <p className="text-xs text-white/50">{absenceAlert.patientName}</p>
                </div>
              </div>

              {/* Mensagem principal */}
              <div className="rounded-xl p-4 text-sm text-white/85 leading-relaxed" style={{
                background: absenceAlert.consecutive >= 3 ? "rgba(239,68,68,0.08)" : "rgba(234,179,8,0.08)",
                border: absenceAlert.consecutive >= 3 ? "1px solid rgba(239,68,68,0.2)" : "1px solid rgba(234,179,8,0.2)",
              }}>
                {absenceAlert.consecutive >= 3 ? (
                  <>
                    <p className="font-bold text-white mb-2">
                      Paciente acumulou 3 faltas em {absenceAlert.professionalSpecialty?.toUpperCase() || "ESTA ESPECIALIDADE"}
                    </p>
                    <p>
                      Limite de <strong>3 ausências não justificadas</strong> atingido
                      {absenceAlert.professionalName ? <> com <strong>{absenceAlert.professionalName}</strong></> : null}.
                      Deseja <strong>dar alta nesta especialidade</strong>? Os próximos horários do paciente em {absenceAlert.professionalSpecialty || "esta área"} serão encerrados e a vaga será liberada. Outras especialidades do paciente continuam ativas.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-bold text-white mb-2">
                      Atenção: {absenceAlert.patientName} acumulou 2 faltas em {absenceAlert.professionalSpecialty || "esta especialidade"}
                      {absenceAlert.professionalName ? <> com {absenceAlert.professionalName}</> : null}
                    </p>
                    <p>Próxima ausência sem justificativa dispara protocolo de alta desta especialidade. Favor realizar contato de acolhimento com a família para entender o motivo (transporte/saúde) e reforçar a importância da continuidade.</p>
                  </>
                )}
              </div>

              {/* Alerta de vulnerabilidade */}
              {(absenceAlert.escolaPublica || absenceAlert.trabalhoNaRoca) && (
                <div className="rounded-xl p-3 text-xs text-cyan-300/90 leading-relaxed flex gap-2 items-start" style={{
                  background: "rgba(34,211,238,0.07)",
                  border: "1px solid rgba(34,211,238,0.2)",
                }}>
                  <span className="text-base flex-shrink-0">🔍</span>
                  <span>
                    <strong className="text-cyan-200">Olhar Especial — Vulnerabilidade Social:</strong> Este paciente possui indicadores de vulnerabilidade
                    {absenceAlert.trabalhoNaRoca && " (trabalho informal/rural)"}
                    {absenceAlert.escolaPublica && " (rede pública de ensino)"}
                    . Verificar se há dificuldade com transporte municipal antes de acionar o protocolo.
                  </span>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                {absenceAlert.consecutive >= 3 ? (
                  <>
                    <button
                      onClick={() => setAbsenceAlert(null)}
                      style={{ ...NEON.yellow, flex: 1, justifyContent: "center", padding: "10px" }}
                    >
                      Manter
                    </button>
                    <button
                      onClick={() => {
                        const apt = absenceAlert.apt;
                        setAbsenceAlert(null);
                        setAltaConfirm(apt);
                      }}
                      style={{ ...NEON.red, flex: 1, justifyContent: "center", padding: "10px" }}
                    >
                      <AlertTriangle className="w-4 h-4" /> Dar Alta em {absenceAlert.professionalSpecialty || "esta especialidade"}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setAbsenceAlert(null)}
                    style={{ ...NEON.green, flex: 1, justifyContent: "center", padding: "10px" }}
                  >
                    <CheckCircle className="w-4 h-4" /> Entendido — vou cobrar a família
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Remanejar / Remarcar: Pick Slot ── */}
      {remanejFlow?.step === "slot" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl" style={{ background: "rgba(0,5,15,0.97)", border: "1px solid rgba(59,130,246,0.3)" }}>
            <div className="px-6 py-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "rgba(59,130,246,0.15)", border: "1px solid #3b82f6" }}>
                    <RotateCcw className="w-4 h-4" style={{ color: "#60a5fa" }} />
                  </div>
                  <div>
                    <p className="font-bold" style={{ color: "#60a5fa", textShadow: "0 0 8px rgba(96,165,250,0.8)" }}>
                      {remanejFlow.kind === "remarcar" ? "Remarcar" : "Remanejar"}
                    </p>
                    <p className="text-xs text-white/50">{remanejFlow.apt.patientName}</p>
                  </div>
                </div>
                <button onClick={() => setRemanejFlow(null)} className="text-white/30 hover:text-white/70"><X className="w-5 h-5" /></button>
              </div>

              {remanejFlow.kind === "remarcar" && (
                <div className="flex items-center justify-between mb-3 px-1">
                  <button
                    type="button"
                    onClick={() => setRemanejFlow({ ...remanejFlow, weekRef: addDays(remanejFlow.weekRef, -7) })}
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)" }}
                    aria-label="Semana anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <p className="text-xs font-bold text-white/80 text-center">
                    {format(modalWeekDays[0], "dd/MM")} a {format(modalWeekDays[4], "dd/MM/yyyy")}
                  </p>
                  <button
                    type="button"
                    onClick={() => setRemanejFlow({ ...remanejFlow, weekRef: addDays(remanejFlow.weekRef, 7) })}
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)" }}
                    aria-label="Próxima semana"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              <p className="text-sm text-white/60 mb-4">
                {remanejFlow.kind === "remarcar"
                  ? "Navegue entre as semanas e escolha um horário livre:"
                  : "Escolha um novo horário disponível nesta semana:"}
              </p>

              {modalAvailableSlots.length === 0 ? (
                <p className="text-center text-white/40 py-8">Nenhum horário disponível nesta semana.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                  {(remanejFlow.kind === "remarcar" ? modalWeekDates : weekDates).map(date => {
                    const daySlots = modalAvailableSlots.filter(s => s.date === date);
                    if (daySlots.length === 0) return null;
                    const dayLabel = (remanejFlow.kind === "remarcar" ? modalWeekDays : weekDays).find(d => format(d, "yyyy-MM-dd") === date);
                    return (
                      <div key={date}>
                        <p className="text-[10px] text-white/40 uppercase font-bold mb-1">
                          {dayLabel ? format(dayLabel, "EEE dd/MM", { locale: ptBR }) : date}
                        </p>
                        {daySlots.map(slot => (
                          <button
                            key={slot.time}
                            onClick={() => handlePickRemanejSlot(slot.date, slot.time)}
                            style={NEON.blue}
                            className="mb-1"
                          >
                            {slot.time}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Remanejar / Remarcar: Carla Notify ── */}
      {remanejFlow?.step === "carla" && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center gap-3 px-5 py-4 bg-gradient-to-r from-blue-600 to-indigo-600">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white text-lg font-bold flex-shrink-0">C</div>
              <div className="flex-1">
                <p className="text-white font-bold text-sm">Carla — NFs Gestão</p>
                <p className="text-white/70 text-xs">Assistente</p>
              </div>
              <button onClick={() => setRemanejFlow(null)} className="text-white/60 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-5 py-5">
              {remanejDone ? (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <CheckCircle className="w-10 h-10 text-blue-500" />
                  <p className="font-semibold">
                    {remanejFlow.kind === "remarcar" ? "Remarcação concluída!" : "Remanejamento concluído!"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {remanejFlow.apt.patientName} movido(a) para {remanejFlow.newTime} do dia {remanejFlow.newDate}.
                    {remanejFlow.kind === "remarcar" && " Na semana seguinte, retorna ao horário original."}
                  </p>
                  <Button onClick={() => setRemanejFlow(null)} className="mt-2 w-full">Fechar</Button>
                </div>
              ) : (
                <>
                  <div className="bg-blue-50 border border-blue-100 rounded-2xl rounded-tl-none px-4 py-3 mb-5">
                    <p className="text-sm text-foreground leading-relaxed">
                      Vi que você {remanejFlow.kind === "remarcar" ? "remarcou" : "remanejou"} a sessão de{" "}
                      <strong>{remanejFlow.apt.patientName}</strong> para{" "}
                      <strong>{remanejFlow.newTime} — {
                        (() => {
                          const allDays = [...weekDays, ...modalWeekDays];
                          const match = allDays.find(d => format(d, "yyyy-MM-dd") === remanejFlow.newDate);
                          return match ? format(match, "EEEE dd/MM", { locale: ptBR }) : remanejFlow.newDate;
                        })()
                      }</strong>.{" "}
                      {remanejFlow.kind === "remarcar"
                        ? "Essa mudança é pontual — na semana seguinte, volta ao horário original. "
                        : "Essa mudança é definitiva — o novo horário vale para as próximas semanas. "}
                      Posso avisar o responsável pelo WhatsApp?
                    </p>
                  </div>
                  {!remanejFlow.apt.guardianPhone && (
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                      Responsável sem telefone cadastrado.
                    </p>
                  )}
                  <div className="flex gap-3">
                    <Button
                      className="flex-1 gap-2 bg-blue-600 hover:bg-blue-700 text-xs"
                      onClick={() => confirmRemanejar(true)}
                      disabled={remanejSending || !remanejFlow.apt.guardianPhone}
                    >
                      <MessageCircle className="w-4 h-4" />
                      {remanejSending ? "Processando..." : "Confirmar e Avisar Mãe"}
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={() => confirmRemanejar(false)} disabled={remanejSending}>
                      {remanejFlow.kind === "remarcar" ? "Só remarcar" : "Só remanejar"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Carla Cancel Dialog ── */}
      {cancelDialog && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center gap-3 px-5 py-4 bg-gradient-to-r from-violet-600 to-indigo-600">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white text-lg font-bold flex-shrink-0">C</div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm">Carla — NFs Gestão</p>
                <p className="text-white/70 text-xs">Assistente</p>
              </div>
              <button onClick={() => setCancelDialog(null)} className="text-white/60 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 py-5">
              {notifyDone ? (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <CheckCircle className="w-10 h-10 text-green-500" />
                  <p className="font-semibold text-foreground">Mensagem enviada!</p>
                  <p className="text-sm text-muted-foreground">
                    O responsável de <strong>{cancelDialog.apt.patientName}</strong> foi avisado pelo WhatsApp.
                  </p>
                  <Button onClick={() => setCancelDialog(null)} className="mt-2 w-full">Fechar</Button>
                </div>
              ) : (
                <>
                  <div className="bg-violet-50 border border-violet-100 rounded-2xl rounded-tl-none px-4 py-3 mb-5">
                    <p className="text-sm text-foreground leading-relaxed">
                      Vi que você desmarcou a sessão de <strong>{cancelDialog.profName}</strong>.{" "}
                      Posso avisar o responsável pelo(a) <strong>{cancelDialog.apt.patientName || "Paciente"}</strong> agora?
                    </p>
                  </div>
                  {!cancelDialog.apt.guardianPhone && (
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                      ⚠️ Responsável sem telefone cadastrado — não será possível enviar o WhatsApp.
                    </p>
                  )}
                  <div className="flex gap-3">
                    <Button
                      className="flex-1 gap-2 bg-violet-600 hover:bg-violet-700 text-xs"
                      onClick={sendCancelNotification}
                      disabled={notifySending || !cancelDialog.apt.guardianPhone}
                    >
                      <MessageCircle className="w-4 h-4" />
                      {notifySending ? "Enviando..." : "Confirmar Cancelamento e Avisar Mãe"}
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={() => {
                      if (cancelDialog) handleRevertClick(cancelDialog.apt);
                    }} disabled={notifySending}>
                      Reverter
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
