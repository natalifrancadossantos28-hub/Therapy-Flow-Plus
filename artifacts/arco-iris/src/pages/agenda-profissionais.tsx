import { useState, useEffect } from "react";
import { format, startOfWeek, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon, Clock, Lock, ShieldCheck, Printer, LogOut, Activity, AlertTriangle, RotateCcw, XCircle, CheckCircle } from "lucide-react";
import { cn, getStatusColor, getStatusLabel } from "@/lib/utils";
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

type Professional = { id: number; name: string; specialty: string; pin?: string };
type Appointment = { id: number; patientId: number; patientName?: string; date: string; time: string; status: string; professionalId: number; escolaPublica?: boolean | null; trabalhoNaRoca?: boolean | null; consecutiveUnjustifiedAbsences?: number | null; };

type AbsenceAlert = { patientName: string; consecutive: number; escolaPublica: boolean; trabalhoNaRoca: boolean; };

const NEON: Record<string, React.CSSProperties> = {
  green: { background: "rgba(5,10,5,0.92)", border: "1px solid #22c55e", color: "#4ade80", boxShadow: "0 0 14px rgba(34,197,94,0.55)", textShadow: "0 0 8px rgba(74,222,128,0.9)", borderRadius: "10px", padding: "8px 14px", fontWeight: 700, fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", width: "100%", transition: "all 0.15s" },
  yellow: { background: "rgba(10,8,0,0.92)", border: "1px solid #eab308", color: "#fde047", boxShadow: "0 0 14px rgba(234,179,8,0.55)", textShadow: "0 0 8px rgba(253,224,71,0.9)", borderRadius: "10px", padding: "8px 14px", fontWeight: 700, fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", width: "100%", transition: "all 0.15s" },
  red: { background: "rgba(10,0,0,0.92)", border: "1px solid #ef4444", color: "#f87171", boxShadow: "0 0 14px rgba(239,68,68,0.55)", textShadow: "0 0 8px rgba(248,113,113,0.9)", borderRadius: "10px", padding: "8px 14px", fontWeight: 700, fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", width: "100%", transition: "all 0.15s" },
  orange: { background: "rgba(10,5,0,0.92)", border: "1px solid #f97316", color: "#fb923c", boxShadow: "0 0 14px rgba(249,115,22,0.55)", textShadow: "0 0 8px rgba(251,146,60,0.9)", borderRadius: "10px", padding: "8px 14px", fontWeight: 700, fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", width: "100%", transition: "all 0.15s" },
};

export default function AgendaProfissionais() {
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [selectedProfId, setSelectedProfId] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [pinVerified, setPinVerified] = useState(false);
  const [pinError, setPinError] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [weekRef] = useState(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [bookingSlot, setBookingSlot] = useState<{ date: string; time: string } | null>(null);
  const [actionMenuId, setActionMenuId] = useState<number | null>(null);
  const [altaConfirm, setAltaConfirm] = useState<Appointment | null>(null);
  const [absenceAlert, setAbsenceAlert] = useState<AbsenceAlert | null>(null);
  const { toast } = useToast();

  const weekDays = getWeekDays(weekRef);
  const weekDates = weekDays.map(d => format(d, "yyyy-MM-dd"));
  const today = format(new Date(), "yyyy-MM-dd");
  const selectedProf = professionals.find(p => String(p.id) === selectedProfId);

  useEffect(() => {
    fetch("/api/professionals").then(r => r.json()).then(setProfessionals).catch(console.error);
  }, []);

  const fetchAppointments = () => {
    if (!selectedProfId) return;
    fetch(`/api/appointments?professionalId=${selectedProfId}`)
      .then(r => r.json()).then(setAppointments).catch(console.error);
  };

  useEffect(() => { if (pinVerified) fetchAppointments(); }, [selectedProfId, pinVerified]);

  const handleProfChange = (id: string) => {
    setSelectedProfId(id); setPinVerified(false); setPinInput(""); setPinError("");
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
      else {
        const data = await res.json();
        setPinError(data.error || "PIN incorreto"); setPinInput("");
      }
    } catch { setPinError("Erro ao verificar PIN."); }
    finally { setPinLoading(false); }
  };

  const handlePrint = () => {
    const todayApts = appointments.filter(a => a.date === today);
    const doc = {
      title: `Agenda do Dia – ${selectedProf?.name}`,
      date: format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }),
    };

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const rows = TIME_SLOTS.filter(t => t !== "12:10").map(time => {
      const apt = todayApts.find(a => a.time === time);
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:700;color:#059669;">${time}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${apt ? (apt.patientName || `Paciente #${apt.patientId}`) : '<span style="color:#9ca3af;font-style:italic">Livre</span>'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${apt ? apt.status : ""}</td>
      </tr>`;
    }).join("");

    printWindow.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"><title>${doc.title}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:32px;color:#111;}
        h1{font-size:22px;margin-bottom:4px;}
        .sub{color:#6b7280;font-size:14px;margin-bottom:24px;}
        table{width:100%;border-collapse:collapse;font-size:14px;}
        th{text-align:left;padding:10px 12px;background:#f0fdf4;color:#059669;border-bottom:2px solid #059669;font-size:12px;text-transform:uppercase;letter-spacing:.05em;}
        .section-row td{background:#fefce8;color:#92400e;font-size:11px;font-weight:700;padding:8px 12px;border-bottom:1px solid #e5e7eb;text-transform:uppercase;letter-spacing:.05em;}
        .lunch-row td{background:#f1f5f9;color:#64748b;font-style:italic;padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;}
        @media print{.no-print{display:none}}
      </style>
    </head><body>
      <div class="no-print" style="display:flex;gap:12px;margin-bottom:20px;align-items:center;">
        <button onclick="window.close()" style="padding:8px 20px;background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">← Voltar ao Sistema</button>
        <button onclick="window.print()" style="padding:8px 20px;background:#059669;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;">🖨 Imprimir</button>
      </div>
      <h1>${doc.title}</h1>
      <p class="sub">${doc.date} • ${selectedProf?.specialty}</p>
      <table>
        <thead><tr><th>Horário</th><th>Paciente</th><th>Status</th></tr></thead>
        <tbody>
          <tr class="section-row"><td colspan="3">Período da Manhã — 08:00 às 11:20</td></tr>
          ${TIME_SLOTS.filter(t => t < "12:10").map(time => {
            const apt = todayApts.find(a => a.time === time);
            return `<tr>
              <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:700;color:#059669;">${time}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${apt ? (apt.patientName || `Paciente #${apt.patientId}`) : '<span style="color:#9ca3af;font-style:italic">Livre</span>'}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${apt ? apt.status : ""}</td>
            </tr>`;
          }).join("")}
          <tr class="lunch-row"><td colspan="3">🍽 12:10 — Intervalo de Almoço</td></tr>
          <tr class="section-row"><td colspan="3">Período da Tarde — 13:10 às 15:40</td></tr>
          ${TIME_SLOTS.filter(t => t > "12:10").map(time => {
            const apt = todayApts.find(a => a.time === time);
            return `<tr>
              <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:700;color:#059669;">${time}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${apt ? (apt.patientName || `Paciente #${apt.patientId}`) : '<span style="color:#9ca3af;font-style:italic">Livre</span>'}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${apt ? apt.status : ""}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
      <p style="margin-top:24px;font-size:11px;color:#94a3b8;">Encerramento: 16:30 | NFS – Gestão Terapêutica</p>
    </body></html>`);
    printWindow.document.close();
  };

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

  const logNotificacao = async (apt: Appointment, acao: string) => {
    try {
      await fetch("/api/notificacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId: apt.id,
          patientName: apt.patientName || `Paciente #${apt.patientId}`,
          professionalName: selectedProf?.name || "—",
          acao,
          dataConsulta: apt.date,
          horaConsulta: apt.time,
        }),
      });
    } catch { /* silencioso */ }
  };

  const handleConcluir = async (apt: Appointment) => {
    setActionMenuId(null);
    try {
      await patchStatus(apt, "atendimento");
      await logNotificacao(apt, "Concluir");
      toast({ title: "✅ Concluído", description: `${apt.patientName} confirmado na sessão.` });
    } catch {
      toast({ title: "Erro", description: "Não foi possível atualizar.", variant: "destructive" });
    }
  };

  const handleDesmarcar = async (apt: Appointment) => {
    setActionMenuId(null);
    try {
      await patchStatus(apt, "desmarcado");
      await logNotificacao(apt, "Desmarcar");
      toast({ title: "🔴 Desmarcado", description: `${apt.patientName} removido da sessão.` });
    } catch {
      toast({ title: "Erro", description: "Não foi possível desmarcar.", variant: "destructive" });
    }
  };

  const handleRemanejar = async (apt: Appointment) => {
    setActionMenuId(null);
    try {
      await patchStatus(apt, "remarcado");
      await logNotificacao(apt, "Remanejar");
      toast({ title: "🟠 Remanejar", description: `${apt.patientName} marcado para reagendamento. A recepção será notificada.` });
    } catch {
      toast({ title: "Erro", description: "Não foi possível remarcar.", variant: "destructive" });
    }
  };

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

  const handleDarAlta = (apt: Appointment) => {
    setActionMenuId(null);
    setAltaConfirm(apt);
  };

  const confirmDarAlta = async () => {
    if (!altaConfirm) return;
    try {
      await fetch(`/api/appointments/${altaConfirm.id}/alta`, { method: "DELETE" });
      setAppointments(prev => prev.filter(a => a.id !== altaConfirm.id));
      setAltaConfirm(null);
      toast({ title: "Alta aplicada", description: `Horário de ${altaConfirm.patientName} liberado.` });
    } catch {
      toast({ title: "Erro", description: "Não foi possível dar alta.", variant: "destructive" });
    }
  };

  const getApt = (date: string, time: string) => appointments.find(a => a.date === date && a.time === time);

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
            {pinVerified && (
              <>
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 transition-all shadow-sm hover:shadow-[0_0_16px_rgba(0,240,255,0.4)]"
                >
                  <Printer className="w-4 h-4" /> Imprimir Agenda do Dia
                </button>
                <button
                  onClick={() => { setPinVerified(false); setSelectedProfId(""); setPinInput(""); }}
                  className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground text-sm font-semibold rounded-xl hover:bg-[rgba(255,30,90,0.1)] hover:text-[#ff2060] border border-border hover:border-[rgba(255,30,90,0.3)] transition-all"
                >
                  <LogOut className="w-4 h-4" /> Sair da Agenda
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
            <div className="bg-card rounded-2xl border border-primary/20 px-6 py-4 flex items-center justify-between" style={{ boxShadow: "0 0 20px rgba(0,240,255,0.04)" }}>
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-primary" style={{ filter: "drop-shadow(0 0 6px rgba(0,240,255,0.5))" }} />
                <div>
                  <p className="font-bold text-foreground">{selectedProf?.name}</p>
                  <p className="text-sm text-muted-foreground">{selectedProf?.specialty}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-foreground">Semana atual</p>
                <p className="text-xs text-muted-foreground">{format(weekDays[0], "dd/MM")} a {format(weekDays[4], "dd/MM/yyyy")}</p>
              </div>
            </div>

            {/* Weekly grid */}
            <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead className="bg-muted/60 border-b border-border">
                    <tr>
                      <th className="px-5 py-4 w-24 sticky left-0 bg-muted/80 backdrop-blur z-10 border-r border-border text-left text-xs text-primary uppercase font-bold">Horário</th>
                      {weekDays.map((d, i) => {
                        const isToday = format(d, "yyyy-MM-dd") === today;
                        return (
                          <th key={i} className={cn("px-4 py-4 text-center min-w-[140px] text-xs uppercase font-bold", isToday ? "text-primary bg-primary/8" : "text-muted-foreground")}>
                            <span className="capitalize">{format(d, "EEEE", { locale: ptBR })}</span>
                            <div className={cn("font-normal mt-0.5 text-[11px]", isToday && "text-primary font-bold")}>{format(d, "dd/MM")}</div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {TIME_SLOTS.map(time => {
                      const isLunch = time === "12:10";
                      return (
                        <tr key={time} className="border-b border-border/60 hover:bg-secondary/30 transition-colors">
                          <td className={cn("px-5 py-3 font-bold sticky left-0 bg-card z-10 border-r border-border", isLunch ? "text-muted-foreground" : "text-primary")}>
                            {time}
                          </td>
                          {isLunch ? (
                            <td colSpan={5} className="px-4 py-3 bg-muted/30 text-center text-muted-foreground italic font-medium text-xs">
                              🍽 Almoço — Pausa
                            </td>
                          ) : (
                            weekDates.map((date, i) => {
                              const apt = getApt(date, time);
                              const isToday = date === today;
                              return (
                                <td key={i} className={cn("px-4 py-2.5 relative", isToday && "bg-primary/5")}>
                                  {apt ? (() => {
                                    const isMenuOpen = actionMenuId === apt.id;
                                    const isDesmarcado = apt.status?.toLowerCase() === "desmarcado";
                                    const isAtendimento = apt.status?.toLowerCase() === "atendimento" || apt.status?.toLowerCase() === "presente";
                                    const isRemarcado = apt.status?.toLowerCase() === "remarcado";
                                    const isFaltaJustificada = apt.status?.toLowerCase() === "falta_justificada" || apt.status?.toLowerCase() === "justificado" || apt.status?.toLowerCase() === "abonado";
                                    const isFaltaNaoJustificada = apt.status?.toLowerCase() === "falta_nao_justificada" || apt.status?.toLowerCase() === "ausente";
                                    return (
                                      <div className="relative">
                                        <div
                                          onClick={() => setActionMenuId(isMenuOpen ? null : apt.id)}
                                          className={cn(
                                            "p-2 rounded-xl border flex flex-col gap-1 cursor-pointer transition-all select-none",
                                            isDesmarcado && "bg-red-950/10 border-red-500/40",
                                            isFaltaNaoJustificada && "bg-red-950/10 border-red-500/40",
                                            isAtendimento && "bg-green-950/10 border-green-400/40",
                                            isRemarcado && "bg-orange-950/10 border-orange-400/40",
                                            isFaltaJustificada && "border-cyan-500/40",
                                            !isDesmarcado && !isAtendimento && !isRemarcado && !isFaltaJustificada && !isFaltaNaoJustificada && "bg-secondary/50 border-border",
                                            isMenuOpen && "ring-2 ring-primary/40"
                                          )}
                                          style={{
                                            boxShadow: isDesmarcado || isFaltaNaoJustificada ? "0 0 8px rgba(239,68,68,0.25)" : isAtendimento ? "0 0 8px rgba(34,197,94,0.2)" : isRemarcado ? "0 0 8px rgba(249,115,22,0.2)" : isFaltaJustificada ? "0 0 8px rgba(6,182,212,0.25)" : "none",
                                            background: isFaltaJustificada ? "rgba(6,182,212,0.04)" : undefined,
                                          }}
                                        >
                                          <p className="font-bold text-foreground truncate text-xs leading-tight">{apt.patientName || `Paciente #${apt.patientId}`}</p>
                                          <span className={cn("px-1.5 py-0.5 rounded text-[9px] uppercase font-bold w-max", getStatusColor(apt.status))}>{getStatusLabel(apt.status)}</span>
                                        </div>
                                        {isMenuOpen && (
                                          <div
                                            className="absolute z-50 top-full left-0 mt-1 min-w-[180px] rounded-2xl shadow-2xl"
                                            style={{ background: "rgba(2,4,8,0.97)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(20px)", padding: "10px", display: "flex", flexDirection: "column", gap: "6px" }}
                                          >
                                            <p className="text-[10px] text-white/40 uppercase font-bold mb-1 px-1">Ações — {apt.patientName}</p>
                                            <button style={NEON.green} onClick={() => handleConcluir(apt)}>
                                              <Activity className="w-3.5 h-3.5" /> ✅ Presente
                                            </button>
                                            <button style={NEON.yellow} onClick={() => handleFaltaJustificada(apt)}>
                                              <CheckCircle className="w-3.5 h-3.5" /> ⚠️ Falta Justificada
                                            </button>
                                            <button style={NEON.red} onClick={() => handleFaltaNaoJustificada(apt)}>
                                              <AlertTriangle className="w-3.5 h-3.5" /> 🔴 Falta N. Justificada
                                            </button>
                                            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: "4px", paddingTop: "6px" }}>
                                              <button style={NEON.red} onClick={() => handleDesmarcar(apt)}>
                                                <AlertTriangle className="w-3.5 h-3.5" /> Desmarcar
                                              </button>
                                            </div>
                                            <button style={NEON.orange} onClick={() => handleRemanejar(apt)}>
                                              <RotateCcw className="w-3.5 h-3.5" /> Remanejar
                                            </button>
                                            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: "4px", paddingTop: "6px" }}>
                                              <button style={NEON.red} onClick={() => handleDarAlta(apt)}>
                                                <LogOut className="w-3.5 h-3.5" /> Dar Alta
                                              </button>
                                            </div>
                                            <button onClick={() => setActionMenuId(null)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.3)", fontSize: "10px", cursor: "pointer", marginTop: "2px", textAlign: "center" }}>
                                              <XCircle className="w-3 h-3 inline mr-1" />Fechar
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })() : (
                                    <button
                                      onClick={() => setBookingSlot({ date, time })}
                                      className="w-full min-h-[50px] flex items-center justify-center border-2 border-dashed border-border/50 rounded-xl text-muted-foreground/40 hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all text-[10px] font-semibold cursor-pointer"
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
            </div>

            {/* Today's summary */}
            <div className="bg-card rounded-2xl border border-border p-6 shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
              <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" style={{ filter: "drop-shadow(0 0 6px rgba(0,240,255,0.5))" }} /> Resumo de Hoje — {format(new Date(), "dd/MM/yyyy")}
              </h3>
              <div className="space-y-2">
                {TIME_SLOTS.filter(t => t !== "12:10").map(time => {
                  const apt = getApt(today, time);
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

      {altaConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setAltaConfirm(null)}>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl" style={{ background: "rgba(5,0,0,0.97)", border: "1px solid rgba(239,68,68,0.3)" }} onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(239,68,68,0.15)", border: "1px solid #ef4444" }}>
                  <LogOut className="w-5 h-5" style={{ color: "#f87171" }} />
                </div>
                <div>
                  <p className="font-bold" style={{ color: "#f87171" }}>Dar Alta</p>
                  <p className="text-xs text-white/50">Esta ação liberará o horário permanentemente</p>
                </div>
              </div>
              <p className="text-sm text-white/70 mb-5">
                Confirmar alta de <strong className="text-white">{altaConfirm.patientName}</strong>? Os próximos agendamentos recorrentes serão cancelados.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setAltaConfirm(null)} className="flex-1 py-3 rounded-xl font-semibold text-sm" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}>
                  Cancelar
                </button>
                <button onClick={confirmDarAlta} className="flex-1 py-3 rounded-xl font-bold text-sm" style={{ background: "rgba(239,68,68,0.15)", border: "1px solid #ef4444", color: "#f87171", boxShadow: "0 0 16px rgba(239,68,68,0.3)" }}>
                  Confirmar Alta
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

      {bookingSlot && selectedProfId && (
        <BookingModal
          date={bookingSlot.date}
          time={bookingSlot.time}
          professionalId={Number(selectedProfId)}
          professionalName={selectedProf?.name || ""}
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
