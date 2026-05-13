import { useCallback, useEffect, useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { Card, Button, Badge, MotionCard, Input, Label } from "@/components/ui-custom";
import { generatePatientPdf } from "@/hooks/use-pdf";
import { ArrowLeft, Download, UserMinus, AlertCircle, FileText, CalendarX, ClipboardCheck, ListPlus, CheckCircle2, Clock, Pencil, X as XIcon, ShieldOff, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn, getStatusColor, formatDate } from "@/lib/utils";
import {
  getPatient,
  getPatientPdf,
  getPatientAbsences,
  upsertPatient,
  deletePatient,
  addPatientToFila,
  listAppointments,
  updateAppointment,
  type Patient,
  type PatientPdfData,
  type PatientAbsencesInfo,
} from "@/lib/arco-rpc";

// Score interno permanece em 0-360 (8 áreas × 0-45), mas exibimos em escala /150
// para padronizar com o restante do sistema. _calc_priority no banco continua
// operando no domínio 360, então as faixas de cor (25/50/75%) não mudam.
// Bônus de vulnerabilidade somam direto no score exibido (apenas desempate):
//   +1 Escola Pública, +1 Trabalho na Roça/Informal. Máximo possível = 152.
// Social NAO muda a cor da classificacao (regra: cor = clinica pura).
const SCORE_MAX_RAW = 360;
const SCORE_MAX_DISPLAY = 150;
const VULN_BONUS_EP = 1;
const VULN_BONUS_TNR = 1;
const toScoreDisplayBase = (raw: number | null | undefined): number =>
  Math.round(((raw ?? 0) / SCORE_MAX_RAW) * SCORE_MAX_DISPLAY);
const vulnBonus = (ep: boolean | null | undefined, tnr: boolean | null | undefined): number =>
  (ep ? VULN_BONUS_EP : 0) + (tnr ? VULN_BONUS_TNR : 0);
const toScoreDisplay = (
  raw: number | null | undefined,
  ep: boolean | null | undefined = false,
  tnr: boolean | null | undefined = false,
): number => toScoreDisplayBase(raw) + vulnBonus(ep, tnr);

// Cor da classificacao depende SO da demanda clinica (triagem_score 0-360).
// Pesos sociais sao apenas desempate na fila (NAO mudam a cor).
function calcPriority(score: number, _escolaPublica: boolean, _trabalhoNaRoca: boolean, _semTerapia: boolean = false): "elevado" | "moderado" | "leve" | "baixo" {
  const levels: Array<"elevado" | "moderado" | "leve" | "baixo"> = ["baixo", "leve", "moderado", "elevado"];
  const baseIdx = score >= 270 ? 3 : score >= 180 ? 2 : score >= 90 ? 1 : 0;
  return levels[baseIdx];
}

const PRIORITY_STYLE: Record<string, string> = {
  maxima: "badge-neon-pink",
  elevado: "badge-neon-red",
  moderado: "badge-neon-orange",
  leve: "badge-neon-blue",
  baixo: "badge-neon-green",
};
const PRIORITY_LABEL: Record<string, string> = {
  maxima: "🔴 MÁXIMA – Prioridade Social/Idade",
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

  // Equipe de Atendimento
  type TeamMember = { professionalId: number; professionalName: string; specialty: string; status: "Ativo" | "Alta" };
  const [team, setTeam] = useState<TeamMember[]>([]);

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

  // Edição de dados pessoais
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDob, setEditDob] = useState("");
  const [editCpf, setEditCpf] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editGuardianName, setEditGuardianName] = useState("");
  const [editGuardianPhone, setEditGuardianPhone] = useState("");
  const [editDiagnosis, setEditDiagnosis] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Afastamento
  const [afastOpen, setAfastOpen] = useState(false);
  const [afastInicio, setAfastInicio] = useState("");
  const [afastFim, setAfastFim] = useState("");
  const [afastMotivo, setAfastMotivo] = useState("");
  const [afastSaving, setAfastSaving] = useState(false);

  const openAfastModal = () => {
    setAfastInicio("");
    setAfastFim("");
    setAfastMotivo("");
    setAfastOpen(true);
  };

  const saveAfastamento = async () => {
    if (!patient || !afastInicio || !afastFim) return;
    if (afastFim < afastInicio) {
      toast({ title: "Data inv\u00e1lida", description: "A data fim deve ser posterior \u00e0 data in\u00edcio.", variant: "destructive" });
      return;
    }
    setAfastSaving(true);
    try {
      const apts = await listAppointments({
        patientId: patientId,
        dateFrom: afastInicio,
        dateTo: afastFim,
      });
      const toJustify = apts.filter(a =>
        a.status !== "falta_justificada" &&
        a.status !== "alta" &&
        a.status !== "desmarcado" &&
        a.status !== "cancelado"
      );
      let count = 0;
      for (const a of toJustify) {
        try {
          await updateAppointment(a.id, { status: "falta_justificada" });
          count++;
        } catch { /* best-effort */ }
      }
      // Registra no prontu\u00e1rio
      try {
        const existing = await getPatient(patientId);
        const prevNotes = existing?.notes ? `${existing.notes}\n` : "";
        const motivoTxt = afastMotivo.trim() ? ` \u2014 ${afastMotivo.trim()}` : "";
        await upsertPatient(patientId, {
          notes: `${prevNotes}[AFASTAMENTO ${afastInicio} a ${afastFim}]${motivoTxt}`,
        });
      } catch { /* best-effort */ }
      setAfastOpen(false);
      toast({ title: "Afastamento registrado!", description: `${count} agendamento(s) marcado(s) como Falta Justificada no per\u00edodo.` });
      await load();
    } catch (err: any) {
      toast({ title: "Erro", description: err?.message || "Falha ao registrar afastamento.", variant: "destructive" });
    } finally {
      setAfastSaving(false);
    }
  };

  const openEditModal = () => {
    if (!patient) return;
    setEditName(patient.name || "");
    setEditDob(patient.dateOfBirth || "");
    setEditCpf(patient.cpf || "");
    setEditPhone(patient.phone || "");
    setEditEmail(patient.email || "");
    setEditGuardianName(patient.guardianName || "");
    setEditGuardianPhone(patient.guardianPhone || "");
    setEditDiagnosis(patient.diagnosis || "");
    setEditNotes(patient.notes || "");
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!patient || !editName.trim()) return;
    setSavingEdit(true);
    try {
      const updated = await upsertPatient(patientId, {
        name: editName.trim(),
        dateOfBirth: editDob || null,
        cpf: editCpf || null,
        phone: editPhone || null,
        email: editEmail || null,
        guardianName: editGuardianName || null,
        guardianPhone: editGuardianPhone || null,
        diagnosis: editDiagnosis || null,
        notes: editNotes || null,
      });
      setPatient(updated);
      setEditOpen(false);
      toast({ title: "Dados atualizados!", description: "As informações do paciente foram salvas com sucesso." });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err?.message || "Falha inesperada.", variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  };

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [p, pdf, abs, allApts] = await Promise.all([
        getPatient(patientId),
        getPatientPdf(patientId).catch(() => null),
        getPatientAbsences(patientId).catch(() => null),
        listAppointments({ patientId }).catch(() => [] as any[]),
      ]);
      setPatient(p);
      setPdfData(pdf);
      setAbsenceInfo(abs);
      // Derive team from appointments
      const profMap = new Map<number, { name: string; hasActive: boolean }>();
      for (const apt of allApts) {
        const entry = profMap.get(apt.professionalId) || { name: apt.professionalName, hasActive: false };
        if (["agendado", "atendimento", "presente"].includes(apt.status) && apt.date >= today) {
          entry.hasActive = true;
        }
        entry.name = apt.professionalName;
        profMap.set(apt.professionalId, entry);
      }
      // Get specialties from professionals list
      const { listProfessionals } = await import("@/lib/arco-rpc");
      const profs = await listProfessionals().catch(() => []);
      const profSpecMap = new Map(profs.map((pr: any) => [pr.id, pr.specialty || "—"]));
      const teamArr: TeamMember[] = Array.from(profMap.entries()).map(([id, info]) => ({
        professionalId: id,
        professionalName: info.name,
        specialty: (profSpecMap.get(id) as string) || "—",
        status: info.hasActive ? "Ativo" : "Alta",
      }));
      teamArr.sort((a, b) => (a.status === "Ativo" ? 0 : 1) - (b.status === "Ativo" ? 0 : 1) || a.specialty.localeCompare(b.specialty));
      setTeam(teamArr);
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
    if (scores.some(s => s < 0 || s > 45)) {
      toast({ title: "Score inválido", description: "Cada área deve ter um valor entre 0 e 45.", variant: "destructive" });
      return;
    }
    const total = scores.reduce((a, b) => a + b, 0);
    if (!patient) return;
    setSavingTriagem(true);
    try {
      const updated = await upsertPatient(patientId, {
        name: patient.name,
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
      toast({ title: "Triagem registrada!", description: `Score total: ${toScoreDisplay(total, escolaPublica, trabalhoNaRoca)}/${SCORE_MAX_DISPLAY} (bônus vuln.: +${vulnBonus(escolaPublica, trabalhoNaRoca)}). Paciente apto para a fila.` });
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
          <Button variant="outline" onClick={openEditModal} className="gap-2">
            <Pencil className="w-4 h-4" /> Editar Dados
          </Button>
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
          {emAtendimento && (
            <Button variant="outline" onClick={openAfastModal} className="gap-2 border-amber-400/50 text-amber-500 hover:bg-amber-500/10">
              <ShieldOff className="w-4 h-4" /> Registrar Afastamento
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

            {/* Equipe de Atendimento */}
            {team.length > 0 && (
              <div className="mt-10">
                <h2 className="text-xl font-bold font-display mb-6 border-b border-border pb-4 flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" /> Equipe de Atendimento
                </h2>
                <div className="space-y-2">
                  {team.map(m => (
                    <div key={m.professionalId} className={cn("flex items-center justify-between p-3 rounded-xl border transition-colors", m.status === "Ativo" ? "border-emerald-400/40 bg-emerald-50/5" : "border-border/50 bg-secondary/20 opacity-70")}>
                      <div className="flex items-center gap-3">
                        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold", m.status === "Ativo" ? "bg-emerald-100 text-emerald-700" : "bg-secondary text-muted-foreground")}>
                          {m.specialty.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-foreground">{m.professionalName}</p>
                          <p className="text-xs text-muted-foreground">{m.specialty}</p>
                        </div>
                      </div>
                      <Badge className={m.status === "Ativo" ? "bg-emerald-100 text-emerald-700 border-emerald-300" : "bg-secondary text-muted-foreground border-border"}>
                        {m.status === "Ativo" ? "Ativo" : "Alta"}
                      </Badge>
                    </div>
                  ))}
                </div>
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
                      <p className="text-lg font-bold text-foreground">{area.val ?? "—"}<span className="text-xs text-muted-foreground">/45</span></p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="p-3 bg-primary/10 rounded-xl border border-primary/20">
                    <p className="text-muted-foreground font-semibold mb-1">Score Total</p>
                    <p className="text-2xl font-bold text-primary">{toScoreDisplay(p.triagemScore, ep, tnr)}<span className="text-sm text-muted-foreground font-normal">/{SCORE_MAX_DISPLAY}</span></p>
                    <p className="text-xs text-muted-foreground mt-0.5">{Math.round(((p.triagemScore ?? 0) / SCORE_MAX_RAW) * 100)}% do máximo{vulnBonus(ep, tnr) > 0 ? ` · +${vulnBonus(ep, tnr)} vuln.` : ""}</p>
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
                Registre a triagem com as notas por área (0–45 cada) para liberar o botão <strong>"Adicionar à Fila"</strong>.
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
            <p className="text-sm text-muted-foreground mb-5">Preencha a nota de cada área (0–45). O score total é exibido em escala padronizada (máx. {SCORE_MAX_DISPLAY}).</p>
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
                      <Label className="text-sm">{area.label} <span className="text-muted-foreground font-normal">(0–45)</span></Label>
                      <Input
                        type="number" min={0} max={45}
                        value={area.val}
                        onChange={e => area.set(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  ))}
                  <div className="p-3 bg-primary/10 rounded-xl border border-primary/20 flex flex-col justify-center">
                    <p className="text-xs text-muted-foreground font-semibold mb-0.5">Score Total</p>
                    <p className="text-2xl font-bold text-primary">{toScoreDisplay(totalScore, escolaPublica, trabalhoNaRoca)}<span className="text-sm text-muted-foreground font-normal">/{SCORE_MAX_DISPLAY}</span></p>
                    <p className="text-xs text-muted-foreground">{Math.round((totalScore / SCORE_MAX_RAW) * 100)}% do máximo{vulnBonus(escolaPublica, trabalhoNaRoca) > 0 ? ` · +${vulnBonus(escolaPublica, trabalhoNaRoca)} vuln.` : ""}</p>
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
                    Verde 0–37 · Azul 38–75 · Laranja 76–112 · Vermelho 113–150 (Vulnerabilidade sobe um nível)
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

      {/* ── Modal Afastamento ── */}
      {afastOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setAfastOpen(false)}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl bg-card border border-border" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-100 text-amber-600">
                    <ShieldOff className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Registrar Afastamento</h3>
                    <p className="text-xs text-muted-foreground">{patient?.name}</p>
                  </div>
                </div>
                <button onClick={() => setAfastOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <XIcon className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-muted-foreground mb-4">
                Todos os agendamentos deste paciente no período serão marcados automaticamente como <strong className="text-amber-500">Falta Justificada</strong>.
              </p>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-semibold">Data Início *</Label>
                    <Input type="date" value={afastInicio} onChange={e => setAfastInicio(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Data Fim *</Label>
                    <Input type="date" value={afastFim} onChange={e => setAfastFim(e.target.value)} className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-semibold">Motivo do Afastamento</Label>
                  <textarea
                    value={afastMotivo}
                    onChange={e => setAfastMotivo(e.target.value)}
                    placeholder="Ex: Quebrou o pé, ficará 90 dias afastado..."
                    rows={3}
                    className="w-full rounded-xl text-sm p-3 resize-none mt-1 bg-secondary/30 border border-border text-foreground"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <Button variant="ghost" className="flex-1" onClick={() => setAfastOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={saveAfastamento}
                  disabled={!afastInicio || !afastFim || afastSaving}
                  className="flex-1 gap-2 bg-amber-600 hover:bg-amber-700 text-white"
                >
                  <ShieldOff className="w-4 h-4" /> {afastSaving ? "Processando..." : "Confirmar Afastamento"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Editar Dados ── */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setEditOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl bg-card border border-border max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-cyan-100 text-cyan-600">
                    <Pencil className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Editar Dados do Paciente</h3>
                    <p className="text-xs text-muted-foreground">Altere os campos e clique em Salvar</p>
                  </div>
                </div>
                <button onClick={() => setEditOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <XIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-semibold">Nome *</Label>
                  <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Nome completo" className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-semibold">Data de Nascimento</Label>
                    <Input value={editDob} onChange={e => setEditDob(e.target.value)} placeholder="DD/MM/AAAA" className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">CPF</Label>
                    <Input value={editCpf} onChange={e => setEditCpf(e.target.value)} placeholder="000.000.000-00" className="mt-1" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-semibold">Telefone</Label>
                    <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="(00) 0 0000-0000" className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Email</Label>
                    <Input value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="email@exemplo.com" className="mt-1" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-semibold">Responsável</Label>
                    <Input value={editGuardianName} onChange={e => setEditGuardianName(e.target.value)} placeholder="Nome do responsável" className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Tel. Responsável</Label>
                    <Input value={editGuardianPhone} onChange={e => setEditGuardianPhone(e.target.value)} placeholder="(00) 0 0000-0000" className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-semibold">Diagnóstico / Motivo</Label>
                  <Input value={editDiagnosis} onChange={e => setEditDiagnosis(e.target.value)} placeholder="Diagnóstico ou motivo do encaminhamento" className="mt-1" />
                </div>
                <div>
                  <Label className="text-sm font-semibold">Observações</Label>
                  <textarea
                    value={editNotes}
                    onChange={e => setEditNotes(e.target.value)}
                    placeholder="Observações adicionais..."
                    rows={3}
                    className="w-full rounded-xl text-sm p-3 resize-none mt-1 bg-secondary/30 border border-border text-foreground"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <Button variant="ghost" className="flex-1" onClick={() => setEditOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={saveEdit}
                  disabled={!editName.trim() || savingEdit}
                  className="flex-1 gap-2 bg-cyan-600 hover:bg-cyan-700 text-white"
                >
                  <Pencil className="w-4 h-4" /> {savingEdit ? "Salvando..." : "Salvar Alterações"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
