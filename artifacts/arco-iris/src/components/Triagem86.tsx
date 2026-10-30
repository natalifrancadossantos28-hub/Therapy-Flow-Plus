import { useMemo, useState } from "react";
import { ChevronDown, AlertTriangle, Info, Printer } from "lucide-react";
import { upsertPatient, type Patient } from "@/lib/arco-rpc";
import { printTriagem86 } from "@/lib/print-triagem-86";
import { Button, Card, Input } from "@/components/ui-custom";
import { cn } from "@/lib/utils";
import {
  ITENS_86, ITENS_TRIAGEM_ATUAL, erroDecisaoPrioridadeFila, AREAS_86, opcoesDe, calcularResultado86,
  AVISO_TRIAGEM, ALERTA_RISCO, RISCO_CODES, sugestoes86, previaEncaminhamento86, ENCAMINHAR_MIN, type Respostas86, type Social86, type Item86, type Resultado86, type DecisaoPrioridadeFila,
} from "@/lib/triagem-86";
import { saveTriagem86, type SaveTriagem86Result, type Triagem86 } from "@/lib/triagem-86-rpc";

const GRUPOS = [...AREAS_86] as const;

/** Cor de cada grupo (mesmo padrão de cores por área da avaliação ABC). */
export const COR_GRUPO: Record<string, string> = {
  Fonoaudiologia: "#ec4899", Psicologia: "#22c55e", "Terapia Ocupacional": "#f59e0b", Fisioterapia: "#3b82f6",
  Psicomotricidade: "#8b5cf6", Nutrição: "#f43f5e", "Educação Física": "#06b6d4", Sociofamiliar: "#14b8a6", Prioridades: "#ef4444",
};
const SEM_PONTO = ["ns", "na", "pni"];

