import { useCallback, useEffect, useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { Card, Button, Badge, MotionCard, Input, Label } from "@/components/ui-custom";
import { generatePatientPdf } from "@/hooks/use-pdf";
import { ArrowLeft, Download, UserMinus, AlertCircle, FileText, CalendarX, ClipboardCheck, ListPlus, CheckCircle2, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn, getStatusColor, formatDate } from "@/lib/utils";
import {
  getPatient,
  getPatientPdf,
  getPatientAbsences,
  upsertPatient,
  deletePatient,
  addPatientToFila,
  type Patient,
  type PatientPdfData,
  type PatientAbsencesInfo,
} from "@/lib/arco-rpc";

function calcPriority(score: number, escolaPublica: boolean, trabalhoNaRoca: boolean, semTerapia: boolean = false): "elevado" | "moderado" | "leve" | "baixo" {
  const levels: Array<"elevado" | "moderado" | "leve" | "baixo"> = ["baixo", "leve", "moderado", "elevado"];
  const baseIdx = score >= 270 ? 3 : score >= 180 ? 2 : score >= 90 ? 1 : 0;
  const vuln = (escolaPublica ? 1 : 0) + (trabalhoNaRoca ? 1 : 0) + (semTerapia ? 1 : 0);
  return levels[Math.min(3, baseIdx + vuln)];
}

const PRIORITY_STYLE: Record<string, string> = {
  elevado: "badge-neon-red",
  moderado: "badge-neon-orange",
  leve: "badge-neon-blue",
  baixo: "badge-neon-green",
};
const PRIORITY_LABEL: Record<string, string> = {
  elevado: "VERMELHO – Elevado",
  moderado: "LARANJA – Moderado",
  leve: "AZUL – Leve",
  baixo: "VERDE – Baixo",
};

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>();
  const patientId = parseInt(id || "0");
  const { toast } = useToast();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [pdfData, setPdfData] = useState<PatientPdfData | null>(null);
  const [absenceInfo, setAbsenceInfo] = useState<PatientAbsencesInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const [triagemEdit, setTriagemEdit] = useState(false);
  const [sPsicologia, setSPsicologia] = useState("");
  const [sPsicomotricidade, setSPsicomotricidade] = useState("");
  const [sFisioterapia, setSFisioterapia] = useState("");
  const [sPsicopedagogia, setSPsicopedagogia] = useState("");
  const [sEdFisica, setSEdFisica] = useState("");
  const [sFono, setSFono] = useState("");
  const [sTO, setSTO] = useState("");
  const [sNutri, setSNutri] = useState("");
  const [escolaPublica, setEscolaPublica] = useState<boolean | null>(null);
  const [trabalhoNaRoca, setTrabalhoNaRoca] = useState<boolean | null>(null);
  const [savingTriagem, setSavingTriagem] = useState(false);

  const [addingToFila, setAddingToFila] = useState(false);
  const [, navigate] = useLocation();

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [p, pdf, abs] = await Promise.all([
        getPatient(patientId),
        getPatientPdf(patientId).catch(() => null),
        getPatientAbsences(patientId).catch(() => null),
      ]);
      setPatient(p);
      setPdfData(pdf);
      setAbsenceInfo(abs);
    } catch (err: any) {
      toast({
        title: "Erro ao carregar paciente",
        description: err?.message || "Falha inesperada.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [patientId, toast]);

  useEffect(() => { void load(); }, [load]);

  const handleDownloadPdf = () => {
    if (pdfData) {
      generatePatientPdf(pdfData as any);
      toast({ title: "PDF Gerado", description: "O download iniciará em instantes." });
    }
  };

  const handleDischarge = async () => {
    if (!confirm("Tem certeza que deseja dar alta para este paciente? O status mudará e a vaga será liberada.")) return;
    setDeleting(true);
    try {
      await deletePatient(patientId);
      toast({ title: "Alta Realizada", description: "Paciente liberado com sucesso." });
      navigate("/patients");
    } catch (err: any) {
      toast({
        title: "Erro",
        description: err?.message || "Não foi possível dar alta.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const p = patient;
  const totalScore = [sPsicologia, sPsicomotricidade, sFisioterapia, sPsicopedagogia, sEdFisica, sFono, sTO, sNutri]
    .reduce((acc, v) => acc + (parseInt(v) || 0), 0);

  const openTriagemEdit = () => {
    setSPsicologia(p?.scorePsicologia != null ? String(p.scorePsicologia) : "");
    setSPsicomotricidade(p?.scorePsicomotricidade != null ? String(p.scorePsicomotricidade) : "");
    setSFisioterapia(p?.scoreFisioterapia != null ? String(p.scoreFisioterapia) : "");
    setSPsicopedagogia(p?.scorePsicopedagogia != null ? String(p.scorePsicopedagogia) : "");
    setSEdFisica(p?.scoreEdFisica != null ? String(p.scoreEdFisica) : "");
    setSFono(p?.scoreFonoaudiologia != null ? String(p.scoreFonoaudiologia) : "");
    setSTO(p?.scoreTO != null ? String(p.scoreTO) : "");
    setSNutri(p?.scoreNutricionista != null ? String(p.scoreNutricionista) : "");
    setEscolaPublica(p?.escolaPublica ?? null);
    setTrabalhoNaRoca(p?.trabalhoNaRoca ?? null);
    setTriagemEdit(true);
  };

  const saveTriagem = async () => {
    const scores = [sPsicologia, sPsicomotricidade, sFisioterapia, sPsicopedagogia, sEdFisica, sFono, sTO, sNutri].map(v => parseInt(v) || 0);
    if (scores.some(s => s < 0 || s > 72)) {
      toast({ title: "Score inválido", description: "Cada área deve ter um valor entre 0 e 72.", variant: "destructive" });
      return;
    }
    const total = scores.reduce((a, b) => a + b, 0);
    setSavingTriagem(true);
    try {
      const updated = await upsertPatient(patientId, {
        triagemScore: total,
        scorePsicologia: scores[0],
        scorePsicomotricidade: scores[1],
        scoreFisioterapia: scores[2],
        scorePsicopedagogia: scores[3],
        scoreEdFisica: scores[4],
        scoreFonoaudiologia: scores[5],
        scoreTO: scores[6],
        scoreNutricionista: scores[7],
        escolaPublica: escolaPublica ?? false,
        trabalhoNaRoca: trabalhoNaRoca ?? false,
      });
      setPatient(updated);
      setTriagemEdit(false);
      toast({ title: "Triagem registrada!", description: `Score total: ${total}/360. Paciente apto para a fila.` });
    } catch (err: any) {
      toast({
        title: "Erro",
        description: err?.message || "Falha ao salvar triagem.",
        variant: "destructive",
      });
    } finally {
      setSavingTriagem(false);
    }
  };

  const SCORE_SPECIALTY_MAP: Array<{ field: keyof Patient; specialty: string }> = [
    { field: "scorePsicologia",       specialty: "Psicologia"         },
    { field: "scorePsicomotricidade", specialty: "Psicomotricidade"   },
    { field: "scoreFisioterapia",     specialty: "Fisioterapia"       },
    { field: "scoreTO",               specialty: "Terapia Ocupacional"},
    { field: "scoreFonoaudiologia",   specialty: "Fonoaudiologia"     },
    { field: "scoreNutricionista",    specialty: "Nutrição"           },
    { field: "scorePsicopedagogia",   specialty: "Psicopedagogia"     },
    { field: "scoreEdFisica",         specialty: "Educação Física"    },
  ];

  const handleAddToFila = async () => {
    if (!patient) return;
    setAddingToFila(true);

    const scoredSpecialties = SCORE_SPECIALTY_MAP
      .filter(({ field }) => ((patient[field] as number | null) ?? 0) > 0)
      .map(({ specialty }) => specialty);

    const targets: (string | null)[] = scoredSpecialties.length > 0 ? scoredSpecialties : [null];

    const added: string[] = [];
    const skipped: string[] = [];
    try {
      for (const sp of targets) {
        try {
          await addPatientToFila(patientId, sp);
          added.push(sp ?? "Geral");
        } catch (err: any) {
          if (err.message?.toLowerCase().includes("fila")) skipped.push(sp ?? "Geral");
          else throw err;
        }
      }
      if (added.length > 0) {
        toast({
          title: added.length === 1 ? "✅ Adicionado à fila!" : `✅ ${added.length} filas adicionadas!`,
          description: added.join(", ") + (skipped.length > 0 ? ` · Já na fila: ${skipped.join(", ")}` : ""),
        });
        navigate("/waiting-list");
      } else {
        toast({ title: "Aviso", description: "Paciente já está em todas as filas correspondentes.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setAddingToFila(false);
    }
  };

  if (isLoading || !patient || !p) return <div className="p-8 text-center animate-pulse">Carregando prontuário...</div>;

  const hasWarning = patient.absenceCount >= 3;
  const triagemFeita = patient.triagemScore != null;
  const ep = patient.escolaPublica ?? false;
  const tnr = patient.trabalhoNaRoca ?? false;
  const semTerapia = patient.localAtendimento === "Sem Atendimento" || patient.localAtendimento === "Nenhum";
  const previewPriority = triagemFeita
    ? calcPriority(patient.triagemScore!, ep, tnr, semTerapia)
    : null;

  const isCensoMunicipal = patient.tipoRegistro === "Registro Censo Municipal";
  const naFila = patient.status === "Fila de Espera";
  const emAtendimento = patient.status === "Atendimento";
  const podeAdicionarFila = triagemFeita && !naFila && !emAtendimento && patient.status !== "Alta" && !isCensoMunicipal;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <Link href="/patients" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Link>
          <div className="flex items-center gap-4 flex-wrap">
            <h1 className="text-3xl font-display font-bold text-foreground">{patient.name}</h1>
            <Badge className={getStatusColor(patient.status)}>{patient.status}</Badge>
            {isCensoMunicipal && (
              <Badge className="bg-violet-100 text-violet-800 border-violet-300">🏛️ Censo Municipal PCD</Badge>
            )}
            {triagemFeita && previewPriority && !isCensoMunicipal && (
              <Badge className={PRIORITY_STYLE[previewPriority]}>
                Prioridade {PRIORITY_LABEL[previewPriority]}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Button variant="outline" onClick={handleDownloadPdf} disabled={!pdfData} className="gap-2">
            <Download className="w-4 h-4" /> Gerar PDF
          </Button>
          {podeAdicionarFila && (
            <Button onClick={handleAddToFila} disabled={addingToFila} className="gap-2 bg-orange-500 hover:bg-orange-600 text-white">
              <ListPlus className="w-4 h-4" /> {addingToFila ? "Adicionando..." : "Confirmar e Adicionar na Fila"}
            </Button>
          )}
          {naFila && (
            <Button variant="outline" disabled className="gap-2 text-orange-600 border-orange-300 cursor-default">
              <Clock className="w-4 h-4" /> Na Fila de Espera
            </Button>
          )}
          <Button variant="destructive" onClick={handleDischarge} disabled={deleting || patient.status === "Alta"} className="gap-2">
            <UserMinus className="w-4 h-4" /> Dar Alta
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <FileText className="w-32 h-32" />
            </div>
            <h2 className="text-xl font-bold font-display mb-6 border-b border-border pb-4">Dados Pessoais</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-12">
              <div>
                <p className="text-sm font-semibold text-muted-foreground">Nascimento</p>
                <p className="text-lg">{formatDate(patient.dateOfBirth)}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground">CPF</p>
                <p className="text-lg">{patient.cpf || "-"}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground">Telefone</p>
                <p className="text-lg">{patient.phone || "-"}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground">Email</p>
                <p className="text-lg">{patient.email || "-"}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-sm font-semibold text-muted-foreground">Responsável</p>
                <p className="text-lg">{patient.guardianName || "-"} <span className="text-muted-foreground text-sm ml-2">{patient.guardianPhone}</span></p>
              </div>
            </div>

            {(patient.tipoRegistro || patient.localAtendimento) && (
              <div className="mt-6 pt-4 border-t border-border grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-12">
                {patient.tipoRegistro && (
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground">Tipo de Registro</p>
                    <p className="text-base font-semibold mt-1">{patient.tipoRegistro === "Registro Censo Municipal" ? "🏛️ Censo Municipal PCD" : "🏥 Paciente da Unidade"}</p>
                  </div>
                )}
                {patient.localAtendimento && (
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground">Atendimento Atual</p>
                    <p className="text-base font-semibold mt-1">{patient.localAtendimento}</p>
                  </div>
                )}
              </div>
            )}

            <h2 className="text-xl font-bold font-display mt-10 mb-6 border-b border-border pb-4">Quadro Clínico</h2>
            <div>
              <p className="text-sm font-semibold text-muted-foreground">Diagnóstico / Motivo</p>
              <p className="text-lg mt-1">{patient.diagnosis || "Não informado"}</p>
            </div>
            <div className="mt-6">
              <p className="text-sm font-semibold text-muted-foreground">Observações</p>
              <div className="p-4 bg-secondary/30 rounded-xl mt-2 min-h-24">
                {patient.notes || "Sem observações adicionais."}
              </div>
            </div>
          </Card>

          <Card className={cn("p-6 border-2 transition-colors", triagemFeita ? "border-emerald-400/40" : "border-amber-400/40 bg-amber-50/5")}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center", triagemFeita ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600")}>
                  {triagemFeita ? <CheckCircle2 className="w-5 h-5" /> : <ClipboardCheck className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-bold font-display text-lg">Triagem Clínica</h3>
                  <p className={cn("text-sm font-semibold", triagemFeita ? "text-emerald-600" : "text-amber-600")}>
                    {triagemFeita ? "Triagem realizada — paciente apto para a fila" : "Aguardando triagem para entrar na fila"}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={openTriagemEdit} className="gap-2">
                <ClipboardCheck className="w-4 h-4" />
                {triagemFeita ? "Editar Triagem" : "Registrar Triagem"}
              </Button>
            </div>

            {triagemFeita ? (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                  {[
                    { label: "Psicologia", val: p.scorePsicologia },
                    { label: "Psicomotr.", val: p.scorePsicomotricidade },
                    { label: "Fisioterapia", val: p.scoreFisioterapia },
                    { label: "Psicoped.", val: p.scorePsicopedagogia },
                    { label: "Ed. Física", val: p.scoreEdFisica },
                    { label: "Fonoaud.", val: p.scoreFonoaudiologia },
                    { label: "T.O.", val: p.scoreTO },
                    { label: "Nutrição", val: p.scoreNutricionista },
                  ].map(area => (
                    <div key={area.label} className="p-2 bg-secondary/30 rounded-xl text-center">
                      <p className="text-muted-foreground font-semibold text-xs mb-1">{area.label}</p>
                      <p className="text-lg font-bold text-foreground">{area.val ?? "—"}<span className="text-xs text-muted-foreground">/72</span></p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="p-3 bg-primary/10 rounded-xl border border-primary/20">
                    <p className="text-muted-foreground font-semibold mb-1">Score Total</p>
                    <p className="text-2xl font-bold text-primary">{p.triagemScore}<span className="text-sm text-muted-foreground font-normal">/360</span></p>
                    <p className="text-xs text-muted-foreground mt-0.5">{Math.round(((p.triagemScore ?? 0) / 360) * 100)}% do máximo</p>
                  </div>
                  <div className="p-3 bg-secondary/30 rounded-xl">
                    <p className="text-muted-foreground font-semibold mb-1">Escola Pública</p>
                    <p className="font-bold">{ep ? "✅ Sim" : "❌ Não"}</p>
                  </div>
                  <div className="p-3 bg-secondary/30 rounded-xl">
                    <p className="text-muted-foreground font-semibold mb-1">Trabalho na Roça</p>
                    <p className="font-bold">{tnr ? "✅ Sim" : "❌ Não"}</p>
                  </div>
                </div>
                {previewPriority && (
                  <div className="p-3 rounded-xl border" style={{ background: "transparent" }}>
                    <p className="text-muted-foreground font-semibold text-xs uppercase tracking-wider mb-1">Prioridade para a fila</p>
                    <span className={cn("text-sm font-bold px-3 py-1 rounded-full border", PRIORITY_STYLE[previewPriority])}>
                      {PRIORITY_LABEL[previewPriority]}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Registre a triagem com as notas por área (0–72 cada) para liberar o botão <strong>"Adicionar à Fila"</strong>.
              </p>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className={cn("p-6 border-2 transition-colors", hasWarning ? "border-rose-400 bg-rose-50/10" : "border-transparent")}>
            <div className="flex items-center gap-3 mb-6">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", hasWarning ? "bg-rose-200 text-rose-600" : "bg-secondary text-foreground")}>
                {hasWarning ? <AlertCircle className="w-6 h-6" /> : <CalendarX className="w-6 h-6" />}
              </div>
              <div>
                <h3 className={cn("font-bold font-display text-lg", hasWarning && "text-rose-900 dark:text-rose-400")}>Faltas</h3>
                <p className={cn("text-sm", hasWarning ? "text-rose-700 font-semibold" : "text-muted-foreground")}>
                  {patient.absenceCount} registradas
                </p>
              </div>
            </div>
            {hasWarning && (
              <div className="p-3 bg-rose-100 text-rose-800 rounded-lg text-sm font-medium mb-4">
                ⚠️ Alerta: Limite de faltas excedido. Considere repassar as regras da clínica.
              </div>
            )}
            <div className="space-y-3">
              {absenceInfo?.absences?.length ? (
                absenceInfo.absences.map((abs: any, i: number) => (
                  <div key={i} className="flex justify-between text-sm p-2 border-b border-border/50 last:border-0">
                    <span className="font-medium text-foreground">{formatDate(abs.date)}</span>
                    <span className="text-muted-foreground">{abs.time}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-center text-muted-foreground italic">Nenhum histórico de falta.</p>
              )}
            </div>
          </Card>
        </div>
      </div>

      {triagemEdit && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <MotionCard className="w-full max-w-lg p-6 my-4" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <h2 className="text-2xl font-bold font-display mb-1">{triagemFeita ? "Editar Triagem" : "Registrar Triagem"}</h2>
            <p className="text-sm text-muted-foreground mb-5">Preencha a nota de cada área (0–72). O score total é a soma (máx. 360).</p>
            <div className="space-y-5">
              <div>
                <Label className="text-base font-bold mb-3 block">Perfil Multidisciplinar</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {([
                    { label: "Psicologia", val: sPsicologia, set: setSPsicologia },
                    { label: "Psicomotricidade", val: sPsicomotricidade, set: setSPsicomotricidade },
                    { label: "Fisioterapia", val: sFisioterapia, set: setSFisioterapia },
                    { label: "Psicopedagogia", val: sPsicopedagogia, set: setSPsicopedagogia },
                    { label: "Ed. Física", val: sEdFisica, set: setSEdFisica },
                    { label: "Fonoaudiologia", val: sFono, set: setSFono },
                    { label: "T.O. (Ter. Ocupacional)", val: sTO, set: setSTO },
                    { label: "Nutricionista", val: sNutri, set: setSNutri },
                  ] as const).map(area => (
                    <div key={area.label} className="space-y-1">
                      <Label className="text-sm">{area.label} <span className="text-muted-foreground font-normal">(0–72)</span></Label>
                      <Input
                        type="number" min={0} max={72}
                        value={area.val}
                        onChange={e => area.set(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  ))}
                  <div className="p-3 bg-primary/10 rounded-xl border border-primary/20 flex flex-col justify-center">
                    <p className="text-xs text-muted-foreground font-semibold mb-0.5">Score Total</p>
                    <p className="text-2xl font-bold text-primary">{totalScore}<span className="text-sm text-muted-foreground font-normal">/360</span></p>
                    <p className="text-xs text-muted-foreground">{Math.round((totalScore / 360) * 100)}% do máximo</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-base font-bold">Critérios de Vulnerabilidade</Label>
                <label className="flex items-center gap-3 p-3 rounded-xl border border-border cursor-pointer hover:bg-secondary/30 transition-colors">
                  <input type="checkbox" checked={escolaPublica ?? false} onChange={e => setEscolaPublica(e.target.checked)} className="w-5 h-5 rounded" />
                  <div>
                    <p className="font-semibold text-sm">Escola Pública</p>
                    <p className="text-xs text-muted-foreground">Aluno de escola da rede pública</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-3 rounded-xl border border-border cursor-pointer hover:bg-secondary/30 transition-colors">
                  <input type="checkbox" checked={trabalhoNaRoca ?? false} onChange={e => setTrabalhoNaRoca(e.target.checked)} className="w-5 h-5 rounded" />
                  <div>
                    <p className="font-semibold text-sm">Trabalho na Roça / Informal</p>
                    <p className="text-xs text-muted-foreground">Responsável com trabalho rural ou informal</p>
                  </div>
                </label>
              </div>

              {totalScore > 0 && (
                <div className="p-3 bg-secondary/30 rounded-xl text-sm">
                  <p className="text-muted-foreground font-semibold mb-2">Classificação que será atribuída:</p>
                  <div className="flex flex-wrap gap-2">
                    {(["baixo", "leve", "moderado", "elevado"] as const).map(lvl => {
                      const active = calcPriority(totalScore, escolaPublica ?? false, trabalhoNaRoca ?? false, semTerapia) === lvl;
                      return (
                        <span key={lvl} className={cn("px-3 py-1 rounded-full border text-xs font-bold transition-all", active ? PRIORITY_STYLE[lvl] + " ring-2 ring-offset-1 ring-current" : "bg-secondary text-muted-foreground border-border opacity-50")}>
                          {PRIORITY_LABEL[lvl]}
                        </span>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Verde 0–90 · Azul 91–180 · Laranja 181–270 · Vermelho 271–360 (Vulnerabilidade sobe um nível)
                  </p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button type="button" variant="ghost" onClick={() => setTriagemEdit(false)}>Cancelar</Button>
              <Button onClick={saveTriagem} disabled={savingTriagem}>{savingTriagem ? "Salvando..." : "Salvar Triagem"}</Button>
            </div>
          </MotionCard>
        </div>
      )}

    </div>
  );
}
