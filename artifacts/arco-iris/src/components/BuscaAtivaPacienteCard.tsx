import { ShieldAlert, History } from "lucide-react";
import { Card } from "@/components/ui-custom";
import { formatDate } from "@/lib/utils";
import { buscaStatusLabel } from "@/lib/busca-ativa";
import type { BuscaAtivaCaso } from "@/lib/arco-rpc";

export function BuscaAtivaPacienteCard({ current, history }: { current: BuscaAtivaCaso[]; history: BuscaAtivaCaso[] }) {
  if (current.length === 0 && history.length === 0) return null;
  return (
    <Card className="p-6 border-2 border-rose-500/40">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-rose-500/15 text-rose-400">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div>
          <h3 className="font-bold font-display text-lg">Busca Ativa</h3>
          <p className="text-sm text-muted-foreground">
            {current.length > 0 ? "Caso aberto com a assistente social" : `Já passou ${history.length}x pela Busca Ativa`}
          </p>
        </div>
      </div>
      <div className="space-y-3 text-sm">
        {current.map(i => (
          <div key={i.id} className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3">
            <p className="font-bold text-rose-300 uppercase text-xs">Em Busca Ativa{i.specialty ? ` · ${i.specialty}` : ""}</p>
            <p className="mt-1"><span className="text-muted-foreground">Motivo:</span> {i.motivo}</p>
            <p className="text-xs text-muted-foreground">
              Desde {formatDate(i.createdAt)} · {buscaStatusLabel(i.status)}{i.encaminhadoPor ? ` · por ${i.encaminhadoPor}` : ""}
            </p>
            {i.obs && <p className="text-xs mt-1">Obs.: {i.obs}</p>}
          </div>
        ))}
        {history.map(h => (
          <div key={h.id} className="rounded-lg border border-border bg-secondary/20 p-3">
            <p className="font-bold text-xs uppercase flex items-center gap-1 text-muted-foreground">
              <History className="w-3.5 h-3.5" /> Já passou{h.specialty ? ` · ${h.specialty}` : ""}
            </p>
            <p className="mt-1"><span className="text-muted-foreground">Motivo:</span> {h.motivo}</p>
            <p className="text-xs text-muted-foreground">{formatDate(h.createdAt)} até {h.finalizadoAt ? formatDate(h.finalizadoAt) : "—"}</p>
            {h.obs && <p className="text-xs mt-1">Obs.: {h.obs}</p>}
            {h.saida && <p className="text-xs text-emerald-400 mt-1">{h.saida}</p>}
          </div>
        ))}
      </div>
    </Card>
  );
}
