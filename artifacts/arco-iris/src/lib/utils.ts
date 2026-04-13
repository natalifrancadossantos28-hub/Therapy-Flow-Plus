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
  if (s === "ativo" || s === "presente") return "badge-neon-green";
  if (s === "inativo" || s === "ausente" || s === "desmarcado") return "badge-neon-red";
  if (s === "alta") return "badge-neon-blue";
  if (s === "agendado") return "badge-neon-blue";
  if (s === "remarcado") return "badge-neon-orange";
  if (s === "aguardando triagem") return "badge-neon-blue";
  if (s === "fila de espera") return "badge-neon-orange";
  if (s === "atendimento") return "badge-neon-green";
  if (s === "abonado" || s === "falta_justificada" || s === "justificado") return "badge-neon-yellow";
  if (s === "pré-cadastro") return "bg-secondary text-muted-foreground border-border";
  if (s === "desistência") return "bg-secondary text-muted-foreground border-border";
  if (s === "óbito") return "bg-secondary text-muted-foreground border-border";
  return "bg-secondary text-muted-foreground border-border";
};

export const getPriorityColor = (priority: string) => {
  const p = priority.toLowerCase();
  if (p === "elevado" || p === "alta") return "badge-neon-red";
  if (p === "moderado" || p === "media" || p === "média") return "badge-neon-orange";
  if (p === "leve") return "badge-neon-blue";
  if (p === "baixo" || p === "baixa") return "badge-neon-green";
  return "bg-secondary text-muted-foreground border-border";
};
