import { useMemo, useState } from "react";
import { Button, Input, Label } from "@/components/ui-custom";
import { Printer, X as XIcon } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import {
  upsertTriagemMulti, autolinkTriagemMulti,
  type Patient, type TriagemMulti, type AutolinkTriagemResult,
} from "@/lib/arco-rpc";
import {
  AREAS, AREA_ICONS, SHORT_NAMES, CORES_AREA, ESCALA, PERGUNTAS, SCORE_MAX_DISPLAY,
  calcularResultado, parseRespostas, corTotal, type ResultadoTriagem,
} from "@/lib/triagem-multi";

// ─── helpers ────────────────────────────────────────────────────────────────

const ESCOLARIDADE_OPTIONS = [
  "Não alfabetizado", "Ensino Fundamental Incompleto", "Ensino Fundamental Completo",
  "Ensino Médio Incompleto", "Ensino Médio Completo",
  "Ensino Superior Incompleto", "Ensino Superior Completo", "Pós-graduação",
];
const TIPO_IMOVEL_OPTIONS = ["Próprio", "Alugado", "Cedido", "Abrigo / Instituição", "Área de risco"];
const TIPO_ESCOLA_OPTIONS = ["Municipal", "Estadual", "Particular", "Filantrópica", "Não escolarizado"];
const TRABALHO_PAIS_OPTIONS = ["Formal (Carteira Assinada)", "Informal/Roça", "Desempregado", "Aposentado/Pensionista"];
const LOCAL_ATENDIMENTO_OPTIONS = ["CAPS", "Reabilitação", "Particular", "Sem Atendimento"];

const escalaCls = (v: number) =>
  v === 0 ? "bg-emerald-500 text-white border-emerald-500"
    : v === 1 ? "bg-blue-500 text-white border-blue-500"
    : v === 2 ? "bg-amber-500 text-white border-amber-500"
    : "bg-rose-500 text-white border-rose-500";

const idadeDe = (dataNascimento: string | null): string => {
  if (!dataNascimento) return "";
  const d = new Date(dataNascimento + "T12:00:00");
  if (Number.isNaN(d.getTime())) return "";
  const hoje = new Date();
  let anos = hoje.getFullYear() - d.getFullYear();
  let meses = hoje.getMonth() - d.getMonth();
  if (hoje.getDate() < d.getDate()) meses -= 1;
  if (meses < 0) { anos -= 1; meses += 12; }
  return anos > 0 ? `${anos} ano${anos > 1 ? "s" : ""}${meses > 0 ? ` e ${meses} m` : ""}` : `${meses} meses`;
};

