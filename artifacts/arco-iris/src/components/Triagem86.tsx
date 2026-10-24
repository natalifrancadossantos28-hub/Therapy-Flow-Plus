import { useMemo, useState } from "react";
import { ChevronDown, AlertTriangle, Info, Printer } from "lucide-react";
import { upsertPatient, type Patient } from "@/lib/arco-rpc";
import { printTriagem86 } from "@/lib/print-triagem-86";
import { Button, Card, Input } from "@/components/ui-custom";
import { cn } from "@/lib/utils";
import {
  ITENS_86, AREAS_86, opcoesDe, calcularResultado86, FAIXAS_RENDA, BENEFICIOS,
  AVISO_TRIAGEM, ALERTA_RISCO, RISCO_CODES, sugestoes86, type Respostas86, type Social86, type Item86, type Resultado86,
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
              value === o.valor ? corOpcao(it, o.valor) : "border-border hover:bg-muted")}>
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

const corOpcao = (it: Item86, v: string) => {
  if (v === "ns" || v === "na" || v === "pni") return "bg-slate-500 text-white border-slate-500";
  if (it.tipo === "clinica") return ["bg-emerald-500 border-emerald-500", "bg-blue-500 border-blue-500", "bg-amber-500 border-amber-500", "bg-rose-500 border-rose-500"][Number(v)] + " text-white";
  if (v === "sim" || v === "ninguem") return "bg-rose-500 text-white border-rose-500";
  if (v === "as_vezes") return "bg-amber-500 text-white border-amber-500";
  return "bg-emerald-500 text-white border-emerald-500";
};

type Dados = Pick<Patient, "dateOfBirth" | "cpf" | "cns" | "guardianName" | "guardianPhone" | "phone" | "address" | "motherName" | "fatherName" | "diagnosis">;
const DADOS_CAMPOS: { k: keyof Dados; l: string; type?: string }[] = [
  { k: "dateOfBirth", l: "Data de nascimento", type: "date" }, { k: "cpf", l: "CPF" }, { k: "cns", l: "Cartão SUS" },
  { k: "guardianName", l: "Responsável" }, { k: "guardianPhone", l: "Telefone do responsável" }, { k: "phone", l: "Telefone" },
  { k: "motherName", l: "Nome da mãe" }, { k: "fatherName", l: "Nome do pai" }, { k: "address", l: "Endereço" }, { k: "diagnosis", l: "Diagnóstico" },
];

/**
 * Triagem única: dados do paciente → 7 especialidades → sociofamiliar →
 * prioridades → resultado/sugestões → Finalizar → Imprimir. Usa a Triagem 86
 * (save_triagem_86). A avaliação ABC continua separada.
 */
