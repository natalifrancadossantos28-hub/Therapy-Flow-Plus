import { useState } from "react";
import { Button } from "@/components/ui-custom";
import { validarCriteriosFila, type WaitingListEntry } from "@/lib/arco-rpc";

/** A decisão de prioridade é registrada pela equipe, não inferida pelo diagnóstico. */
export function ValidarCriteriosFila({ entry, onSaved }: {
  entry: WaitingListEntry;
  onSaved: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [urgente, setUrgente] = useState(false);
  const [particular, setParticular] = useState(false);
  const [responsavel, setResponsavel] = useState("");
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const abrir = () => {
    setUrgente(!!entry.urgente);
    setParticular(!!entry.escolaParticular);
    setResponsavel(""); setMotivo(""); setError(""); setOpen(true);
  };
  const salvar = async () => {
    setSaving(true); setError("");
    try {
      await validarCriteriosFila({ id: entry.id, urgente, escolaParticular: particular,
        responsavel: responsavel.trim(), justificativa: motivo.trim(), expectedId: entry.criteriosValidacaoId ?? null });
      // Recarrega a ordem do servidor. Não muda respostas da triagem nem datas.
      await onSaved();
      setOpen(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Não foi possível atualizar os critérios. Atualize a fila antes de tentar novamente.");
    } finally { setSaving(false); }
  };
  return <>
    <Button variant="outline" className="h-8 text-xs" onClick={abrir}>Validar critérios</Button>
    {open && <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-label={`Validar critérios de ${entry.patientName}`} className="bg-card border border-border rounded-2xl p-5 space-y-4 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold">Validar critérios da fila</h2>
        <p className="text-sm">{entry.patientName} · {entry.specialty}</p>
        <p className="text-xs text-muted-foreground">Sinais de risco da triagem pedem avaliação técnica. Só a urgência confirmada abaixo antecipa a posição; o histórico da triagem permanece intacto.</p>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={urgente} disabled={saving} onChange={e => setUrgente(e.target.checked)} />Urgência confirmada pela equipe para esta especialidade</label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={particular} disabled={saving} onChange={e => setParticular(e.target.checked)} />Escola particular confirmada</label>
        <p className="text-xs text-muted-foreground">Escola particular ou atendimento fora informado no cadastro leva ao bloco final. Urgência confirmada prevalece. “Não está na rede municipal” sozinho não comprova escola particular.</p>
        <label className="block text-sm">Responsável técnico<input className="block w-full rounded-lg border border-border bg-background p-2 mt-1" value={responsavel} disabled={saving} onChange={e => setResponsavel(e.target.value)} /></label>
        <label className="block text-sm">Justificativa<textarea className="block w-full rounded-lg border border-border bg-background p-2 mt-1" value={motivo} disabled={saving} onChange={e => setMotivo(e.target.value)} /></label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2"><Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancelar</Button><Button disabled={saving || !responsavel.trim() || !motivo.trim()} onClick={salvar}>{saving ? "Salvando…" : "Registrar validação"}</Button></div>
      </div>
    </div>}
  </>;
}
