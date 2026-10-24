import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Users, FileText } from "lucide-react";
import { listWaitingList, type WaitingListEntry } from "@/lib/arco-rpc";

/** Próximos da fila para a especialidade do profissional, na ordem atual da fila.
 *  É só uma sugestão: o agendamento continua sendo confirmado pela recepção. */
export function ProximosElegiveis({ specialty, showProntuario }: { specialty?: string | null; showProntuario: boolean }) {
  const [rows, setRows] = useState<WaitingListEntry[] | null>(null);
  useEffect(() => {
    if (!specialty) { setRows(null); return; }
    let alive = true;
    listWaitingList()
      .then((wl) => { if (alive) setRows(wl.filter((w) => !w.paused && w.specialty === specialty).slice(0, 5)); })
      .catch(() => { if (alive) setRows(null); });
    return () => { alive = false; };
  }, [specialty]);
  if (!specialty || !rows) return null;
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="font-bold text-sm flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Próximos elegíveis da fila · {specialty}</h3>
        <span className="text-[11px] text-muted-foreground">Sugestão: a recepção confirma antes de agendar</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ninguém aguardando nesta especialidade.</p>
      ) : (
        <ol className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-5">
          {rows.map((w, i) => (
            <li key={w.id} className="rounded-xl border border-border/70 px-3 py-2 text-sm">
              <span className="font-bold text-primary mr-1">#{i + 1}</span>
              <span className="font-semibold">{w.patientName}</span>
              <div className="text-[11px] text-muted-foreground">desde {w.entryDate ? w.entryDate.split("-").reverse().join("/") : "—"}</div>
              {showProntuario && (
                <Link href={`/patients/${w.patientId}`} className="text-[11px] text-primary font-semibold inline-flex items-center gap-1 mt-0.5 hover:underline">
                  <FileText className="w-3 h-3" /> Prontuário
                </Link>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
