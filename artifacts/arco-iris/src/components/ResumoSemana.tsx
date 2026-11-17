import { NeonResumo } from "@/components/AgendaNeon";
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
  return <NeonResumo itens={itens} />;
}
