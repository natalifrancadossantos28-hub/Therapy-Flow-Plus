import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui-custom";
import { cn } from "@/lib/utils";
import {
  AVF_PERGUNTAS,
  AVF_ESCALA,
  avfPerguntas,
  isParentalSpecialty,
  AVF_MIN,
  AVF_MAX,
  avfFaixa,
  avfCompleta,
  avfTotal,
  avfEvolucao,
} from "@/lib/avaliacao-funcional";
import {
  createAvaliacaoFuncional,
  getPatient,
  type AvaliacaoFuncional,
  type AvaliacaoFuncionalTipo,
} from "@/lib/arco-rpc";

/** Mensagem real do erro do Supabase (que não é `Error`), com dica da migração. */
function mensagemDeErro(e: unknown): string {
  const bruta =
    e instanceof Error ? e.message
    : typeof e === "object" && e !== null && "message" in e && typeof (e as { message: unknown }).message === "string"
      ? (e as { message: string }).message
      : "";
  if (!bruta) return "Erro ao salvar avaliação.";
  if (/create_avaliacao_funcional|schema cache|does not exist|não existe/i.test(bruta)) {
    return `${bruta} — a migração 0101_avaliacao_funcional_5_perguntas.sql ainda não foi aplicada no banco.`;
  }
  return bruta;
}

export function AvfScoreBadge({ total, size = "sm", className }: { total: number | null | undefined; size?: "sm" | "md"; className?: string }) {
  if (total == null) {
    return (
      <span className={cn("inline-flex items-center rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground font-semibold",
        size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-3 py-1", className)}>
        Sem avaliação
      </span>
    );
  }
  const f = avfFaixa(total);
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border font-bold whitespace-nowrap",
        size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-3 py-1", className)}
      style={{ color: f.color, background: f.bg, borderColor: f.border }}
      title={f.label}
    >
      {total}/{AVF_MAX} · {f.short}
    </span>
  );
}

export function AvfEvolucaoBadge({ entrada, alta, className }: { entrada: number; alta: number; className?: string }) {
  const ev = avfEvolucao(entrada, alta);
  const color = ev.tendencia === "melhora" ? "#22c55e" : ev.tendencia === "piora" ? "#ef4444" : "#eab308";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border font-bold text-[10px] px-2 py-0.5 whitespace-nowrap", className)}
      style={{ color, borderColor: `${color}66`, background: `${color}1a` }}
      title={ev.tendencia === "melhora" ? "Evolução positiva" : ev.tendencia === "piora" ? "Evolução negativa" : "Sem alteração"}>
      {ev.tendencia === "melhora" ? "▲" : ev.tendencia === "piora" ? "▼" : "•"} {ev.delta > 0 ? "+" : ""}{ev.delta} pts
    </span>
  );
}

type Props = {
  patientId: number;
  tipo: AvaliacaoFuncionalTipo;
  /** Especialidade avaliada (a mesma para entrada e alta do paciente). */
  specialty: string | null;
  patientName?: string | null;
  professionalId?: number | null;
  professionalName?: string | null;
  /** Avaliação de entrada da mesma especialidade, exibida para comparação na alta. */
  entradaRef?: AvaliacaoFuncional | null;
  onSaved: (a: AvaliacaoFuncional) => void;
  onCancel?: () => void;
  saveLabel?: string;
};

