import { useState, useEffect } from "react";
import { useGetProfessionals } from "@workspace/api-client-react";
import { Card, Select, Button, Label } from "@/components/ui-custom";
import { format, startOfWeek, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon, Clock, Lock, ShieldCheck, ExternalLink } from "lucide-react";
import { cn, getStatusColor } from "@/lib/utils";
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
  id: number; patientId: number; patientName?: string;
  professionalId: number; date: string; time: string; status: string;
};

const isAdminSession = () => sessionStorage.getItem("nfs_admin_auth") === "true";

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
  const { data: professionals } = useGetProfessionals();
  const { toast } = useToast();

  // Admin bypasses PIN — access is granted by the admin session itself
  const canView = isAdmin || pinVerified;

  const weekDays = getWeekDays(weekRef);
  const weekDates = weekDays.map(d => format(d, "yyyy-MM-dd"));

  const fetchAppointments = () => {
    if (!selectedProfId) return;
    fetch(`/api/appointments?professionalId=${selectedProfId}`)
      .then(r => r.json()).then(setAppointments).catch(console.error);
  };

  useEffect(() => {
    if (canView && selectedProfId) fetchAppointments();
  }, [selectedProfId, canView]);

  const handleProfChange = (id: string) => {
    setSelectedProfId(id);
    if (!isAdmin) {
      setPinVerified(false);
      setPinInput("");
      setPinError("");
    }
  };

  const verifyPin = async () => {
    if (!selectedProfId || pinInput.length !== 4) return;
    setPinLoading(true);
    setPinError("");
    try {
      const res = await fetch(`/api/professionals/${selectedProfId}/verify-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinInput }),
      });
      if (res.ok) { setPinVerified(true); }
      else {
        const data = await res.json();
        setPinError(data.error || "PIN incorreto");
        setPinInput("");
      }
    } catch { setPinError("Erro ao verificar PIN."); }
    finally { setPinLoading(false); }
  };

  const getApt = (date: string, time: string) => appointments.find(a => a.date === date && a.time === time);
  const selectedProf = professionals?.find(p => String(p.id) === selectedProfId);

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

      {/* Professional selector */}
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
                type="password"
                maxLength={4}
                value={pinInput}
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
              <p className="text-sm text-muted-foreground">{selectedProf.specialty}</p>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[700px]">
              <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border">
                <tr>
                  <th className="px-4 py-4 w-24 sticky left-0 bg-secondary/90 backdrop-blur z-10 border-r border-border">Horário</th>
                  {weekDays.map((d, i) => (
                    <th key={i} className="px-4 py-4 text-center min-w-[140px]">
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
                          return (
                            <td key={i} className="px-4 py-3">
                              {apt ? (
                                <div className="p-2 rounded-xl border border-border/50 bg-white shadow-sm flex flex-col gap-1">
                                  <Link href={`/patients/${apt.patientId}`} className="font-bold text-foreground hover:text-primary hover:underline truncate block text-xs">
                                    {apt.patientName || `Paciente #${apt.patientId}`}
                                  </Link>
                                  <span className={cn("px-1.5 py-0.5 rounded text-[9px] uppercase font-bold w-max", getStatusColor(apt.status))}>{apt.status}</span>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setBookingSlot({ date, time })}
                                  className="w-full h-full min-h-[50px] flex items-center justify-center border-2 border-dashed border-border/40 rounded-xl text-muted-foreground/40 hover:border-primary/40 hover:text-primary/60 hover:bg-primary/5 transition-colors text-[10px] font-semibold cursor-pointer"
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

      {bookingSlot && selectedProfId && (
        <BookingModal
          date={bookingSlot.date}
          time={bookingSlot.time}
          professionalId={Number(selectedProfId)}
          professionalName={selectedProf?.name || ""}
          onClose={() => setBookingSlot(null)}
          onSuccess={() => { setBookingSlot(null); fetchAppointments(); toast({ title: "Agendado!", description: "Paciente incluído na agenda." }); }}
        />
      )}
    </div>
  );
}
