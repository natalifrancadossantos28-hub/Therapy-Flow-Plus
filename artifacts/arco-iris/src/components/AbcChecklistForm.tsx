import { useMemo, useState } from "react";
import { Button } from "@/components/ui-custom";
import { cn } from "@/lib/utils";
import {
  ABC_AREAS,
  ABC_AREA_MAX,
  ABC_TOTAL_MAX,
  ABC_NIVEL_INFO,
  ABC_NIVEL_ALTO_MIN,
  ABC_NIVEL_MODERADO_MIN,
  abcItemsByArea,
  calcAbcScores,
  type AbcAreaKey,
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
  professionalId?: number | null;
  professionalName?: string | null;
  /** Respostas iniciais (ex.: para reavaliar a partir da entrada). */
  initialRespostas?: number[];
  onSaved: (a: AbcAvaliacao) => void;
  onCancel?: () => void;
  saveLabel?: string;
  compact?: boolean;
};

export function AbcChecklistForm({
  patientId, tipo, professionalId, professionalName, initialRespostas,
  onSaved, onCancel, saveLabel, compact,
}: Props) {
  const [marcados, setMarcados] = useState<Set<number>>(() => new Set(initialRespostas ?? []));
  const [observacoes, setObservacoes] = useState("");
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
    <div className="space-y-4">
      <div
        className="rounded-xl border p-4 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-10 backdrop-blur"
        style={{ borderColor: nivelInfo.border, background: nivelInfo.bg }}
      >
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            {tipo === "entrada" ? "Avaliação de Entrada" : "Avaliação de Alta (reavaliação)"}
          </p>
          <p className="text-2xl font-bold" style={{ color: nivelInfo.color }}>
            {scores.total} <span className="text-sm text-muted-foreground font-normal">/ {ABC_TOTAL_MAX} pontos</span>
          </p>
        </div>
        <div className="text-right">
          <span className="inline-block rounded-full px-3 py-1 text-sm font-bold border"
            style={{ color: nivelInfo.color, borderColor: nivelInfo.border }}>
            {nivelInfo.label}
          </span>
          <p className="text-[11px] text-muted-foreground mt-1">
            ≥{ABC_NIVEL_ALTO_MIN} alto · {ABC_NIVEL_MODERADO_MIN}–{ABC_NIVEL_ALTO_MIN - 1} moderado · &lt;{ABC_NIVEL_MODERADO_MIN} baixo
          </p>
        </div>
      </div>

      <div className={cn("grid gap-2", compact ? "grid-cols-5" : "grid-cols-2 sm:grid-cols-5")}>
        {ABC_AREAS.map(a => (
          <div key={a.key} className="rounded-lg bg-secondary/30 p-2 text-center">
            <p className="text-[10px] font-semibold text-muted-foreground truncate" title={a.label}>{a.short}</p>
            <p className="font-bold" style={{ color: a.color }}>
              {scores.porArea[a.key]}<span className="text-[10px] text-muted-foreground font-normal">/{ABC_AREA_MAX[a.key]}</span>
            </p>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Marque os comportamentos observados. Cada item tem peso próprio (1–4); a pontuação por área e o grau de impacto são calculados automaticamente.
      </p>

      <div className="space-y-4">
        {ABC_AREAS.map(area => (
          <AreaBlock key={area.key} areaKey={area.key} label={area.label} color={area.color}
            marcados={marcados} onToggle={toggle} />
        ))}
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

      {error && <p className="text-sm text-rose-500 font-semibold">{error}</p>}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={saving}>Cancelar</Button>
        )}
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Salvando…" : (saveLabel ?? "Salvar avaliação")}
        </Button>
      </div>
    </div>
  );
}

function AreaBlock({ areaKey, label, color, marcados, onToggle }: {
  areaKey: AbcAreaKey; label: string; color: string;
  marcados: Set<number>; onToggle: (id: number) => void;
}) {
  const items = abcItemsByArea(areaKey);
  const sub = items.reduce((s, it) => s + (marcados.has(it.id) ? it.peso : 0), 0);
  return (
    <div className="rounded-xl border border-border/60 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-secondary/40">
        <p className="font-bold text-sm" style={{ color }}>{label}</p>
        <p className="text-xs font-semibold text-muted-foreground">{sub}/{ABC_AREA_MAX[areaKey]}</p>
      </div>
      <ul className="divide-y divide-border/40">
        {items.map(it => {
          const on = marcados.has(it.id);
          return (
            <li key={it.id}>
              <label className={cn("flex items-start gap-3 px-3 py-2 cursor-pointer text-sm transition-colors hover:bg-secondary/30", on && "bg-secondary/50")}>
                <input type="checkbox" checked={on} onChange={() => onToggle(it.id)} className="mt-0.5 accent-current" />
                <span className="flex-1">
                  <span className="text-muted-foreground text-xs mr-1">{it.id}.</span>{it.texto}
                </span>
                <span className="text-[10px] font-bold rounded px-1.5 py-0.5 bg-secondary text-muted-foreground shrink-0">+{it.peso}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
