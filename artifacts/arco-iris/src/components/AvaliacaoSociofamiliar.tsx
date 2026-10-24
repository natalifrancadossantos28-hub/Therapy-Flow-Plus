import { useState } from "react";
import { AlertTriangle, HeartHandshake, Loader2 } from "lucide-react";
import { Button, Card, Input, Label } from "@/components/ui-custom";
import { createAvaliacaoSociofamiliar, type AvaliacaoSociofamiliar } from "@/lib/arco-rpc";
import {
  AVSF_NAO_INFORMADO, AVSF_PERGUNTAS, AVSF_PROTECAO, AVSF_PROTECAO_ALERTA,
  avsfCalcular, avsfFaixa, avsfRespostaLabel, type AvsfRespostas,
} from "@/lib/avaliacao-sociofamiliar";

const fmtData = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

export function AvsfIndicadorBadge({ score, scoreMax }: { score: number; scoreMax: number }) {
  const f = avsfFaixa(score, scoreMax);
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border"
      style={{ color: f.color, background: f.bg, borderColor: f.border }}
      title="Indicador social experimental — não altera a fila de espera"
    >
      {f.label} · {score}/{scoreMax}
    </span>
  );
}

export function AvsfAlertas({ alertas }: { alertas: string[] }) {
  if (alertas.length === 0) return null;
  return (
    <div className="rounded-xl border-2 border-rose-400/60 bg-rose-500/10 p-3 text-rose-500">
      <p className="flex items-center gap-2 font-bold text-sm">
        <AlertTriangle className="w-4 h-4" /> Avaliar com urgência
      </p>
      <ul className="mt-1 ml-6 list-disc text-sm">
        {alertas.map(a => <li key={a}>{a}</li>)}
      </ul>
    </div>
  );
}

