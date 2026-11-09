import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Button, Input, Label, Select } from "@/components/ui-custom";
import { useToast } from "@/hooks/use-toast";
import { openBuscaAtivaCaso } from "@/lib/arco-rpc";
import { BUSCA_MOTIVOS, quemEncaminha } from "@/lib/busca-ativa";

export function EncaminharBuscaAtivaModal({
  patientId, patientName, specialty, professionalId, onClose, onDone,
}: {
  patientId: number;
  patientName: string;
  specialty?: string | null;
  professionalId?: number | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  const { toast } = useToast();
  const [motivo, setMotivo] = useState<string>(BUSCA_MOTIVOS[0]);
  const [outro, setOutro] = useState("");
  const [detalhe, setDetalhe] = useState("");
  const [sending, setSending] = useState(false);

  const enviar = async () => {
    const base = motivo === "Outro" ? outro.trim() : motivo;
    if (!base) {
      toast({ title: "Informe o motivo", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      await openBuscaAtivaCaso({
        patientId,
        motivo: detalhe.trim() ? `${base} — ${detalhe.trim()}` : base,
        specialty: specialty ?? null,
        professionalId: professionalId ?? null,
        encaminhadoPor: quemEncaminha(),
      });
      toast({ title: "Encaminhado para a Busca Ativa", description: `${patientName} continua na agenda e na fila normalmente.` });
      onDone?.();
      onClose();
    } catch (err: unknown) {
      toast({ title: "Erro ao encaminhar", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-card p-6 shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-rose-500/15 text-rose-400">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <p className="font-bold text-lg">Encaminhar para Busca Ativa</p>
            <p className="text-xs text-muted-foreground">Para a assistente social. A agenda e a fila não mudam.</p>
          </div>
        </div>
        <p className="text-sm"><strong>{patientName}</strong>{specialty ? ` · ${specialty}` : ""}</p>
        <div>
          <Label>Motivo</Label>
          <Select value={motivo} onChange={e => setMotivo(e.target.value)}>
            {BUSCA_MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
          </Select>
          {motivo === "Outro" && (
            <Input className="mt-2" placeholder="Descreva o motivo" value={outro} onChange={e => setOutro(e.target.value)} autoFocus />
          )}
        </div>
        <div>
          <Label>O que aconteceu (opcional)</Label>
          <Input placeholder="Ex.: criança chegou com marcas, mãe relatou..." value={detalhe} onChange={e => setDetalhe(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={sending}>Cancelar</Button>
          <Button onClick={enviar} disabled={sending} className="bg-rose-600 hover:bg-rose-500 text-white gap-1">
            <ShieldAlert className="w-4 h-4" /> Encaminhar
          </Button>
        </div>
      </div>
    </div>
  );
}
