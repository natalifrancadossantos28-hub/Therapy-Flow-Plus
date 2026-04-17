import { useState, useEffect, useRef } from "react";
import { useGetProfessionals } from "@workspace/api-client-react";
import { Card, Select, Button, Label } from "@/components/ui-custom";
import { format, startOfWeek, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Calendar as CalendarIcon, Clock, Lock, ShieldCheck, ExternalLink,
  X, MessageCircle, CheckCircle, Activity, RotateCcw, LogOut, AlertTriangle
} from "lucide-react";
import { cn, getStatusColor, getStatusLabel } from "@/lib/utils";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import BookingModal from "@/components/BookingModal";

const TIME_SLOTS = [
  "08:00", "08:50", "09:40", "10:30", "11:20",
  "12:10",
  "13:10", "14:00", "14:50", "15:40",
];

function getWeekDays(ref: Date): Date[] {
  const monday = startOfWeek(ref, { weekStartsOn: 1 });
  return Array.from({ length: 5 }, (_, i) => addDays(monday, i));
}

type Appointment = {
  id: number;
  patientId: number;
  patientName?: string | null;
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
};

type AbsenceAlert = {
  patientName: string;
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
  step: "slot" | "carla";
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
};

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
  const isAdmin = isAdminSession();
  const [selectedProfId, setSelectedProfId] = useState<string>("");
  const [pinInput, setPinInput] = useState("");
  const [pinVerified, setPinVerified] = useState(false);
  const [pinError, setPinError] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [weekRef] = useState(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [bookingSlot, setBookingSlot] = useState<{ date: string; time: string } | null>(null);
  const [cancelDialog, setCancelDialog] = useState<CancelDialog | null>(null);
  const [notifySending, setNotifySending] = useState(false);
  const [notifyDone, setNotifyDone] = useState(false);
  const [actionMenuId, setActionMenuId] = useState<number | null>(null);
  const [altaConfirm, setAltaConfirm] = useState<Appointment | null>(null);
  const [absenceAlert, setAbsenceAlert] = useState<AbsenceAlert | null>(null);
  const [remanejFlow, setRemanejFlow] = useState<RemanejFlow | null>(null);
  const [remanejSending, setRemanejSending] = useState(false);
  const [remanejDone, setRemanejDone] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { data: professionals } = useGetProfessionals();
  const { toast } = useToast();

  const canView = isAdmin || pinVerified;
  const weekDays = getWeekDays(weekRef);
  const weekDates = weekDays.map(d => format(d, "yyyy-MM-dd"));

  const fetchAppointments = () => {
    if (!selectedProfId) return;
    const from = weekDates[0];
    const to = weekDates[4];
    fetch(`/api/appointments?professionalId=${selectedProfId}&dateFrom=${from}&dateTo=${to}`)
      .then(r => r.json()).then(setAppointments).catch(console.error);
  };

  useEffect(() => {
    if (canView && selectedProfId) fetchAppointments();
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
      const res = await fetch(`/api/professionals/${selectedProfId}/verify-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinInput }),
      });
      if (res.ok) { setPinVerified(true); }
      else { const d = await res.json(); setPinError(d.error || "PIN incorreto"); setPinInput(""); }
    } catch { setPinError("Erro ao verificar PIN."); }
    finally { setPinLoading(false); }
  };

  // ── Patch status (single occurrence) ──
  const patchStatus = async (apt: Appointment, status: string) => {
    const res = await fetch(`/api/appointments/${apt.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    setAppointments(prev => prev.map(a => a.id === apt.id ? { ...a, status } : a));
    return data;
  };

  // ── Log na tabela Notificações_Recepção ──
  const logNotificacao = async (apt: Appointment, acao: string) => {
    try {
      await fetch("/api/notificacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId: apt.id,
          patientName: apt.patientName || `Paciente #${apt.patientId}`,
          professionalName: apt.professionalName || selectedProf?.name || "—",
          acao,
          dataConsulta: apt.date,
          horaConsulta: apt.time,
        }),
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
      await patchStatus(apt, "desmarcado");
      await logNotificacao(apt, "Desmarcar");
      setNotifyDone(false);
      setCancelDialog({ apt: { ...apt, status: "desmarcado" }, profName, originalStatus });
    } catch {
      toast({ title: "Erro", description: "Não foi possível desmarcar.", variant: "destructive" });
    }
  };

  // ── Reverter desmarcado ──
  const handleRevertClick = async (apt: Appointment) => {
    const revertTo = cancelDialog?.originalStatus || "agendado";
    try {
      await fetch(`/api/appointments/${apt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: revertTo }),
      });
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
      await logNotificacao(apt, "Falta Não Justificada");
      const consecutive: number = result?.consecutiveUnjustifiedAbsences ?? 1;
      if (consecutive >= 2) {
        setAbsenceAlert({
          patientName: apt.patientName ?? `Paciente #${apt.patientId}`,
          consecutive,
          escolaPublica: result?.escolaPublica ?? false,
          trabalhoNaRoca: result?.trabalhoNaRoca ?? false,
        });
      } else {
        toast({ title: "⚠️ Falta Não Justificada registrada", description: `${apt.patientName} — 1ª ausência sem justificativa.` });
      }
    } catch {
      toast({ title: "Erro", description: "Não foi possível registrar.", variant: "destructive" });
    }
  };

  // ── Dar Alta ──
  const handleDarAlta = (apt: Appointment) => {
    setActionMenuId(null);
    setAltaConfirm(apt);
  };

  const confirmDarAlta = async () => {
    if (!altaConfirm) return;
    try {
      await fetch(`/api/appointments/${altaConfirm.id}/alta`, { method: "DELETE" });
      setAppointments(prev => prev.filter(a =>
        a.id !== altaConfirm.id &&
        !(a.recurrenceGroupId && a.recurrenceGroupId === altaConfirm.recurrenceGroupId && a.date >= altaConfirm.date)
      ));
      setAltaConfirm(null);
      toast({ title: "Alta aplicada", description: `Horário de ${altaConfirm.patientName} liberado permanentemente.` });
    } catch {
      toast({ title: "Erro", description: "Não foi possível dar alta.", variant: "destructive" });
    }
  };

  // ── Remanejar ──
  const handleStartRemanejar = (apt: Appointment) => {
    setActionMenuId(null);
    setRemanejFlow({ apt, step: "slot" });
    setRemanejDone(false);
  };

  const handlePickRemanejSlot = (newDate: string, newTime: string) => {
    if (!remanejFlow) return;
    setRemanejFlow({ ...remanejFlow, step: "carla", newDate, newTime });
  };

  const confirmRemanejar = async (notifyCarla: boolean) => {
    if (!remanejFlow?.newDate || !remanejFlow?.newTime) return;
    setRemanejSending(true);
    try {
      await fetch(`/api/appointments/${remanejFlow.apt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: remanejFlow.newDate, time: remanejFlow.newTime, status: "remarcado" }),
      });
      setAppointments(prev => prev.map(a =>
        a.id === remanejFlow.apt.id
          ? { ...a, date: remanejFlow.newDate!, time: remanejFlow.newTime!, status: "remarcado" }
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
        "Remanejar"
      );
      setRemanejDone(true);
    } catch {
      toast({ title: "Erro", description: "Não foi possível remanejar.", variant: "destructive" });
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

  const getApt = (date: string, time: string) => appointments.find(a => a.date === date && a.time === time);
  const selectedProf = professionals?.find(p => String(p.id) === selectedProfId);

  // Available slots for remanejar (no appointment in that slot)
  const availableSlots = weekDates.flatMap(date =>
    TIME_SLOTS.filter(t => t !== "12:10" && !getApt(date, t)).map(time => ({ date, time }))
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Agenda Semanal</h1>
          <p className="text-muted-foreground mt-1">
            Grade semanal — {weekDays.length > 0 && `${format(weekDays[0], "dd/MM")} a ${format(weekDays[4], "dd/MM/yyyy")}`}
          </p>
        </div>
        <Link href="/agenda-profissionais">
          <Button variant="outline" className="gap-2 text-sm">
            <ExternalLink className="w-4 h-4" /> Portal do Profissional
          </Button>
        </Link>
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
            <table className="w-full text-sm text-left min-w-[700px]">
              <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border">
                <tr>
                  <th className="px-4 py-4 w-24 sticky left-0 bg-secondary/90 backdrop-blur z-10 border-r border-border">Horário</th>
                  {weekDays.map((d, i) => (
                    <th key={i} className="px-4 py-4 text-center min-w-[150px]">
                      <span className="font-bold text-foreground capitalize">{format(d, "EEEE", { locale: ptBR })}</span>
                      <div className="font-normal mt-0.5">{format(d, "dd/MM")}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TIME_SLOTS.map(time => {
                  const isLunch = time === "12:10";
                  return (
                    <tr key={time} className="border-b border-border hover:bg-secondary/10 transition-colors">
                      <td className="px-4 py-3 font-display font-bold text-primary sticky left-0 bg-card/90 backdrop-blur z-10 border-r border-border">{time}</td>
                      {isLunch ? (
                        <td colSpan={5} className="px-4 py-3 bg-slate-50/50 text-center text-muted-foreground italic font-medium">Almoço — Pausa</td>
                      ) : (
                        weekDates.map((date, i) => {
                          const apt = getApt(date, time);
                          const isDesmarcado = apt?.status?.toLowerCase() === "desmarcado";
                          const isAtendimento = apt?.status?.toLowerCase() === "atendimento" || apt?.status?.toLowerCase() === "presente";
                          const isRemarcado = apt?.status?.toLowerCase() === "remarcado";
                          const isFaltaJustificada = apt?.status?.toLowerCase() === "falta_justificada" || apt?.status?.toLowerCase() === "justificado" || apt?.status?.toLowerCase() === "abonado";
                          const isFaltaNaoJustificada = apt?.status?.toLowerCase() === "falta_nao_justificada" || apt?.status?.toLowerCase() === "ausente";
                          const isMenuOpen = apt && actionMenuId === apt.id;

                          return (
                            <td key={i} className="px-3 py-2 relative">
                              {apt ? (
                                <div className="relative" ref={isMenuOpen ? menuRef : null}>
                                  {/* Appointment block */}
                                  <div
                                    onClick={() => setActionMenuId(isMenuOpen ? null : apt.id)}
                                    className={cn(
                                      "p-2 rounded-xl border flex flex-col gap-1 cursor-pointer transition-all select-none",
                                      isDesmarcado && "bg-red-950/10 border-red-500/40",
                                      isFaltaNaoJustificada && "bg-red-950/10 border-red-500/40",
                                      isAtendimento && "bg-green-950/10 border-green-400/40",
                                      isRemarcado && "bg-orange-950/10 border-orange-400/40",
                                      isFaltaJustificada && "border-cyan-500/40",
                                      !isDesmarcado && !isAtendimento && !isRemarcado && !isFaltaJustificada && !isFaltaNaoJustificada && "bg-white border-border/50",
                                      isMenuOpen && "ring-2 ring-primary/40"
                                    )}
                                    style={{
                                      boxShadow: isDesmarcado || isFaltaNaoJustificada
                                        ? "0 0 8px rgba(239,68,68,0.25)"
                                        : isAtendimento
                                        ? "0 0 8px rgba(34,197,94,0.2)"
                                        : isRemarcado
                                        ? "0 0 8px rgba(249,115,22,0.2)"
                                        : isFaltaJustificada
                                        ? "0 0 8px rgba(6,182,212,0.25)"
                                        : "none",
                                      background: isFaltaJustificada ? "rgba(6,182,212,0.04)" : undefined,
                                    }}
                                  >
                                    <span className="font-bold text-foreground truncate text-xs leading-tight">
                                      {apt.patientName || `Paciente #${apt.patientId}`}
                                    </span>
                                    <span className={cn("px-1.5 py-0.5 rounded text-[9px] uppercase font-bold w-max", getStatusColor(apt.status))}>
                                      {getStatusLabel(apt.status)}
                                    </span>
                                    {isDesmarcado && (
                                      <span className="text-[9px] text-orange-400 font-semibold">⚠ só esta data</span>
                                    )}
                                    {isRemarcado && (
                                      <span className="text-[9px] text-blue-400 font-semibold">↩ remanejado</span>
                                    )}
                                    {apt.recurrenceGroupId && !isDesmarcado && !isRemarcado && (
                                      <span className="text-[9px] text-muted-foreground/50">
                                        {apt.ciclo === "A" ? "↺ quinzenal A" : apt.ciclo === "B" ? "↺ quinzenal B" : apt.ciclo === "M" ? "↺ mensal" : "↺ semanal"}
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
                                      <p className="text-[10px] text-white/40 uppercase font-bold mb-1 px-1">Ações — {apt.patientName}</p>

                                      <button style={NEON.green} onClick={() => handleAtendimento(apt)}>
                                        <Activity className="w-3.5 h-3.5" /> ✅ Presente
                                      </button>

                                      <button style={NEON.yellow} onClick={() => handleFaltaJustificada(apt)}>
                                        <CheckCircle className="w-3.5 h-3.5" /> ⚠️ Falta Justificada
                                      </button>

                                      <button style={NEON.red} onClick={() => handleFaltaNaoJustificada(apt)}>
                                        <AlertTriangle className="w-3.5 h-3.5" /> 🔴 Falta N. Justificada
                                      </button>

                                      <div style={{ height: "1px", background: "rgba(255,255,255,0.07)", margin: "2px 0" }} />

                                      <button style={NEON.red} onClick={() => handleDesmarcado(apt, selectedProf?.name || "")}>
                                        <AlertTriangle className="w-3.5 h-3.5" /> Desmarcar
                                      </button>

                                      <button style={NEON.orange} onClick={() => handleStartRemanejar(apt)}>
                                        <RotateCcw className="w-3.5 h-3.5" /> Remanejar
                                      </button>

                                      <button style={NEON.red} onClick={() => handleDarAlta(apt)}>
                                        <LogOut className="w-3.5 h-3.5" /> Dar Alta
                                      </button>
                                    </div>
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

      {/* ── BookingModal ── */}
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
            toast({ title: "Agendado!", description: "Sessões semanais criadas automaticamente para as próximas 52 semanas." });
          }}
        />
      )}

      {/* ── Dar Alta Confirmation ── */}
      {altaConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl" style={{ background: "rgba(5,0,0,0.97)", border: "1px solid rgba(239,68,68,0.3)" }}>
            <div className="px-6 py-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(239,68,68,0.15)", border: "1px solid #ef4444" }}>
                  <LogOut className="w-5 h-5" style={{ color: "#f87171" }} />
                </div>
                <div>
                  <p className="font-bold" style={{ color: "#f87171", textShadow: "0 0 8px rgba(248,113,113,0.8)" }}>Dar Alta</p>
                  <p className="text-xs text-white/50">Ação permanente e irreversível</p>
                </div>
              </div>
              <p className="text-sm text-white/80 mb-1">
                Isso removerá <strong className="text-white">{altaConfirm.patientName}</strong> deste horário
                <strong className="text-white"> e de todas as semanas futuras</strong>.
              </p>
              {altaConfirm.recurrenceGroupId && (
                <p className="text-xs text-orange-400/80 mt-2">
                  ⚠ Este é um agendamento recorrente. Todos os próximos serão cancelados.
                </p>
              )}
              <div className="flex gap-3 mt-5">
                <button
                  onClick={confirmDarAlta}
                  style={{ ...NEON.red, flex: 1, justifyContent: "center", padding: "10px" }}
                >
                  <LogOut className="w-4 h-4" /> Confirmar Alta
                </button>
                <Button variant="outline" className="flex-1 border-white/10 text-white/60 hover:text-white hover:bg-white/5" onClick={() => setAltaConfirm(null)}>
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
                    <p className="font-bold text-white mb-2">Protocolo de Gestão de Vagas</p>
                    <p>Limite de <strong>3 ausências não justificadas</strong> atingido. O prontuário será encaminhado para a coordenação para liberação da vaga e redirecionamento de fila. Favor notificar a família sobre o encerramento do ciclo terapêutico atual.</p>
                  </>
                ) : (
                  <>
                    <p className="font-bold text-white mb-2">Atenção Recepção</p>
                    <p>Identificada <strong>2ª ausência não justificada</strong>. Favor realizar contato de acolhimento para entender o motivo da falta (transporte/saúde) e reforçar a importância da continuidade para o sucesso do tratamento. Informar gentilmente que o limite de ausências sem justificativa é de 3 turnos.</p>
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
                <button
                  onClick={() => setAbsenceAlert(null)}
                  style={{ ...NEON.green, flex: 1, justifyContent: "center", padding: "10px" }}
                >
                  <CheckCircle className="w-4 h-4" /> Entendido
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Remanejar: Pick Slot ── */}
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
                    <p className="font-bold" style={{ color: "#60a5fa", textShadow: "0 0 8px rgba(96,165,250,0.8)" }}>Remanejar</p>
                    <p className="text-xs text-white/50">{remanejFlow.apt.patientName}</p>
                  </div>
                </div>
                <button onClick={() => setRemanejFlow(null)} className="text-white/30 hover:text-white/70"><X className="w-5 h-5" /></button>
              </div>

              <p className="text-sm text-white/60 mb-4">Escolha um novo horário disponível nesta semana:</p>

              {availableSlots.length === 0 ? (
                <p className="text-center text-white/40 py-8">Nenhum horário disponível nesta semana.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                  {weekDates.map(date => {
                    const daySlots = availableSlots.filter(s => s.date === date);
                    if (daySlots.length === 0) return null;
                    const dayLabel = weekDays.find(d => format(d, "yyyy-MM-dd") === date);
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

      {/* ── Remanejar: Carla Notify ── */}
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
                  <p className="font-semibold">Remanejamento concluído!</p>
                  <p className="text-sm text-muted-foreground">
                    {remanejFlow.apt.patientName} movido(a) para {remanejFlow.newTime} do dia {remanejFlow.newDate}.
                  </p>
                  <Button onClick={() => setRemanejFlow(null)} className="mt-2 w-full">Fechar</Button>
                </div>
              ) : (
                <>
                  <div className="bg-blue-50 border border-blue-100 rounded-2xl rounded-tl-none px-4 py-3 mb-5">
                    <p className="text-sm text-foreground leading-relaxed">
                      Vi que você remanejou a sessão de{" "}
                      <strong>{remanejFlow.apt.patientName}</strong> para{" "}
                      <strong>{remanejFlow.newTime} — {
                        weekDays.find(d => format(d, "yyyy-MM-dd") === remanejFlow.newDate)
                          ? format(weekDays.find(d => format(d, "yyyy-MM-dd") === remanejFlow.newDate)!, "EEEE dd/MM", { locale: ptBR })
                          : remanejFlow.newDate
                      }</strong>.{" "}
                      Posso avisar o responsável pelo WhatsApp?
                    </p>
                  </div>
                  {!remanejFlow.apt.guardianPhone && (
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                      ⚠️ Responsável sem telefone cadastrado.
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
                      Só remanejar
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
