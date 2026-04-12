import { useState, useEffect } from "react";
import { useGetProfessionals } from "@workspace/api-client-react";
import { Card, Select } from "@/components/ui-custom";
import { format, startOfWeek, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon, Clock } from "lucide-react";
import { cn, getStatusColor } from "@/lib/utils";
import { Link } from "wouter";

const TIME_SLOTS = [
  "07:30", "08:00", "08:50", "09:40", "10:30", "11:20",
  "12:10",
  "13:00", "13:50", "14:40", "15:30",
];

function getWeekDays(referenceDate: Date): Date[] {
  const monday = startOfWeek(referenceDate, { weekStartsOn: 1 });
  return Array.from({ length: 5 }, (_, i) => addDays(monday, i));
}

type Appointment = {
  id: number;
  patientId: number;
  patientName?: string;
  professionalId: number;
  date: string;
  time: string;
  status: string;
};

export default function Agenda() {
  const [selectedProfId, setSelectedProfId] = useState<string>("");
  const [weekRef] = useState<Date>(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const { data: professionals } = useGetProfessionals();

  const weekDays = getWeekDays(weekRef);

  useEffect(() => {
    if (!selectedProfId) return;
    fetch(`/api/appointments?professionalId=${selectedProfId}`)
      .then(r => r.json())
      .then(setAppointments)
      .catch(console.error);
  }, [selectedProfId]);

  const weekDates = weekDays.map(d => format(d, "yyyy-MM-dd"));

  const getApt = (date: string, time: string) =>
    appointments.find(a => a.date === date && a.time === time);

  const selectedProf = professionals?.find(p => String(p.id) === selectedProfId);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Agenda Semanal</h1>
          <p className="text-muted-foreground mt-1">
            Grade semanal fixa — {weekDays.length > 0 && (
              `${format(weekDays[0], "dd/MM")} a ${format(weekDays[4], "dd/MM/yyyy")}`
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 bg-card p-2 rounded-2xl border border-border shadow-sm">
          <CalendarIcon className="w-5 h-5 text-primary ml-2" />
          <Select
            value={selectedProfId}
            onChange={e => setSelectedProfId(e.target.value)}
            className="border-none shadow-none focus-visible:ring-0 font-semibold text-foreground bg-transparent min-w-[180px]"
          >
            <option value="">Selecione o profissional</option>
            {professionals?.map(p => (
              <option key={p.id} value={p.id}>{p.name} – {p.specialty}</option>
            ))}
          </Select>
        </div>
      </div>

      {!selectedProfId ? (
        <Card className="p-16 text-center">
          <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-bold text-foreground">Selecione um profissional</p>
          <p className="text-muted-foreground">Escolha o profissional para visualizar a grade semanal.</p>
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
                  <th className="px-4 py-4 w-24 sticky left-0 bg-secondary/90 backdrop-blur z-10 border-r border-border">
                    Horário
                  </th>
                  {weekDays.map((d, i) => (
                    <th key={i} className="px-4 py-4 text-center min-w-[140px]">
                      <span className="font-bold text-foreground capitalize">
                        {format(d, "EEEE", { locale: ptBR })}
                      </span>
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
                      <td className="px-4 py-3 font-display font-bold text-primary sticky left-0 bg-card/90 backdrop-blur z-10 border-r border-border">
                        {time}
                      </td>
                      {isLunch ? (
                        <td colSpan={5} className="px-4 py-3 bg-slate-50/50 text-center text-muted-foreground italic font-medium">
                          Almoço — Pausa
                        </td>
                      ) : (
                        weekDates.map((date, i) => {
                          const apt = getApt(date, time);
                          return (
                            <td key={i} className="px-4 py-3">
                              {apt ? (
                                <div className="p-2 rounded-xl border border-border/50 bg-white shadow-sm flex flex-col gap-1">
                                  <Link
                                    href={`/patients/${apt.patientId}`}
                                    className="font-bold text-foreground hover:text-primary hover:underline truncate block text-xs"
                                  >
                                    {apt.patientName || `Paciente #${apt.patientId}`}
                                  </Link>
                                  <span className={cn("px-1.5 py-0.5 rounded text-[9px] uppercase font-bold w-max", getStatusColor(apt.status))}>
                                    {apt.status}
                                  </span>
                                </div>
                              ) : (
                                <div className="h-full min-h-[50px] flex items-center justify-center border-2 border-dashed border-border/40 rounded-xl text-muted-foreground/40 text-[10px] font-semibold">
                                  Livre
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
        </Card>
      )}
    </div>
  );
}
