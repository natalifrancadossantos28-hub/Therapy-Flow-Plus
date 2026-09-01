import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Contador de faltas do paciente na especialidade — mesmo critério do sininho
 * da Recepção (count_absences_by_specialty).
 */
export function AbsenceBadge({ count, compact = false }: { count: number; compact?: boolean }) {
  if (count <= 0) return null;
  const tone =
    count >= 3
      ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
      : count >= 2
      ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
      : "bg-orange-500/15 text-orange-300 border-orange-500/30";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded border font-bold uppercase w-max max-w-full",
        compact ? "text-[9px] px-1 py-0.5" : "text-[10px] px-1.5 py-0.5",
        tone,
      )}
      title={`${count} falta(s) registrada(s) nesta especialidade`}
    >
      <Bell className={compact ? "w-2.5 h-2.5 shrink-0" : "w-3 h-3 shrink-0"} />
      {count} {count === 1 ? "falta" : "faltas"}
    </span>
  );
}
