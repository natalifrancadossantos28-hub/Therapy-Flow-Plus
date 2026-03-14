import { useState } from "react";
import { useGetAppointments, useGetProfessionals } from "@workspace/api-client-react";
import { Card, Input } from "@/components/ui-custom";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Clock } from "lucide-react";
import { cn, getStatusColor } from "@/lib/utils";
import { Link } from "wouter";

export default function Agenda() {
  const [date, setDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const { data: professionals } = useGetProfessionals();
  const { data: appointments, isLoading } = useGetAppointments({ date });

  const timeSlots = ["08:00", "08:50", "09:40", "10:30", "11:20", "12:10", "13:10", "14:00", "14:50", "15:40"];

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Agenda Geral</h1>
          <p className="text-muted-foreground mt-1">Visão completa de todos os consultórios.</p>
        </div>
        <div className="flex items-center gap-3 bg-card p-2 rounded-2xl border border-border shadow-sm">
          <CalendarIcon className="w-5 h-5 text-primary ml-2" />
          <Input 
            type="date" 
            value={date} 
            onChange={e => setDate(e.target.value)} 
            className="border-none shadow-none focus-visible:ring-0 font-semibold text-foreground bg-transparent"
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[800px]">
            <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border">
              <tr>
                <th className="px-4 py-4 w-24 sticky left-0 bg-secondary/90 backdrop-blur z-10 border-r border-border">Horário</th>
                {professionals?.map(prof => (
                  <th key={prof.id} className="px-4 py-4 min-w-[200px]">
                    <span className="font-bold text-foreground">{prof.name}</span>
                    <div className="font-normal mt-1">{prof.specialty}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timeSlots.map(time => {
                const isLunch = time === "12:10";
                return (
                  <tr key={time} className="border-b border-border hover:bg-secondary/10 transition-colors">
                    <td className="px-4 py-3 font-display font-bold text-primary sticky left-0 bg-card/90 backdrop-blur z-10 border-r border-border">
                      {time}
                    </td>
                    {isLunch ? (
                      <td colSpan={professionals?.length || 1} className="px-4 py-3 bg-slate-50/50 text-center text-muted-foreground italic font-medium">
                        Horário de Almoço (Pausa)
                      </td>
                    ) : (
                      professionals?.map(prof => {
                        const apt = appointments?.find(a => a.professionalId === prof.id && a.time === time);
                        return (
                          <td key={prof.id} className="px-4 py-3">
                            {apt ? (
                              <div className="p-3 rounded-xl border border-border/50 bg-white shadow-sm flex flex-col gap-2">
                                <Link href={`/patients/${apt.patientId}`} className="font-bold text-foreground hover:text-primary hover:underline truncate block">
                                  {apt.patientName || `Paciente #${apt.patientId}`}
                                </Link>
                                <span className={cn("px-2 py-0.5 rounded-md text-[10px] uppercase font-bold w-max", getStatusColor(apt.status))}>
                                  {apt.status}
                                </span>
                              </div>
                            ) : (
                              <div className="h-full min-h-[60px] flex items-center justify-center border-2 border-dashed border-border/50 rounded-xl text-muted-foreground/50 text-xs font-semibold">
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
    </div>
  );
}
