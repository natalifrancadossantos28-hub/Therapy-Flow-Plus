import { useState, useEffect } from "react";
import { format, startOfWeek, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon, Clock, Lock, ShieldCheck, Printer, LogOut } from "lucide-react";
import { cn, getStatusColor } from "@/lib/utils";
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
type Appointment = { id: number; patientId: number; patientName?: string; date: string; time: string; status: string; professionalId: number };

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

  const getApt = (date: string, time: string) => appointments.find(a => a.date === date && a.time === time);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      {/* Header */}
      <div className="bg-white border-b border-emerald-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center">
              <CalendarIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-gray-900 leading-tight">NFS – Portal do Profissional</p>
              <p className="text-xs text-gray-500">Agenda Semanal</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {pinVerified && (
              <>
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors shadow-sm"
                >
                  <Printer className="w-4 h-4" /> Imprimir Agenda do Dia
                </button>
                <button
                  onClick={() => { setPinVerified(false); setSelectedProfId(""); setPinInput(""); }}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl hover:bg-rose-50 hover:text-rose-700 border border-gray-200 hover:border-rose-200 transition-colors"
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
            <div className="bg-white rounded-3xl shadow-xl border border-emerald-100 overflow-hidden">
              <div className="bg-gradient-to-r from-emerald-500 to-teal-500 p-8 text-center text-white">
                <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Lock className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold">Acesso do Profissional</h2>
                <p className="text-sm opacity-80 mt-1">Selecione seu nome e informe o PIN</p>
              </div>
              <div className="p-8 space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Profissional</label>
                  <select
                    value={selectedProfId}
                    onChange={e => handleProfChange(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-gray-50 font-medium"
                  >
                    <option value="">Selecione seu nome...</option>
                    {professionals.map(p => <option key={p.id} value={p.id}>{p.name} – {p.specialty}</option>)}
                  </select>
                </div>

                {selectedProfId && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">PIN (4 dígitos)</label>
                    <input
                      type="password" maxLength={4}
                      value={pinInput}
                      onChange={e => setPinInput(e.target.value.replace(/\D/, ""))}
                      onKeyDown={e => e.key === "Enter" && verifyPin()}
                      placeholder="••••"
                      className="w-full border border-gray-200 rounded-xl px-4 py-4 text-center font-mono text-2xl tracking-[1em] focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-gray-50"
                    />
                    {pinError && <p className="text-red-500 text-sm mt-2 font-semibold">{pinError}</p>}
                  </div>
                )}

                <button
                  onClick={verifyPin}
                  disabled={!selectedProfId || pinInput.length !== 4 || pinLoading}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors shadow-sm"
                >
                  {pinLoading ? "Verificando..." : "Acessar Agenda"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Pro info bar */}
            <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-500" />
                <div>
                  <p className="font-bold text-gray-900">{selectedProf?.name}</p>
                  <p className="text-sm text-gray-500">{selectedProf?.specialty}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-700">Semana atual</p>
                <p className="text-xs text-gray-500">{format(weekDays[0], "dd/MM")} a {format(weekDays[4], "dd/MM/yyyy")}</p>
              </div>
            </div>

            {/* Weekly grid */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead className="bg-emerald-50 border-b border-emerald-100">
                    <tr>
                      <th className="px-5 py-4 w-24 sticky left-0 bg-emerald-50 backdrop-blur z-10 border-r border-emerald-100 text-left text-xs text-emerald-700 uppercase font-bold">Horário</th>
                      {weekDays.map((d, i) => {
                        const isToday = format(d, "yyyy-MM-dd") === today;
                        return (
                          <th key={i} className={cn("px-4 py-4 text-center min-w-[140px] text-xs uppercase font-bold", isToday ? "text-emerald-700 bg-emerald-100/50" : "text-gray-500")}>
                            <span className="capitalize">{format(d, "EEEE", { locale: ptBR })}</span>
                            <div className={cn("font-normal mt-0.5 text-[11px]", isToday && "text-emerald-600 font-bold")}>{format(d, "dd/MM")}</div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {TIME_SLOTS.map(time => {
                      const isLunch = time === "12:10";
                      return (
                        <tr key={time} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                          <td className={cn("px-5 py-3 font-bold sticky left-0 bg-white z-10 border-r border-gray-100", isLunch ? "text-gray-400" : "text-emerald-600")}>
                            {time}
                          </td>
                          {isLunch ? (
                            <td colSpan={5} className="px-4 py-3 bg-slate-50 text-center text-gray-400 italic font-medium text-xs">
                              🍽 Almoço — Pausa
                            </td>
                          ) : (
                            weekDates.map((date, i) => {
                              const apt = getApt(date, time);
                              const isToday = date === today;
                              return (
                                <td key={i} className={cn("px-4 py-2.5", isToday && "bg-emerald-50/30")}>
                                  {apt ? (
                                    <div className="p-2.5 rounded-xl border border-gray-200 bg-white shadow-sm">
                                      <p className="font-semibold text-gray-900 text-xs truncate">
                                        {apt.patientName || `Paciente #${apt.patientId}`}
                                      </p>
                                      <span className={cn("px-1.5 py-0.5 rounded text-[9px] uppercase font-bold w-max mt-1 block", getStatusColor(apt.status))}>
                                        {apt.status}
                                      </span>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setBookingSlot({ date, time })}
                                      className="w-full min-h-[50px] flex items-center justify-center border-2 border-dashed border-gray-200 rounded-xl text-gray-300 hover:border-emerald-300 hover:text-emerald-400 hover:bg-emerald-50/30 transition-colors text-[10px] font-semibold cursor-pointer"
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
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-500" /> Resumo de Hoje — {format(new Date(), "dd/MM/yyyy")}
              </h3>
              <div className="space-y-2">
                {TIME_SLOTS.filter(t => t !== "12:10").map(time => {
                  const apt = getApt(today, time);
                  return (
                    <div key={time} className={cn("flex items-center gap-4 px-4 py-3 rounded-xl text-sm", apt ? "bg-emerald-50 border border-emerald-100" : "bg-gray-50 border border-gray-100")}>
                      <span className="font-bold text-emerald-600 w-14 shrink-0">{time}</span>
                      <span className={apt ? "font-semibold text-gray-900" : "text-gray-400 italic"}>
                        {apt ? (apt.patientName || `Paciente #${apt.patientId}`) : "Livre"}
                      </span>
                      {apt && <span className={cn("ml-auto px-2 py-0.5 rounded text-[10px] uppercase font-bold", getStatusColor(apt.status))}>{apt.status}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

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