function Sel({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full h-10 mt-1 px-3 rounded-xl border border-border bg-background text-sm">
        <option value="">Selecione…</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function Txt({ label, value, onChange, placeholder, className }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={className}>
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-1" />
    </div>
  );
}

function Chk({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 accent-primary" />
      {label}
    </label>
  );
}

// ─── Resultado (igual ao relatório do app NFs Triagem) ──────────────────────

export function TriagemMultiResultado({ triagem, patient, compact }: { triagem: TriagemMulti; patient?: Patient | null; compact?: boolean }) {
  const respostas = parseRespostas(triagem.respostas);
  const r: ResultadoTriagem | null = respostas
    ? calcularResultado(respostas, { tipoEscola: triagem.tipoEscola, trabalhoPais: triagem.trabalhoPais })
    : null;

  const t = triagem;
  const nome = t.nome || patient?.name || "—";
  const dataNasc = t.dataNascimento || patient?.dateOfBirth || null;
  const beneficios = [
    t.bolsaFamilia && "Bolsa Família", t.bpc && "BPC", t.pensao && "Pensão", t.auxilioDoenca && "Auxílio-Doença", t.outrosAuxilios,
  ].filter(Boolean).join(", ");
  const dispositivos = [
    t.cadeiraDeRodas && "Cadeira de Rodas", t.ortesesProteses && "Órteses/Próteses", t.aparelhoAuditivo && "Aparelho Auditivo",
  ].filter(Boolean).join(", ");

  const Campo = ({ label, val, span }: { label: string; val: string | null | undefined; span?: boolean }) =>
    val ? <div className={span ? "md:col-span-2" : ""}><p className="text-muted-foreground font-semibold">{label}</p><p className="font-bold">{val}</p></div> : null;

  return (
    <div className="space-y-4 text-sm" data-triagem-print>
      {t.alergias && (
        <div className="bg-red-50 border-2 border-red-400 rounded-2xl p-4 flex gap-3 items-start">
          <span className="text-2xl">⚠️</span>
          <div><p className="font-bold text-red-700">ALERTA DE ALERGIA</p><p className="text-red-800 font-semibold">{t.alergias}</p></div>
        </div>
      )}
      {t.medicacaoContinua && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex gap-3 items-start">
          <span className="text-xl">💊</span>
          <div><p className="font-bold text-amber-800">Medicação Contínua</p><p className="text-amber-900">{t.medicacaoContinua}</p></div>
        </div>
      )}
      {t.problemasSaude && (
        <div className="bg-orange-50 border border-orange-300 rounded-2xl p-4 flex gap-3 items-start">
          <span className="text-xl">🏥</span>
          <div><p className="font-bold text-orange-800">Problemas de Saúde Associados</p><p className="text-orange-900">{t.problemasSaude}</p></div>
        </div>
      )}

      {/* Dados do Paciente */}
      <div className="rounded-2xl border border-border/60 p-5 space-y-4 bg-card">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-xs text-primary uppercase tracking-wider">Dados do Paciente</h4>
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
            {t.tipoRegistro === "Registro Censo Municipal" ? "🏛️ Censo Municipal PCD" : "🏥 Paciente da Unidade"}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Campo label="Nome" val={nome} span />
          <Campo label="Data da Triagem" val={t.data || formatDate(t.createdAt.slice(0, 10))} />
          <Campo label="Nascimento" val={dataNasc ? formatDate(dataNasc) : null} />
          <Campo label="Idade" val={t.idade || idadeDe(dataNasc)} />
          <Campo label="Naturalidade" val={t.naturalidade} />
          <Campo label="RG" val={t.rg} />
          <Campo label="CPF" val={t.cpf || patient?.cpf} />
          <Campo label="Cartão SUS" val={t.sus || patient?.cns} />
          <Campo label="Responsável" val={t.responsavel || patient?.guardianName} />
          <Campo label="CPF do Responsável" val={t.cpfResponsavel} />
          <Campo label="Cartão SUS do Responsável" val={t.susResponsavel} />
          <Campo label="Telefone" val={t.telefone || patient?.phone} />
          <Campo label="Endereço" val={t.endereco || patient?.address} span />
        </div>

        {(t.nomeMae || t.nomePai || t.numIrmaos || t.tipoImovel || beneficios || t.rendaFamiliar || t.localAtendimento || t.tipoEscola || t.trabalhoPais) && (
          <div className="pt-4 border-t border-border">
            <p className="font-bold text-muted-foreground uppercase text-xs tracking-wider mb-2">Núcleo Familiar e Social</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Campo label="Mãe" val={t.nomeMae ? `${t.nomeMae}${t.escolaridadeMae ? ` | ${t.escolaridadeMae}` : ""}${t.profissaoMae ? ` | ${t.profissaoMae}` : ""}` : null} />
              <Campo label="Pai" val={t.nomePai ? `${t.nomePai}${t.escolaridadePai ? ` | ${t.escolaridadePai}` : ""}${t.profissaoPai ? ` | ${t.profissaoPai}` : ""}` : null} />
              <Campo label="Nº de Irmãos" val={t.numIrmaos} />
              <Campo label="Moradia" val={t.tipoImovel} />
              <Campo label="Renda Familiar" val={t.rendaFamiliar} />
              <Campo label="Benefícios" val={beneficios} span />
              <Campo label="Escola" val={t.tipoEscola} />
              <Campo label="Trabalho dos Pais" val={t.trabalhoPais} />
              <Campo label="Atendimento Atual" val={t.localAtendimento} />
            </div>
          </div>
        )}

        {(t.diagnostico || t.cid || t.cid11 || t.medico || dispositivos) && (
          <div className="pt-4 border-t border-border">
            <p className="font-bold text-muted-foreground uppercase text-xs tracking-wider mb-2">Saúde e Dispositivos</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Campo label="Diagnóstico" val={t.diagnostico} />
              <Campo label="CID-10" val={t.cid} />
              <Campo label="CID-11" val={t.cid11} />
              <Campo label="Médico" val={t.medico} />
              <Campo label="Última Consulta" val={t.dataUltimaCons ? formatDate(t.dataUltimaCons) : null} />
              <Campo label="Dispositivos" val={dispositivos} span />
            </div>
          </div>
        )}

        {t.profissional && (
          <div className="pt-4 border-t border-border">
            <p className="text-muted-foreground font-semibold">Profissional Responsável pela Triagem</p>
            <p className="font-bold">{t.profissional}{t.especialidade ? ` — ${t.especialidade}` : ""}</p>
          </div>
        )}
      </div>

      {!r ? (
        <p className="text-muted-foreground italic">
          {t.resultado || "Esta triagem foi salva com um questionário antigo; o detalhamento por área não está disponível."}
        </p>
      ) : (
        <>
          {/* Pontuação total */}
          <div className="rounded-2xl border border-border/60 p-5 bg-card flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">Pontuação Total</p>
              <p className="text-4xl font-bold mt-1">{r.scoreDisplayTotal} <span className="text-lg font-normal text-muted-foreground">/ {SCORE_MAX_DISPLAY}</span></p>
              <p className="text-muted-foreground mt-1">{r.pctTotal}% da pontuação máxima{r.vulnBonusPts > 0 ? ` · +${r.vulnBonusPts} vulnerabilidade` : ""}</p>
              <div className="flex gap-3 mt-3 flex-wrap">
                {[["bg-emerald-500", "Verde – Baixo"], ["bg-blue-500", "Azul – Leve"], ["bg-amber-500", "Laranja – Moderado"], ["bg-rose-500", "Vermelho – Elevado"]].map(([cor, label]) => (
                  <span key={label} className="flex items-center gap-1 text-xs text-muted-foreground"><span className={`w-3 h-3 rounded-full ${cor}`} /> {label}</span>
                ))}
              </div>
            </div>
            <div className="relative w-28 h-28 flex-shrink-0">
              <svg viewBox="0 0 36 36" className="w-28 h-28 -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(148,163,184,0.25)" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke={corTotal(r.pctTotal)} strokeWidth="3"
                  strokeDasharray={`${r.pctTotal} ${100 - r.pctTotal}`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center"><span className="text-xl font-bold">{r.pctTotal}%</span></div>
            </div>
          </div>

          {/* Perfil por área */}
          <div className="rounded-2xl border border-border/60 p-5 bg-card">
            <h4 className="font-bold text-base mb-1">Perfil Multidisciplinar</h4>
            <p className="text-muted-foreground mb-3">Percentual de indicativo por área avaliada</p>
            <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
              {r.porArea.map(({ area, pct, nivel }) => (
                <div key={area} className={cn("text-center p-2 rounded-xl border", nivel.bg)}>
                  <p className="text-xs font-semibold text-muted-foreground truncate">{SHORT_NAMES[area]}</p>
                  <p className={cn("text-lg font-bold", nivel.cor)}>{pct}%</p>
                  <p className={cn("text-[10px] font-semibold", nivel.cor)}>{nivel.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Top 3 */}
          {r.top3.length > 0 && (
            <div className="rounded-2xl border border-border/60 p-5 bg-card">
              <h4 className="font-bold text-base mb-3">Prioridades Identificadas (Top {r.top3.length})</h4>
              <div className="space-y-2">
                {r.top3.map(({ area, pontos, max, nivel }, i) => (
                  <div key={area} className={cn("flex items-center gap-4 p-3 rounded-xl border", nivel.bg)}>
                    <span className="text-2xl font-black text-muted-foreground/40 w-8 text-center">{i + 1}</span>
                    <div className="flex-1">
                      <p className={cn("font-bold", nivel.cor)}>{area}</p>
                      <p className={cn("text-xs font-semibold", nivel.cor)}>{nivel.label}</p>
                    </div>
                    <div className="text-right"><span className="text-2xl font-bold">{pontos}</span><p className="text-xs text-muted-foreground">/{max}</p></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detalhado */}
          {!compact && (
            <div className="rounded-2xl border border-border/60 p-5 bg-card">
              <h4 className="font-bold text-base mb-4">Resultado Detalhado por Área</h4>
              <div className="space-y-3">
                {r.ranking.map(({ area, pontos, max, pct, nivel }) => (
                  <div key={area}>
                    <div className="flex justify-between items-center mb-1">
                      <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full border", CORES_AREA[area] ?? "bg-secondary border-border")}>{area}</span>
                      <div className="flex items-center gap-3">
                        <span className={cn("font-bold", nivel.cor)}>{nivel.label}</span>
                        <span className="text-muted-foreground">{pontos}/{max} ({pct}%)</span>
                      </div>
                    </div>
                    <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: nivel.hex }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!compact && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-blue-900">
              <p className="font-bold mb-1">Nota Técnica</p>
              <p>Este documento refere-se a uma triagem inicial baseada em observações estruturadas, não constituindo diagnóstico clínico ou laudo profissional. Os resultados indicam possíveis necessidades e servem como apoio para encaminhamento para avaliação especializada.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Formulário (questionário 9 x 10) ────────────────────────────────────────

type TriagemMultiBody = Omit<TriagemMulti, "id" | "createdAt">;

type FormProps = {
  patient: Patient;
  base?: TriagemMulti | null;
  professionalName?: string | null;
  professionalSpecialty?: string | null;
  onSaved: (t: TriagemMulti, autolink: AutolinkTriagemResult | null) => void;
  onCancel: () => void;
};

export function TriagemMultiForm({ patient, base, professionalName, professionalSpecialty, onSaved, onCancel }: FormProps) {
  const b = base ?? null;
  const [etapa, setEtapa] = useState<"dados" | "perguntas" | "resultado">("dados");
  const [respostas, setRespostas] = useState<number[]>(() => parseRespostas(b?.respostas ?? null) ?? Array(PERGUNTAS.length).fill(0));
  const [areaAtiva, setAreaAtiva] = useState(AREAS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nomeResponsavel, setNomeResponsavel] = useState(b?.responsavel ?? patient.guardianName ?? "");
  const [telefone, setTelefone] = useState(b?.telefone ?? patient.phone ?? patient.guardianPhone ?? "");
  const [endereco, setEndereco] = useState(b?.endereco ?? patient.address ?? "");
  const [naturalidade, setNaturalidade] = useState(b?.naturalidade ?? "");
  const [rg, setRg] = useState(b?.rg ?? "");
  const [sus, setSus] = useState(b?.sus ?? patient.cns ?? "");
  const [cpfResponsavel, setCpfResponsavel] = useState(b?.cpfResponsavel ?? "");
  const [susResponsavel, setSusResponsavel] = useState(b?.susResponsavel ?? "");
  const [nomeMae, setNomeMae] = useState(b?.nomeMae ?? patient.motherName ?? "");
  const [escolaridadeMae, setEscolaridadeMae] = useState(b?.escolaridadeMae ?? "");
  const [profissaoMae, setProfissaoMae] = useState(b?.profissaoMae ?? "");
  const [nomePai, setNomePai] = useState(b?.nomePai ?? patient.fatherName ?? "");
  const [escolaridadePai, setEscolaridadePai] = useState(b?.escolaridadePai ?? "");
  const [profissaoPai, setProfissaoPai] = useState(b?.profissaoPai ?? "");
  const [numIrmaos, setNumIrmaos] = useState(b?.numIrmaos ?? "");
  const [tipoImovel, setTipoImovel] = useState(b?.tipoImovel ?? "");
  const [bolsaFamilia, setBolsaFamilia] = useState(!!b?.bolsaFamilia);
  const [bpc, setBpc] = useState(!!b?.bpc);
  const [pensao, setPensao] = useState(!!b?.pensao);
  const [auxilioDoenca, setAuxilioDoenca] = useState(!!b?.auxilioDoenca);
  const [outrosAuxilios, setOutrosAuxilios] = useState(b?.outrosAuxilios ?? "");
  const [rendaFamiliar, setRendaFamiliar] = useState(b?.rendaFamiliar ?? "");
  const [diagnostico, setDiagnostico] = useState(b?.diagnostico ?? patient.diagnosis ?? "");
  const [cid, setCid] = useState(b?.cid ?? "");
  const [cid11, setCid11] = useState(b?.cid11 ?? "");
  const [medico, setMedico] = useState(b?.medico ?? "");
  const [dataUltimaCons, setDataUltimaCons] = useState(b?.dataUltimaCons ?? "");
  const [cadeiraDeRodas, setCadeiraDeRodas] = useState(!!b?.cadeiraDeRodas);
  const [ortesesProteses, setOrtesesProteses] = useState(!!b?.ortesesProteses);
  const [aparelhoAuditivo, setAparelhoAuditivo] = useState(!!b?.aparelhoAuditivo);
  const [medicacaoContinua, setMedicacaoContinua] = useState(b?.medicacaoContinua ?? "");
  const [alergias, setAlergias] = useState(b?.alergias ?? "");
  const [problemasSaude, setProblemasSaude] = useState(b?.problemasSaude ?? "");
  const [tipoEscola, setTipoEscola] = useState(b?.tipoEscola ?? (patient.escolaPublica ? "Municipal" : ""));
  const [trabalhoPais, setTrabalhoPais] = useState(b?.trabalhoPais ?? (patient.trabalhoNaRoca ? "Informal/Roça" : ""));
  const [outroAtendimento, setOutroAtendimento] = useState(b ? b.outroAtendimento !== false : patient.outroAtendimento !== false);
  const [abrigoCasaCrianca, setAbrigoCasaCrianca] = useState(b?.abrigoCasaCrianca ?? patient.abrigoCasaCrianca ?? false);
  const [cognitivoNaoPreservado, setCognitivoNaoPreservado] = useState(false);
  const [localAtendimento, setLocalAtendimento] = useState(b?.localAtendimento ?? patient.localAtendimento ?? "");
  const [profissional, setProfissional] = useState(b?.profissional ?? professionalName ?? "");

  const areaIdx = AREAS.indexOf(areaAtiva);
  const perguntasDaArea = useMemo(() => PERGUNTAS.map((p, idx) => ({ ...p, idx })).filter((p) => p.area === areaAtiva), [areaAtiva]);
  const resultado = useMemo(() => calcularResultado(respostas, { cognitivoNaoPreservado, tipoEscola, trabalhoPais }), [respostas, cognitivoNaoPreservado, tipoEscola, trabalhoPais]);

  const payload = (): TriagemMultiBody => ({
    nome: patient.name,
    dataNascimento: patient.dateOfBirth,
    idade: idadeDe(patient.dateOfBirth) || null,
    responsavel: nomeResponsavel || null,
    telefone: telefone || null,
    endereco: endereco || null,
    naturalidade: naturalidade || null,
    rg: rg || null,
    cpf: patient.cpf,
    sus: sus || null,
    cpfResponsavel: cpfResponsavel || null,
    susResponsavel: susResponsavel || null,
    nomeMae: nomeMae || null, escolaridadeMae: escolaridadeMae || null, profissaoMae: profissaoMae || null,
    nomePai: nomePai || null, escolaridadePai: escolaridadePai || null, profissaoPai: profissaoPai || null,
    numIrmaos: numIrmaos || null, tipoImovel: tipoImovel || null,
    bolsaFamilia, bpc, pensao, auxilioDoenca,
    outrosAuxilios: outrosAuxilios || null, rendaFamiliar: rendaFamiliar || null,
    diagnostico: diagnostico || null, cid: cid || null, cid11: cid11 || null,
    medico: medico || null, dataUltimaCons: dataUltimaCons || null,
    cadeiraDeRodas, ortesesProteses, aparelhoAuditivo,
    medicacaoContinua: medicacaoContinua || null, alergias: alergias || null, problemasSaude: problemasSaude || null,
    tipoEscola: tipoEscola || null, trabalhoPais: trabalhoPais || null,
    outroAtendimento, abrigoCasaCrianca,
    localAtendimento: localAtendimento || null,
    tipoRegistro: patient.tipoRegistro === "Registro Censo Municipal" ? "Registro Censo Municipal" : "Paciente da Unidade",
    profissional: profissional || null,
    especialidade: b?.especialidade ?? professionalSpecialty ?? null,
    data: new Date().toLocaleDateString("pt-BR"),
    resultado: resultado.resultadoTexto,
    respostas: JSON.stringify(respostas),
  });

  const salvar = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await upsertTriagemMulti(b?.id ?? null, payload());
      const link = saved.tipoRegistro === "Registro Censo Municipal" ? null : await autolinkTriagemMulti(saved.id);
      onSaved(saved, link);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar triagem.");
    } finally {
      setSaving(false);
    }
  };

  const preview: TriagemMulti = { id: b?.id ?? 0, createdAt: b?.createdAt ?? new Date().toISOString(), ...payload() };

  const etapas: Array<{ key: typeof etapa; label: string }> = [
    { key: "dados", label: "1. Dados" }, { key: "perguntas", label: "2. Questionário" }, { key: "resultado", label: "3. Resultado" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2 no-print">
        {etapas.map((e) => (
          <button key={e.key} type="button" onClick={() => setEtapa(e.key)}
            className={cn("px-4 py-1.5 rounded-full text-sm font-semibold border transition-all",
              etapa === e.key ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-border")}>
            {e.label}
          </button>
        ))}
      </div>

      {etapa === "dados" && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-border/60 p-4 bg-secondary/20">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Paciente</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="col-span-2"><p className="text-muted-foreground text-xs">Nome</p><p className="font-bold">{patient.name}</p></div>
              <div><p className="text-muted-foreground text-xs">Nascimento</p><p className="font-bold">{patient.dateOfBirth ? formatDate(patient.dateOfBirth) : "—"}</p></div>
              <div><p className="text-muted-foreground text-xs">CPF</p><p className="font-bold">{patient.cpf || "—"}</p></div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Nome, nascimento e CPF vêm do cadastro do paciente — é por eles que a triagem é vinculada ao prontuário e à fila.</p>
          </div>

          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Identificação e contato</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Txt label="Responsável" value={nomeResponsavel} onChange={setNomeResponsavel} />
              <Txt label="Telefone" value={telefone} onChange={setTelefone} />
              <Txt label="Endereço" value={endereco} onChange={setEndereco} className="sm:col-span-2" />
              <Txt label="Naturalidade" value={naturalidade} onChange={setNaturalidade} />
              <Txt label="RG" value={rg} onChange={setRg} />
              <Txt label="Cartão SUS" value={sus} onChange={setSus} />
              <Txt label="CPF do Responsável" value={cpfResponsavel} onChange={setCpfResponsavel} />
              <Txt label="Cartão SUS do Responsável" value={susResponsavel} onChange={setSusResponsavel} />
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Núcleo familiar e social</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Txt label="Nome da Mãe" value={nomeMae} onChange={setNomeMae} />
              <Sel label="Escolaridade da Mãe" value={escolaridadeMae} onChange={setEscolaridadeMae} options={ESCOLARIDADE_OPTIONS} />
              <Txt label="Profissão da Mãe" value={profissaoMae} onChange={setProfissaoMae} />
              <Txt label="Nome do Pai" value={nomePai} onChange={setNomePai} />
              <Sel label="Escolaridade do Pai" value={escolaridadePai} onChange={setEscolaridadePai} options={ESCOLARIDADE_OPTIONS} />
              <Txt label="Profissão do Pai" value={profissaoPai} onChange={setProfissaoPai} />
              <Txt label="Nº de Irmãos" value={numIrmaos} onChange={setNumIrmaos} />
              <Sel label="Moradia" value={tipoImovel} onChange={setTipoImovel} options={TIPO_IMOVEL_OPTIONS} />
              <Txt label="Renda Familiar" value={rendaFamiliar} onChange={setRendaFamiliar} placeholder="Ex.: R$ 1.500 / 2 salários mínimos" />
              <Sel label="Tipo de Escola" value={tipoEscola} onChange={setTipoEscola} options={TIPO_ESCOLA_OPTIONS} />
              <Sel label="Trabalho dos Pais" value={trabalhoPais} onChange={setTrabalhoPais} options={TRABALHO_PAIS_OPTIONS} />
              <Sel label="Atendimento Atual" value={localAtendimento} onChange={setLocalAtendimento} options={LOCAL_ATENDIMENTO_OPTIONS} />
            </div>
            <div className="flex flex-wrap gap-4 mt-3">
              <Chk checked={bolsaFamilia} onChange={setBolsaFamilia} label="Bolsa Família" />
              <Chk checked={bpc} onChange={setBpc} label="BPC" />
              <Chk checked={pensao} onChange={setPensao} label="Pensão" />
              <Chk checked={auxilioDoenca} onChange={setAuxilioDoenca} label="Auxílio-Doença" />
              <Chk checked={abrigoCasaCrianca} onChange={setAbrigoCasaCrianca} label="Abrigo / Casa da Criança" />
              <Chk checked={outroAtendimento} onChange={setOutroAtendimento} label="Já faz atendimento em outro local" />
            </div>
            <div className="mt-3"><Txt label="Outros auxílios" value={outrosAuxilios} onChange={setOutrosAuxilios} /></div>
          </div>

          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Saúde e dispositivos</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Txt label="Diagnóstico" value={diagnostico} onChange={setDiagnostico} className="sm:col-span-3" />
              <Txt label="CID-10" value={cid} onChange={setCid} />
              <Txt label="CID-11" value={cid11} onChange={setCid11} />
              <Txt label="Médico" value={medico} onChange={setMedico} />
              <div>
                <Label className="text-xs">Última Consulta</Label>
                <Input type="date" value={dataUltimaCons} onChange={(e) => setDataUltimaCons(e.target.value)} className="mt-1" />
              </div>
              <Txt label="Medicação Contínua" value={medicacaoContinua} onChange={setMedicacaoContinua} />
              <Txt label="Alergias" value={alergias} onChange={setAlergias} />
              <Txt label="Problemas de Saúde Associados" value={problemasSaude} onChange={setProblemasSaude} className="sm:col-span-3" />
            </div>
            <div className="flex flex-wrap gap-4 mt-3">
              <Chk checked={cadeiraDeRodas} onChange={setCadeiraDeRodas} label="Cadeira de Rodas" />
              <Chk checked={ortesesProteses} onChange={setOrtesesProteses} label="Órteses/Próteses" />
              <Chk checked={aparelhoAuditivo} onChange={setAparelhoAuditivo} label="Aparelho Auditivo" />
              <Chk checked={cognitivoNaoPreservado} onChange={setCognitivoNaoPreservado} label="🧠 Cognitivo Não Preservado (reduz prioridade de Psicopedagogia)" />
            </div>
          </div>

          <Txt label="Profissional responsável pela triagem" value={profissional} onChange={setProfissional} />

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
            <Button onClick={() => setEtapa("perguntas")}>Ir para o questionário →</Button>
          </div>
        </div>
      )}

      {etapa === "perguntas" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {AREAS.map((area) => {
              const temResposta = PERGUNTAS.some((p, idx) => p.area === area && respostas[idx] > 0);
              return (
                <button key={area} type="button" onClick={() => setAreaAtiva(area)}
                  className={cn("px-3 py-1.5 rounded-full text-xs font-semibold border transition-all flex items-center gap-1.5",
                    areaAtiva === area ? "bg-primary text-primary-foreground border-primary shadow-md" : "bg-secondary text-muted-foreground border-border hover:border-primary/40")}>
                  <span>{AREA_ICONS[area] ?? "📋"}</span>
                  <span>{area}</span>
                  {temResposta && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />}
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl border border-border/60 overflow-hidden">
            <div className={cn("px-5 py-3 border-b border-border", CORES_AREA[areaAtiva] ?? "bg-secondary")}>
              <h3 className="font-bold text-lg">{areaAtiva}</h3>
              <p className="text-sm opacity-80">Área {areaIdx + 1} de {AREAS.length} — {perguntasDaArea.length} perguntas</p>
            </div>
            <div className="divide-y divide-border">
              {perguntasDaArea.map(({ pergunta, explicacao, idx }) => (
                <div key={idx} className="px-5 py-4">
                  <div className="flex flex-col md:flex-row md:items-start gap-3">
                    <div className="flex-1">
                      <p className="font-bold text-foreground text-sm">[{pergunta}]</p>
                      <p className="text-xs text-muted-foreground italic mt-0.5">({explicacao})</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {ESCALA.map((e) => (
                        <button key={e.valor} type="button" title={e.label}
                          onClick={() => { const n = [...respostas]; n[idx] = e.valor; setRespostas(n); }}
                          className={cn("w-11 h-11 rounded-xl text-sm font-bold border-2 transition-all",
                            respostas[idx] === e.valor ? escalaCls(e.valor) : "bg-secondary text-muted-foreground border-border hover:border-primary/50")}>
                          {e.valor}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 bg-muted/30 flex justify-between items-center border-t border-border">
              <Button variant="outline" size="sm" type="button" disabled={areaIdx === 0} onClick={() => setAreaAtiva(AREAS[Math.max(0, areaIdx - 1)])}>← Anterior</Button>
              <span className="text-sm text-muted-foreground">{areaIdx + 1} / {AREAS.length}</span>
              {areaIdx < AREAS.length - 1
                ? <Button size="sm" type="button" onClick={() => setAreaAtiva(AREAS[areaIdx + 1])}>Próxima →</Button>
                : <Button size="sm" type="button" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setEtapa("resultado")}>Ver Resultado ✓</Button>}
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 p-4">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Escala de Pontuação</p>
            <div className="flex flex-wrap gap-4">
              {ESCALA.map((e) => (
                <span key={e.valor} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className={cn("w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold", escalaCls(e.valor))}>{e.valor}</span>
                  {e.label.split("–")[1].trim()}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Cada área tem 10 itens (0 a 30 pontos): <strong>0 a 8</strong> baixa sinalização · <strong>9 a 17</strong> sinalização moderada · <strong>18 a 30</strong> alta sinalização (priorização na avaliação).
            </p>
          </div>
        </div>
      )}

      {etapa === "resultado" && (
        <div className="space-y-4">
          <TriagemMultiResultado triagem={preview} patient={patient} />
          {error && <p className="text-sm text-red-500 font-semibold">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2 no-print">
            <Button variant="ghost" onClick={onCancel} disabled={saving}><XIcon className="w-4 h-4 mr-1" />Cancelar</Button>
            <Button variant="outline" onClick={() => setEtapa("perguntas")} disabled={saving}>← Voltar ao questionário</Button>
            <Button variant="outline" onClick={() => window.print()} disabled={saving} className="gap-2"><Printer className="w-4 h-4" />Imprimir</Button>
            <Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : b ? "Atualizar Triagem" : "Salvar Triagem"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
