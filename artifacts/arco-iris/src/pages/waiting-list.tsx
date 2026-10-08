import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Card, MotionCard, Button, Badge, Label, Select, Input } from "@/components/ui-custom";
import { Trash2, ListTodo, ListPlus, Snowflake, Undo2, Search, LogOut, History, Clock, X } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { getPriorityColor, formatDate, calcIdade } from "@/lib/utils";
import { specialtyTone, specialtyShortLabel, SPECIALTIES, isCaregiverSpecialty } from "@/lib/specialty-colors";
import { PatientAvatar } from "@/components/PatientAvatar";
import { supabase } from "@/lib/supabase";
import { AREA_MAX_UI, areaToUi } from "@/lib/score-scale";
import { AbcNivelBadge } from "@/components/AbcChecklistForm";
import {
  listWaitingList,
  deleteWaitingListEntry,
  setWaitingListPaused,
  listWaitingListHistory,
  type WaitingListHistoryEntry,
  addPatientToFila,
  listPatients,
  syncWaitingListWithAgenda,
  upsertPatient,
  getPatient,
  listAppointments,
  deleteAppointmentAlta,
  type WaitingListEntry,
  type Patient,
} from "@/lib/arco-rpc";


// Regra de faixa etária: a fila de espera prioriza crianças. Pacientes acima
// de 11 anos NÃO permanecem na fila (mas continuam cadastrados normalmente).
const MAX_AGE_FILA = 11;

// True se o paciente (pela data de nascimento) está acima da idade limite da
// fila. Datas ausentes/inválidas (NaN) NÃO são consideradas acima do limite,
// para não remover ninguém por falta de dado.
function isOverAge(dob: string | null | undefined): boolean {
  if (!dob) return false;
  const idade = calcIdade(dob);
  return !isNaN(idade) && idade > MAX_AGE_FILA;
}