/** Pergunta no estilo da ABC: números clicáveis na tela, cor ao selecionar, explicação ao clicar no título. */
function ItemRow({ it, value, onChange }: { it: Item86; value?: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const cor = COR_GRUPO[it.grupo] ?? "#3b82f6";
  const respondida = !!value;
  return (
    <div className="rounded-xl border p-3 transition-all duration-150"
      style={respondida ? { borderColor: cor, background: `${cor}12` } : undefined}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full text-left flex items-start gap-2">
        <span className="text-[11px] font-mono font-bold mt-0.5 px-1.5 py-0.5 rounded" style={{ color: cor, background: `${cor}1f` }}>{it.code}</span>
        <span className="flex-1">
          <span className="block text-sm font-semibold" style={respondida ? { color: cor } : undefined}>
            {it.titulo} <ChevronDown className={cn("inline w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
          </span>
          <span className="block text-sm text-muted-foreground">{it.tecnica}</span>
        </span>
      </button>
      {open && <p className="mt-2 ml-8 text-sm rounded-lg p-2 border" style={{ background: `${cor}14`, borderColor: `${cor}55` }}><Info className="inline w-3.5 h-3.5 mr-1" />{it.simples}</p>}
      <div className="mt-2 ml-8 flex flex-wrap gap-1.5">
        {opcoesDe(it).map((o) => {
          const sel = value === o.valor;
          const neutro = SEM_PONTO.includes(o.valor);
          return (
            <button key={o.valor} type="button" aria-pressed={sel} title={o.label} onClick={() => onChange(o.valor)}
              className={cn("min-w-[62px] max-w-[120px] px-2 py-1.5 rounded-xl border-2 flex flex-col items-center leading-tight transition-all duration-150",
                sel ? "text-white shadow-md" : "border-border bg-background/40 hover:border-foreground/40")}
              style={sel ? { background: neutro ? "#64748b" : cor, borderColor: neutro ? "#94a3b8" : cor } : undefined}>
              <span className="text-lg font-extrabold">{o.num ?? o.label}</span>
              <span className={cn("text-[10px] text-center", !sel && "text-muted-foreground")}>{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** `encaminhadas`: especialidades que vão (ou foram) para a fila; as demais aparecem como avaliadas. */
export function Resultado86View({ r, compact, encaminhadas, decisao }: { r: Resultado86; compact?: boolean; encaminhadas?: string[] | null; decisao?: DecisaoPrioridadeFila }) {
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
          {r.areas.map((a) => {
            const fila = !!encaminhadas?.includes(a.area);
            return (
              <div key={a.area} className={cn("rounded-lg border p-2", fila ? "border-primary bg-primary/10" : "border-border")}>
                <p className="text-xs font-semibold">{a.area}</p>
                <p className="text-lg font-bold">{a.pontos}<span className="text-xs text-muted-foreground">/30</span></p>
                {encaminhadas && <p className={cn("text-[10px] font-bold uppercase", fila ? "text-primary" : "text-muted-foreground")}>{fila ? "Encaminhada à fila" : "Avaliada"}</p>}
                {!compact && (a.naoSei > 0 || a.naoAplica > 0) && <p className="text-[10px] text-amber-500">{a.naoSei} não sei · {a.naoAplica} não se aplica</p>}
              </div>
            );
          })}
        </div>
      </div>
      {decisao ? <div className="rounded-lg border border-border p-3 text-sm">
        <p className="font-bold">Decisão técnica de prioridade para convocação</p>
        <p>{decisao.prioritaria ? `Sim: ${decisao.especialidades.join(", ")}` : "Não — segue o fluxo habitual da fila."}</p>
        {decisao.prioritaria && <p>Justificativa: {decisao.justificativa}</p>}
      </div> : <div className="grid sm:grid-cols-2 gap-2 text-sm">
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
      </div>}
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
      <Resultado86View r={r} compact encaminhadas={t.encaminhamento?.encaminhadas ?? null} decisao={t.social?.prioridadeFila} />
    </Card>
  );
}

type Dados = Pick<Patient, "dateOfBirth" | "cpf" | "cns" | "guardianName" | "guardianPhone" | "phone" | "address" | "motherName" | "fatherName" | "diagnosis">;
const DADOS_CAMPOS: { k: keyof Dados; l: string; type?: string }[] = [
  { k: "dateOfBirth", l: "Data de nascimento", type: "date" }, { k: "cpf", l: "CPF" }, { k: "cns", l: "Cartão SUS" },
  { k: "guardianName", l: "Responsável" }, { k: "guardianPhone", l: "Telefone do responsável" }, { k: "phone", l: "Telefone" },
  { k: "motherName", l: "Nome da mãe" }, { k: "fatherName", l: "Nome do pai" }, { k: "address", l: "Endereço" }, { k: "diagnosis", l: "Diagnóstico" },
];

/**
 * Triagem única: dados do paciente → especialidades → decisão técnica final.
 * Sem blocos extras sociofamiliares ou de prioridade automática. Usa a Triagem 86
 * (save_triagem_86). A avaliação ABC continua separada.
 */
export function Triagem86Form({ patientId, patient, editarDados = true, tipoTriagem, enfileirar = true, resumoAoSalvar = true, onPatientUpdated, onSaved, onCancel }: {
  patientId: number; patient?: Patient | null; editarDados?: boolean; tipoTriagem?: string;
  /** false: só salva; a fila é decidida ao concluir a ABC (fluxo do cadastro). */
  enfileirar?: boolean;
  /** false: chama onSaved logo após salvar, sem a tela de resumo. */
  resumoAoSalvar?: boolean;
  onPatientUpdated?: (p: Patient) => void;
  onSaved: (r: SaveTriagem86Result) => void; onCancel: () => void;
}) {
  const comDados = !!patient && editarDados;
  const etapas = [...(comDados ? ["Dados do paciente"] : []), ...GRUPOS, "Resultado"];
  const [etapa, setEtapa] = useState(0);
  const [resp, setResp] = useState<Respostas86>({});
  const [decisao, setDecisao] = useState<DecisaoPrioridadeFila>({ prioritaria: false, especialidades: [], justificativa: "" });
  const social: Social86 = { formulario: "clinico", prioridadeFila: decisao };
  const [dados, setDados] = useState<Dados>(() => Object.fromEntries(DADOS_CAMPOS.map(({ k }) => [k, patient?.[k] ?? ""])) as Dados);
  const [responsavel, setResponsavel] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState<{ res: SaveTriagem86Result; paciente: Patient | null } | null>(null);
  const r = useMemo(() => calcularResultado86(resp, {}), [resp]);
  const faltando = ITENS_TRIAGEM_ATUAL.filter(i => !resp[i.code]).map(i => i.code);
  const previa = useMemo(() => {
    const areas = previaEncaminhamento86(r);
    const dob = patient?.dateOfBirth;
    if (dob) {
      const birth = new Date(dob + "T12:00:00");
      const now = new Date();
      const cutoff = new Date(now); cutoff.setFullYear(cutoff.getFullYear()-2);
      if (birth <= now && birth > cutoff && !areas.includes("Fisioterapia")) areas.push("Fisioterapia");
    }
    return areas;
  }, [r, patient?.dateOfBirth]);
  const totalPts = r.areas.reduce((s, a) => s + a.pontos, 0);
  const riscos = r.prioridades.filter((p) => RISCO_CODES.includes(p.code));
  const grupo = etapas[etapa];
  const itens = ITENS_86.filter((i) => i.grupo === grupo);
  const falta = (g: string) => ITENS_86.filter((i) => i.grupo === g && r.faltando.includes(i.code)).length;
  const irPara = (n: number) => { setEtapa(n); setErro(null); document.getElementById("triagem-unica-topo")?.scrollIntoView({ behavior: "smooth" }); };

  const finalizar = async () => {
    if (!responsavel.trim()) { setErro("Informe quem preencheu a triagem."); return; }
    if (faltando.length) { setErro(`Faltam ${faltando.length} perguntas: ${faltando.slice(0, 6).join(", ")}${faltando.length > 6 ? "…" : ""}`); return; }
    const decisaoErro = erroDecisaoPrioridadeFila(decisao, previa);
    if (decisaoErro) { setErro(decisaoErro); return; }
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
      const res = await saveTriagem86(patientId, resp, social, responsavel.trim(), enfileirar);
      if (!resumoAoSalvar) { onSaved(res); return; }
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
          <p className="text-sm text-muted-foreground">{res.addedSpecialties?.length ? `Incluída na fila: ${res.addedSpecialties.join(", ")}.` : res.reason === "all_already_queued" ? "Já estava nas filas cabíveis; notas atualizadas." : res.reason === "no_eligible_specialties" ? `Nenhuma especialidade com ${ENCAMINHAR_MIN} pontos ou mais: não entrou na fila.` : "Notas por área atualizadas."}</p>
        </div>
        <Resultado86View r={r} encaminhadas={res.encaminhamento?.encaminhadas ?? res.specialties ?? null} decisao={decisao} />
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

      <div className="sticky top-0 z-10 rounded-xl border border-border bg-background/90 backdrop-blur p-3 shadow-sm">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-3xl font-black leading-none">{totalPts}</span>
          <span className="text-sm font-semibold">Pontuação total <span className="text-muted-foreground font-normal">/ 210 · {ITENS_TRIAGEM_ATUAL.length - faltando.length}/{ITENS_TRIAGEM_ATUAL.length} respondidas</span></span>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {r.areas.map((a) => {
            const cor = COR_GRUPO[a.area];
            const fila = previa.includes(a.area);
            return (
              <span key={a.area} className="text-[11px] font-bold px-2 py-0.5 rounded-full border"
                style={{ color: cor, borderColor: `${cor}66`, background: fila ? `${cor}26` : undefined }}>
                {a.area} {a.pontos}/30{fila ? " · fila" : ""}
              </span>
            );
          })}

        </div>
        {riscos.length > 0 && <p className="mt-2 text-xs font-semibold text-red-500 flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{ALERTA_RISCO}</p>}
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
          <Resultado86View r={r} encaminhadas={previa} decisao={decisao} />
          <fieldset className="rounded-xl border-2 border-primary/40 p-4 space-y-3">
            <legend className="font-bold px-1">Decisão final da triadora</legend>
            <p className="font-semibold">Esta criança precisa de prioridade para convocação, à frente da ordem habitual?</p>
            <div className="flex flex-wrap gap-4">
              <label className="flex gap-2 items-center"><input type="radio" name="prioridade-final" checked={!decisao.prioritaria} onChange={() => setDecisao({ prioritaria: false, especialidades: [], justificativa: "" })} />Não — segue a ordem habitual</label>
              <label className="flex gap-2 items-center"><input type="radio" name="prioridade-final" checked={decisao.prioritaria} onChange={() => setDecisao(d => ({ ...d, prioritaria: true }))} />Sim — prioridade validada</label>
            </div>
            {decisao.prioritaria && <>
              <p className="text-sm">Em qual especialidade?</p>
              <div className="flex flex-wrap gap-3">{previa.map(s => <label key={s} className="flex gap-2 text-sm"><input type="checkbox" checked={decisao.especialidades.includes(s)} onChange={e => setDecisao(d => ({ ...d, especialidades: e.target.checked ? [...d.especialidades, s] : d.especialidades.filter(x => x!==s) }))} />{s}</label>)}</div>
              <label className="block text-sm">Justificativa da prioridade<textarea className="block w-full rounded-lg border border-border bg-background p-2 mt-1" value={decisao.justificativa} onChange={e => setDecisao(d => ({ ...d, justificativa: e.target.value }))} /></label>
            </>}
            <p className="text-xs text-muted-foreground">A decisão fica registrada com a triagem e o nome da responsável. A pontuação e o diagnóstico, sozinhos, não antecipam a posição. Filas já existentes mantêm sua data e validações anteriores.</p>
          </fieldset>
          <Sugestoes r={r} />
        </div>
      ) : (
        <div className="space-y-2">
          {itens.map((it) => <ItemRow key={it.code} it={it} value={resp[it.code]} onChange={(v) => setResp(p => ({ ...p, [it.code]: v }))} />)}
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
      {grupo === "Resultado" && <p className="text-[11px] text-muted-foreground">{enfileirar ? "Ao finalizar" : "Ao concluir a Avaliação ABC"}, a criança entra automaticamente nas filas das especialidades elegíveis pela pontuação ({ENCAMINHAR_MIN} pontos ou mais), sem duplicar; quem já está na fila mantém a data de entrada.</p>}
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
