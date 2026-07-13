import { useState, useEffect, useRef } from "react";
import { format, startOfWeek, addDays, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { openAgendaPrint, type AgendaPrintMode, type PrintAppointment } from "@/lib/print-agenda";
import { Calendar as CalendarIcon, Clock, Lock, ShieldCheck, Printer, LogOut, AlertTriangle, RotateCcw, XCircle, Plus, Activity, X, CheckCircle, ChevronLeft, ChevronRight, ChevronDown, ArrowRightLeft, UserX, XOctagon, Users, UserPlus, Repeat, Info, Trash2, Snowflake, Play } from "lucide-react";
import { cn, getStatusColor, getStatusLabel, todayBR } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useToast } from "@/hooks/use-toast";
import BookingModal from "@/components/BookingModal";
import { PatientAvatar } from "@/components/PatientAvatar";
import { supabase } from "@/lib/supabase";
import {
  listProfessionals,
  verifyProfessionalPin,
  listPatients,
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
  remanejarRecurrenceForward,
  undoMultiAppointment,
  listFeriados,
  listAusencias,
  type Feriado,
  type Ausencia,
} from "@/lib/arco-rpc";
import { isBlocked, holidayOn } from "@/lib/blocked-dates";
import { worksThroughLunch } from "@/lib/schedule";
import { getProfessionalSession, getCurrentScope, clearAllSessions } from "@/lib/portal-session";
import { useLocation } from "wouter";

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

