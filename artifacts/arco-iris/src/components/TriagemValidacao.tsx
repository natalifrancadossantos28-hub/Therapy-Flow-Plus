import { useState } from "react";
import { CheckCircle2, HelpCircle, MinusCircle } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import {
  DECISAO_INFO, DEMANDA_NAO_IDENTIFICADA, createTriagemValidacao,
  type DecisaoValidacao, type TriagemValidacao,
} from "@/lib/fila-indicadores";

export type AreaSugestao = { area: string; pontos: number; nivelLabel: string; sinalizada: boolean };

/** Resumo da triagem com validação das especialidades pela equipe. */
export function TriagemValidacaoPanel({ patientId, areas, historico, origem = "triagem", onSaved }: {
  patientId: number; areas: AreaSugestao[]; historico: TriagemValidacao[];
  origem?: "triagem" | "avaliacao"; onSaved: (v: TriagemValidacao) => void;
}) {
  const [aberto, setAberto] = useState<{ area: string; decisao: DecisaoValidacao } | null>(null);
  const [just, setJust] = useState("");
  const [resp, setResp] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const atual = (area: string) => historico.find((h) => h.specialty === area);

  const salvar = async () => {
    if (!aberto) return;
    setSaving(true); setErro("");
    try {
      onSaved(await createTriagemValidacao({ patientId, specialty: aberto.area, decisao: aberto.decisao, origem, justificativa: just, responsavel: resp }));
      setAberto(null); setJust("");
    } catch (e: any) { setErro(e?.message || "Não foi possível salvar."); }
    finally { setSaving(false); }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="font-bold font-display text-lg">Validação das especialidades</h3>
      <p className="text-xs text-muted-foreground mb-3">A triagem só sugere. A equipe confirma cada especialidade. Tudo fica registrado no histórico.</p>
      <div className="space-y-2">
        {areas.map((a) => {
          const v = atual(a.area);
          return (
            <div key={a.area} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm">{a.area} <span className="text-xs text-muted-foreground font-normal">· {a.pontos} pts · {a.nivelLabel}</span></p>
                  {!a.sinalizada && <p className="text-xs text-amber-400 mt-0.5">{DEMANDA_NAO_IDENTIFICADA}</p>}
                  {v && <p className="text-xs mt-0.5" style={{ color: DECISAO_INFO[v.decisao].color }}>{DECISAO_INFO[v.decisao].label} · {formatDate(v.createdAt.slice(0, 10))}{v.responsavel ? ` · ${v.responsavel}` : ""}{v.justificativa ? ` — ${v.justificativa}` : ""}</p>}
                </div>
                <div className="flex gap-1.5">
                  {([["confirmada", CheckCircle2, "Confirmar"], ["sem_demanda", MinusCircle, "Sem demanda"], ["revisar", HelpCircle, "Revisar"]] as const).map(([d, I, t]) => (
                    <button key={d} type="button" onClick={() => { setAberto({ area: a.area, decisao: d }); setErro(""); }}
                      className={cn("inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold", v?.decisao === d ? "border-transparent text-white" : "border-border text-muted-foreground hover:text-foreground")}
                      style={v?.decisao === d ? { background: DECISAO_INFO[d].color } : undefined}>
                      <I className="w-3.5 h-3.5" />{t}
                    </button>
                  ))}
                </div>
              </div>
              {aberto?.area === a.area && (
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_200px_auto]">
                  <input value={just} onChange={(e) => setJust(e.target.value)} placeholder={aberto.decisao === "sem_demanda" ? "Justificativa técnica (obrigatória)" : "Justificativa (opcional)"}
                    className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm" />
                  <input value={resp} onChange={(e) => setResp(e.target.value)} placeholder="Responsável" className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm" />
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => setAberto(null)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold">Cancelar</button>
                    <button type="button" onClick={salvar} disabled={saving} className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-bold">{saving ? "..." : DECISAO_INFO[aberto.decisao].label}</button>
                  </div>
                  {erro && <p className="text-xs text-red-400 sm:col-span-3">{erro}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground mt-3">A criança entra na fila automaticamente pela triagem. Este registro é feito pelo profissional na avaliação, depois da convocação, e fica no histórico.</p>
    </div>
  );
}
