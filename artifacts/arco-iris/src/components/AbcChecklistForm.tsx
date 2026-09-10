import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui-custom";
import { cn } from "@/lib/utils";
import {
  ABC_AREAS,
  ABC_AREA_BY_KEY,
  ABC_ITEMS,
  ABC_NIVEL_INFO,
  ABC_NIVEL_ALTO_MIN,
  ABC_NIVEL_MODERADO_MIN,
  ABC_DISCLAIMER,
  calcAbcScores,
  printAbcChecklist,
  type AbcNivel,
} from "@/lib/abc-checklist";
import { createAbcAvaliacao, type AbcAvaliacao, type AbcTipo } from "@/lib/arco-rpc";

export type AbcNivelBadgeProps = {
  nivel: 1 | 2 | 3 | null | undefined;
  total?: number | null;
  size?: "sm" | "md";
  className?: string;
};

export function AbcNivelBadge({ nivel, total, size = "sm", className }: AbcNivelBadgeProps) {
  if (!nivel) {
    return (
      <span className={cn("inline-flex items-center rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground font-semibold",
        size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-3 py-1", className)}>
        Sem ABC
      </span>
    );
  }
  const info = ABC_NIVEL_INFO[nivel];
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border font-bold whitespace-nowrap",
        size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-3 py-1", className)}
      style={{ color: info.color, background: info.bg, borderColor: info.border }}
      title={info.label}
    >
      N{nivel} · {info.short}{total != null ? ` (${total})` : ""}
    </span>
  );
}

type Props = {
  patientId: number;
  tipo: AbcTipo;
  /** Dados exibidos na identificação e na folha impressa. */
  patientName?: string | null;
  patientProntuario?: string | null;
  patientDateOfBirth?: string | null;
  professionalId?: number | null;
  professionalName?: string | null;
  /** Respostas iniciais (ex.: para reavaliar a partir da entrada). */
  initialRespostas?: number[];
  onSaved: (a: AbcAvaliacao) => void;
  onCancel?: () => void;
  saveLabel?: string;
};

const REF_ROWS: { nivel: AbcNivel; faixa: string; desc: string }[] = [
  { nivel: 1, faixa: `≥ ${ABC_NIVEL_ALTO_MIN}`, desc: "Prejuízo significativo na interação" },
  { nivel: 2, faixa: `${ABC_NIVEL_MODERADO_MIN} – ${ABC_NIVEL_ALTO_MIN - 1}`, desc: "Interferência parcial no engajamento" },
  { nivel: 3, faixa: `< ${ABC_NIVEL_MODERADO_MIN}`, desc: "Pouca interferência comportamental" },
];

export function AbcChecklistForm({
  patientId, tipo, patientName, patientProntuario, patientDateOfBirth,
  professionalId, professionalName, initialRespostas, onSaved, onCancel, saveLabel,
}: Props) {
  const [marcados, setMarcados] = useState<Set<number>>(() => new Set(initialRespostas ?? []));
  const [observacoes, setObservacoes] = useState("");
  const [dataAplicacao, setDataAplicacao] = useState(() => new Date().toISOString().slice(0, 10));
  const [showResult, setShowResult] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scores = useMemo(() => calcAbcScores(marcados), [marcados]);
  const nivelInfo = ABC_NIVEL_INFO[scores.nivel];

  const toggle = (id: number) => {
    setMarcados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handlePrint = () => {
    printAbcChecklist({
      nome: patientName ?? "",
      prontuario: patientProntuario,
      dataNascimento: patientDateOfBirth,
      dataAplicacao,
      tipo,
      marcados,
      observacoes: observacoes.trim() || null,
      profissional: professionalName,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await createAbcAvaliacao({
        patientId,
        tipo,
        respostas: Array.from(marcados).sort((a, b) => a - b),
        scoreSensorial: scores.porArea.sensorial,
        scoreRelacionamento: scores.porArea.relacionamento,
        scoreCorpo: scores.porArea.corpo,
        scoreLinguagem: scores.porArea.linguagem,
        scorePessoalSocial: scores.porArea.pessoalSocial,
        scoreTotal: scores.total,
        nivel: scores.nivel,
        professionalId: professionalId ?? null,
        professionalName: professionalName ?? null,
        observacoes: observacoes.trim() || null,
      });
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar avaliação.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <h2 className="text-xl md:text-2xl font-bold tracking-tight">
          <span style={{ color: "#a855f7" }}>ABC</span> — Autism Behavior Checklist
        </h2>
        <p className="text-xs text-muted-foreground">
          Versão Brasileira · Checklist de Comportamento Autístico · {tipo === "entrada" ? "Avaliação de Entrada" : "Avaliação de Alta (reavaliação)"}
        </p>
      </div>

      <div className="rounded-2xl border border-border/50 p-4 space-y-3" style={{ background: "rgba(168,85,247,0.04)" }}>
        <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "#a855f7" }}>Identificação</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground">Nome do Paciente</p>
            <p className="font-semibold">{patientName || "—"}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground">Prontuário</p>
            <p className="font-semibold">{patientProntuario || "—"}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground">Data de Nascimento</p>
            <p className="font-semibold">{patientDateOfBirth ? new Date(`${patientDateOfBirth}T00:00:00`).toLocaleDateString("pt-BR") : "—"}</p>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground block mb-0.5">Data da Aplicação</label>
            <input type="date" value={dataAplicacao} onChange={e => setDataAplicacao(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-2 py-1 text-sm" />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/50 p-3">
        <h3 className="text-[11px] font-bold uppercase text-muted-foreground tracking-wider mb-2">Legenda das Categorias</h3>
        <div className="flex flex-wrap gap-2">
          {ABC_AREAS.map(a => (
            <span key={a.key} className="px-2.5 py-1 rounded-lg text-[11px] font-bold border"
              style={{ background: a.bg, color: a.color, borderColor: `${a.color}40` }}>
              {a.code} — {a.label}
            </span>
          ))}
        </div>
      </div>

      <div className="sticky top-0 z-20 rounded-2xl border p-3 backdrop-blur-md"
        style={{ background: nivelInfo.bg, borderColor: `${nivelInfo.color}40` }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl font-bold font-display" style={{ color: nivelInfo.color }}>{scores.total}</span>
            <div>
              <p className="text-sm font-bold" style={{ color: nivelInfo.color }}>{nivelInfo.nivel} — {nivelInfo.nome}</p>
              <p className="text-xs text-muted-foreground">{marcados.size}/{ABC_ITEMS.length} itens marcados</p>
            </div>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {ABC_AREAS.map(a => (
              <span key={a.key} className="px-2 py-1 rounded-lg text-[11px] font-bold border"
                style={{ color: a.color, background: a.bg, borderColor: `${a.color}30` }}>
                {a.code}: {scores.porArea[a.key]}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {ABC_ITEMS.map(item => {
          const a = ABC_AREA_BY_KEY[item.area];
          const on = marcados.has(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => toggle(item.id)}
              className="w-full text-left rounded-xl border p-3 transition-all duration-150 flex items-start gap-3"
              style={{
                background: on ? a.bg : "transparent",
                borderColor: on ? `${a.color}50` : "rgba(148,163,184,0.25)",
                boxShadow: on ? `0 0 12px ${a.color}15` : undefined,
              }}
            >
              <div className="mt-0.5 w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all"
                style={{ borderColor: on ? a.color : "rgba(148,163,184,0.5)", background: on ? a.color : "transparent" }}>
                {on && <svg viewBox="0 0 12 12" className="w-3 h-3 text-white"><path d="M2 6l3 3 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </div>
              <span className="text-sm font-bold w-7 shrink-0 mt-0.5" style={{ color: on ? a.color : undefined }}>
                {String(item.id).padStart(2, "0")}
              </span>
              <div className="flex-1">
                <span className={cn("text-sm", on && "font-semibold")} style={{ color: on ? a.color : undefined }}>{item.texto}</span>
                <p className="text-xs mt-1 leading-relaxed italic text-muted-foreground" style={on ? { color: `${a.color}cc` } : undefined}>{item.hint}</p>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold shrink-0 mt-0.5"
                style={{ background: a.bg, color: a.color, border: `1px solid ${a.color}30` }}>
                {a.code} · {item.peso}
              </span>
            </button>
          );
        })}
      </div>

      <div>
        <label className="block text-xs font-bold mb-1">Observações (opcional)</label>
        <textarea
          value={observacoes}
          onChange={e => setObservacoes(e.target.value)}
          rows={2}
          className="w-full rounded-lg border bg-background p-2 text-sm"
          placeholder="Contexto da avaliação, comportamentos relevantes…"
        />
      </div>

      <button
        type="button"
        onClick={() => setShowResult(true)}
        className="w-full py-3 rounded-xl font-bold text-white transition-all"
        style={{ background: `linear-gradient(135deg, ${nivelInfo.color}, ${nivelInfo.color}cc)`, boxShadow: `0 0 20px ${nivelInfo.color}40` }}
      >
        Ver Resultado Final
      </button>

      {showResult && (
        <div className="rounded-2xl border-2 p-5 space-y-5" style={{ borderColor: `${nivelInfo.color}50`, background: nivelInfo.bg }}>
          <div className="text-center space-y-1">
            <h3 className="text-2xl font-bold" style={{ color: nivelInfo.color }}>{nivelInfo.nivel} — {nivelInfo.nome}</h3>
            <p className="text-4xl font-bold font-display" style={{ color: nivelInfo.color }}>{scores.total} pontos</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">{nivelInfo.desc}</p>
          </div>

          <div className="rounded-xl border border-border/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="px-4 py-2 text-left font-semibold text-muted-foreground">Pontuação</th>
                  <th className="px-4 py-2 text-left font-semibold text-muted-foreground">Nível</th>
                  <th className="px-4 py-2 text-left font-semibold text-muted-foreground hidden sm:table-cell">Descrição</th>
                </tr>
              </thead>
              <tbody>
                {REF_ROWS.map(r => {
                  const ativo = r.nivel === scores.nivel;
                  const info = ABC_NIVEL_INFO[r.nivel];
                  return (
                    <tr key={r.nivel} className={cn("border-b border-border/30 last:border-0", ativo && "font-bold")}
                      style={ativo ? { background: info.bg } : undefined}>
                      <td className="px-4 py-2" style={ativo ? { color: info.color } : undefined}>{r.faixa}</td>
                      <td className="px-4 py-2" style={ativo ? { color: info.color } : undefined}>{info.label}</td>
                      <td className="px-4 py-2 hidden sm:table-cell text-xs text-muted-foreground">{r.desc}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Subtotais por Categoria</h4>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {ABC_AREAS.map(a => (
                <div key={a.key} className="rounded-xl p-3 text-center border" style={{ background: a.bg, borderColor: `${a.color}30` }}>
                  <p className="text-2xl font-bold font-display" style={{ color: a.color }}>{scores.porArea[a.key]}</p>
                  <p className="text-[10px] font-bold uppercase text-muted-foreground mt-1">{a.code}</p>
                  <p className="text-[9px] text-muted-foreground">{a.label}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground text-center italic">{ABC_DISCLAIMER}</p>

          <button type="button" onClick={handlePrint}
            className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all flex items-center justify-center gap-2"
            style={{ background: nivelInfo.color }}>
            <Printer className="w-4 h-4" /> Gerar PDF / Imprimir
          </button>
        </div>
      )}

      {error && <p className="text-sm text-rose-500 font-semibold">{error}</p>}

      <div className="flex justify-end gap-2 flex-wrap">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={saving}>Cancelar</Button>
        )}
        <Button variant="outline" className="gap-2" onClick={handlePrint} disabled={saving}>
          <Printer className="w-4 h-4" /> Imprimir
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Salvando…" : (saveLabel ?? "Salvar avaliação")}
        </Button>
      </div>
    </div>
  );
}