const PRIORITY_LABEL: Record<string, string> = {
  maxima: "🔴 MÁXIMA – Prioridade Social/Idade",
  elevado: "VERMELHO – Elevado",
  moderado: "LARANJA – Moderado",
  leve: "AZUL – Leve",
  baixo: "VERDE – Baixo",
  alta: "VERMELHO – Elevado",
  media: "LARANJA – Moderado",
  baixa: "VERDE – Baixo",
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

const PAUSE_REASONS = [
  "Sem contato (telefone não atende)",
  "Recusou a vaga no momento",
  "Mudou-se / sem transporte",
  "Aguardando documento / laudo",
  "Problema de saúde / internação",
  "Pedido da família",
  "Outro",
] as const;

const HIST_LABEL: Record<string, { label: string; cls: string }> = {
  entrada:            { label: "Entrou na fila",      cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40" },
  agendado:           { label: "Agendado",            cls: "bg-cyan-500/15 text-cyan-400 border-cyan-500/40" },
  alta:               { label: "Alta",                cls: "bg-violet-500/15 text-violet-400 border-violet-500/40" },
  desistencia:        { label: "Desistência",         cls: "bg-orange-500/15 text-orange-400 border-orange-500/40" },
  obito:              { label: "Óbito",               cls: "bg-zinc-500/15 text-zinc-300 border-zinc-500/40" },
  removido:           { label: "Removido da fila",    cls: "bg-red-500/15 text-red-400 border-red-500/40" },
  pausa:              { label: "Pausa / busca ativa", cls: "bg-sky-500/15 text-sky-400 border-sky-500/40" },
  retorno:            { label: "Voltou à fila",       cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40" },
  retorno_automatico: { label: "Voltou (prazo venceu)", cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/40" },
};

const waitDaysOf = (e: WaitingListEntry): number => {
  if (typeof e.waitDays === "number") return e.waitDays;
  const d = new Date(e.entryDate + "T12:00:00").getTime();
  return Number.isFinite(d) ? Math.max(0, Math.round((Date.now() - d) / 86_400_000)) : 0;
};
const waitTone = (days: number) =>
  days >= 180 ? "text-red-400 bg-red-500/10 border-red-500/40"
  : days >= 90 ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/40"
  : "text-muted-foreground bg-secondary/40 border-border";

export default function WaitingList() {
  useDocumentTitle("Fila de Espera");
  const [waitingList, setWaitingList] = useState<WaitingListEntry[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [formPatientId, setFormPatientId] = useState("");
  // Inserção manual (admin): adiciona qualquer paciente sem exigir triagem.
  const [manualMode, setManualMode] = useState(false);
  const [manualSpecialty, setManualSpecialty] = useState("");
  const [manualSearch, setManualSearch] = useState("");
  const [filterSpecialty, setFilterSpecialty] = useState<string>("__all__");
  const [searchQuery, setSearchQuery] = useState("");
  // Saída do paciente (Alta / Desistência / Óbito) direto pela fila.
  const [saidaTarget, setSaidaTarget] = useState<WaitingListEntry | null>(null);
  const [saidaTipo, setSaidaTipo] = useState<"Alta" | "Desistência" | "Óbito">("Alta");
  const [saidaMotivo, setSaidaMotivo] = useState("");
  const [saidaLoading, setSaidaLoading] = useState(false);
  const [pauseTarget, setPauseTarget] = useState<WaitingListEntry | null>(null);
  const [pauseReason, setPauseReason] = useState<string>(PAUSE_REASONS[0]);
  const [pauseOther, setPauseOther] = useState("");
  const [pauseReturn, setPauseReturn] = useState("");
  const [pauseLoading, setPauseLoading] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [histItems, setHistItems] = useState<WaitingListHistoryEntry[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histSearch, setHistSearch] = useState("");
  const [histEvento, setHistEvento] = useState("");
  const { toast } = useToast();

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      // Sync server-side: remove duplicatas e pacientes já em atendimento
      try { await syncWaitingListWithAgenda(); } catch { /* silencioso */ }

      const [wl, ps] = await Promise.all([listWaitingList(), listPatients()]);

      // Regra de faixa etária: remove automaticamente da fila os pacientes acima
      // de 11 anos (continuam cadastrados normalmente). Best-effort: se a exclusão
      // no banco falhar, ainda ocultamos da lista exibida.
      const dobById = new Map(ps.map(p => [p.id, p.dateOfBirth]));
      const overAge = wl.filter(e => isOverAge(dobById.get(e.patientId)));
      if (overAge.length > 0) {
        await Promise.allSettled(overAge.map(e => deleteWaitingListEntry(e.id)));
      }
      const overAgeIds = new Set(overAge.map(e => e.id));
      setWaitingList(wl.filter(e => !overAgeIds.has(e.id)));
      setPatients(ps);
    } catch (err: any) {
      toast({
        title: "Erro ao carregar fila",
        description: err?.message || "Falha inesperada.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime: atualiza a fila instantaneamente quando uma nova triagem for salva
  // (trigger `tg_triagens_autolink` insere em `waiting_list`) ou quando algum
  // paciente tem `triagem_score`/`status` atualizados. Debounce 400ms evita
  // re-render em rajadas (ex.: varias especialidades inseridas em sequencia).
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReload = useCallback(() => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(() => { void load(); }, 400);
  }, [load]);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel("arco-fila-espera")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "waiting_list" },
        () => scheduleReload()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "patients" },
        () => scheduleReload()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        () => scheduleReload()
      )
      .subscribe();
    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      void supabase?.removeChannel(channel);
    };
  }, [scheduleReload]);

  const eligiblePatients = patients.filter((p) => {
    const score = p.triagemScore;
    const prt = parseInt(p.prontuario ?? "", 10);
    const isProntuarioAntigo = !isNaN(prt) && prt < 500;
    const inactiveStatus = ["Alta", "Óbito", "Desistência", "Atendimento"].includes(p.status ?? "");
    const isCenso = p.tipoRegistro === "Registro Censo Municipal";
    // Acima de 11 anos não entra na fila (prioridade para crianças).
    if (isOverAge(p.dateOfBirth)) return false;
    return (score != null || isProntuarioAntigo) && !inactiveStatus && !isCenso;
  });

  const resetForm = () => {
    setFormPatientId("");
    setManualMode(false);
    setManualSpecialty("");
    setManualSearch("");
  };

  // Pacientes elegíveis para inserção manual (admin): autonomia total — qualquer
  // paciente cadastrado, independente de triagem, de status (inclusive quem já
  // está em atendimento em outra especialidade) ou de alta/desistência.
  // Restrições que permanecem porque são regra do banco/da clínica:
  //   • Censo Municipal não entra na fila;
  //   • acima de 11 anos não permanece na fila.
  const manualCandidates = patients.filter(p => {
    if (p.tipoRegistro === "Registro Censo Municipal") return false;
    return !isOverAge(p.dateOfBirth);
  });

  const manualMatches = manualCandidates.filter(p => {
    const q = manualSearch.trim().toLowerCase();
    if (!q) return true;
    return (p.name ?? "").toLowerCase().includes(q) || (p.prontuario ?? "").toLowerCase().includes(q);
  });

  const MANUAL_LIST_LIMIT = 100;
  const manualEligible = manualMatches.slice(0, MANUAL_LIST_LIMIT);

  const handleAddManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPatientId) return;
    const sel = patients.find(p => String(p.id) === formPatientId);
    if (isOverAge(sel?.dateOfBirth)) {
      toast({ title: "Fora da faixa etária", description: `A fila é para pacientes com até ${MAX_AGE_FILA} anos. Acima disso, o atendimento é agendado direto.`, variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const result = await addPatientToFila(
        parseInt(formPatientId),
        manualSpecialty.trim() || null,
        null,
        true, // skipTriagemCheck — admin insere sem exigir triagem
      );
      await load();
      if (result?.id == null) {
        toast({
          title: "Não foi possível adicionar",
          description: "O banco recusou a inserção deste paciente na fila. Confira a data de nascimento e o tipo de cadastro.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "✅ Adicionado à fila!",
        description: `${manualSpecialty || "Qualquer especialidade"} — Prioridade: ${PRIORITY_LABEL[result.priority] ?? result.priority}`,
      });
      setIsDialogOpen(false);
      resetForm();
    } catch (err: any) {
      const already = err?.message?.toLowerCase().includes("fila");
      toast({
        title: already ? "Aviso" : "Erro",
        description: already ? "Paciente já está na fila desta especialidade." : (err?.message || "Falha ao adicionar."),
        variant: "destructive",
      });
    } finally {
      setAdding(false);
    }
  };

  const openSaida = (entry: WaitingListEntry, tipo: "Alta" | "Desistência" | "Óbito") => {
    setSaidaTarget(entry);
    setSaidaTipo(tipo);
    setSaidaMotivo("");
  };

  const confirmSaida = async () => {
    if (!saidaTarget) return;
    // Motivo obrigatório para Alta e Desistência; Óbito é opcional.
    if (saidaTipo !== "Óbito" && !saidaMotivo.trim()) return;
    setSaidaLoading(true);
    const label = saidaTipo;
    const pid = saidaTarget.patientId;
    try {
      // 1) Grava status + motivo no prontuário do paciente.
      try {
        const existing = await getPatient(pid);
        const prevNotes = existing?.notes ? `${existing.notes}\n` : "";
        const motivo = saidaMotivo.trim() || "—";
        await upsertPatient(pid, {
          status: label,
          notes: `${prevNotes}[${label.toUpperCase()} ${new Date().toLocaleDateString("pt-BR")} — Fila] Motivo: ${motivo}`,
        });
      } catch {
        toast({ title: "Aviso", description: "Falha ao gravar no prontuário — a fila será atualizada mesmo assim.", variant: "destructive" });
      }

      // 2) Remove TODAS as entradas do paciente na fila.
      try {
        const filaAtual = await listWaitingList();
        for (const e of filaAtual.filter(e => e.patientId === pid)) {
          try { await deleteWaitingListEntry(e.id); } catch { /* best-effort */ }
        }
      } catch { /* silencioso */ }

      // 3) Cascata: remove agendamentos futuros do paciente (evita fantasmas).
      try {
        const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
        const futuros = await listAppointments({ patientId: pid, dateFrom: todayStr });
        const grupos = new Set<string>();
        for (const a of futuros) {
          if (a.id <= 0) continue;
          const gid = a.recurrenceGroupId || `single:${a.id}`;
          if (grupos.has(gid)) continue;
          grupos.add(gid);
          try { await deleteAppointmentAlta(a.id); } catch { /* best-effort */ }
        }
      } catch { /* best-effort */ }

      await load();
      toast({ title: `${label} registrada`, description: `${saidaTarget.patientName} saiu da fila.` });
      setSaidaTarget(null);
      setSaidaMotivo("");
    } catch (err: any) {
      toast({ title: "Erro", description: err?.message || "Falha ao registrar saída.", variant: "destructive" });
    } finally {
      setSaidaLoading(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPatientId) return;

    const selectedPatient = patients.find(p => String(p.id) === formPatientId);
    if (isOverAge(selectedPatient?.dateOfBirth)) {
      toast({ title: "Fora da faixa etária", description: `A fila é para pacientes com até ${MAX_AGE_FILA} anos. Acima disso, o atendimento é agendado direto.`, variant: "destructive" });
      return;
    }
    setAdding(true);

    const scoredSpecialties = SCORE_SPECIALTY_MAP
      .filter(({ field }) => ((selectedPatient?.[field] as number | null) ?? 0) > 0)
      .map(({ specialty }) => specialty);
    const specialtiesToAdd: (string | null)[] = scoredSpecialties.length > 0 ? scoredSpecialties : [null];

    let added = 0;
    let skipped = 0;
    let lastPriority = "";
    try {
      for (const sp of specialtiesToAdd) {
        try {
          const prt = parseInt(selectedPatient?.prontuario ?? "", 10);
          const skipTriagem = !isNaN(prt) && prt < 500 && selectedPatient?.triagemScore == null;
          const result = await addPatientToFila(parseInt(formPatientId), sp ?? null, null, skipTriagem);
          lastPriority = result.priority;
          added++;
        } catch (err: any) {
          if (err.message?.includes("Já na fila") || err.message?.toLowerCase().includes("fila")) skipped++;
          else throw err;
        }
      }
      await load();
      const desc = added > 0
        ? `${added} especialidade(s) adicionada(s)${skipped > 0 ? `, ${skipped} já existia(m)` : ""}. Prioridade: ${PRIORITY_LABEL[lastPriority] ?? lastPriority}`
        : "Todas as especialidades já estavam na fila.";
      toast({ title: added > 0 ? "✅ Adicionado à fila!" : "Aviso", description: desc, variant: added > 0 ? "default" : "destructive" });
      if (added > 0) { setIsDialogOpen(false); resetForm(); }
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (id: number) => {
    if (!confirm("Remover paciente da fila de espera?")) return;
    try {
      await deleteWaitingListEntry(id);
      setWaitingList(prev => prev.filter(e => e.id !== id));
      toast({ title: "Removido", description: "Entrada removida com sucesso." });
    } catch (err: any) {
      toast({
        title: "Erro",
        description: err?.message || "Falha ao remover.",
        variant: "destructive",
      });
    }
  };

  const handlePause = (entry: WaitingListEntry) => {
    setPauseReason(PAUSE_REASONS[0]);
    setPauseOther("");
    const d = new Date(); d.setDate(d.getDate() + 30);
    setPauseReturn(d.toISOString().slice(0, 10));
    setPauseTarget(entry);
  };

  const confirmPause = async () => {
    if (!pauseTarget) return;
    const reason = pauseReason === "Outro" ? (pauseOther.trim() || "Outro") : pauseReason;
    setPauseLoading(true);
    try {
      const res = await setWaitingListPaused(pauseTarget.id, true, reason, pauseReturn || null);
      setWaitingList(prev => prev.map(e =>
        e.id === pauseTarget.id
          ? { ...e, paused: true, pausedAt: new Date().toISOString(), pausedReason: reason, pausedReturnDate: res.pausedReturnDate, pausedOrigin: "Fila de Espera" }
          : e
      ));
      toast({ title: "🔵 Em busca ativa", description: `${pauseTarget.patientName} saiu da disputa por vaga${pauseReturn ? ` até ${formatDate(pauseReturn)}` : ""}.` });
      setPauseTarget(null);
    } catch (err: any) {
      toast({ title: "Erro", description: err?.message || "Falha ao pausar.", variant: "destructive" });
    } finally {
      setPauseLoading(false);
    }
  };

  const loadHistory = useCallback(async () => {
    setHistLoading(true);
    try {
      setHistItems(await listWaitingListHistory({ limit: 500 }));
    } catch (err: any) {
      toast({ title: "Erro", description: err?.message || "Falha ao carregar histórico.", variant: "destructive" });
    } finally {
      setHistLoading(false);
    }
  }, [toast]);

  useEffect(() => { if (histOpen) loadHistory(); }, [histOpen, loadHistory]);

  const handleUnpause = async (entry: WaitingListEntry) => {
    try {
      await setWaitingListPaused(entry.id, false);
      setWaitingList(prev => prev.map(e =>
        e.id === entry.id ? { ...e, paused: false, pausedAt: null, pausedReason: null, pausedReturnDate: null, pausedOrigin: null } : e
      ));
      toast({ title: "Descongelado", description: `${entry.patientName} voltou à fila na posição original.` });
    } catch (err: any) {
      toast({ title: "Erro", description: err?.message || "Falha ao descongelar.", variant: "destructive" });
    }
  };

  // Foto do paciente por id (para exibir a miniatura na fila).
  const photoById = new Map<number, string | null>();
  for (const p of patients) photoById.set(p.id, p.photoUrl);

  // Parental/Pilates: quem é atendido é o responsável, então é o nome dele que aparece.
  const caregiverById = new Map<number, string | null>();
  for (const p of patients) caregiverById.set(p.id, p.motherName || p.guardianName || null);
  const caregiverNameOf = (entry: WaitingListEntry): string | null =>
    isCaregiverSpecialty(entry.specialty) ? (caregiverById.get(entry.patientId) ?? null) : null;

  // Pacientes em busca ativa (congelados) saem da disputa por vaga prioritaria.
  const activeList = waitingList.filter(e => !e.paused);

  // Resumo gerencial por especialidade: quantos esperam, média e maior espera, alertas.
  const resumo = useMemo(() => {
    const m = new Map<string, { n: number; soma: number; max: number; a90: number; a180: number; semTriagem: number }>();
    for (const e of activeList) {
      const k = e.specialty || "Qualquer especialidade";
      const r = m.get(k) ?? { n: 0, soma: 0, max: 0, a90: 0, a180: 0, semTriagem: 0 };
      const d = waitDaysOf(e);
      r.n++; r.soma += d; r.max = Math.max(r.max, d);
      if (d >= 180) r.a180++; else if (d >= 90) r.a90++;
      if (e.ordenacao === "prioridade" && e.scoreEspecialidade == null && !e.triagemScore) r.semTriagem++;
      m.set(k, r);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].n - a[1].n);
  }, [activeList]);
  const pausedList = waitingList.filter(e => e.paused);

  // Server ja retorna ORDER BY (score_clinico_100 + score_social) DESC (Fase 5C).
  // Aqui so calculamos a posicao dentro de cada especialidade preservando a ordem recebida.
  // A numeracao considera apenas os pacientes ativos (congelados nao ocupam posicao).
  const perSpecialtyPosition = new Map<number, number>();
  const specialtyOptions: string[] = [];
  {
    const seen = new Set<string>();
    // Lista oficial primeiro: toda especialidade existe no filtro mesmo sem ninguém na fila.
    for (const sp of SPECIALTIES) {
      if (!seen.has(sp)) { seen.add(sp); specialtyOptions.push(sp); }
    }
    for (const entry of waitingList) {
      const sp: string = entry.specialty ?? "__null__";
      if (!seen.has(sp)) { seen.add(sp); specialtyOptions.push(sp); }
    }
    const counters = new Map<string, number>();
    for (const entry of activeList) {
      const sp: string = entry.specialty ?? "__null__";
      const next = (counters.get(sp) ?? 0) + 1;
      counters.set(sp, next);
      perSpecialtyPosition.set(entry.id, next);
    }
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const matchesFilter = (entry: WaitingListEntry) => {
    if (normalizedQuery) {
      const name = (entry.patientName ?? "").toLowerCase();
      const prontuario = (entry.patientProntuario ?? "").toLowerCase();
      if (!name.includes(normalizedQuery) && !prontuario.includes(normalizedQuery)) return false;
    }
    if (filterSpecialty === "__all__") return true;
    const sp: string = entry.specialty ?? "__null__";
    return sp === filterSpecialty;
  };
  const displayList = activeList.filter(matchesFilter);
  const displayPausedList = pausedList.filter(matchesFilter);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Fila de Espera</h1>
          <p className="text-muted-foreground mt-1">Organização por prioridade calculada na triagem. A fila é para pacientes com até {MAX_AGE_FILA} anos.</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar por nome ou prontuário..."
              className="w-full sm:w-64 rounded-lg bg-secondary/40 border border-border pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60 transition-colors"
            />
          </div>
          <Button onClick={() => setIsDialogOpen(true)} className="gap-2 whitespace-nowrap">
            <ListPlus className="w-4 h-4" /> Adicionar à Fila
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground bg-secondary/40 border border-border rounded-xl px-4 py-2.5 flex-1">
          <span className="font-semibold">Ordenação por prioridade:</span>
          <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-bold border border-rose-200">VERMELHO – Elevado</span>
          <span className="text-muted-foreground">→</span>
          <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-bold border border-orange-200">LARANJA – Moderado</span>
          <span className="text-muted-foreground">→</span>
          <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-bold border border-sky-200">AZUL – Leve</span>
          <span className="text-muted-foreground">→</span>
          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold border border-emerald-200">VERDE – Baixo</span>
          <span className="w-full text-[11px] text-muted-foreground">
            Em toda especialidade a ordem é: <strong>Prioridade Máxima</strong> (abrigo / idade na Fono e Fisio) →
            <strong>demanda prioritária</strong> pelo diagnóstico/CID → o resto.
            No "resto", <strong>Fonoaudiologia</strong> e <strong>Fisioterapia</strong> usam a pontuação (nota da triagem + Checklist ABC, as cores acima);
            as demais especialidades seguem a <strong>ordem de chegada</strong>. Quem está sem triagem fica como "Baixo" e entra pela data.
          </span>
          <span className="w-full text-[11px] text-muted-foreground">
            Pais <strong>desempregados</strong> somam +10 pontos e trabalho <strong>informal/roça</strong> +5.
            Quem já atende no <strong>particular</strong> perde 10 pontos, o bônus de idade e a Prioridade Máxima por idade;
            quem atende no <strong>CAPS/Reabilitação</strong> perde só 5 pontos. Abrigo mantém Prioridade Máxima.
            Pelo diagnóstico/CID, quem tem <strong>deficiência</strong> passa na frente na especialidade que mais precisa
            (ex.: paralisia cerebral, física e visual na Fisio/T.O.; auditiva na Fono; intelectual e TEA na Psico/T.O.), logo depois da Prioridade Máxima.
          </span>
        </div>
        {specialtyOptions.length > 0 && (
          <div className="relative">
            <select
              value={filterSpecialty}
              onChange={e => setFilterSpecialty(e.target.value)}
              className="appearance-none cursor-pointer font-bold text-xs rounded-full px-5 py-2 pr-8 border-2 transition-all outline-none"
              style={{
                background: "rgba(8, 145, 178, 0.08)",
                borderColor: "rgba(34, 211, 238, 0.55)",
                color: "#67e8f9",
                boxShadow: "0 0 12px rgba(34, 211, 238, 0.18), inset 0 0 8px rgba(34, 211, 238, 0.04)",
              }}
            >
              <option value="__all__" style={{ background: "#0f172a", color: "#e2e8f0" }}>
                ✦ Todas as especialidades
              </option>
              {specialtyOptions.map(sp => (
                <option key={sp} value={sp} style={{ background: "#0f172a", color: "#e2e8f0" }}>
                  {sp === "__null__" ? "Qualquer especialidade" : sp}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-cyan-400 text-xs">▾</span>
          </div>
        )}
      </div>

      {resumo.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {resumo.map(([sp, r]) => {
            const tone = specialtyTone(sp);
            const media = Math.round(r.soma / r.n);
            return (
              <button key={sp} type="button" onClick={() => setFilterSpecialty(filterSpecialty === sp ? "__all__" : sp)}
                className={`text-left rounded-xl border p-3 transition hover:scale-[1.02] ${filterSpecialty === sp ? "ring-2 ring-primary" : ""}`}
                style={{ background: tone.bg, borderColor: tone.border }}>
                <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: tone.fg }}>{specialtyShortLabel(sp)}</div>
                <div className="text-2xl font-bold text-foreground leading-tight">{r.n}</div>
                <div className="text-[11px] text-muted-foreground">média {media}d · maior {r.max}d</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {r.a180 > 0 && <span className="text-[10px] font-bold px-1.5 rounded bg-red-500/20 text-red-400">{r.a180} &gt;180d</span>}
                  {r.a90 > 0 && <span className="text-[10px] font-bold px-1.5 rounded bg-yellow-500/20 text-yellow-400">{r.a90} &gt;90d</span>}
                  {r.semTriagem > 0 && <span className="text-[10px] font-bold px-1.5 rounded bg-amber-500/20 text-amber-400">{r.semTriagem} sem triagem</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Clock className="w-3.5 h-3.5" />
        <span>Tempo de espera: </span>
        <span className="px-1.5 rounded border border-yellow-500/40 bg-yellow-500/10 text-yellow-400 font-semibold">amarelo ≥ 90 dias</span>
        <span className="px-1.5 rounded border border-red-500/40 bg-red-500/10 text-red-400 font-semibold">vermelho ≥ 180 dias</span>
        <span className="ml-auto flex gap-2">
          <Link href="/pausados"><Button variant="outline" size="sm" className="gap-1.5"><Snowflake className="w-3.5 h-3.5" /> Pausados / Busca Ativa</Button></Link>
          <Button variant={histOpen ? "default" : "outline"} size="sm" className="gap-1.5" onClick={() => setHistOpen(v => !v)}>
            <History className="w-3.5 h-3.5" /> Histórico da fila
          </Button>
        </span>
      </div>

      {histOpen && (
        <Card className="p-0 overflow-hidden border-primary/30">
          <div className="flex flex-wrap items-center gap-2 px-6 py-3 bg-primary/5 border-b border-border">
            <History className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-wide">Histórico da fila</h2>
            <span className="text-xs text-muted-foreground">quem entrou, saiu, pausou, voltou ou foi agendado — e por quê</span>
            <div className="ml-auto flex gap-2 items-center">
              <Input className="h-8 w-56 text-xs" placeholder="Paciente ou prontuário…" value={histSearch} onChange={e => setHistSearch(e.target.value)} />
              <Select className="h-8 w-44 text-xs py-0" value={histEvento} onChange={e => setHistEvento(e.target.value)}>
                <option value="">Todos os eventos</option>
                {Object.entries(HIST_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
              <Button variant="ghost" size="sm" onClick={loadHistory} disabled={histLoading}>{histLoading ? "…" : "Atualizar"}</Button>
            </div>
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 sticky top-0">
                <tr>
                  <th className="px-6 py-2">Quando</th>
                  <th className="px-6 py-2">Paciente</th>
                  <th className="px-6 py-2">Especialidade</th>
                  <th className="px-6 py-2">Evento</th>
                  <th className="px-6 py-2">Motivo / detalhe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(() => {
                  const q = histSearch.trim().toLowerCase();
                  const rows = histItems.filter(h =>
                    (!histEvento || h.evento === histEvento) &&
                    (!q || (h.patientName || "").toLowerCase().includes(q) || (h.prontuario || "").toLowerCase().includes(q))
                  );
                  if (histLoading && histItems.length === 0) return <tr><td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">Carregando…</td></tr>;
                  if (rows.length === 0) return <tr><td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">Nenhum evento.</td></tr>;
                  return rows.map(h => {
                    const lb = HIST_LABEL[h.evento] ?? { label: h.evento, cls: "bg-secondary text-foreground border-border" };
                    const ret = h.detalhe && typeof h.detalhe.retorno === "string" ? h.detalhe.retorno : null;
                    return (
                      <tr key={h.id} className="hover:bg-secondary/20">
                        <td className="px-6 py-2 whitespace-nowrap text-muted-foreground">{new Date(h.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                        <td className="px-6 py-2 font-medium">
                          <Link href={`/patients/${h.patientId}`} className="hover:underline">{h.patientName || `#${h.patientId}`}</Link>
                          {h.prontuario && <span className="text-xs text-muted-foreground ml-1">[{h.prontuario}]</span>}
                        </td>
                        <td className="px-6 py-2">{h.specialty || "Qualquer"}</td>
                        <td className="px-6 py-2"><span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${lb.cls}`}>{lb.label}</span></td>
                        <td className="px-6 py-2 text-muted-foreground">{h.motivo || "—"}{ret ? ` · retorno previsto ${formatDate(ret)}` : ""}</td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border">
              <tr>
                <th className="px-6 py-4">Posição</th>
                <th className="px-6 py-4">Paciente</th>
                <th className="px-6 py-4">Especialidade</th>
                <th className="px-6 py-4">Prioridade</th>
                <th className="px-6 py-4">Score</th>
                <th className="px-6 py-4">Entrada</th>
                <th className="px-6 py-4">Espera</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="text-center py-12 animate-pulse">Carregando fila...</td></tr>
              ) : activeList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                      <ListTodo className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <p className="text-lg font-bold text-foreground">Fila Vazia</p>
                    <p className="text-muted-foreground">Nenhum paciente aguardando vaga.</p>
                  </td>
                </tr>
              ) : displayList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-muted-foreground">
                    {normalizedQuery ? "Nenhum paciente encontrado" : "Nenhum paciente nesta especialidade."}
                  </td>
                </tr>
              ) : (
                displayList.map((entry) => {
                  const pos = perSpecialtyPosition.get(entry.id) ?? "—";
                  return (
                    <tr key={entry.id} className="border-b border-border hover:bg-secondary/20 transition-colors">
                      <td className="px-6 py-4 font-display font-bold text-lg text-primary">#{pos}</td>
                      <td className="px-6 py-4 font-semibold text-foreground">
                        <div className="flex items-center gap-2 flex-wrap">
                          <PatientAvatar url={photoById.get(entry.patientId)} name={entry.patientName} size={48} />
                          {entry.patientName}
                          {entry.specialty && (() => {
                            const tone = specialtyTone(entry.specialty);
                            return (
                              <span
                                className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md leading-none"
                                style={{
                                  background: tone.bg,
                                  color: tone.fg,
                                  border: `1px solid ${tone.border}`,
                                  boxShadow: `0 0 8px ${tone.glow}`,
                                  textShadow: `0 0 6px ${tone.glow}`,
                                }}
                              >
                                {specialtyShortLabel(entry.specialty)}
                              </span>
                            );
                          })()}
                          {isCaregiverSpecialty(entry.specialty) && (
                            <span className="text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-md leading-none bg-pink-500/20 text-pink-300 border border-pink-400/40">
                              👩 Mãe/Responsável
                            </span>
                          )}
                        </div>
                        {caregiverNameOf(entry) && (
                          <div className="text-xs text-pink-400 font-semibold mt-0.5">Mãe/responsável: {caregiverNameOf(entry)}</div>
                        )}
                        <div className="text-xs text-muted-foreground font-mono font-normal mt-0.5">
                          {entry.patientProntuario || `#${String(entry.patientId).padStart(4, "0")}`}
                        </div>
                        {entry.patientPhone && (
                          <div className="text-xs text-muted-foreground font-normal mt-0.5">{entry.patientPhone}</div>
                        )}
                        {entry.notes && (
                          <div className="text-xs text-amber-400/80 font-normal mt-1 italic">📋 {entry.notes}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {entry.specialty || "Qualquer especialidade"}
                      </td>
                      <td className="px-6 py-4">
                        <Badge className={getPriorityColor(entry.priority)}>
                          {PRIORITY_LABEL[entry.priority] ?? entry.priority}
                        </Badge>
                        <div
                          className="mt-1"
                          title={entry.abcNivel
                            ? `Checklist ABC (avaliação de entrada): ${entry.abcTotal} pontos. O ABC não pula a fila: soma junto com a nota da triagem na pontuação da especialidade.`
                            : "Sem avaliação ABC: a pontuação fica só com a nota da triagem."}
                        >
                          <AbcNivelBadge nivel={entry.abcNivel ?? null} total={entry.abcTotal ?? null} />
                        </div>
                        {entry.ordenacao === "prioridade" && entry.scoreEspecialidade == null && !entry.triagemScore && (
                          <div
                            title="Sem nota de triagem nesta especialidade: a prioridade fica como Baixo e a posição é só pela data de entrada. Faça a triagem para a criança disputar a vaga pela gravidade."
                            className="mt-1 inline-block text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 border border-amber-500/40"
                          >
                            ⚠ sem triagem
                          </div>
                        )}
                        {entry.demandaPrioritaria && (
                          <div
                            title={`Demanda prioritária pelo diagnóstico/CID: ${entry.demandaPrioritaria}. Fica logo depois da Prioridade Máxima nesta especialidade.`}
                            className="mt-1 text-[11px] font-bold text-rose-500"
                          >
                            ★ {entry.demandaPrioritaria}
                          </div>
                        )}
                        {entry.atendeFora && (
                          <div
                            title={entry.atendeForaTipo === "particular"
                              ? "Já faz atendimento particular: −10 pontos, sem bônus de idade e sem Prioridade Máxima por idade."
                              : `Já atende na rede pública${entry.localAtendimento ? ` (${entry.localAtendimento})` : ""}: −5 pontos, mantém a prioridade.`}
                            className="mt-1 text-[11px] font-bold text-amber-500"
                          >
                            {entry.atendeForaTipo === "particular" ? "⚠ particular · −10" : `⚠ atende fora · −${entry.penalidadeFora ?? 5}`}
                          </div>
                        )}
                        {entry.ordenacao === "chegada" && (
                          <div
                            title="Nesta especialidade a fila segue a ordem de chegada: do mais antigo para o mais novo pela data de entrada. A cor indica só a gravidade clínica."
                            className="mt-1 text-[11px] font-semibold text-muted-foreground"
                          >
                            ⏱ ordem de chegada
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {entry.scoreEspecialidade != null ? (
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-baseline gap-1 font-mono">
                              <span className="font-bold text-foreground">{areaToUi(entry.scoreEspecialidade)}</span>
                              <span className="text-xs text-muted-foreground">/{AREA_MAX_UI}</span>
                              {!!entry.bonusTrabalho && entry.bonusTrabalho > 0 && (
                                <span
                                  title={`Trabalho dos pais: ${entry.trabalhoPais || "Informal/Roça"} (Desempregado +10, Informal/Roça +5)`}
                                  className="ml-2 text-xs font-semibold text-emerald-500"
                                >
                                  +{entry.bonusTrabalho} {entry.bonusTrabalho >= 10 ? "desempregado" : "informal"}
                                </span>
                              )}
                              {!!entry.scoreSocialDesempate && entry.scoreSocialDesempate > 0 && (
                                <span
                                  title="Ponto de vulnerabilidade somado como desempate (+1 Escola Pública)"
                                  className="ml-2 text-xs font-semibold text-amber-500"
                                >
                                  +{entry.scoreSocialDesempate} desempate
                                </span>
                              )}
                            </div>
                            {!!entry.ageBonus && entry.ageBonus > 0 && (
                              <span
                                title={entry.ageBonus >= 50 ? "Bônus Primeira Infância (<4 anos): +50" : "Bônus Primeira Infância (4-6 anos): +20"}
                                className="text-xs font-semibold"
                                style={{ color: entry.ageBonus >= 50 ? "#f472b6" : "#a78bfa" }}
                              >
                                +{entry.ageBonus} {entry.ageBonus >= 50 ? "👶 <4 anos" : "🧒 4-6 anos"}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-baseline gap-1 font-mono">
                              <span className="font-bold text-foreground">{entry.scoreTotal150 ?? 0}</span>
                              <span className="text-xs text-muted-foreground">/150</span>
                              <span
                                title="Sem especialidade definida: usa score clinico geral"
                                className="ml-2 text-xs font-semibold text-muted-foreground"
                              >
                                geral
                              </span>
                            </div>
                            {!!entry.ageBonus && entry.ageBonus > 0 && (
                              <span
                                title={entry.ageBonus >= 50 ? "Bônus Primeira Infância (<4 anos): +50" : "Bônus Primeira Infância (4-6 anos): +20"}
                                className="text-xs font-semibold"
                                style={{ color: entry.ageBonus >= 50 ? "#f472b6" : "#a78bfa" }}
                              >
                                +{entry.ageBonus} {entry.ageBonus >= 50 ? "👶 <4 anos" : "🧒 4-6 anos"}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 font-medium">{formatDate(entry.entryDate)}</td>
                      <td className="px-6 py-4">
                        {(() => { const d = waitDaysOf(entry); return (
                          <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md border ${waitTone(d)}`}
                            title={d >= 180 ? "Mais de 180 dias esperando — prioridade de contato/encaixe" : d >= 90 ? "Mais de 90 dias esperando" : "Dias na fila"}>
                            <Clock className="w-3 h-3" /> {d}d
                          </span>
                        ); })()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          <Button
                            variant="outline"
                            title="Pausar atendimento (busca ativa) — tira da disputa por vaga sem remover"
                            className="h-8 gap-1.5 text-xs border-sky-500/40 text-sky-300 hover:bg-sky-500/10"
                            onClick={() => handlePause(entry)}
                          >
                            <Snowflake className="w-3.5 h-3.5" /> Pausar Atendimento
                          </Button>
                          <Button
                            variant="outline"
                            title="Dar Alta (encerra o atendimento — motivo obrigatório)"
                            className="h-8 gap-1.5 text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                            onClick={() => openSaida(entry, "Alta")}
                          >
                            <LogOut className="w-3.5 h-3.5" /> Alta
                          </Button>
                          <Button
                            variant="outline"
                            title="Registrar Desistência (motivo obrigatório)"
                            className="h-8 gap-1.5 text-xs border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                            onClick={() => openSaida(entry, "Desistência")}
                          >
                            Desistência
                          </Button>
                          <Button
                            variant="outline"
                            title="Registrar Óbito"
                            className="h-8 gap-1.5 text-xs border-slate-500/40 text-slate-400 hover:bg-slate-500/10"
                            onClick={() => openSaida(entry, "Óbito")}
                          >
                            Óbito
                          </Button>
                          <Button
                            variant="ghost"
                            title="Tirar da fila (sem alterar status do paciente)"
                            className="text-destructive hover:bg-destructive/10 h-8 w-8 p-0"
                            onClick={() => handleRemove(entry.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {pausedList.length > 0 && (
        <Card className="p-0 overflow-hidden border-sky-500/30">
          <div className="flex items-center gap-2 px-6 py-4 bg-sky-500/10 border-b border-sky-500/20">
            <Search className="w-4 h-4 text-sky-400" />
            <h2 className="text-sm font-bold uppercase tracking-wide text-sky-300">
              Em Busca Ativa ({pausedList.length})
            </h2>
            <span className="text-xs text-muted-foreground">
              Fora da disputa por vaga. Vencido o prazo de retorno, volta sozinho à fila. Veja todos em "Pausados / Busca Ativa".
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border">
                <tr>
                  <th className="px-6 py-4">Paciente</th>
                  <th className="px-6 py-4">Especialidade</th>
                  <th className="px-6 py-4">Motivo</th>
                  <th className="px-6 py-4">Veio de</th>
                  <th className="px-6 py-4">Congelado em</th>
                  <th className="px-6 py-4">Retorno previsto</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {displayPausedList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhum paciente em busca ativa nesta especialidade.
                    </td>
                  </tr>
                ) : (
                  displayPausedList.map((entry) => (
                    <tr key={entry.id} className="border-b border-border hover:bg-secondary/20 transition-colors opacity-90">
                      <td className="px-6 py-4 font-semibold text-foreground">
                        <div className="flex items-center gap-2 flex-wrap">
                          <PatientAvatar url={photoById.get(entry.patientId)} name={entry.patientName} size={48} />
                          <Snowflake className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                          {entry.patientName}
                          {entry.specialty && (() => {
                            const tone = specialtyTone(entry.specialty);
                            return (
                              <span
                                className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md leading-none"
                                style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}` }}
                              >
                                {specialtyShortLabel(entry.specialty)}
                              </span>
                            );
                          })()}
                        </div>
                        {caregiverNameOf(entry) && (
                          <div className="text-xs text-pink-400 font-semibold mt-0.5">Mãe/responsável: {caregiverNameOf(entry)}</div>
                        )}
                        <div className="text-xs text-muted-foreground font-mono font-normal mt-0.5">
                          {entry.patientProntuario || `#${String(entry.patientId).padStart(4, "0")}`}
                        </div>
                        {entry.patientPhone && (
                          <div className="text-xs text-muted-foreground font-normal mt-0.5">{entry.patientPhone}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {entry.specialty || "Qualquer especialidade"}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground italic">
                        {entry.pausedReason || "Busca ativa"}
                      </td>
                      <td className="px-6 py-4 text-xs"><span className={`font-bold uppercase px-1.5 py-0.5 rounded border ${(entry.pausedOrigin || "").startsWith("Agenda") ? "bg-violet-500/15 text-violet-400 border-violet-500/40" : "bg-sky-500/15 text-sky-400 border-sky-500/40"}`}>{entry.pausedOrigin || "Fila de Espera"}</span></td>
                      <td className="px-6 py-4 font-medium">
                        {entry.pausedAt ? formatDate(entry.pausedAt) : "—"}
                      </td>
                      <td className="px-6 py-4 text-xs whitespace-nowrap">{entry.pausedReturnDate ? (() => { const d = Math.round((new Date(entry.pausedReturnDate + "T12:00:00").getTime() - Date.now()) / 86_400_000); return <span className={d < 0 ? "text-red-400 font-bold" : d <= 7 ? "text-yellow-400 font-bold" : "text-foreground"}>{formatDate(entry.pausedReturnDate)}{d < 0 ? " · vencido" : d <= 7 ? (d <= 0 ? " · hoje" : ` · em ${d}d`) : ""}</span>; })() : <span className="text-muted-foreground">sem prazo</span>}</td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          variant="outline"
                          className="h-8 gap-1.5 text-xs border-sky-500/40 text-sky-300 hover:bg-sky-500/10"
                          onClick={() => handleUnpause(entry)}
                        >
                          <Undo2 className="w-3.5 h-3.5" /> Descongelar
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {pauseTarget && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <MotionCard className="w-full max-w-md p-6 overflow-visible border-sky-500/40" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold font-display flex items-center gap-2"><Snowflake className="w-5 h-5 text-sky-400" /> Busca ativa / pausa</h2>
                <p className="text-sm text-muted-foreground mt-1">{pauseTarget.patientName}{pauseTarget.specialty ? ` — ${pauseTarget.specialty}` : ""}. Sai da disputa por vaga, sem perder a data de entrada.</p>
              </div>
              <button type="button" onClick={() => setPauseTarget(null)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <Label>Motivo</Label>
                <Select value={pauseReason} onChange={e => setPauseReason(e.target.value)}>
                  {PAUSE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </Select>
                {pauseReason === "Outro" && (
                  <Input className="mt-2" placeholder="Descreva o motivo" value={pauseOther} onChange={e => setPauseOther(e.target.value)} autoFocus />
                )}
              </div>
              <div>
                <Label>Retorno previsto</Label>
                <Input type="date" value={pauseReturn} onChange={e => setPauseReturn(e.target.value)} />
                <p className="text-xs text-muted-foreground mt-1">Nessa data o paciente volta sozinho para a fila. Deixe em branco para sem prazo.</p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setPauseTarget(null)} disabled={pauseLoading}>Cancelar</Button>
                <Button onClick={confirmPause} disabled={pauseLoading} className="gap-1.5"><Snowflake className="w-4 h-4" /> {pauseLoading ? "Salvando…" : "Pausar"}</Button>
              </div>
            </div>
          </MotionCard>
        </div>
      )}

      {isDialogOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <MotionCard className="w-full max-w-md p-6 overflow-visible" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <h2 className="text-2xl font-bold font-display mb-1">Adicionar à Fila de Espera</h2>

            {/* Alternância: Triado (score automático) ou Manual (admin, sem triagem) */}
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-secondary/40 border border-border text-xs font-semibold mt-3 mb-4">
              <button
                type="button"
                onClick={() => { setManualMode(false); setFormPatientId(""); }}
                className={`py-2 rounded-lg transition-colors ${!manualMode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Paciente triado
              </button>
              <button
                type="button"
                onClick={() => { setManualMode(true); setFormPatientId(""); }}
                className={`py-2 rounded-lg transition-colors ${manualMode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Manual (admin)
              </button>
            </div>

            {!manualMode ? (
              <form onSubmit={handleAdd} className="space-y-4">
                <div>
                  <Label>Paciente (com triagem realizada)</Label>
                  <Select required value={formPatientId} onChange={e => setFormPatientId(e.target.value)}>
                    <option value="">Selecione um paciente triado...</option>
                    {eligiblePatients.map(p => {
                      const raw = p.triagemScore ?? 0;
                      const scoreClinico = Math.round((raw * 100) / 360);
                      return (
                        <option key={p.id} value={p.id}>
                          {p.name} — Score clínico: {scoreClinico}/100
                        </option>
                      );
                    })}
                  </Select>
                  {eligiblePatients.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1 font-semibold">
                      Nenhum paciente com triagem disponível. Use a aba "Manual (admin)" para inserir qualquer paciente.
                    </p>
                  )}
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold">
                  ✅ As especialidades são detectadas automaticamente pelas áreas pontuadas na triagem do paciente. A prioridade (Elevado / Moderado / Leve / Baixo) é calculada com base no score clínico e critérios de vulnerabilidade.
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <Button type="button" variant="ghost" onClick={() => { setIsDialogOpen(false); resetForm(); }}>Cancelar</Button>
                  <Button type="submit" disabled={adding || !formPatientId}>
                    {adding ? "Adicionando..." : "Confirmar e Adicionar"}
                  </Button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleAddManual} className="space-y-4">
                <div>
                  <Label>Buscar paciente (nome ou prontuário)</Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={manualSearch}
                      onChange={e => setManualSearch(e.target.value)}
                      placeholder="Digite para filtrar..."
                      className="w-full rounded-lg bg-secondary/40 border border-border pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60 transition-colors"
                    />
                  </div>
                </div>
                <div>
                  <Label>Paciente</Label>
                  <Select required value={formPatientId} onChange={e => setFormPatientId(e.target.value)}>
                    <option value="">Selecione um paciente...</option>
                    {manualEligible.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.prontuario ? ` — ${p.prontuario}` : ""}{p.status ? ` (${p.status})` : ""}
                      </option>
                    ))}
                  </Select>
                  {manualMatches.length > MANUAL_LIST_LIMIT && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Mostrando {MANUAL_LIST_LIMIT} de {manualMatches.length} pacientes — refine a busca acima.
                    </p>
                  )}
                  {manualMatches.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1 font-semibold">
                      Nenhum paciente encontrado. Pacientes acima de {MAX_AGE_FILA} anos e do Censo Municipal não entram na fila.
                    </p>
                  )}
                </div>
                <div>
                  <Label>Especialidade</Label>
                  <Select value={manualSpecialty} onChange={e => setManualSpecialty(e.target.value)}>
                    <option value="">Qualquer especialidade</option>
                    {SPECIALTIES.map(sp => (
                      <option key={sp} value={sp}>{sp}</option>
                    ))}
                  </Select>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-semibold">
                  Inserção administrativa: adiciona qualquer paciente à fila, mesmo sem triagem e mesmo que ele já esteja em atendimento em outra especialidade. A entrada é protegida da limpeza automática da fila e a prioridade fica como "Baixo" até a triagem ser feita.
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <Button type="button" variant="ghost" onClick={() => { setIsDialogOpen(false); resetForm(); }}>Cancelar</Button>
                  <Button type="submit" disabled={adding || !formPatientId}>
                    {adding ? "Adicionando..." : "Adicionar (Admin)"}
                  </Button>
                </div>
              </form>
            )}
          </MotionCard>
        </div>
      )}

      {saidaTarget && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <MotionCard className="w-full max-w-md p-6 overflow-visible" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <h2 className="text-2xl font-bold font-display mb-1">
              {saidaTipo === "Alta" ? "Dar Alta" : saidaTipo === "Desistência" ? "Registrar Desistência" : "Registrar Óbito"}
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Paciente: <strong className="text-foreground">{saidaTarget.patientName}</strong>. Isso remove o paciente da fila
              e dos agendamentos futuros, e grava o status no prontuário.
            </p>
            <div className="space-y-4">
              <div>
                <Label>
                  Motivo {saidaTipo !== "Óbito" ? <span className="text-destructive">*</span> : <span className="text-muted-foreground">(opcional)</span>}
                </Label>
                <textarea
                  value={saidaMotivo}
                  onChange={e => setSaidaMotivo(e.target.value)}
                  rows={3}
                  placeholder={saidaTipo === "Óbito" ? "Observação (opcional)" : "Descreva o motivo..."}
                  className="w-full rounded-lg bg-secondary/40 border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60 transition-colors resize-none"
                />
                {saidaTipo !== "Óbito" && !saidaMotivo.trim() && (
                  <p className="text-xs text-amber-600 mt-1 font-semibold">O motivo é obrigatório para {saidaTipo}.</p>
                )}
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <Button type="button" variant="ghost" onClick={() => { setSaidaTarget(null); setSaidaMotivo(""); }}>Cancelar</Button>
                <Button
                  type="button"
                  onClick={confirmSaida}
                  disabled={saidaLoading || (saidaTipo !== "Óbito" && !saidaMotivo.trim())}
                >
                  {saidaLoading ? "Registrando..." : `Confirmar ${saidaTipo}`}
                </Button>
              </div>
            </div>
          </MotionCard>
        </div>
      )}
    </div>
  );
}
