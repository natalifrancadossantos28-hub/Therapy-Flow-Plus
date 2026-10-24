import { useMemo, useState } from "react";
import { ChevronDown, AlertTriangle, Info, Printer } from "lucide-react";
import { Button, Card, Input } from "@/components/ui-custom";
import { cn } from "@/lib/utils";
import {
  ITENS_86, AREAS_86, opcoesDe, calcularResultado86, FAIXAS_RENDA, BENEFICIOS,
  AVISO_TRIAGEM, ALERTA_RISCO, RISCO_CODES, type Respostas86, type Social86, type Item86, type Resultado86,
} from "@/lib/triagem-86";
import { saveTriagem86, type SaveTriagem86Result, type Triagem86 } from "@/lib/triagem-86-rpc";

const GRUPOS = [...AREAS_86, "Sociofamiliar", "Prioridades"] as const;

function ItemRow({ it, value, onChange }: { it: Item86; value?: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("rounded-xl border p-3", value ? "border-border" : "border-amber-500/40")}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full text-left flex items-start gap-2">
        <span className="text-[11px] font-mono font-bold text-primary mt-0.5">{it.code}</span>
        <span className="flex-1">
          <span className="block text-sm font-semibold">{it.titulo}</span>
          <span className="block text-sm text-muted-foreground">{it.tecnica}</span>
        </span>
        <ChevronDown className={cn("w-4 h-4 mt-1 transition-transform", open && "rotate-180")} />
      </button>
      {open && <p className="mt-2 ml-8 text-sm rounded-lg bg-primary/10 border border-primary/30 p-2"><Info className="inline w-3.5 h-3.5 mr-1" />{it.simples}</p>}
      <div className="mt-2 ml-8 flex flex-wrap gap-1.5">
        {opcoesDe(it).map((o) => (
          <button key={o.valor} type="button" onClick={() => onChange(o.valor)}
            className={cn("px-2.5 py-1 rounded-lg text-xs border transition-colors",
              value === o.valor ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted")}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Resultado86View({ r, compact }: { r: Resultado86; compact?: boolean }) {
  const riscos = r.prioridades.filter((p) => RISCO_CODES.includes(p.code));
  return (
    <div className="space-y-3">
      {riscos.length > 0 && (
        <div className="rounded-xl border border-red-500/60 bg-red-500/10 p-3 text-sm text-red-400 font-semibold flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {ALERTA_RISCO}
        </div>
      )}
      <div>
        <p className="text-xs font-bold uppercase text-muted-foreground mb-1">A · Possível necessidade por especialidade</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {r.areas.map((a) => (
            <div key={a.area} className="rounded-lg border border-border p-2">
              <p className="text-xs font-semibold">{a.area}</p>
              <p className="text-lg font-bold">{a.pontos}<span className="text-xs text-muted-foreground">/30</span></p>
              {!compact && (a.naoSei > 0 || a.naoAplica > 0) && <p className="text-[10px] text-amber-500">{a.naoSei} não sei · {a.naoAplica} não se aplica</p>}
            </div>
          ))}
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg border border-border p-2">
          <p className="text-xs font-bold uppercase text-muted-foreground">B · Prioridade clínica</p>
          {r.prioridades.length ? r.prioridades.map((p) => <p key={p.code}>• {p.code} {p.titulo}</p>) : <p className="text-muted-foreground">Nenhum sinal marcado</p>}
          {r.prioridadesNaoSei > 0 && <p className="text-[11px] text-amber-500">{r.prioridadesNaoSei} item(ns) “não sei”</p>}
        </div>
        <div className="rounded-lg border border-border p-2">
          <p className="text-xs font-bold uppercase text-muted-foreground">C · Vulnerabilidade social</p>
          {r.social.length ? r.social.map((s) => <p key={s.code}>• {s.titulo}{s.intensidade === "parcial" ? " (em parte)" : ""}</p>) : <p className="text-muted-foreground">Nenhuma barreira marcada</p>}
          {r.socialNaoInformado > 0 && <p className="text-[11px] text-muted-foreground">{r.socialNaoInformado} preferiu(ram) não informar — não penaliza</p>}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">{AVISO_TRIAGEM}</p>
    </div>
  );
}

export function Triagem86Card({ t, onPrint }: { t: Triagem86; onPrint?: () => void }) {
  const r = useMemo(() => calcularResultado86(t.respostas, t.social ?? {}), [t]);
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-sm font-bold">Triagem · {new Date(t.createdAt).toLocaleDateString("pt-BR")}{t.responsavel ? ` · ${t.responsavel}` : ""}</p>
        {onPrint && <Button variant="outline" size="sm" className="gap-2" onClick={onPrint}><Printer className="w-4 h-4" /> Imprimir / PDF</Button>}
      </div>
      <Resultado86View r={r} compact />
    </Card>
  );
}

export function Triagem86Form({ patientId, onSaved, onCancel }: {
  patientId: number; onSaved: (r: SaveTriagem86Result) => void; onCancel: () => void;
}) {
  const [resp, setResp] = useState<Respostas86>({});
  const [social, setSocial] = useState<Social86>({});
  const [grupo, setGrupo] = useState<string>(GRUPOS[0]);
  const [responsavel, setResponsavel] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const r = useMemo(() => calcularResultado86(resp, social), [resp, social]);
  const itens = ITENS_86.filter((i) => i.grupo === grupo);
  const falta = (g: string) => ITENS_86.filter((i) => i.grupo === g && r.faltando.includes(i.code)).length;

  const salvar = async () => {
    if (!responsavel.trim()) { setErro("Informe quem preencheu a triagem."); return; }
    if (r.faltando.length) { setErro(`Faltam ${r.faltando.length} perguntas: ${r.faltando.slice(0, 6).join(", ")}${r.faltando.length > 6 ? "…" : ""}`); return; }
    setSaving(true); setErro(null);
    try { onSaved(await saveTriagem86(patientId, resp, social, responsavel.trim())); }
    catch (e) { setErro(e instanceof Error ? e.message : "Erro ao salvar. A migração 0128 já foi aplicada?"); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{AVISO_TRIAGEM} Clique no título para ver a explicação simples. A avaliação ABC continua separada.</p>
      <div className="flex flex-wrap gap-1.5">
        {GRUPOS.map((g) => (
          <button key={g} type="button" onClick={() => setGrupo(g)}
            className={cn("px-3 py-1.5 rounded-full text-xs font-semibold border",
              grupo === g ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted")}>
            {g} {falta(g) > 0 ? <span className="opacity-70">({falta(g)})</span> : "✓"}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {itens.map((it) => it.code === "S01" ? (
          <div key={it.code} className="rounded-xl border border-border p-3 space-y-2">
            <p className="text-sm"><b className="font-mono text-primary text-[11px] mr-2">S01</b><b>{it.titulo}</b> — {it.simples}</p>
            <div className="flex flex-wrap gap-2 items-center">
              <Input type="number" min={1} max={30} className="w-32" placeholder="Moradores" value={social.moradores ?? ""}
                onChange={(e) => setSocial((s) => ({ ...s, moradores: e.target.value ? Number(e.target.value) : null }))} />
              {FAIXAS_RENDA.map((o) => (
                <button key={o.valor} type="button" onClick={() => setSocial((s) => ({ ...s, renda: o.valor }))}
                  className={cn("px-2.5 py-1 rounded-lg text-xs border", social.renda === o.valor ? "bg-primary text-primary-foreground border-primary" : "border-border")}>{o.label}</button>
              ))}
            </div>
          </div>
        ) : it.code === "S02" ? (
          <div key={it.code} className="rounded-xl border border-border p-3 space-y-2">
            <p className="text-sm"><b className="font-mono text-primary text-[11px] mr-2">S02</b><b>{it.titulo}</b> — {it.simples}</p>
            <div className="flex flex-wrap gap-1.5">
              {[["sim", "Sim"], ["nao", "Não"], ["pni", "Prefere não informar"]].map(([v, l]) => (
                <button key={v} type="button" onClick={() => setSocial((s) => ({ ...s, beneficio: v }))}
                  className={cn("px-2.5 py-1 rounded-lg text-xs border", social.beneficio === v ? "bg-primary text-primary-foreground border-primary" : "border-border")}>{l}</button>
              ))}
              {social.beneficio === "sim" && BENEFICIOS.map((b) => (
                <button key={b} type="button" onClick={() => setSocial((s) => ({ ...s, beneficioTipo: b }))}
                  className={cn("px-2.5 py-1 rounded-lg text-xs border", social.beneficioTipo === b ? "bg-emerald-600 text-white border-emerald-600" : "border-border")}>{b}</button>
              ))}
            </div>
          </div>
        ) : (
          <ItemRow key={it.code} it={it} value={resp[it.code]} onChange={(v) => setResp((p) => ({ ...p, [it.code]: v }))} />
        ))}
      </div>
      <Card className="p-4"><p className="text-sm font-bold mb-2">Resumo (atualiza enquanto responde)</p><Resultado86View r={r} /></Card>
      <div className="flex flex-wrap items-center gap-2">
        <Input className="max-w-xs" placeholder="Responsável pelo preenchimento" value={responsavel} onChange={(e) => setResponsavel(e.target.value)} />
        <Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar triagem e incluir nas filas"}</Button>
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
      </div>
      {erro && <p className="text-sm text-red-500">{erro}</p>}
      <p className="text-[11px] text-muted-foreground">Ao salvar, a criança entra automaticamente nas filas das especialidades com pontuação (sem duplicar; quem já está mantém a data de entrada).</p>
    </div>
  );
}