function isoWeekNumber(dateStr: string): number {
  const d = new Date(dateStr + "T12:00:00");
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil((((+target - +yearStart) / 86_400_000) + 1) / 7);
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
  const todayStr = todayBR();
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
    const PONTUAL_STATUSES = ["remarcado", "desmarcado", "cancelado"];
    const scheduleRefApts = nonTerminalApts.filter(a => !PONTUAL_STATUSES.includes(a.status.toLowerCase()));
    const refApt = scheduleRefApts.at(-1) ?? activeApts.at(-1) ?? nonTerminalApts.at(-1) ?? sorted.at(-1)!;
    const refDow = new Date(refApt.date + "T12:00:00").getDay();
    const target = weekDates.find(d => new Date(d + "T12:00:00").getDay() === refDow);
    if (!target) continue;
    if (target < (activeApts[0] ?? nonTerminalApts[0] ?? sorted[0]).date) continue;
    if (gApts.some(a => weekDates.includes(a.date))) continue;

    // A recorrência cujas linhas reais já terminaram antes de hoje (ex.: foi cortada
    // via "Remover" ou "Encaminhamento Interno" com "remover da agenda") NÃO deve ser
    // projetada de volta para o presente/futuro. Recorrências ativas mantêm ~1 ano de
    // linhas reais à frente, então isto só afeta séries encerradas/cortadas.
    if (target >= todayStr && !gApts.some(a => a.date >= todayStr)) continue;

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

type Professional = { id: number; name: string; specialty: string; pin?: string };
type Appointment = { id: number; patientId: number; patientName?: string; patientStatus?: string | null; guardianName?: string | null; professionalName?: string | null; date: string; time: string; status: string; professionalId: number; recurrenceGroupId?: string | null; frequency?: string | null; escolaPublica?: boolean | null; trabalhoNaRoca?: boolean | null; consecutiveUnjustifiedAbsences?: number | null; prontuario?: string | null; notes?: string | null; paused?: boolean; pausedAt?: string | null; pausedReason?: string | null; pausedReturnDate?: string | null; };

type AbsenceAlert = { patientName: string; professionalName: string; professionalSpecialty: string; consecutive: number; escolaPublica: boolean; trabalhoNaRoca: boolean; };

type RemanejFlow = {
  apt: Appointment;
  // 'remanejar' = mover na semana atual; 'remarcar' = escolher qualquer semana futura
  kind: "remanejar" | "remarcar";
  weekRef: Date;
  newDate?: string;
  newTime?: string;
  done?: boolean;
};

const NEON: Record<string, React.CSSProperties> = {
  green: { background: "rgba(5,10,5,0.92)", border: "1px solid #22c55e", color: "#4ade80", boxShadow: "0 0 14px rgba(34,197,94,0.55)", textShadow: "0 0 8px rgba(74,222,128,0.9)", borderRadius: "10px", padding: "8px 14px", fontWeight: 700, fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", width: "100%", transition: "all 0.15s" },
  yellow: { background: "rgba(10,8,0,0.92)", border: "1px solid #eab308", color: "#fde047", boxShadow: "0 0 14px rgba(234,179,8,0.55)", textShadow: "0 0 8px rgba(253,224,71,0.9)", borderRadius: "10px", padding: "8px 14px", fontWeight: 700, fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", width: "100%", transition: "all 0.15s" },
  red: { background: "rgba(10,0,0,0.92)", border: "1px solid #ef4444", color: "#f87171", boxShadow: "0 0 14px rgba(239,68,68,0.55)", textShadow: "0 0 8px rgba(248,113,113,0.9)", borderRadius: "10px", padding: "8px 14px", fontWeight: 700, fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", width: "100%", transition: "all 0.15s" },
  orange: { background: "rgba(10,5,0,0.92)", border: "1px solid #f97316", color: "#fb923c", boxShadow: "0 0 14px rgba(249,115,22,0.55)", textShadow: "0 0 8px rgba(251,146,60,0.9)", borderRadius: "10px", padding: "8px 14px", fontWeight: 700, fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", width: "100%", transition: "all 0.15s" },
  blue: { background: "rgba(0,5,15,0.92)", border: "1px solid #3b82f6", color: "#60a5fa", boxShadow: "0 0 14px rgba(59,130,246,0.55)", textShadow: "0 0 8px rgba(96,165,250,0.9)", borderRadius: "10px", padding: "6px 10px", fontWeight: 700, fontSize: "11px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", width: "100%", transition: "all 0.15s", justifyContent: "center" },
  fuchsia: { background: "rgba(10,0,10,0.92)", border: "1px solid #c026d3", color: "#e879f9", boxShadow: "0 0 14px rgba(192,38,211,0.55)", textShadow: "0 0 8px rgba(232,121,249,0.9)", borderRadius: "10px", padding: "8px 14px", fontWeight: 700, fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", width: "100%", transition: "all 0.15s" },
  cyan: { background: "rgba(0,5,10,0.92)", border: "1px solid #06b6d4", color: "#22d3ee", boxShadow: "0 0 14px rgba(6,182,212,0.55)", textShadow: "0 0 8px rgba(34,211,238,0.9)", borderRadius: "10px", padding: "8px 14px", fontWeight: 700, fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", width: "100%", transition: "all 0.15s" },
  violet: { background: "rgba(8,0,14,0.92)", border: "1px solid #8b5cf6", color: "#c4b5fd", boxShadow: "0 0 14px rgba(139,92,246,0.55)", textShadow: "0 0 8px rgba(196,181,253,0.9)", borderRadius: "10px", padding: "8px 14px", fontWeight: 700, fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", width: "100%", transition: "all 0.15s" },
};

const SPECIALTIES = [
  "Psicologia", "Psicologia Parental", "Psicomotricidade", "Fisioterapia", "Terapia Ocupacional",
  "Fonoaudiologia", "Nutrição", "Psicopedagogia", "Educação Física",
];

export default function AgendaProfissionais() {
  const [, setLocation] = useLocation();
  // Fase 6: identifica o scope vindo do portal unificado.
  // - admin: seleciona qualquer profissional sem PIN.
  // - professional: pin ja foi verificado no portal; auto-seleciona.
  const portalScope = getCurrentScope();
  const portalProf = getProfessionalSession();
  const isAdminViewing = portalScope === "admin";
  const isProfessionalSession = portalScope === "professional" && !!portalProf;
  // Admin pode abrir a agenda de um profissional específico via ?prof=ID
  // (usado pelo botão "Agenda" da tela de Profissionais).
  const profFromQuery =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("prof") || ""
      : "";
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [photoById, setPhotoById] = useState<Map<number, string | null>>(new Map());
  const [selectedProfId, setSelectedProfId] = useState(
    isProfessionalSession
      ? String(portalProf!.professionalId)
      : isAdminViewing
        ? profFromQuery
        : ""
  );
  const [pinInput, setPinInput] = useState("");
  const [pinVerified, setPinVerified] = useState(isAdminViewing || isProfessionalSession);
  const [pinError, setPinError] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [printMenuOpen, setPrintMenuOpen] = useState(false);
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
  const [feriados, setFeriados] = useState<Feriado[]>([]);
  const [ausencias, setAusencias] = useState<Ausencia[]>([]);
  const [bookingSlot, setBookingSlot] = useState<{ date: string; time: string } | null>(null);
  const [actionMenuId, setActionMenuId] = useState<number | null>(null);
  const [altaConfirm, setAltaConfirm] = useState<Appointment | null>(null);
  const [altaMotivo, setAltaMotivo] = useState("");
  const [saidaTipo, setSaidaTipo] = useState<"Alta" | "Óbito" | "Desistência">("Alta");
  const [absenceAlert, setAbsenceAlert] = useState<AbsenceAlert | null>(null);
  const [remanejFlow, setRemanejFlow] = useState<RemanejFlow | null>(null);
  const [remanejSending, setRemanejSending] = useState(false);
  const { toast } = useToast();

  // Encaminhamento Interno
  const [encApt, setEncApt] = useState<Appointment | null>(null);
  const [encEspecialidade, setEncEspecialidade] = useState("");
  const [encMotivo, setEncMotivo] = useState("");
  const [encErro, setEncErro] = useState("");
  const [encSending, setEncSending] = useState(false);
  const [encManterAgenda, setEncManterAgenda] = useState(true);

  // Multi-Atendimento
  const [multiApt, setMultiApt] = useState<Appointment | null>(null);
  const [multiProfId, setMultiProfId] = useState<string>("");
  const [multiSending, setMultiSending] = useState(false);
  const [multiErro, setMultiErro] = useState("");
  const [undoMultiApt, setUndoMultiApt] = useState<Appointment | null>(null);
  const [undoMultiSending, setUndoMultiSending] = useState(false);

  // Frequência (Periodicidade)
  const [freqApt, setFreqApt] = useState<Appointment | null>(null);
  const [freqSending, setFreqSending] = useState(false);

  // Exclusão administrativa
  const [excluirConfirm, setExcluirConfirm] = useState<Appointment | null>(null);
  const [excluirSending, setExcluirSending] = useState(false);

  // Pausa temporária
  const [pauseModal, setPauseModal] = useState<Appointment | null>(null);
  const [pauseReason, setPauseReason] = useState("");
  const [pauseReturnDate, setPauseReturnDate] = useState("");
  const [pauseSending, setPauseSending] = useState(false);

  const weekDays = getWeekDays(weekRef);
  const weekDates = weekDays.map(d => format(d, "yyyy-MM-dd"));
  const today = format(new Date(), "yyyy-MM-dd");
  const selectedProf = professionals.find(p => String(p.id) === selectedProfId);

  useEffect(() => {
    listProfessionals()
      .then((list) =>
        setProfessionals(
          list.map((p) => ({
            id: p.id,
            name: p.name,
            specialty: p.specialty ?? "",
            pin: p.pin ?? undefined,
          }))
        )
      )
      .catch(console.error);
    listPatients().then((ps) => {
      const m = new Map<number, string | null>();
      for (const p of ps) if (p.photoUrl) m.set(p.id, p.photoUrl);
      setPhotoById(m);
    }).catch(console.error);
    listFeriados().then(setFeriados).catch(console.error);
    listAusencias().then(setAusencias).catch(console.error);
  }, []);

  const loadedRangeRef = useRef<{ from: string; to: string } | null>(null);

  const fetchAppointments = (refDate?: Date) => {
    if (!selectedProfId) return;
    const ref = refDate ?? weekRef;
    const rangeStart = addDays(startOfWeek(ref, { weekStartsOn: 1 }), -56);
    const rangeEnd = addDays(startOfWeek(ref, { weekStartsOn: 1 }), 60);
    const dateFrom = format(rangeStart, "yyyy-MM-dd");
    const dateTo = format(rangeEnd, "yyyy-MM-dd");
    loadedRangeRef.current = { from: dateFrom, to: dateTo };
    listAppointments({ professionalId: parseInt(selectedProfId), dateFrom, dateTo })
      // Oculta pacientes com status terminal (Alta/Óbito/Desistência) da agenda.
      .then((list) => setAppointments(list.filter(a => !TERMINAL_STATUSES.includes((a.patientStatus ?? "").toLowerCase()))))
      .catch((err) => {
        console.error("fetchAppointments error:", err);
        toast({ title: "Erro ao carregar agenda", description: err?.message || String(err), variant: "destructive" });
      });
  };

  useEffect(() => { if (pinVerified) fetchAppointments(); }, [selectedProfId, pinVerified]);

  // Re-fetch when navigating outside the loaded date window
  useEffect(() => {
    if (!pinVerified || !selectedProfId) return;
    const range = loadedRangeRef.current;
    if (!range) return;
    const viewStart = weekDates[0];
    const viewEnd = weekDates[weekDates.length - 1];
    const margin = 14; // days before needing reload
    const marginFrom = format(addDays(new Date(range.from + "T12:00:00"), margin), "yyyy-MM-dd");
    const marginTo = format(addDays(new Date(range.to + "T12:00:00"), -margin), "yyyy-MM-dd");
    if (viewStart < marginFrom || viewEnd > marginTo) {
      fetchAppointments(weekRef);
    }
  }, [weekRef, pinVerified, selectedProfId]);

  // Realtime: recarrega a agenda quando qualquer appointment desse profissional muda
  // (grupo novo, remanejar pela Recepcao, status update, etc.).
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!supabase || !pinVerified || !selectedProfId) return;
    const profId = parseInt(selectedProfId);
    const scheduleReload = () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = setTimeout(() => { fetchAppointments(weekRefLatest.current); }, 400);
    };
    const channel = supabase
      .channel(`agenda-prof-${profId}`)
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
  }, [selectedProfId, pinVerified]);

  // Rede de segurança da sincronia: além do Realtime (instantâneo), garante que
  // a agenda convirja mesmo se um evento Realtime se perder ou a aba ficar em
  // segundo plano. Recarrega ao voltar o foco/visibilidade da aba e a cada 30s.
  useEffect(() => {
    if (!pinVerified || !selectedProfId) return;
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
  }, [selectedProfId, pinVerified]);

  const handleProfChange = (id: string) => {
    setSelectedProfId(id); setPinVerified(false); setPinInput(""); setPinError("");
  };

  const verifyPin = async () => {
    if (!selectedProfId || pinInput.length !== 4) return;
    setPinLoading(true); setPinError("");
    try {
      const prof = await verifyProfessionalPin(parseInt(selectedProfId), pinInput);
      if (prof) { setPinVerified(true); }
      else {
        setPinError("PIN incorreto"); setPinInput("");
      }
    } catch { setPinError("Erro ao verificar PIN."); }
    finally { setPinLoading(false); }
  };

  const buildPrintApts = (dates: string[]): PrintAppointment[] => {
    const exp = applyFrequencyFilter(expandRecurrence(appointments, dates), dates);
    return exp
      .filter(a => dates.includes(a.date) && !INACTIVE_STATUSES.includes((a.status || "").toLowerCase()))
      .map(a => ({
        date: a.date,
        time: a.time,
        patientId: a.patientId,
        patientName: a.patientName ?? null,
        prontuario: a.prontuario ?? null,
        status: a.status,
      }));
  };

  const monthWeekdays = (ref: Date): string[] => {
    const first = startOfMonth(ref);
    const last = endOfMonth(ref);
    const out: string[] = [];
    for (let d = new Date(first); d <= last; d = addDays(d, 1)) {
      const dow = d.getDay();
      if (dow >= 1 && dow <= 5) out.push(format(d, "yyyy-MM-dd"));
    }
    return out;
  };

  const handlePrint = (mode: AgendaPrintMode = "dia") => {
    setPrintMenuOpen(false);
    const isPaulaProf = worksThroughLunch(selectedProf?.name);
    let dates: string[] = [];
    let refDate = weekRef;
    if (mode === "dia") { dates = [today]; refDate = new Date(today + "T12:00:00"); }
    else if (mode === "semana") { dates = weekDates; }
    else if (mode === "mes") { dates = monthWeekdays(weekRef); }
    openAgendaPrint({
      mode,
      professionalName: selectedProf?.name,
      specialty: selectedProf?.specialty,
      timeSlots: TIME_SLOTS,
      appointments: mode === "rascunho" ? [] : buildPrintApts(dates),
      refDate,
      includeLunch: !isPaulaProf,
    });
  };

  const patchStatus = async (apt: Appointment, status: string) => {
    let realId = apt.id;

    // Virtual appointment (projeção de recorrência): materializar no banco
    if (apt.id < 0 && selectedProf) {
      const mat = await materializeVirtualAppointment({
        patientId: apt.patientId,
        professionalId: selectedProf.id,
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

  const logNotificacao = async (apt: Appointment, acao: string) => {
    try {
      await createNotificacao({
        appointmentId: apt.id,
        patientName: apt.patientName || `Paciente #${apt.patientId}`,
        patientPhone: (apt as { patientPhone?: string | null }).patientPhone ?? null,
        professionalName: selectedProf?.name || "—",
        acao,
        dataConsulta: apt.date,
        horaConsulta: apt.time,
      });
    } catch { /* silencioso */ }
  };

  // Desmarcar foi removido do Portal do Profissional: so Recepcao/ADM podem desmarcar.

  const handleRemarcar = (apt: Appointment) => {
    setActionMenuId(null);
    // Remarcar = mudança pontual: reposição de um dia, volta ao horário original na semana seguinte
    setRemanejFlow({ apt, kind: "remarcar", weekRef: new Date(apt.date + "T12:00:00") });
  };

  const handleRemanejar = (apt: Appointment) => {
    setActionMenuId(null);
    // Remanejar = mudança definitiva: novo dia/horário fixo para as próximas semanas
    setRemanejFlow({ apt, kind: "remanejar", weekRef });
  };

  const confirmRemanejar = async (newDate: string, newTime: string) => {
    if (!remanejFlow) return;
    const newStatus = remanejFlow.kind === "remarcar" ? "remarcado" : "remanejado";
    const acao = remanejFlow.kind === "remarcar" ? "Remarcado" : "Remanejado";
    const emoji = remanejFlow.kind === "remarcar" ? "🟡" : "🟠";
    setRemanejSending(true);
    try {
      // Se a ocorrência clicada é virtual (projeção de semana futura, id negativo),
      // materializa ANTES de mexer — senão a ação cai na ocorrência base e a semana
      // de frente não pode ser editada de forma independente.
      let realId = remanejFlow.apt.id;
      if (remanejFlow.apt.id < 0 && selectedProf) {
        const mat = await materializeVirtualAppointment({
          patientId: remanejFlow.apt.patientId,
          professionalId: selectedProf.id,
          date: remanejFlow.apt.date,
          time: remanejFlow.apt.time,
          recurrenceGroupId: remanejFlow.apt.recurrenceGroupId,
          frequency: (remanejFlow.apt.frequency as "semanal" | "quinzenal" | "mensal") ?? "semanal",
          notes: remanejFlow.apt.notes,
        });
        realId = mat.id;
      }
      await updateAppointment(realId, {
        date: newDate,
        time: newTime,
        status: newStatus,
      });
      setAppointments(prev => prev.map(a =>
        (a.id === remanejFlow.apt.id || a.id === realId)
          ? { ...a, id: realId, date: newDate, time: newTime, status: newStatus }
          : a
      ));
      // Remanejar = mudança DEFINITIVA: move também as ocorrências FUTURAS da
      // recorrência para o novo dia/horário. Remarcar (pontual) não propaga.
      if (remanejFlow.kind === "remanejar" && remanejFlow.apt.recurrenceGroupId) {
        const { moved } = await remanejarRecurrenceForward({
          recurrenceGroupId: remanejFlow.apt.recurrenceGroupId,
          patientId: remanejFlow.apt.patientId,
          fromDate: remanejFlow.apt.date,
          newDate,
          newTime,
          excludeId: realId,
        });
        if (moved.length) {
          const m = new Map(moved.map(x => [x.id, x]));
          setAppointments(prev => prev.map(a => m.has(a.id) ? { ...a, date: m.get(a.id)!.date, time: m.get(a.id)!.time } : a));
        }
      }
      await logNotificacao(
        { ...remanejFlow.apt, date: newDate, time: newTime },
        acao
      );
      setRemanejFlow({ ...remanejFlow, newDate, newTime, done: true });
      toast({ title: `${emoji} ${acao}`, description: `${remanejFlow.apt.patientName} movido para ${newDate} às ${newTime}. Recepção notificada.` });
    } catch (err: any) {
      const raw = String(err?.message ?? "");
      if (raw.includes("JA_REMANEJADO_HOJE")) {
        toast({
          title: "🚫 Limite diário",
          description: `${remanejFlow.apt.patientName} já foi remanejado hoje. Tente novamente amanhã.`,
          variant: "destructive",
        });
      } else {
        toast({ title: `Erro ao ${acao.toLowerCase()}`, description: raw || "Falha inesperada.", variant: "destructive" });
      }
    } finally {
      setRemanejSending(false);
    }
  };

  const handleAtendimento = async (apt: Appointment) => {
    setActionMenuId(null);
    try {
      await patchStatus(apt, "atendimento");
      await logNotificacao(apt, "Em Atendimento");
      toast({ title: "✅ Em Atendimento", description: `${apt.patientName} marcado como em atendimento.` });
    } catch (err: any) {
      toast({ title: "Erro ao iniciar atendimento", description: err?.message ?? "Falha inesperada.", variant: "destructive" });
    }
  };

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

      const todayStr = todayBR();
      const profSpecialty = selectedProf?.specialty ?? null;

      // Check if patient still has active appointments with OTHER professionals
      let hasOtherActive = false;
      try {
        const allFuture = await listAppointments({ patientId: altaConfirm.patientId, dateFrom: todayStr });
        hasOtherActive = allFuture.some(a =>
          a.professionalId !== altaConfirm.professionalId &&
          (a.status === "agendado" || a.status === "atendimento" || a.status === "em_atendimento")
        );
      } catch { hasOtherActive = true; }

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

      // Remover apenas da fila da especialidade deste profissional (não de todas).
      // Comparação case-insensitive/trim para não deixar a entrada presa por diferença de formatação.
      try {
        const specNorm = (profSpecialty || "").trim().toLowerCase();
        const filaAtual = await listWaitingList();
        const entradas = filaAtual.filter(e =>
          e.patientId === altaConfirm.patientId &&
          (!specNorm || !(e.specialty || "").trim() || (e.specialty || "").trim().toLowerCase() === specNorm)
        );
        for (const entry of entradas) {
          await deleteWaitingListEntry(entry.id);
        }
      } catch { /* silencioso — fila pode estar vazia */ }

      // Cascata: remove TODOS os agendamentos futuros do paciente com este profissional
      // (não só o grupo de recorrência clicado) — evita "fantasmas" na agenda após a alta.
      try {
        const futuros = await listAppointments({
          patientId: altaConfirm.patientId,
          professionalId: altaConfirm.professionalId,
          dateFrom: todayStr,
        });
        const gruposRemovidos = new Set<string>();
        for (const a of futuros) {
          if (a.id <= 0) continue;
          const gid = a.recurrenceGroupId || `single:${a.id}`;
          if (gruposRemovidos.has(gid)) continue;
          gruposRemovidos.add(gid);
          try { await deleteAppointmentAlta(a.id); } catch { /* best-effort */ }
        }
      } catch { /* best-effort */ }

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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha inesperada.";
      toast({ title: `Erro ao aplicar ${label.toLowerCase()}`, description: msg, variant: "destructive" });
    }
  };

  // ── Encaminhamento Interno ──
  const handleEncaminhamento = async (apt: Appointment) => {
    try {
      const profId = selectedProfId ? Number(selectedProfId) : null;
      const allApts = await listAppointments({ patientId: apt.patientId, professionalId: profId });
      const completed = allApts.filter(a => a.status === "atendimento").length;
      if (completed < 2) {
        toast({ title: "Encaminhamento bloqueado", description: `Só é possível encaminhar após 2 atendimentos concluídos. Atualmente: ${completed}/2.`, variant: "destructive" });
        setActionMenuId(null);
        return;
      }
    } catch { /* se falhar a contagem, permite prosseguir */ }
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
      // Prontuário antigo (< 500) pula exigência de triagem (pacientes pré-sistema)
      const prt = parseInt(encApt.prontuario ?? "", 10);
      const skipTriagem = !isNaN(prt) && prt < 500;
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
      // Encerra o vínculo só de hoje em diante (mesma lógica do "Remover"/"Excluir":
      // preserva o histórico de atendimentos passados).
      if (!encManterAgenda) {
        try {
          const today = todayBR();
          if (encApt.recurrenceGroupId) {
            await deleteRecurrenceForward(encApt.recurrenceGroupId, today, encApt.patientId);
          } else if (encApt.id > 0) {
            await deleteAppointmentAlta(encApt.id);
          }
        } catch { /* best-effort */ }
      }
      setEncApt(null);
      toast({ title: "Encaminhamento realizado", description: `${encApt.patientName} adicionado à fila de ${encEspecialidade}.${encManterAgenda ? " Mantido na agenda atual." : " Removido da agenda de hoje em diante (histórico preservado)."}` });
      fetchAppointments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha inesperada.";
      toast({ title: "Erro ao encaminhar", description: msg, variant: "destructive" });
    } finally {
      setEncSending(false);
    }
  };

  // ── Falta Justificada ──
  const handleFaltaJustificada = async (apt: Appointment) => {
    setActionMenuId(null);
    try {
      await patchStatus(apt, "falta_justificada");
      await logNotificacao(apt, "Falta Justificada");
      toast({ title: "Falta Justificada registrada", description: `${apt.patientName} — sequência de alertas zerada.` });
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
          patientName: apt.patientName ?? `Paciente #${apt.patientId}`,
          professionalName: profName,
          professionalSpecialty: profSpec,
          consecutive,
          escolaPublica: result?.escolaPublica ?? false,
          trabalhoNaRoca: result?.trabalhoNaRoca ?? false,
        });
      } else {
        toast({ title: "Falta Não Justificada registrada", description: `${apt.patientName} — 1ª ausência sem justificativa.` });
      }
    } catch {
      toast({ title: "Erro", description: "Não foi possível registrar.", variant: "destructive" });
    }
  };

  // ── Desmarcar ──
  const handleDesmarcado = async (apt: Appointment) => {
    setActionMenuId(null);
    try {
      await patchStatus(apt, "desmarcado");
      await logNotificacao(apt, "Desmarcado");
      toast({ title: "Desmarcado", description: `${apt.patientName} — agendamento desmarcado.` });
    } catch {
      toast({ title: "Erro", description: "Não foi possível desmarcar.", variant: "destructive" });
    }
  };

  // ── Multi-Atendimento ──
  const handleMultiAtendimento = async (apt: Appointment) => {
    try {
      const allApts = await listAppointments({ patientId: apt.patientId, professionalId: Number(selectedProfId) });
      const completed = allApts.filter(a => a.status === "atendimento").length;
      if (completed < 2) {
        toast({ title: "Atendimento Multi bloqueado", description: `Só é possível após 2 atendimentos concluídos. Atualmente: ${completed}/2.`, variant: "destructive" });
        setActionMenuId(null);
        return;
      }
    } catch { /* se falhar a contagem, permite prosseguir */ }
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
      await createAppointments({
        patientId: multiApt.patientId,
        professionalId: secondProf.id,
        date: multiApt.date,
        time: multiApt.time,
        notes: `Atendimento Multi com ${currentProf.name} (${currentProf.specialty || "—"})`,
        frequency: (multiApt.frequency as "semanal" | "quinzenal" | "mensal") ?? "semanal",
        noRecurrence: true,
      });
      await updateAppointment(multiApt.id, { notes: `Atendimento Multi com ${secondProf.name} (${secondProf.specialty || "—"})` });
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

  // ── Desfazer Multi (remove só o profissional convidado) ──
  const handleStartDesfazerMulti = (apt: Appointment) => {
    setActionMenuId(null);
    setUndoMultiApt(apt);
  };

  const confirmDesfazerMulti = async () => {
    if (!undoMultiApt) return;
    setUndoMultiSending(true);
    try {
      const res = await undoMultiAppointment({
        patientId: undoMultiApt.patientId,
        date: undoMultiApt.date,
        time: undoMultiApt.time,
        keepProfessionalId: undoMultiApt.professionalId,
      });
      const nomes = res.removedNames.join(", ");
      await logNotificacao(undoMultiApt, `Multi desfeito — ${nomes || "profissional convidado"} removido (${selectedProf?.name || ""} mantido)`);
      setUndoMultiApt(null);
      toast({ title: "Multi desfeito", description: nomes ? `${nomes} removido. ${selectedProf?.name || "O profissional principal"} mantido.` : "Profissional convidado removido." });
      fetchAppointments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha inesperada.";
      toast({ title: "Erro ao desfazer Multi", description: msg, variant: "destructive" });
    } finally {
      setUndoMultiSending(false);
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
      setFreqApt(null);
      fetchAppointments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha inesperada.";
      toast({ title: "Erro ao alterar periodicidade", description: msg, variant: "destructive" });
    } finally {
      setFreqSending(false);
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

      await createNotificacao({ patientName: pauseModal.patientName || "", professionalName: pauseModal.professionalName, acao: "Pausa Temporária" });
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

      await createNotificacao({ patientName: apt.patientName || "", professionalName: apt.professionalName, acao: "Retorno de Pausa" });
      fetchAppointments();
      toast({ title: "▶ Retomado", description: `${apt.patientName} voltou para a agenda com status "Agendado".` });
    } catch {
      toast({ title: "Erro", description: "Não foi possível retomar.", variant: "destructive" });
    }
  };

  // ── Exclusão administrativa ──
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

  // Expande recorrência: projeta agendamentos recorrentes em semanas sem linha real no banco.
  // Depois filtra: se frequência é quinzenal/mensal, esconde "agendado" nas semanas erradas.
  // Por fim, oculta feriados e ausências do profissional (férias/folga/falta).
  const expanded = applyFrequencyFilter(expandRecurrence(appointments, weekDates), weekDates)
    .filter(a => !isBlocked(a.date, a.professionalId, feriados, ausencias));

  const selectedProfIdNum = selectedProfId ? parseInt(selectedProfId) : 0;
  const dayBlock = (date: string): string | null => {
    const h = holidayOn(date, feriados);
    if (h) return h.descricao ? `Feriado — ${h.descricao}` : "Feriado";
    const abs = ausencias.find(a => a.professionalId === selectedProfIdNum && date >= a.dataInicio && date <= a.dataFim);
    if (abs) return abs.motivo ? `Ausente — ${abs.motivo}` : "Ausente";
    return null;
  };

  // Fase 5A: slots em grupo — o mesmo horario pode ter varios pacientes.
  const getApts = (date: string, time: string) =>
    expanded.filter(a => a.date === date && a.time === time);

  // Slots vazios para o seletor do modal (remanejar/remarcar).
  // Usa a semana atualmente selecionada dentro do modal.
  const modalWeekDays = remanejFlow ? getWeekDays(remanejFlow.weekRef) : [];
  const modalWeekDates = modalWeekDays.map(d => format(d, "yyyy-MM-dd"));
  const isPaula = worksThroughLunch(selectedProf?.name);
  const modalAvailableSlots = modalWeekDates.flatMap(date =>
    TIME_SLOTS.filter(t => (isPaula || t !== "12:10") && getApts(date, t).length === 0)
      .map(time => ({ date, time }))
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      {/* Admin shortcut bar */}
      <div className="bg-slate-800 text-white px-4 py-2 flex items-center">
        <a
          href={import.meta.env.BASE_URL || "/"}
          className="flex items-center gap-2 text-sm font-semibold text-slate-200 hover:text-white transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          Ir para o Painel Administrativo
        </a>
      </div>

      {/* Header */}
      <div className="bg-card border-b border-border shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center" style={{ boxShadow: "0 0 12px rgba(0,240,255,0.3)" }}>
              <CalendarIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-bold text-foreground leading-tight">NFS – Portal do Profissional</p>
              <p className="text-xs text-muted-foreground">Agenda Semanal</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle compact />
            {pinVerified && (
              <>
                <div className="relative">
                  <button
                    onClick={() => setPrintMenuOpen(o => !o)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 transition-all shadow-sm hover:shadow-[0_0_16px_rgba(0,240,255,0.4)]"
                  >
                    <Printer className="w-4 h-4" /> Imprimir Agenda
                    <ChevronDown className={cn("w-4 h-4 transition-transform", printMenuOpen && "rotate-180")} />
                  </button>
                  {printMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setPrintMenuOpen(false)} />
                      <div className="absolute right-0 mt-2 w-56 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden py-1">
                        <button onClick={() => handlePrint("dia")} className="w-full text-left px-4 py-2.5 text-sm hover:bg-primary/10 flex items-center gap-2 text-foreground">
                          <CalendarIcon className="w-4 h-4 text-primary" /> Agenda do Dia
                        </button>
                        <button onClick={() => handlePrint("semana")} className="w-full text-left px-4 py-2.5 text-sm hover:bg-primary/10 flex items-center gap-2 text-foreground">
                          <CalendarIcon className="w-4 h-4 text-primary" /> Agenda da Semana
                        </button>
                        <button onClick={() => handlePrint("mes")} className="w-full text-left px-4 py-2.5 text-sm hover:bg-primary/10 flex items-center gap-2 text-foreground">
                          <CalendarIcon className="w-4 h-4 text-primary" /> Agenda do Mês
                        </button>
                        <div className="border-t border-border my-1" />
                        <button onClick={() => handlePrint("rascunho")} className="w-full text-left px-4 py-2.5 text-sm hover:bg-primary/10 flex items-center gap-2 text-foreground">
                          <Printer className="w-4 h-4 text-muted-foreground" /> Agenda em branco (rascunho)
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <button
                  onClick={() => {
                    // Admin volta pro dashboard; profissional e acesso direto voltam pro portal.
                    if (isAdminViewing) {
                      setLocation("/");
                    } else {
                      clearAllSessions();
                      setLocation("/portal");
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground text-sm font-semibold rounded-xl hover:bg-[rgba(255,30,90,0.1)] hover:text-[#ff2060] border border-border hover:border-[rgba(255,30,90,0.3)] transition-all"
                >
                  <LogOut className="w-4 h-4" /> {isAdminViewing ? "Voltar ao painel" : "Sair da Agenda"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">

        {/* Login Card */}
        {!pinVerified ? (
          <div className="max-w-md mx-auto mt-16">
            <div className="bg-card rounded-3xl border border-primary/20 overflow-hidden" style={{ boxShadow: "0 0 60px rgba(0,0,0,0.5), 0 0 30px rgba(0,240,255,0.05)" }}>
              <div className="bg-gradient-to-r from-primary/70 to-primary/30 p-8 text-center text-primary-foreground" style={{ borderBottom: "1px solid rgba(0,240,255,0.2)" }}>
                <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ boxShadow: "0 0 20px rgba(0,240,255,0.3)" }}>
                  <Lock className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold">Acesso do Profissional</h2>
                <p className="text-sm opacity-80 mt-1">Selecione seu nome e informe o PIN</p>
              </div>
              <div className="p-8 space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">Profissional</label>
                  <select
                    value={selectedProfId}
                    onChange={e => handleProfChange(e.target.value)}
                    className="w-full border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/30 bg-muted text-foreground font-medium transition-all"
                  >
                    <option value="">Selecione seu nome...</option>
                    {professionals.map(p => <option key={p.id} value={p.id}>{p.name} – {p.specialty}</option>)}
                  </select>
                </div>

                {selectedProfId && (
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">PIN (4 dígitos)</label>
                    <input
                      type="password" maxLength={4}
                      value={pinInput}
                      onChange={e => setPinInput(e.target.value.replace(/\D/, ""))}
                      onKeyDown={e => e.key === "Enter" && verifyPin()}
                      placeholder="••••"
                      className="w-full border border-border rounded-xl px-4 py-4 text-center font-mono text-2xl tracking-[1em] focus:outline-none focus:ring-2 focus:ring-primary/30 bg-muted text-foreground transition-all"
                    />
                    {pinError && <p className="text-destructive text-sm mt-2 font-semibold">{pinError}</p>}
                  </div>
                )}

                <button
                  onClick={verifyPin}
                  disabled={!selectedProfId || pinInput.length !== 4 || pinLoading}
                  className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground font-bold py-3 rounded-xl transition-all hover:shadow-[0_0_20px_rgba(0,240,255,0.4)]"
                >
                  {pinLoading ? "Verificando..." : "Acessar Agenda"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Pro info bar */}
            <div className="bg-card rounded-2xl border border-primary/20 px-6 py-4 flex items-center justify-between gap-4 flex-wrap" style={{ boxShadow: "0 0 20px rgba(0,240,255,0.04)" }}>
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-primary" style={{ filter: "drop-shadow(0 0 6px rgba(0,240,255,0.5))" }} />
                {isAdminViewing ? (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-fuchsia-400 font-bold">Admin · visualizando</p>
                    <select
                      value={selectedProfId}
                      onChange={(e) => setSelectedProfId(e.target.value)}
                      className="mt-1 bg-muted text-foreground font-bold rounded-lg px-3 py-1.5 border border-border focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="">Selecione um profissional...</option>
                      {professionals.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}{p.specialty ? ` — ${p.specialty}` : ""}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <p className="font-bold text-foreground">{selectedProf?.name}</p>
                    <p className="text-sm text-muted-foreground">{selectedProf?.specialty}</p>
                  </div>
                )}
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
                <div className="text-center min-w-[160px]">
                  <p className="text-sm font-semibold text-foreground">
                    {format(weekDays[0], "dd/MM")} a {format(weekDays[4], "dd/MM/yyyy")}
                  </p>
                  <button
                    type="button"
                    onClick={goThisWeek}
                    className="text-[11px] text-primary hover:underline font-semibold"
                  >
                    Voltar para esta semana
                  </button>
                </div>
                <button
                  type="button"
                  onClick={goNextWeek}
                  className="w-9 h-9 rounded-xl border border-border bg-muted/40 hover:bg-primary/10 hover:border-primary/40 text-muted-foreground hover:text-primary transition-colors flex items-center justify-center"
                  aria-label="Próxima semana"
                  title="Próxima semana"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Weekly grid */}
            <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
                  <thead className="bg-muted/60 border-b border-border">
                    <tr>
                      <th className="px-2 py-2 sticky left-0 bg-muted/80 backdrop-blur z-10 border-r border-border text-left text-sm text-primary uppercase font-bold" style={{ width: "60px" }}>Horário</th>
                      {weekDays.map((d, i) => {
                        const isToday = format(d, "yyyy-MM-dd") === today;
                        const block = dayBlock(weekDates[i]);
                        return (
                          <th key={i} className={cn("px-1 py-2 text-center text-xs uppercase font-bold", isToday ? "text-primary bg-primary/8" : "text-muted-foreground")}>
                            <span className="font-bold text-foreground capitalize text-sm">{format(d, "EEE", { locale: ptBR })}</span>
                            <div className={cn("font-normal text-xs", isToday && "text-primary font-bold")}>{format(d, "dd/MM")}</div>
                            {block && (
                              <div className="mt-0.5 text-[10px] font-bold normal-case" style={{ color: "#c084fc" }} title={block}>
                                {block.length > 14 ? block.slice(0, 14) + "…" : block}
                              </div>
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {TIME_SLOTS.map(time => {
                      const isPaulaProf = worksThroughLunch(selectedProf?.name);
                      const isLunch = time === "12:10" && !isPaulaProf;
                      return (
                        <tr key={time} className="border-b border-border/60 hover:bg-secondary/30 transition-colors">
                          <td className={cn("px-2 py-2 font-bold text-sm sticky left-0 bg-card z-10 border-r border-border", isLunch ? "text-muted-foreground" : "text-primary")}>
                            {time}
                          </td>
                          {isLunch ? (
                            <td colSpan={5} className="px-4 py-3 bg-muted/30 text-center text-muted-foreground italic font-medium text-xs">
                              🍽 Almoço — Pausa
                            </td>
                          ) : (
                            weekDates.map((date, i) => {
                              const apts = getApts(date, time);
                              const isToday = date === today;
                              const isGroup = apts.length > 1;
                              return (
                                <td key={i} className={cn("px-1.5 py-1.5 relative align-top", isToday && "bg-primary/5")}>
                                  {apts.length === 0 ? (
                                    <button
                                      onClick={() => setBookingSlot({ date, time })}
                                      className="w-full min-h-[50px] flex items-center justify-center border-2 border-dashed border-border/50 rounded-xl text-muted-foreground/40 hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all text-[10px] font-semibold cursor-pointer"
                                    >
                                      + Agendar
                                    </button>
                                  ) : (
                                    <div className="flex flex-col gap-1.5">
                                      {isGroup && (
                                        <span className="text-[9px] uppercase font-bold text-cyan-400 tracking-wider">
                                          · grupo ({apts.length})
                                        </span>
                                      )}
                                      {apts.map(apt => (() => {
                                    const isMenuOpen = actionMenuId === apt.id;
                                    const s = apt.status?.toLowerCase() ?? "";
                                    const isDesmarcado    = s === "desmarcado";
                                    const isPresente      = s === "presente";
                                    const isAtendimento   = s === "atendimento";
                                    const isRemarcado     = s === "remarcado";
                                    const isRemanejado    = s === "remanejado";
                                    const isRescheduled   = isRemarcado || isRemanejado;
                                    const isFaltaJust     = s === "falta_justificada" || s === "justificado" || s === "abonado";
                                    const isFaltaNaoJust  = s === "falta_nao_justificada" || s === "ausente";
                                    const isMulti = !!(apt.notes && apt.notes.startsWith("Atendimento Multi com "));
                                    const multiPartner = isMulti ? apt.notes!.replace("Atendimento Multi com ", "").replace(/\s*\(.*\)$/, "") : null;
                                    const multiPartnerSpec = isMulti ? (apt.notes!.match(/\(([^)]+)\)\s*$/) || [])[1] || null : null;
                                    const isGhost = !apt.patientName || apt.patientName.trim() === "";

                                    return (
                                      <div className="relative">
                                        {/* ── Card do paciente ─────────────────────────────── */}
                                        <div
                                          onClick={() => {
                                            setActionMenuId(isMenuOpen ? null : apt.id);
                                          }}
                                          className={cn(
                                            "p-2 rounded-xl border flex flex-col gap-1 transition-all select-none",
                                            isGhost && "bg-amber-950/20 border-amber-500/60 animate-pulse",
                                            !isGhost && isPresente      && "border-cyan-400/60 bg-cyan-950/15",
                                            !isGhost && isAtendimento   && "border-green-400/60 bg-green-950/15",
                                            !isGhost && isDesmarcado    && "border-red-500/40 bg-red-950/10",
                                            !isGhost && isFaltaNaoJust  && "border-red-500/40 bg-red-950/10",
                                            !isGhost && isRemarcado     && "border-yellow-400/50 bg-yellow-950/10",
                                            !isGhost && isRemanejado    && "border-orange-400/50 bg-orange-950/10",
                                            !isGhost && isFaltaJust     && "border-cyan-500/40 bg-[rgba(6,182,212,0.04)]",
                                            !isGhost && isMulti && !isDesmarcado && !isRescheduled && "border-violet-400/60 bg-violet-950/10",
                                            !isGhost && !isPresente && !isAtendimento && !isDesmarcado && !isFaltaNaoJust && !isRescheduled && !isFaltaJust && !isMulti && "bg-secondary/50 border-border cursor-pointer hover:border-primary/40",
                                            "cursor-pointer",
                                            isMenuOpen && "ring-2 ring-primary/40",
                                          )}
                                          style={{
                                            boxShadow: isPresente
                                              ? "0 0 10px rgba(6,182,212,0.3)"
                                              : isAtendimento
                                              ? "0 0 10px rgba(34,197,94,0.3)"
                                              : isDesmarcado || isFaltaNaoJust
                                              ? "0 0 8px rgba(239,68,68,0.25)"
                                              : isRemarcado
                                              ? "0 0 8px rgba(250,204,21,0.2)"
                                              : isRemanejado
                                              ? "0 0 8px rgba(249,115,22,0.2)"
                                              : isFaltaJust
                                              ? "0 0 8px rgba(6,182,212,0.2)"
                                              : "none",
                                          }}
                                        >
                                          <div className="flex items-center justify-between gap-1">
                                            <span className="flex items-center gap-1.5 min-w-0 font-bold text-foreground text-xs leading-tight" title={apt.patientName || undefined}>
                                              <PatientAvatar url={photoById.get(apt.patientId)} name={apt.patientName} size={40} />
                                              <span className="truncate">
                                                {apt.prontuario && <span className="text-cyan-400 font-extrabold mr-1">[{apt.prontuario}]</span>}
                                                {isGhost ? (
                                                  <span className="text-amber-400">⚠ Sem dados</span>
                                                ) : (
                                                  abbreviateName(apt.patientName) || `#${apt.patientId}`
                                                )}
                                              </span>
                                            </span>
                                            {/* Cadeado visível quando Presente — status vem da recepção */}
                                            {isPresente && (
                                              <Lock className="w-3 h-3 shrink-0" style={{ color: "#22d3ee", filter: "drop-shadow(0 0 4px rgba(6,182,212,0.7))" }} />
                                            )}
                                          </div>
                                          <span className={cn("px-1.5 py-0.5 rounded text-[9px] uppercase font-bold w-max", getStatusColor(apt.status))}>{getStatusLabel(apt.status)}</span>
                                          {(apt.paused || (apt.status || "").toLowerCase() === "pausado") && (
                                            <span className="px-1.5 py-0.5 rounded text-[9px] uppercase font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center gap-0.5">
                                              <Snowflake className="w-2.5 h-2.5" /> Pausado
                                            </span>
                                          )}
                                          {isMulti && multiPartner && (
                                            <span className="text-[9px] text-violet-400 font-semibold flex items-center gap-0.5 flex-wrap">
                                              <Users className="w-2.5 h-2.5 shrink-0" /> Multi: {selectedProf?.name} {selectedProf?.specialty ? `(${selectedProf.specialty})` : ""} & {multiPartner} {multiPartnerSpec ? `(${multiPartnerSpec})` : ""}
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
                                          {/* Encaminhamento info on slot card */}
                                          {apt.notes && apt.notes.includes("ENCAMINHAMENTO") && (
                                            <span className="text-[9px] text-fuchsia-400/70 font-semibold flex items-center gap-0.5 truncate">
                                              <ArrowRightLeft className="w-2.5 h-2.5 shrink-0" /> Enc. Interno
                                            </span>
                                          )}
                                        </div>

                                        {isMenuOpen && (
                                          <div
                                            className="absolute z-50 top-full left-0 mt-1 w-56 rounded-2xl shadow-2xl"
                                            style={{ background: "rgba(2,4,8,0.97)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(20px)", padding: "10px", display: "flex", flexDirection: "column", gap: "6px" }}
                                          >
                                            <p className="text-[10px] text-white/40 uppercase font-bold mb-1 px-1">Ações — {apt.patientName || `Agendamento #${apt.id}`}</p>
                                            {isGhost && (
                                              <p className="text-[9px] text-amber-400/80 font-semibold px-1 mb-1">⚠ Paciente sem dados — solicite exclusão ao admin</p>
                                            )}
                                            {(isFaltaJust || isFaltaNaoJust) && !isAdminViewing ? (
                                              <p className="text-[9px] text-amber-400/80 font-semibold px-1 mb-1">🔒 Falta registrada — apenas Admin/Recepção pode alterar</p>
                                            ) : (
                                              <>
                                                <button style={NEON.green} onClick={() => handleAtendimento(apt)}>
                                                  <Activity className="w-3.5 h-3.5" /> Em Atendimento
                                                </button>
                                                <button style={NEON.yellow} onClick={() => handleFaltaJustificada(apt)}>
                                                  <CheckCircle className="w-3.5 h-3.5" /> Falta Justificada
                                                </button>
                                                <button style={NEON.red} onClick={() => handleFaltaNaoJustificada(apt)}>
                                                  <AlertTriangle className="w-3.5 h-3.5" /> Falta N. Justificada
                                                </button>
                                              </>
                                            )}
                                            <div style={{ height: "1px", background: "rgba(255,255,255,0.07)", margin: "2px 0" }} />
                                            {isAdminViewing && (
                                              <button style={NEON.red} onClick={() => handleDesmarcado(apt)}>
                                                <AlertTriangle className="w-3.5 h-3.5" /> Desmarcar
                                              </button>
                                            )}

                                            <button style={NEON.orange} onClick={() => handleRemanejar(apt)}>
                                              <RotateCcw className="w-3.5 h-3.5" /> Remanejar
                                            </button>
                                            <button style={NEON.yellow} onClick={() => handleRemarcar(apt)}>
                                              <CalendarIcon className="w-3.5 h-3.5" /> Remarcar
                                            </button>

                                            {/* ── Periodicidade (Frequência) Cards ── */}
                                            {(apt.recurrenceGroupId || isMulti) && (
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
                                            {(apt.paused || (apt.status || "").toLowerCase() === "pausado") ? (
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
                                            <button style={{ ...NEON.red, marginTop: "2px" }} onClick={() => handleSaida(apt, "Desistência")}>
                                              <UserX className="w-3.5 h-3.5" /> Desistência
                                            </button>
                                            <button style={{ ...NEON.red, marginTop: "2px" }} onClick={() => handleSaida(apt, "Óbito")}>
                                              <XOctagon className="w-3.5 h-3.5" /> Óbito
                                            </button>

                                            <div style={{ height: "1px", background: "rgba(255,255,255,0.07)", margin: "2px 0" }} />
                                            <button style={NEON.fuchsia} onClick={() => handleEncaminhamento(apt)}>
                                              <ArrowRightLeft className="w-3.5 h-3.5" /> Encaminhamento Interno
                                            </button>

                                            <button style={{ ...NEON.fuchsia, background: "rgba(0,8,10,0.92)", border: "1px solid #06b6d4", color: "#67e8f9", boxShadow: "0 0 14px rgba(6,182,212,0.55)", textShadow: "0 0 8px rgba(103,232,249,0.9)" }} onClick={() => handleMultiAtendimento(apt)}>
                                              <UserPlus className="w-3.5 h-3.5" /> Atendimento Multi
                                            </button>

                                            {isMulti && (
                                              <button style={NEON.violet} onClick={() => handleStartDesfazerMulti(apt)}>
                                                <UserX className="w-3.5 h-3.5" /> Desfazer Multi
                                              </button>
                                            )}

                                            <div style={{ height: "1px", background: "rgba(255,255,255,0.07)", margin: "2px 0" }} />
                                            {isAdminViewing && (
                                              <button style={NEON.red} onClick={() => handleExcluirAdmin(apt)}>
                                                <Trash2 className="w-3.5 h-3.5" /> Excluir Agendamento
                                              </button>
                                            )}

                                            {/* ── Referral info if exists ── */}
                                            {apt.notes && apt.notes.includes("Encaminhamento") && (
                                              <div className="rounded-lg p-2 mt-1" style={{ background: "rgba(192,38,211,0.08)", border: "1px solid rgba(192,38,211,0.2)" }}>
                                                <p className="text-[9px] text-fuchsia-400 font-bold flex items-center gap-1">
                                                  <Info className="w-3 h-3" /> Info do Encaminhamento
                                                </p>
                                                <p className="text-[8px] text-white/50 mt-0.5 leading-tight">{apt.notes}</p>
                                              </div>
                                            )}

                                            <p className="text-[9px] text-white/30 italic leading-tight px-1 mt-1">
                                              Recepção é notificada automaticamente a cada ação.
                                            </p>
                                            <button onClick={() => setActionMenuId(null)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.3)", fontSize: "10px", cursor: "pointer", marginTop: "2px", textAlign: "center" }}>
                                              <XCircle className="w-3 h-3 inline mr-1" />Fechar
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })())}
                                  {/* Fase 5A (prof): permite empilhar outro paciente no mesmo slot (atendimento em grupo). */}
                                  <button
                                    onClick={() => setBookingSlot({ date, time })}
                                    className="w-full text-[10px] font-semibold py-1.5 rounded-lg border border-dashed border-cyan-500/30 text-cyan-400/70 hover:text-cyan-300 hover:border-cyan-400/60 hover:bg-cyan-500/5 transition-colors flex items-center justify-center gap-1"
                                  >
                                    <Plus className="w-3 h-3" /> adicionar ao grupo
                                  </button>
                                    </div>
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
            </div>

            {/* Today's summary */}
            <div className="bg-card rounded-2xl border border-border p-6 shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
              <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" style={{ filter: "drop-shadow(0 0 6px rgba(0,240,255,0.5))" }} /> Resumo de Hoje — {format(new Date(), "dd/MM/yyyy")}
              </h3>
              <div className="space-y-2">
                {TIME_SLOTS.filter(t => isPaula || t !== "12:10").map(time => {
                  const apts = getApts(today, time);
                  const apt = apts[0] ?? null;
                  return (
                    <div key={time} className={cn("flex items-center gap-4 px-4 py-3 rounded-xl text-sm", apt ? "bg-primary/8 border border-primary/20" : "bg-secondary/50 border border-border/50")}>
                      <span className="font-bold text-primary w-14 shrink-0">{time}</span>
                      <span className={apt ? "font-semibold text-foreground" : "text-muted-foreground italic"}>
                        {apt ? (apt.patientName || `Paciente #${apt.patientId}`) : "Livre"}
                      </span>
                      {apt && <span className={cn("ml-auto px-2 py-0.5 rounded text-[10px] uppercase font-bold", getStatusColor(apt.status))}>{getStatusLabel(apt.status)}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

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
                <button
                  className="flex-1 rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/5 px-4 py-2 text-sm font-medium transition-colors"
                  onClick={() => setPauseModal(null)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de Exclusão Administrativa ── */}
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
                  <p className="text-xs text-white/50">Limpeza administrativa</p>
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
                <button className="flex-1 rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/5 text-sm" onClick={() => setExcluirConfirm(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de Saída (Alta / Óbito / Desistência) ── */}
      {altaConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => { setAltaConfirm(null); setAltaMotivo(""); }}>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl" style={{ background: "rgba(5,0,0,0.97)", border: "1px solid rgba(239,68,68,0.3)" }} onClick={e => e.stopPropagation()}>
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
              <p className="text-sm text-white/70 mb-1">
                <strong className="text-white">{altaConfirm.patientName}</strong> será removido da agenda deste profissional
                e da fila desta especialidade. Agendamentos em outras especialidades não serão afetados.
              </p>
              <p className="text-xs text-white/50 mt-1">Status global só será alterado se não houver outros atendimentos ativos.</p>
              <div className="mb-4 mt-4">
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
              <div className="flex gap-3">
                <button onClick={() => { setAltaConfirm(null); setAltaMotivo(""); }} className="flex-1 py-3 rounded-xl font-semibold text-sm" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}>
                  Cancelar
                </button>
                <button
                  onClick={confirmSaida}
                  disabled={!altaMotivo.trim()}
                  className="flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                  style={{ background: "rgba(239,68,68,0.15)", border: "1px solid #ef4444", color: "#f87171", boxShadow: "0 0 16px rgba(239,68,68,0.3)", opacity: altaMotivo.trim() ? 1 : 0.4, cursor: altaMotivo.trim() ? "pointer" : "not-allowed" }}
                >
                  {saidaTipo === "Alta" && <LogOut className="w-4 h-4" />}
                  {saidaTipo === "Desistência" && <UserX className="w-4 h-4" />}
                  {saidaTipo === "Óbito" && <XOctagon className="w-4 h-4" />}
                  Confirmar {saidaTipo}
                </button>
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
                <button onClick={() => setEncApt(null)} className="flex-1 py-3 rounded-xl font-semibold text-sm" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}>
                  Cancelar
                </button>
                <button
                  onClick={confirmEncaminhamento}
                  disabled={!encEspecialidade || encSending}
                  className="flex-1 py-3 rounded-xl font-bold text-sm"
                  style={{ background: "rgba(192,38,211,0.15)", border: "1px solid #c026d3", color: "#e879f9", boxShadow: "0 0 16px rgba(192,38,211,0.3)", opacity: encEspecialidade && !encSending ? 1 : 0.4, cursor: encEspecialidade && !encSending ? "pointer" : "not-allowed" }}
                >
                  {encSending ? "Encaminhando..." : "Confirmar Encaminhamento"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Desfazer Multi (confirmação) ── */}
      {undoMultiApt && (() => {
        const partner = (undoMultiApt.notes || "").replace("Atendimento Multi com ", "").replace(/\s*\(.*\)$/, "").trim();
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => !undoMultiSending && setUndoMultiApt(null)}>
            <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl" style={{ background: "rgba(8,0,14,0.97)", border: "1px solid rgba(139,92,246,0.4)" }} onClick={e => e.stopPropagation()}>
              <div className="px-6 py-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(139,92,246,0.15)", border: "1px solid #8b5cf6" }}>
                    <UserX className="w-5 h-5" style={{ color: "#c4b5fd" }} />
                  </div>
                  <div>
                    <p className="font-bold" style={{ color: "#c4b5fd", textShadow: "0 0 8px rgba(196,181,253,0.8)" }}>Desfazer Multi</p>
                    <p className="text-xs text-white/50">{undoMultiApt.patientName} — {undoMultiApt.time}</p>
                  </div>
                </div>

                <p className="text-sm text-white/80 mb-2 leading-relaxed">
                  Remover o profissional convidado{partner ? <> <span className="font-bold text-violet-300">{partner}</span></> : ""} deste atendimento?
                </p>
                <p className="text-[11px] text-white/45 mb-4 leading-relaxed">
                  {selectedProf?.name ? <><span className="font-semibold text-white/70">{selectedProf.name}</span> continua com o atendimento normalmente.</> : "O profissional principal continua com o atendimento normalmente."} As ocorrências passadas são preservadas.
                </p>

                <div className="flex gap-3">
                  <button
                    onClick={confirmDesfazerMulti}
                    disabled={undoMultiSending}
                    style={{ ...NEON.violet, flex: 1, justifyContent: "center", padding: "10px", opacity: undoMultiSending ? 0.5 : 1, cursor: undoMultiSending ? "wait" : "pointer" }}
                  >
                    <UserX className="w-4 h-4" /> {undoMultiSending ? "Removendo..." : "Remover convidado"}
                  </button>
                  <button onClick={() => !undoMultiSending && setUndoMultiApt(null)} disabled={undoMultiSending} className="flex-1 py-3 rounded-xl font-semibold text-sm" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}>
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Multi-Atendimento Modal ── */}
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
                  className="flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                  style={{ background: "rgba(6,182,212,0.15)", border: "1px solid #06b6d4", color: "#67e8f9", boxShadow: "0 0 16px rgba(6,182,212,0.3)", opacity: multiProfId && !multiSending ? 1 : 0.4, cursor: multiProfId && !multiSending ? "pointer" : "not-allowed" }}
                >
                  <UserPlus className="w-4 h-4" /> {multiSending ? "Criando..." : "Confirmar Multi"}
                </button>
                <button onClick={() => setMultiApt(null)} className="flex-1 py-3 rounded-xl font-semibold text-sm" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {absenceAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setAbsenceAlert(null)}>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl" style={{ background: "rgba(4,3,0,0.97)", border: `1px solid ${absenceAlert.consecutive >= 3 ? "rgba(239,68,68,0.5)" : "rgba(234,179,8,0.5)"}` }} onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: absenceAlert.consecutive >= 3 ? "rgba(239,68,68,0.15)" : "rgba(234,179,8,0.15)", border: `1px solid ${absenceAlert.consecutive >= 3 ? "#ef4444" : "#eab308"}` }}>
                  <AlertTriangle className="w-5 h-5" style={{ color: absenceAlert.consecutive >= 3 ? "#f87171" : "#fde047" }} />
                </div>
                <div>
                  <p className="font-bold text-sm" style={{ color: absenceAlert.consecutive >= 3 ? "#f87171" : "#fde047" }}>
                    {absenceAlert.consecutive >= 3 ? "🚨 Protocolo de Gestão de Vagas" : "⚠️ Alerta de Evasão"}
                  </p>
                  <p className="text-xs text-white/50">
                    {absenceAlert.consecutive >= 3 ? "3ª falta consecutiva — ação imediata" : "2ª falta consecutiva — iniciar busca ativa"}
                  </p>
                </div>
              </div>
              <p className="text-sm text-white/70 mb-3">
                <strong className="text-white">{absenceAlert.patientName}</strong> acumula <strong style={{ color: absenceAlert.consecutive >= 3 ? "#f87171" : "#fde047" }}>{absenceAlert.consecutive} faltas não justificadas consecutivas</strong>.
              </p>
              {absenceAlert.consecutive >= 3 && (
                <div className="mb-3 p-3 rounded-xl text-xs" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5" }}>
                  Acionar a coordenação para aplicar protocolo de gestão de vagas. O espaço pode ser realocado para outro paciente em lista de espera.
                </div>
              )}
              {absenceAlert.consecutive === 2 && (
                <div className="mb-3 p-3 rounded-xl text-xs" style={{ background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.3)", color: "#fde047" }}>
                  Realizar busca ativa: contatar a família e verificar barreiras de transporte antes da próxima sessão.
                </div>
              )}
              {(absenceAlert.escolaPublica || absenceAlert.trabalhoNaRoca) && (
                <div className="mb-3 p-3 rounded-xl text-xs" style={{ background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.35)", color: "#67e8f9" }}>
                  <strong>Atenção à vulnerabilidade:</strong> paciente é de {[absenceAlert.escolaPublica && "escola pública", absenceAlert.trabalhoNaRoca && "família que trabalha na roça"].filter(Boolean).join(" e ")}. Avaliar barreiras de transporte antes de acionar protocolo.
                </div>
              )}
              <button onClick={() => setAbsenceAlert(null)} className="w-full py-3 rounded-xl font-bold text-sm mt-1" style={{ background: absenceAlert.consecutive >= 3 ? "rgba(239,68,68,0.15)" : "rgba(234,179,8,0.12)", border: `1px solid ${absenceAlert.consecutive >= 3 ? "#ef4444" : "#eab308"}`, color: absenceAlert.consecutive >= 3 ? "#f87171" : "#fde047" }}>
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {remanejFlow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => !remanejSending && setRemanejFlow(null)}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl" style={{ background: "rgba(0,5,15,0.97)", border: "1px solid rgba(59,130,246,0.3)" }} onClick={e => e.stopPropagation()}>
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
                <button onClick={() => setRemanejFlow(null)} className="text-white/30 hover:text-white/70" disabled={remanejSending}><X className="w-5 h-5" /></button>
              </div>

              {remanejFlow.done ? (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <CheckCircle className="w-10 h-10" style={{ color: "#60a5fa" }} />
                  <p className="font-semibold text-white">
                    {remanejFlow.kind === "remarcar" ? "Remarcação concluída!" : "Remanejamento concluído!"}
                  </p>
                  <p className="text-sm text-white/60">
                    {remanejFlow.apt.patientName} movido(a) para {remanejFlow.newTime} do dia {remanejFlow.newDate}.
                    {remanejFlow.kind === "remarcar" && " Na semana seguinte, retorna ao horário original."}
                  </p>
                  <button onClick={() => setRemanejFlow(null)} className="mt-2 w-full py-2 rounded-xl font-bold text-sm" style={{ background: "rgba(59,130,246,0.15)", border: "1px solid #3b82f6", color: "#60a5fa" }}>
                    Fechar
                  </button>
                </div>
              ) : (
                <>
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
                      : "Escolha um novo horário livre nesta semana:"}
                  </p>
                  {modalAvailableSlots.length === 0 ? (
                    <p className="text-center text-white/40 py-8">Nenhum horário disponível nesta semana.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
                      {modalWeekDates.map(date => {
                        const daySlots = modalAvailableSlots.filter(s => s.date === date);
                        if (daySlots.length === 0) return null;
                        const dayLabel = modalWeekDays.find(d => format(d, "yyyy-MM-dd") === date);
                        return (
                          <div key={date}>
                            <p className="text-[10px] text-white/40 uppercase font-bold mb-1">
                              {dayLabel ? format(dayLabel, "EEE dd/MM", { locale: ptBR }) : date}
                            </p>
                            {daySlots.map(slot => (
                              <button
                                key={slot.time}
                                onClick={() => confirmRemanejar(slot.date, slot.time)}
                                disabled={remanejSending}
                                style={{ ...NEON.blue, opacity: remanejSending ? 0.5 : 1 }}
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
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {bookingSlot && selectedProfId && (
        <BookingModal
          date={bookingSlot.date}
          time={bookingSlot.time}
          professionalId={Number(selectedProfId)}
          professionalName={selectedProf?.name || ""}
          professionalSpecialty={selectedProf?.specialty || ""}
          onClose={() => setBookingSlot(null)}
          onSuccess={() => {
            setBookingSlot(null);
            fetchAppointments();
            toast({ title: "Agendado!", description: "Paciente movido da fila para a agenda." });
          }}
        />
      )}
    </div>
  );
}