export function Triagem86Form({ patientId, patient, editarDados = true, tipoTriagem, onPatientUpdated, onSaved, onCancel }: {
  patientId: number; patient?: Patient | null; editarDados?: boolean; tipoTriagem?: string; onPatientUpdated?: (p: Patient) => void;
  onSaved: (r: SaveTriagem86Result) => void; onCancel: () => void;
}) {
  const comDados = !!patient && editarDados;
  const etapas = [...(comDados ? ["Dados do paciente"] : []), ...GRUPOS, "Resultado"];
  const [etapa, setEtapa] = useState(0);
  const [resp, setResp] = useState<Respostas86>({});
  const [social, setSocial] = useState<Social86>({});
  const [dados, setDados] = useState<Dados>(() => Object.fromEntries(DADOS_CAMPOS.map(({ k }) => [k, patient?.[k] ?? ""])) as Dados);
  const [responsavel, setResponsavel] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState<{ res: SaveTriagem86Result; paciente: Patient | null } | null>(null);
  const r = useMemo(() => calcularResultado86(resp, social), [resp, social]);
  const grupo = etapas[etapa];
  const itens = ITENS_86.filter((i) => i.grupo === grupo);
  const falta = (g: string) => ITENS_86.filter((i) => i.grupo === g && r.faltando.includes(i.code)).length;
  const irPara = (n: number) => { setEtapa(n); setErro(null); document.getElementById("triagem-unica-topo")?.scrollIntoView({ behavior: "smooth" }); };

  const finalizar = async () => {
    if (!responsavel.trim()) { setErro("Informe quem preencheu a triagem."); return; }
    if (r.faltando.length) { setErro(`Faltam ${r.faltando.length} perguntas: ${r.faltando.slice(0, 6).join(", ")}${r.faltando.length > 6 ? "…" : ""}`); return; }
    setSaving(true); setErro(null);
    try {
      let pac: Patient | null = patient ?? null;
      if (patient && comDados && DADOS_CAMPOS.some(({ k }) => (dados[k] || null) !== (patient[k] || null))) {
        const d = (k: keyof Dados) => (dados[k] as string)?.trim() || null;
        pac = await upsertPatient(patient.id, {
          name: patient.name, prontuario: patient.prontuario, entryDate: patient.entryDate, email: patient.email,
          trabalhoPais: patient.trabalhoPais, localAtendimento: patient.localAtendimento, outroAtendimento: patient.outroAtendimento,
          notes: patient.notes, photoUrl: patient.photoUrl,
          dateOfBirth: d("dateOfBirth"), cpf: d("cpf"), cns: d("cns"), phone: d("phone"), address: d("address"),
          motherName: d("motherName"), fatherName: d("fatherName"), guardianName: d("guardianName"),
          guardianPhone: d("guardianPhone"), diagnosis: d("diagnosis"),
        });
        onPatientUpdated?.(pac);
      }
      const res = await saveTriagem86(patientId, resp, social, responsavel.trim());
      setSalvo({ res, paciente: pac });
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro ao salvar."); }
    finally { setSaving(false); }
  };

  if (salvo) {
    const { res, paciente } = salvo;
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-emerald-500/50 bg-emerald-500/10 p-4">
          <p className="font-bold text-emerald-400">Triagem finalizada e salva.</p>
          <p className="text-sm text-muted-foreground">{res.addedSpecialties?.length ? `Incluída na fila: ${res.addedSpecialties.join(", ")}.` : res.reason === "all_already_queued" ? "Já estava nas filas cabíveis; notas atualizadas." : "Notas por área atualizadas."}</p>
        </div>
        <Resultado86View r={r} />
        <Sugestoes r={r} />
        <div className="flex flex-wrap gap-2">
          {paciente && <Button className="gap-2" onClick={() => printTriagem86(res.triagem, paciente, { tipo: tipoTriagem })}><Printer className="w-4 h-4" /> Imprimir relatório</Button>}
          <Button variant="outline" onClick={() => onSaved(res)}>Concluir</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" id="triagem-unica-topo">
      <p className="text-xs text-muted-foreground">{AVISO_TRIAGEM} Responda de 0 a 3 (0 = nunca, 3 = sempre). Clique no título para ver a explicação simples. A avaliação ABC continua separada.</p>
      <div className="flex flex-wrap gap-1.5">
        {etapas.map((g, n) => {
          const f = GRUPOS.includes(g as typeof GRUPOS[number]) ? falta(g) : 0;
          return (
            <button key={g} type="button" onClick={() => irPara(n)}
              className={cn("px-3 py-1.5 rounded-full text-xs font-semibold border",
                etapa === n ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted")}>
              {n + 1}. {g} {GRUPOS.includes(g as typeof GRUPOS[number]) ? (f > 0 ? <span className="opacity-70">({f})</span> : "✓") : null}
            </button>
          );
        })}
      </div>

      {grupo === "Dados do paciente" && patient && (
        <div className="rounded-xl border border-border p-4 space-y-3">
          <p className="text-sm"><b>{patient.name}</b>{patient.prontuario ? ` · Prontuário ${patient.prontuario}` : ""}</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {DADOS_CAMPOS.map(({ k, l, type }) => (
              <label key={k} className={cn("text-xs font-semibold text-muted-foreground space-y-1", k === "address" && "sm:col-span-2")}>
                <span>{l}</span>
                <Input type={type ?? "text"} value={(dados[k] as string) ?? ""} onChange={(e) => setDados((d) => ({ ...d, [k]: e.target.value }))} />
              </label>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">As alterações são gravadas no cadastro ao finalizar a triagem.</p>
        </div>
      )}

      {grupo === "Resultado" ? (
        <div className="space-y-4">
          <Resultado86View r={r} />
          <Sugestoes r={r} />
        </div>
      ) : (
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
          {itens.length > 0 && AREAS_86.includes(grupo as typeof AREAS_86[number]) && (() => {
            const a = r.areas.find((x) => x.area === grupo)!;
            return <p className="text-sm font-semibold text-right">Pontuação {grupo}: {a.pontos}/30</p>;
          })()}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        {etapa > 0 && <Button variant="outline" onClick={() => irPara(etapa - 1)}>← Voltar</Button>}
        {grupo !== "Resultado" ? (
          <Button onClick={() => irPara(etapa + 1)}>Próxima etapa →</Button>
        ) : (
          <>
            <Input className="max-w-xs" placeholder="Responsável pelo preenchimento" value={responsavel} onChange={(e) => setResponsavel(e.target.value)} />
            <Button onClick={finalizar} disabled={saving}>{saving ? "Salvando…" : "Finalizar Triagem"}</Button>
          </>
        )}
      </div>
      {erro && <p className="text-sm text-red-500">{erro}</p>}
      {grupo === "Resultado" && <p className="text-[11px] text-muted-foreground">Ao finalizar, a criança entra automaticamente nas filas das especialidades com pontuação (sem duplicar; quem já está mantém a data de entrada).</p>}
    </div>
  );
}

function Sugestoes({ r }: { r: Resultado86 }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-xs font-bold uppercase text-muted-foreground mb-1">D · Sugestões de encaminhamento</p>
      {sugestoes86(r).filter((x) => x !== ALERTA_RISCO).map((x) => <p key={x} className="text-sm">• {x}</p>)}
      <p className="text-[11px] text-muted-foreground mt-1">Orientativas: a equipe técnica valida cada especialidade.</p>
    </div>
  );
}
