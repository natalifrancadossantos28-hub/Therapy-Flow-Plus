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
  if (s === "ativo" || s === "presente") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (s === "inativo" || s === "ausente") return "bg-rose-100 text-rose-800 border-rose-200";
  if (s === "alta") return "bg-purple-100 text-purple-800 border-purple-200";
  if (s === "agendado") return "bg-blue-100 text-blue-800 border-blue-200";
  if (s === "remarcado") return "bg-amber-100 text-amber-800 border-amber-200";
  if (s === "aguardando triagem") return "bg-sky-100 text-sky-800 border-sky-200";
  if (s === "fila de espera") return "bg-orange-100 text-orange-800 border-orange-200";
  if (s === "atendimento") return "bg-teal-100 text-teal-800 border-teal-200";
  if (s === "pré-cadastro") return "bg-slate-100 text-slate-700 border-slate-200";
  if (s === "desistência") return "bg-zinc-100 text-zinc-700 border-zinc-200";
  if (s === "óbito") return "bg-neutral-200 text-neutral-700 border-neutral-300";
  return "bg-slate-100 text-slate-800 border-slate-200";
};

export const getPriorityColor = (priority: string) => {
  const p = priority.toLowerCase();
  if (p === "alta") return "bg-rose-100 text-rose-800 border-rose-200";
  if (p === "media" || p === "média") return "bg-amber-100 text-amber-800 border-amber-200";
  if (p === "baixa") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  return "bg-slate-100 text-slate-800 border-slate-200";
};