export function AvaliacaoSociofamiliarForm({
  patientId, patientName, professionalId, professionalName, onCancel, onSaved,
}: {
  patientId: number;
  patientName: string;
  professionalId: number | null;
  professionalName: string | null;
  onCancel: () => void;
  onSaved: (a: AvaliacaoSociofamiliar) => void;
}) {
  const [respostas, setRespostas] = useState<AvsfRespostas>({ protecao: [] });
  const [avaliador, setAvaliador] = useState(professionalName ?? "");
  const [justificativa, setJustificativa] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calc = avsfCalcular(respostas);
  const faltando = AVSF_PERGUNTAS.filter(p => !respostas[p.key]);
  const protecao = Array.isArray(respostas.protecao) ? respostas.protecao : [];

  const toggleProtecao = (v: string) =>
    setRespostas(r => {
      const atual = Array.isArray(r.protecao) ? r.protecao : [];
      return { ...r, protecao: atual.includes(v) ? atual.filter(x => x !== v) : [...atual, v] };
    });

  const salvar = async () => {
    setError(null);
    if (faltando.length > 0) {
      setError(`Responda todas as perguntas (pode marcar "Não informado"). Falta: ${faltando.map(p => p.titulo).join(", ")}.`);
      return;
    }
    if (!avaliador.trim()) { setError("Informe quem fez a avaliação."); return; }
    if (!justificativa.trim()) { setError("Escreva o parecer / justificativa da avaliação."); return; }
    setSaving(true);
    try {
      const saved = await createAvaliacaoSociofamiliar({
        patientId,
        respostas,
        score: calc.score,
        scoreMax: calc.scoreMax,
        alertas: calc.alertas,
        justificativa: justificativa.trim(),
        professionalId,
        professionalName: avaliador.trim(),
        observacoes: observacoes.trim() || null,
      });
      onSaved(saved);
    } catch (e: any) {
      setError(e?.message ?? "Não foi possível salvar a avaliação.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: "rgba(236,72,153,0.15)", color: "#ec4899" }}>
          <HeartHandshake className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold font-display text-lg">Avaliação Sociofamiliar</h3>
          <p className="text-sm text-muted-foreground">{patientName}</p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground bg-secondary/60 rounded-lg p-3">
        O indicador social é <strong>experimental</strong> e fica separado da pontuação clínica: <strong>não muda a fila de espera</strong>.
        Benefício social, renda, CID ou deficiência não contam pontos. Campos com <span className="text-rose-500">*</span> são obrigatórios.
      </p>

      {AVSF_PERGUNTAS.map((p, i) => (
        <div key={p.key} className="space-y-2">
          <Label>
            {i + 1}. {p.titulo} <span className="text-rose-500">*</span>
            <span className="block font-normal text-sm text-muted-foreground">{p.texto}</span>
          </Label>
          <div className="grid gap-1.5">
            {[...p.opcoes, { valor: AVSF_NAO_INFORMADO, label: "Não informado", pontos: 0 }].map(o => {
              const sel = respostas[p.key] === o.valor;
              return (
                <button
                  key={o.valor}
                  type="button"
                  onClick={() => setRespostas(r => ({ ...r, [p.key]: o.valor }))}
                  className={`text-left text-sm px-3 py-2 rounded-lg border-2 transition-colors ${sel ? "border-pink-500 bg-pink-500/10 font-semibold" : "border-border hover:bg-secondary/60"} ${o.valor === AVSF_NAO_INFORMADO ? "italic text-muted-foreground" : ""}`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="space-y-2">
        <Label>
          {AVSF_PERGUNTAS.length + 1}. Situações de vulnerabilidade e proteção social
          <span className="block font-normal text-sm text-muted-foreground">Marque o que se aplica (pode deixar em branco se nenhuma).</span>
        </Label>
        <div className="grid gap-1.5">
          {AVSF_PROTECAO.map(o => (
            <label key={o.valor} className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-border cursor-pointer hover:bg-secondary/60">
              <input type="checkbox" checked={protecao.includes(o.valor)} onChange={() => toggleProtecao(o.valor)} />
              <span>{o.label}</span>
              {AVSF_PROTECAO_ALERTA.has(o.valor) && <span className="ml-auto text-[10px] font-bold text-rose-600">ALERTA</span>}
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-xl border p-3 space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm font-semibold">Indicador social (experimental)</span>
          <AvsfIndicadorBadge score={calc.score} scoreMax={calc.scoreMax} />
        </div>
        <AvsfAlertas alertas={calc.alertas} />
      </div>

      <div className="space-y-2">
        <Label>Avaliado por <span className="text-rose-500">*</span></Label>
        <Input value={avaliador} onChange={e => setAvaliador(e.target.value)} placeholder="Nome de quem fez a avaliação" />
      </div>
      <div className="space-y-2">
        <Label>Parecer / justificativa <span className="text-rose-500">*</span></Label>
        <textarea
          className="w-full min-h-[90px] rounded-xl border-2 border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary"
          value={justificativa}
          onChange={e => setJustificativa(e.target.value)}
          placeholder="Ex.: mãe cuida sozinha de 3 filhos, sem transporte; encaminhar ao CRAS."
        />
      </div>
      <div className="space-y-2">
        <Label>Observações</Label>
        <textarea
          className="w-full min-h-[60px] rounded-xl border-2 border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary"
          value={observacoes}
          onChange={e => setObservacoes(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-rose-600 font-medium">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={saving}>Cancelar</Button>
        <Button onClick={salvar} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Salvar avaliação
        </Button>
      </div>
    </div>
  );
}

export function AvaliacaoSociofamiliarCard({
  historico, onNova,
}: {
  historico: AvaliacaoSociofamiliar[];
  onNova?: () => void;
}) {
  const ultima = historico[0] ?? null;
  return (
    <Card className="p-6 border-2 transition-colors" style={{ borderColor: ultima?.alertas.length ? "rgba(239,68,68,0.5)" : "rgba(236,72,153,0.35)" }}>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: "rgba(236,72,153,0.15)", color: "#ec4899" }}>
            <HeartHandshake className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold font-display text-lg">Avaliação Sociofamiliar</h3>
            <p className="text-sm text-muted-foreground">
              Transporte, cuidados, rede de apoio, alimentação, moradia e proteção social — {historico.length === 0 ? "nenhuma avaliação registrada" : `${historico.length} avaliação(ões)`}
            </p>
          </div>
        </div>
        {onNova && <Button size="sm" onClick={onNova}>{ultima ? "Nova avaliação" : "Fazer avaliação"}</Button>}
      </div>

      {ultima ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <AvsfIndicadorBadge score={ultima.score} scoreMax={ultima.scoreMax} />
            <span className="text-muted-foreground">
              {fmtData(ultima.createdAt)}{ultima.professionalName ? ` · ${ultima.professionalName}` : ""}
            </span>
          </div>
          <AvsfAlertas alertas={ultima.alertas} />
          <p className="text-sm"><strong>Parecer:</strong> {ultima.justificativa}</p>
          {ultima.observacoes && <p className="text-sm text-muted-foreground"><strong>Obs.:</strong> {ultima.observacoes}</p>}
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold text-muted-foreground">Ver respostas</summary>
            <ul className="mt-2 space-y-1">
              {AVSF_PERGUNTAS.map(p => (
                <li key={p.key}><strong>{p.titulo}:</strong> {avsfRespostaLabel(p.key, ultima.respostas[p.key])}</li>
              ))}
              <li><strong>Proteção social:</strong> {avsfRespostaLabel("protecao", ultima.respostas.protecao)}</li>
            </ul>
          </details>
          {historico.length > 1 && (
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold text-muted-foreground">Avaliações anteriores ({historico.length - 1})</summary>
              <ul className="mt-2 space-y-2">
                {historico.slice(1).map(a => (
                  <li key={a.id} className="border-l-2 pl-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <AvsfIndicadorBadge score={a.score} scoreMax={a.scoreMax} />
                      <span className="text-muted-foreground">{fmtData(a.createdAt)}{a.professionalName ? ` · ${a.professionalName}` : ""}</span>
                    </div>
                    {a.alertas.length > 0 && <p className="text-rose-600 text-xs mt-1">Alertas: {a.alertas.join("; ")}</p>}
                    <p className="mt-1">{a.justificativa}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">
          Registre a realidade da família para a equipe e a assistente social. O indicador é experimental e não muda a fila de espera.
        </p>
      )}
    </Card>
  );
}