export function AvaliacaoFuncionalForm({
  patientId, tipo, specialty, patientName, professionalId, professionalName, entradaRef, onSaved, onCancel, saveLabel,
}: Props) {
  const parental = isParentalSpecialty(specialty);
  const perguntas = useMemo(() => avfPerguntas(specialty), [specialty]);
  const [respostas, setRespostas] = useState<Array<number | null>>(() => AVF_PERGUNTAS.map(() => null));
  // Na Parental quem está em acompanhamento é o responsável.
  const [responsavel, setResponsavel] = useState<string | null>(null);
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const completa = avfCompleta(respostas);
  const total = avfTotal(respostas);
  const respondidas = respostas.filter(r => r != null).length;
  const faixa = useMemo(() => avfFaixa(total), [total]);

  useEffect(() => {
    if (!parental) { setResponsavel(null); return; }
    let ativo = true;
    getPatient(patientId)
      .then((p) => { if (ativo) setResponsavel(p?.motherName?.trim() || null); })
      .catch(() => undefined);
    return () => { ativo = false; };
  }, [parental, patientId]);

  const setResposta = (idx: number, valor: number) => {
    setRespostas(prev => prev.map((r, i) => (i === idx ? valor : r)));
  };

  const handleSave = async () => {
    if (!avfCompleta(respostas)) {
      setError("Responda as 5 perguntas antes de salvar.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await createAvaliacaoFuncional({
        patientId,
        tipo,
        respostas,
        specialty,
        professionalId: professionalId ?? null,
        professionalName: professionalName ?? null,
        observacoes: observacoes.trim() || null,
      });
      onSaved(saved);
    } catch (e) {
      setError(mensagemDeErro(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-lg md:text-xl font-bold tracking-tight">
          <span style={{ color: "#06b6d4" }}>Avaliação Funcional</span> {parental ? "— Psicologia Parental" : "Multidisciplinar"}
        </h2>
        <p className="text-xs text-muted-foreground">
          5 perguntas · escala 1–5 · total {AVF_MIN}–{AVF_MAX} pts · {tipo === "entrada" ? "Avaliação de Entrada" : "Avaliação de Alta"}
          {specialty ? <> · <strong>{specialty}</strong></> : null}
          {parental
            ? responsavel
              ? <> · <strong>{responsavel}</strong> (responsável)</>
              : patientName ? <> · responsável de {patientName}</> : null
            : patientName ? <> · {patientName}</> : null}
        </p>
        {parental && (
          <p className="text-[11px] text-muted-foreground">
            As perguntas avaliam o responsável em acompanhamento, não a criança.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-border/50 p-3">
        <h3 className="text-[11px] font-bold uppercase text-muted-foreground tracking-wider mb-2">Escala de resposta</h3>
        <div className="flex flex-wrap gap-1.5">
          {AVF_ESCALA.map(e => (
            <span key={e.valor} className="px-2 py-1 rounded-lg text-[11px] font-semibold border"
              style={{ color: e.color, borderColor: `${e.color}40`, background: `${e.color}12` }}>
              <strong>{e.valor}</strong> — {e.label}
            </span>
          ))}
        </div>
      </div>

      <div className="sticky top-0 z-20 rounded-2xl border p-3 backdrop-blur-md"
        style={{ background: completa ? faixa.bg : "rgba(120,120,120,0.08)", borderColor: completa ? faixa.border : "rgba(120,120,120,0.3)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl font-bold font-display" style={{ color: completa ? faixa.color : undefined }}>
              {completa ? total : "—"}<span className="text-sm text-muted-foreground font-normal">/{AVF_MAX}</span>
            </span>
            <div>
              <p className="text-sm font-bold" style={{ color: completa ? faixa.color : undefined }}>{completa ? faixa.label : "Responda as 5 perguntas"}</p>
              <p className="text-xs text-muted-foreground">{respondidas}/{perguntas.length} respondidas</p>
            </div>
          </div>
          {tipo === "alta" && entradaRef && completa && (
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">Entrada: <strong>{entradaRef.scoreTotal}</strong> pts → Alta: <strong>{total}</strong> pts</p>
              <AvfEvolucaoBadge entrada={entradaRef.scoreTotal} alta={total} />
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {perguntas.map((p, idx) => {
          const atual = respostas[idx];
          const ref = entradaRef?.respostas[idx];
          return (
            <div key={p.key} className="rounded-2xl border border-border/50 p-4 space-y-2.5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#06b6d4" }}>{idx + 1}. {p.titulo}</p>
                <p className="text-sm font-medium mt-0.5">{p.texto}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {p.dica}
                  {ref != null && <> · <span className="font-semibold">na entrada: {ref}</span></>}
                </p>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {AVF_ESCALA.map(e => {
                  const sel = atual === e.valor;
                  return (
                    <button
                      key={e.valor}
                      type="button"
                      onClick={() => setResposta(idx, e.valor)}
                      className={cn("rounded-xl border py-2 text-sm font-bold transition-all", sel ? "scale-[1.03] shadow-md" : "opacity-70 hover:opacity-100")}
                      style={{ color: sel ? "#fff" : e.color, background: sel ? e.color : `${e.color}12`, borderColor: `${e.color}66` }}
                      title={e.label}
                    >
                      {e.valor}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-muted-foreground mb-1">Observações (opcional)</label>
        <textarea
          value={observacoes}
          onChange={e => setObservacoes(e.target.value)}
          rows={3}
          placeholder="Ex.: Objetivos alcançados, orientações à família…"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
      </div>

      {error && <p className="text-sm font-semibold text-red-500">{error}</p>}

      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && <Button variant="outline" onClick={onCancel} disabled={saving}>Cancelar</Button>}
        <Button onClick={() => { void handleSave(); }} disabled={saving || !completa}>
          {saving ? "Salvando…" : (saveLabel ?? (tipo === "entrada" ? "Salvar avaliação de entrada" : "Salvar avaliação de alta"))}
        </Button>
      </div>
    </div>
  );
}
