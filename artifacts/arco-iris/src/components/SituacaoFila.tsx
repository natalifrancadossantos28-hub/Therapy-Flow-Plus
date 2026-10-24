import { useState } from "react";
import { createFilaSituacao, SITUACAO_INFO, type FilaSituacao, type Situacao } from "@/lib/triagem-86-rpc";
import { getProfessionalSession } from "@/lib/portal-session";

// Situação da criança em cada especialidade. A demanda é confirmada pelo
// profissional na avaliação, depois da convocação — não antes de entrar na fila.
export function SituacaoFila({ waitingListId, historico, onSaved }: {
  waitingListId: number; historico: FilaSituacao[]; onSaved: (s: FilaSituacao) => void;
}) {
  const atual = historico[0]?.situacao ?? "aguardando";
  const [nova, setNova] = useState<Situacao | "">("");
  const [just, setJust] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const info = SITUACAO_INFO[atual];

  const salvar = async () => {
    if (!nova) return;
    if (nova === "demanda_nao_confirmada" && !just.trim()) { setErro("Informe a justificativa."); return; }
    setSaving(true); setErro(null);
    try {
      const resp = getProfessionalSession()?.professionalName ?? "Administração";
      onSaved(await createFilaSituacao(waitingListId, nova, just.trim(), resp));
      setNova(""); setJust("");
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro (migração 0128 aplicada?)"); }
    finally { setSaving(false); }
  };

  return (
    <div className="text-[11px] space-y-1">
      <span className="font-semibold" style={{ color: info.color }}>{info.label}</span>
      <details>
        <summary className="cursor-pointer text-primary font-semibold">Atualizar situação</summary>
        <div className="mt-1 space-y-1 max-w-[220px]">
          <select className="w-full rounded border border-border bg-background px-1 py-0.5" value={nova} onChange={(e) => setNova(e.target.value as Situacao)}>
            <option value="">Escolha…</option>
            {(Object.keys(SITUACAO_INFO) as Situacao[]).map((s) => <option key={s} value={s}>{SITUACAO_INFO[s].label}</option>)}
          </select>
          {nova === "demanda_nao_confirmada" && (
            <textarea className="w-full rounded border border-border bg-background px-1 py-0.5" rows={2} placeholder="Justificativa (obrigatória)" value={just} onChange={(e) => setJust(e.target.value)} />
          )}
          <button type="button" disabled={!nova || saving} onClick={salvar} className="px-2 py-0.5 rounded bg-primary text-primary-foreground disabled:opacity-50">{saving ? "Salvando…" : "Registrar"}</button>
          {erro && <p className="text-red-500">{erro}</p>}
          {historico.length > 0 && (
            <ul className="text-muted-foreground space-y-0.5 pt-1 border-t border-border">
              {historico.slice(0, 5).map((h) => (
                <li key={h.id}>{new Date(h.createdAt).toLocaleDateString("pt-BR")} · {SITUACAO_INFO[h.situacao].label}{h.responsavel ? ` · ${h.responsavel}` : ""}{h.justificativa ? ` — ${h.justificativa}` : ""}</li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </div>
  );
}
