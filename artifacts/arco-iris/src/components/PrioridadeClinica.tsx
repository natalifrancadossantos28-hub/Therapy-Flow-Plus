import { useState } from "react";
import { AlertTriangle, ShieldAlert, Siren } from "lucide-react";
import { Button } from "@/components/ui-custom";
import { cn, formatDate } from "@/lib/utils";
import {
  NIVEL_INFO, PRIORIDADE_OPCOES, PRIORIDADE_PERGUNTAS, EMERGENCIA_PERGUNTA, EMERGENCIA_ALERTA,
  calcularPrioridade, createPrioridadeClinica, type PrioridadeClinica, type PrioridadeRespostas, type NivelPrioridade,
} from "@/lib/fila-indicadores";

export function NivelBadge({ nivel, emergencia }: { nivel: NivelPrioridade; emergencia?: boolean }) {
  const i = NIVEL_INFO[nivel];
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap"
      style={{ color: i.color, background: i.bg, border: `1px solid ${i.border}` }} title={i.desc}>
      {emergencia && <Siren className="w-3 h-3" />}{i.label.replace("Prioridade ", "")}
    </span>
  );
}

export function PrioridadeClinicaCard({ historico, onNova }: { historico: PrioridadeClinica[]; onNova: () => void }) {
  const atual = historico[0];
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-rose-500/15 text-rose-400"><ShieldAlert className="w-5 h-5" /></div>
          <div>
            <h3 className="font-bold font-display text-lg">Prioridade Clínica</h3>
            <p className="text-xs text-muted-foreground">Considera gravidade, riscos e limitações funcionais, não só o diagnóstico.</p>
          </div>
        </div>
        <Button size="sm" onClick={onNova}>{atual ? "Nova classificação" : "Classificar"}</Button>
      </div>
      {atual ? (
        <div className="space-y-2">
          {atual.emergencia && (
            <div className="rounded-xl border border-red-500/60 bg-red-500/15 p-3 text-sm font-semibold text-red-300 flex gap-2"><Siren className="w-4 h-4 shrink-0 mt-0.5" />{EMERGENCIA_ALERTA}</div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <NivelBadge nivel={atual.nivel} emergencia={atual.emergencia} />
            <span className="text-xs text-muted-foreground">{formatDate(atual.createdAt.slice(0, 10))}{atual.responsavel ? ` · ${atual.responsavel}` : ""}</span>
          </div>
          <p className="text-sm text-muted-foreground">{NIVEL_INFO[atual.nivel].desc}</p>
          {atual.alertas.length > 0 && (
            <ul className="text-sm space-y-1">{atual.alertas.map((a) => <li key={a} className="flex gap-2 text-amber-400"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{a}</li>)}</ul>
          )}
          {atual.observacoes && <p className="text-sm italic text-muted-foreground">{atual.observacoes}</p>}
          {historico.length > 1 && <p className="text-xs text-muted-foreground">{historico.length - 1} classificação(ões) anterior(es) no histórico.</p>}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Ainda não classificada.</p>
      )}
      <p className="text-[11px] text-muted-foreground mt-3">Critérios em validação pela equipe técnica. Esta classificação ainda não muda a ordem da fila.</p>
    </div>
  );
}

export function PrioridadeClinicaForm({ patientId, onSaved, onCancel }: { patientId: number; onSaved: (p: PrioridadeClinica) => void; onCancel: () => void }) {
  const [resp, setResp] = useState<PrioridadeRespostas>({});
  const [emergencia, setEmergencia] = useState(false);
  const [responsavel, setResponsavel] = useState("");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const calc = calcularPrioridade(resp);
  const nivel: NivelPrioridade = emergencia ? "maxima" : calc.nivel;

  const salvar = async () => {
    setSaving(true); setErro("");
    try {
      const alertas = emergencia ? [EMERGENCIA_ALERTA, ...calc.alertas] : calc.alertas;
      onSaved(await createPrioridadeClinica({ patientId, respostas: resp, nivel, alertas, emergencia, responsavel, observacoes: obs }));
    } catch (e: any) {
      setErro(e?.message || "Não foi possível salvar.");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <label className={cn("flex gap-3 rounded-xl border-2 p-3 cursor-pointer", emergencia ? "border-red-500 bg-red-500/10" : "border-border")}>
        <input type="checkbox" checked={emergencia} onChange={(e) => setEmergencia(e.target.checked)} className="mt-1 accent-red-500" />
        <span><span className="font-bold text-sm flex items-center gap-1.5"><Siren className="w-4 h-4 text-red-400" />{EMERGENCIA_PERGUNTA}</span>
          {emergencia && <span className="block text-sm text-red-300 font-semibold mt-1">{EMERGENCIA_ALERTA}</span>}</span>
      </label>
      {PRIORIDADE_PERGUNTAS.map((p) => (
        <div key={p.key} className="rounded-xl border border-border p-3">
          <p className="font-semibold text-sm">{p.pergunta}</p>
          <p className="text-xs text-muted-foreground italic">{p.explicacao}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {PRIORIDADE_OPCOES.map((o) => (
              <button key={o.valor} type="button" onClick={() => setResp((r) => ({ ...r, [p.key]: o.valor }))}
                className={cn("rounded-lg border px-3 py-1.5 text-xs font-semibold",
                  resp[p.key] === o.valor
                    ? o.valor === "grave" ? "bg-rose-500 text-white border-rose-500" : o.valor === "leve" ? "bg-amber-500 text-white border-amber-500" : "bg-emerald-500 text-white border-emerald-500"
                    : "border-border text-muted-foreground hover:text-foreground")}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="grid sm:grid-cols-2 gap-3">
        <input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} placeholder="Responsável pela classificação"
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm" />
        <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observações (opcional)"
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
        <div className="flex items-center gap-2 text-sm">Resultado: <NivelBadge nivel={nivel} emergencia={emergencia} /></div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={saving}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>{saving ? "Salvando..." : "Salvar classificação"}</Button>
        </div>
      </div>
      {erro && <p className="text-sm text-red-400">{erro}</p>}
      <p className="text-[11px] text-muted-foreground">Proposta inicial de critérios: risco intenso (autoagressão, agressividade com lesão ou perda recente de habilidades) ou 3 itens intensos resultam em máxima; 1 item intenso ou 6 pontos ou mais resultam em elevada; qualquer sinal resulta em moderada. Os critérios precisam ser aprovados pela equipe técnica.</p>
    </div>
  );
}
