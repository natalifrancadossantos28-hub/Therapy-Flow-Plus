import { Snowflake, History } from "lucide-react";
import { Card } from "@/components/ui-custom";
import { formatDate } from "@/lib/utils";
import { buscaStatusLabel } from "@/lib/busca-ativa";
import type { BuscaAtivaHistoricoItem, PausedOverviewItem } from "@/lib/arco-rpc";

export function BuscaAtivaPacienteCard({ current, history }: { current: PausedOverviewItem[]; history: BuscaAtivaHistoricoItem[] }) {
  if (current.length === 0 && history.length === 0) return null;
  return (
    <Card className="p-6 border-2 border-sky-500/40">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-sky-500/15 text-sky-400">
          <Snowflake className="w-6 h-6" />
        </div>
        <div>
          <h3 className="font-bold font-display text-lg">Busca Ativa</h3>
          <p className="text-sm text-muted-foreground">
            {current.length > 0 ? "Paciente está em Busca Ativa agora" : `Já passou ${history.length}x pela Busca Ativa`}
          </p>
        </div>
      </div>
      <div className="space-y-3 text-sm">
        {current.map(i => (
          <div key={`${i.source}-${i.id}`} className="rounded-lg border border-sky-500/40 bg-sky-500/10 p-3">
            <p className="font-bold text-sky-300 uppercase text-xs">Em Busca Ativa · {i.specialty || i.professionalName}</p>
            <p className="mt-1"><span className="text-muted-foreground">Motivo:</span> {i.pausedReason}</p>
            <p className="text-xs text-muted-foreground">Desde {i.pausedAt ? formatDate(i.pausedAt) : "—"} · {buscaStatusLabel(i.buscaStatus)}</p>
            {i.buscaObs && <p className="text-xs mt-1">Obs.: {i.buscaObs}</p>}
          </div>
        ))}
        {history.map(h => (
          <div key={h.id} className="rounded-lg border border-border bg-secondary/20 p-3">
            <p className="font-bold text-xs uppercase flex items-center gap-1 text-muted-foreground">
              <History className="w-3.5 h-3.5" /> Já passou · {h.specialty || h.professionalName || "—"}
            </p>
            <p className="mt-1"><span className="text-muted-foreground">Motivo:</span> {h.motivo || "—"}</p>
            <p className="text-xs text-muted-foreground">
              {h.pausedAt ? formatDate(h.pausedAt) : "—"} até {formatDate(h.returnedAt)}
              {h.buscaStatus ? ` · ${buscaStatusLabel(h.buscaStatus)}` : ""}
            </p>
            {h.buscaObs && <p className="text-xs mt-1">Obs.: {h.buscaObs}</p>}
            {h.retornoMotivo && <p className="text-xs text-emerald-400 mt-1">{h.retornoMotivo}</p>}
          </div>
        ))}
      </div>
    </Card>
  );
}
