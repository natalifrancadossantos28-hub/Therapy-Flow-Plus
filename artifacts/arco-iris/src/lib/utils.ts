import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string | null | undefined, dateFormat = "dd/MM/yyyy") {
  if (!dateStr) return "-";
  try {
    return format(parseISO(dateStr), dateFormat, { locale: ptBR });
  } catch (e) {
    return dateStr;
  }
}

export const getStatusColor = (status: string) => {
  const s = status.toLowerCase();
  if (s === "ativo" || s === "atendimento") return "badge-neon-green";
  if (s === "presente") return "badge-neon-cyan";
  if (s === "inativo" || s === "ausente" || s === "desmarcado" || s === "falta_nao_justificada") return "badge-neon-red";
  if (s === "alta") return "badge-neon-blue";
  if (s === "agendado") return "badge-neon-blue";
  if (s === "remarcado") return "badge-neon-yellow";
  if (s === "remanejado") return "badge-neon-orange";
  if (s === "aguardando triagem") return "badge-neon-blue";
  if (s === "fila de espera") return "badge-neon-orange";
  if (s === "abonado" || s === "falta_justificada" || s === "justificado") return "badge-neon-cyan";
  if (s === "pré-cadastro") return "bg-secondary text-muted-foreground border-border";
  if (s === "desistência") return "bg-secondary text-muted-foreground border-border";
  if (s === "óbito") return "bg-secondary text-muted-foreground border-border";
  return "bg-secondary text-muted-foreground border-border";
};

export const getStatusLabel = (status: string): string => {
  const s = status.toLowerCase();
  if (s === "atendimento") return "Em Atendimento";
  if (s === "presente") return "Presente";
  if (s === "ausente" || s === "falta_nao_justificada") return "Ausente";
  if (s === "falta_justificada" || s === "justificado" || s === "abonado") return "Justificado";
  if (s === "desmarcado") return "Desmarcado";
  if (s === "remarcado") return "Remarcado";
  if (s === "remanejado") return "Remanejado";
  if (s === "agendado") return "Agendado";
  return status;
};

export const getPriorityColor = (priority: string) => {
  const p = priority.toLowerCase();
  if (p === "elevado" || p === "alta") return "badge-neon-red";
  if (p === "moderado" || p === "media" || p === "média") return "badge-neon-orange";
  if (p === "leve") return "badge-neon-blue";
  if (p === "baixo" || p === "baixa") return "badge-neon-green";
  return "bg-secondary text-muted-foreground border-border";
};
