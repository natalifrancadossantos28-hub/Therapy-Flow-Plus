import { CalendarCheck } from "lucide-react";
import { statusOf, ST_REALIZADO, ST_FALTA, ST_JUSTIFICADA, ST_CANCELADO } from "@/lib/indicadores";

type Apt = { date?: string | null; status?: string | null; patientId?: number | null };

/** Resumo da semana do profissional selecionado (só a agenda dele). */
export function ResumoSemana({ appointments, weekDates }: { appointments: Apt[]; weekDates: string[] }) {
  const dias = new Set(weekDates);
  const semana = appointments.filter((a) => a.date && dias.has(a.date));
  const conta = (set: Set<string>) => semana.filter((a) => set.has(statusOf(a))).length;
  const cancelados = conta(ST_CANCELADO);
  const itens = [
    { label: "Atendimentos na semana", valor: semana.length - cancelados },
    { label: "Pacientes", valor: new Set(semana.filter((a) => !ST_CANCELADO.has(statusOf(a))).map((a) => a.patientId)).size },
    { label: "Realizados", valor: conta(ST_REALIZADO) },
    { label: "Faltas", valor: conta(ST_FALTA) },
    { label: "Faltas justificadas", valor: conta(ST_JUSTIFICADA) },
  ];
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h3 className="font-bold text-sm flex items-center gap-2 mb-2">
        <CalendarCheck className="w-4 h-4 text-primary" /> Resumo da semana
      </h3>
      <div className="grid gap-1.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {itens.map((i) => (
          <div key={i.label} className="rounded-xl border border-border/70 px-3 py-2">
            <div className="text-2xl font-bold text-primary">{i.valor}</div>
            <div className="text-[12px] text-muted-foreground">{i.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
