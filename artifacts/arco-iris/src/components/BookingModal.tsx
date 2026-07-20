import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { X, Calendar, Clock, AlertCircle, Search, UserCog, ArrowRightLeft, ChevronDown, ChevronUp } from "lucide-react";
import { MotionCard, Button, Label } from "@/components/ui-custom";
import { listWaitingList, listPatients, createAppointments, listAppointments, deleteWaitingListEntry, listProfessionals, createNotificacao, type Patient } from "@/lib/arco-rpc";
import { supabase } from "@/lib/supabase";
import { cn, todayBR, formatDate } from "@/lib/utils";
import { specialtyKey } from "@/lib/specialty-colors";

type WaitingEntry = {
  id: number; patientId: number; patientName: string;
  patientProntuario?: string | null; priority: string;
  specialty?: string | null;
  notes?: string | null;
  referringProfessional?: string | null;
  paused?: boolean | null;
};

type Props = {
  date: string; time: string;
  professionalId: number; professionalName: string;
  professionalSpecialty?: string;
  adminMode?: boolean;
  onClose: () => void; onSuccess: () => void;
};

const PRIORITY_COLORS: Record<string, string> = {
  maxima: "badge-neon-pink",
  alta: "badge-neon-red",
  elevado: "badge-neon-red",
  moderado: "badge-neon-orange",
  media: "badge-neon-orange",
  leve: "badge-neon-blue",
  baixo: "badge-neon-green",
  baixa: "badge-neon-green",
};

const PRIORITY_LABELS: Record<string, string> = {
  maxima: "🔴 MÁXIMA",
  alta: "ALTA",
  elevado: "ALTA",
  moderado: "MÉDIA",
  media: "MÉDIA",
  leve: "LEVE",
  baixo: "BAIXA",
  baixa: "BAIXA",
};

const OPEN_SPECIALTIES = ["qualquer", "qualquer especialidade", "multidisciplinar", "todos", ""];

function matchesSpecialty(entrySpecialty: string | null | undefined, profSpecialty: string): boolean {
  if (!profSpecialty) return true;
  const s = (entrySpecialty ?? "").trim().toLowerCase();
  // Entries without specialty (null/empty) match any professional
  if (!s || OPEN_SPECIALTIES.includes(s)) return true;
  const entryKey = specialtyKey(entrySpecialty);
  const profKey = specialtyKey(profSpecialty);
  // If entry has a specialty but it doesn't map to a known key, do substring match
  if (entryKey === "default") {
    return s.includes(profSpecialty.trim().toLowerCase()) ||
      profSpecialty.trim().toLowerCase().includes(s);
  }
  // If the professional specialty is unknown, don't show entries with known specialties
  if (profKey === "default") {
    return false;
  }
  return entryKey === profKey;
}

// Compara duas especialidades de forma robusta (mesma chave de especialidade).
// Usado para escopar a trava "já agendado" por especialidade — puxar é
// independente por especialidade: ter horário em outra especialidade não bloqueia.
function isSameSpecialty(profSpecialty: string, otherSpecialty: string | null | undefined): boolean {
  const a = (profSpecialty ?? "").trim().toLowerCase();
  const b = (otherSpecialty ?? "").trim().toLowerCase();
  if (!a || !b) return false;
  const ak = specialtyKey(profSpecialty);
  const bk = specialtyKey(otherSpecialty ?? "");
  if (ak === "default" || bk === "default") {
    return a === b || a.includes(b) || b.includes(a);
  }
  return ak === bk;
}

const FREQUENCY_OPTIONS = [
  { value: "semanal",   label: "Semanal",   desc: "Toda semana — 52 sessões/ano", icon: "📅" },
  { value: "quinzenal", label: "Quinzenal", desc: "A cada 14 dias — Semana A e B", icon: "🔄" },
  { value: "mensal",    label: "Mensal",    desc: "Uma vez por mês — 13 sessões/ano", icon: "📆" },
];

export default function BookingModal({
  date, time, professionalId, professionalName, professionalSpecialty = "",
  adminMode = false, onClose, onSuccess,
}: Props) {
  const [waitingList, setWaitingList] = useState<WaitingEntry[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [alreadyScheduledIds, setAlreadyScheduledIds] = useState<Set<number>>(new Set());
  const [frequency, setFrequency] = useState<"semanal" | "quinzenal" | "mensal">("semanal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"fila" | "direto">(
    () => ((professionalSpecialty || "").toLowerCase().includes("parental") ? "direto" : "fila")
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  // Filtro de Disponibilidade: IDs de pacientes já agendados neste mesmo horário com QUALQUER profissional
  const [bookedAtSlotIds, setBookedAtSlotIds] = useState<Set<number>>(new Set());
  // Mapa professionalId → specialty para validação de duplicidade
  const [profSpecialtyMap, setProfSpecialtyMap] = useState<Map<number, string>>(new Map());
  const [notesExpanded, setNotesExpanded] = useState(false);

  // Psicologia Parental: a mãe/responsável passa na orientação no MESMO horário em
  // que a criança é atendida por outro profissional (ex.: Fisio). Como o prontuário
  // é o mesmo da criança, liberamos o conflito de horário cross-especialidade só
  // para esta especialidade.
  const isParentalBooking = (professionalSpecialty || "").toLowerCase().includes("parental");

  // Busca Direta liberada para o Admin e para a Psicologia Parental (atendimento
  // da mãe/responsável, sem fila por prioridade). Nos demais casos, só via fila.
  const allowDirect = adminMode || isParentalBooking;

  const loadData = useCallback(async () => {
    try {
      const list = await listWaitingList();
      setWaitingList(list.map(e => ({
        id: e.id,
        patientId: e.patientId,
        patientName: e.patientName,
        patientProntuario: e.patientProntuario ?? null,
        priority: e.priority,
        specialty: e.specialty ?? null,
        notes: e.notes ?? null,
        referringProfessional: e.professionalName ?? null,
        paused: e.paused ?? false,
      })));
    } catch (err) { console.error(err); }

    if (allowDirect) {
      listPatients().then(setPatients).catch(console.error);
    }

    // Carrega mapa de especialidades dos profissionais (necessário para escopar
    // a trava "já agendado" por especialidade).
    const specMap = new Map<number, string>();
    try {
      const profs = await listProfessionals();
      for (const p of profs) {
        if (p.specialty) specMap.set(p.id, p.specialty);
      }
      setProfSpecialtyMap(specMap);
    } catch (err) { console.error(err); }

    // Trava POR ESPECIALIDADE: carrega pacientes que já têm horário ativo futuro
    // com um profissional DA MESMA ESPECIALIDADE deste slot — esses não reaparecem
    // na fila desta especialidade (evita que dois profissionais da mesma
    // especialidade puxem o mesmo paciente). Ter agendamento em OUTRA especialidade
    // NÃO bloqueia: puxar é independente por especialidade.
    const today = new Date().toISOString().slice(0, 10);
    try {
      const apts = await listAppointments({ dateFrom: today });
      const ids = new Set<number>();
      const activeStatuses = ["agendado", "atendimento", "em_atendimento", "em atendimento", "presente"];
      for (const a of apts) {
        if (!activeStatuses.includes(a.status.toLowerCase())) continue;
        const aptSpec = a.professionalId === professionalId
          ? professionalSpecialty
          : (specMap.get(a.professionalId) ?? "");
        const sameSpec = professionalSpecialty
          ? isSameSpecialty(professionalSpecialty, aptSpec)
          : a.professionalId === professionalId;
        if (sameSpec) ids.add(a.patientId);
      }
      setAlreadyScheduledIds(ids);
    } catch (err) { console.error(err); }

    // Filtro de Disponibilidade: busca TODOS os agendamentos no mesmo dia
    // para identificar pacientes já agendados neste horário com qualquer profissional.
    try {
      const allAptsOnDate = await listAppointments({ date });
      const bookedIds = new Set<number>();
      for (const a of allAptsOnDate) {
        if (a.time === time && (a.status === "agendado" || a.status === "atendimento") && a.professionalId !== professionalId) {
          bookedIds.add(a.patientId);
        }
      }
      setBookedAtSlotIds(bookedIds);
    } catch (err) { console.error(err); }
  }, [adminMode, allowDirect, professionalId, professionalSpecialty, date, time]);

  useEffect(() => { void loadData(); }, [loadData]);

  // Atualização em Tempo Real: escuta mudanças na fila de espera e nos agendamentos
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!supabase) return;
    const scheduleReload = () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = setTimeout(() => { void loadData(); }, 400);
    };
    const channel = supabase
      .channel(`booking-modal-realtime-${professionalId}-${date}-${time}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "waiting_list" },
        scheduleReload
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        scheduleReload
      )
      .subscribe();
    // Fallback polling: garante sincronização mesmo se Realtime falhar.
    // O Realtime acima já recarrega em ~400ms a cada mudança, então este é só
    // uma rede de segurança — 30s evita refetch pesado (agendamentos/pacientes)
    // a cada 5s enquanto o modal está aberto.
    const pollInterval = setInterval(() => { void loadData(); }, 30_000);
    return () => {
      clearInterval(pollInterval);
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      void supabase?.removeChannel(channel);
    };
  }, [loadData, professionalId, date, time]);

  // Pacientes em busca ativa (congelados) nao entram na disputa por vaga.
  const matchedBySpec = waitingList.filter(e => !e.paused && matchesSpecialty(e.specialty, professionalSpecialty));
  // Filtro por ESPECIALIDADE: remove pacientes que já têm agendamento ativo com um
  // profissional DA MESMA ESPECIALIDADE (alreadyScheduledIds já vem escopado por
  // especialidade). Ter horário em outra especialidade NÃO oculta o paciente aqui.
  // Mantém também a trava física do mesmo horário (bookedAtSlotIds).
  const filteredList = matchedBySpec.filter(e => {
    if (!isParentalBooking && bookedAtSlotIds.has(e.patientId)) return false;
    if (alreadyScheduledIds.has(e.patientId)) return false;
    return true;
  });
  const nextPatient = filteredList[0] ?? null;
  const queueBlockedCount = matchedBySpec.length - filteredList.length;

  const directMatches = useMemo(() => {
    if (!allowDirect || mode !== "direto") return [];
    const term = searchTerm.trim().toLowerCase();
    const active = patients.filter(p => !["Alta", "Óbito", "Desistência"].includes(p.status ?? ""));
    if (!term) return active.slice(0, 30);
    return active.filter(p =>
      (p.name ?? "").toLowerCase().includes(term) ||
      (p.prontuario ?? "").toLowerCase().includes(term)
    ).slice(0, 30);
  }, [allowDirect, mode, patients, searchTerm]);

  const selectedDirectAlreadyScheduled =
    selectedPatientId != null && alreadyScheduledIds.has(selectedPatientId);
  const selectedDirectBookedAtSlot =
    selectedPatientId != null && bookedAtSlotIds.has(selectedPatientId);

  const selectedDirect = directMatches.find(p => p.id === selectedPatientId) ?? null;

  // Trava de antecedência: só permite agendar a partir de amanhã.
  // Bloqueia datas <= hoje (fuso de Brasília) em todos os módulos.
  const isPastOrToday = date <= todayBR();

  const handleSave = async () => {
    setError("");
    if (isPastOrToday) {
      setError(
        `Não é possível agendar para ${formatDate(date)} (hoje ou data passada). ` +
        `Escolha uma data a partir de amanhã.`
      );
      return;
    }
    const isDirect = allowDirect && mode === "direto";
    if (isDirect && !selectedDirect) { setError("Selecione um paciente."); return; }
    if (!isDirect && !nextPatient) return;

    const targetPatientId = isDirect ? selectedDirect!.id : nextPatient!.patientId;
    const targetPatientName = isDirect ? selectedDirect!.name : nextPatient!.patientName;
    // Trava final: nao permite agendar paciente que ja tem horario ativo
    // com QUALQUER profissional. Admin pode forçar em Busca Direta.
    if (alreadyScheduledIds.has(targetPatientId) && !isDirect) {
      setError(
        `${targetPatientName} já possui agendamento ativo nesta especialidade. ` +
        `Não é possível agendar novamente pela fila.`
      );
      return;
    }

    setLoading(true);
    try {
      // Re-validação global: verifica se o paciente foi agendado por outro
      // profissional enquanto o modal estava aberto.
      const todayStr = new Date().toISOString().slice(0, 10);
      const freshGlobalApts = await listAppointments({ patientId: targetPatientId, dateFrom: todayStr });
      const activeStatuses = ["agendado", "atendimento", "em_atendimento", "em atendimento", "presente"];
      // Re-validação POR ESPECIALIDADE: só bloqueia se o paciente já foi agendado
      // por um profissional da MESMA especialidade enquanto o modal estava aberto.
      const hasActiveSameSpec = freshGlobalApts.some(a => {
        if (!activeStatuses.includes(a.status.toLowerCase())) return false;
        const aptSpec = a.professionalId === professionalId
          ? professionalSpecialty
          : (profSpecialtyMap.get(a.professionalId) ?? "");
        return professionalSpecialty
          ? isSameSpecialty(professionalSpecialty, aptSpec)
          : a.professionalId === professionalId;
      });
      if (hasActiveSameSpec && !isDirect) {
        setError(
          `${targetPatientName} já foi agendado por outro profissional desta especialidade. ` +
          `A lista será atualizada automaticamente.`
        );
        void loadData();
        setLoading(false);
        return;
      }

      // Bloqueio de Duplicidade: re-valida se o paciente ainda está disponível
      // neste horário antes de confirmar.
      const freshApts = await listAppointments({ date });
      const slotConflicts = freshApts.filter(
        a => a.patientId === targetPatientId && a.time === time &&
             (a.status === "agendado" || a.status === "atendimento")
      );
      // Psicologia Parental: permite o mesmo horário com OUTRO profissional
      // (a criança em terapia + a mãe na orientação). Só bloqueia duplicata
      // exata com o MESMO profissional parental.
      const alreadyTaken = isParentalBooking
        ? slotConflicts.some(a => a.professionalId === professionalId)
        : slotConflicts.length > 0;
      if (alreadyTaken) {
        setError(
          `${targetPatientName} já foi puxado por outro profissional para este horário. ` +
          `A lista será atualizada automaticamente.`
        );
        void loadData();
        setLoading(false);
        return;
      }

      await createAppointments({
        patientId: targetPatientId,
        professionalId,
        date,
        time,
        frequency,
        fromWaitingList: !isDirect,
      });

      // Notificação para o sininho da Recepção: novo agendamento criado
      try {
        const patientPhone = isDirect ? selectedDirect!.phone ?? null : null;
        await createNotificacao({
          patientName: targetPatientName,
          professionalName: professionalName,
          acao: "Novo Agendamento",
          dataConsulta: date,
          horaConsulta: time,
          patientPhone: patientPhone ?? undefined,
        });
      } catch { /* silencioso — notificação não deve bloquear agendamento */ }

      // Trigger de Remoção: ao agendar, remove o paciente da fila de espera da
      // mesma especialidade. Busca a fila atualizada para garantir que não fique
      // "suja" com pacientes já agendados.
      try {
        const currentFila = await listWaitingList();
        const entriesToRemove = currentFila.filter(e => {
          if (e.patientId !== targetPatientId) return false;
          // Puxou da fila: remove SEMPRE a entrada exata que foi puxada
          // (garante que o paciente saia da fila mesmo se a especialidade do
          // profissional vier vazia). Em qualquer caso, remove também as
          // entradas da mesma especialidade do profissional.
          if (!isDirect && nextPatient && e.id === nextPatient.id) return true;
          if (professionalSpecialty) return matchesSpecialty(e.specialty, professionalSpecialty);
          return false;
        });
        for (const entry of entriesToRemove) {
          try { await deleteWaitingListEntry(entry.id); } catch { /* silencioso */ }
        }
      } catch { /* se falhar a limpeza da fila, não bloqueia o agendamento */ }

      onSuccess();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro inesperado";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const formattedDate = format(new Date(date + "T12:00:00"), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  return (
    <div
      className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <MotionCard
        className="w-full max-w-md p-0 overflow-hidden shadow-2xl flex flex-col"
        style={{ maxHeight: "90vh" }}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="bg-primary p-5 text-primary-foreground shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-bold font-display">Agendar Paciente</h2>
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/40 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex flex-col gap-1 text-sm opacity-90">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span className="capitalize">{formattedDate}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span>{time} – {professionalName}</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {isPastOrToday && (
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Agendamentos só são permitidos a partir de amanhã. Esta data ({formatDate(date)})
                é hoje ou já passou — escolha um dia futuro na agenda.
              </span>
            </div>
          )}
          {allowDirect && (
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-secondary/40 border border-border text-xs font-semibold">
              <button
                type="button"
                onClick={() => { setMode("fila"); setError(""); }}
                className={cn(
                  "flex items-center justify-center gap-2 py-2 rounded-lg transition-all",
                  mode === "fila" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <AlertCircle className="w-3.5 h-3.5" /> Fila de Espera
              </button>
              <button
                type="button"
                onClick={() => { setMode("direto"); setError(""); }}
                className={cn(
                  "flex items-center justify-center gap-2 py-2 rounded-lg transition-all",
                  mode === "direto" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <UserCog className="w-3.5 h-3.5" /> {adminMode ? "Admin — Busca Direta" : "Busca Direta"}
              </button>
            </div>
          )}

          {(!allowDirect || mode === "fila") && (
            <div>
              <Label className="mb-2 block font-semibold">
                Próximo da Fila de Espera
                {filteredList.length > 1 && (
                  <span className="ml-2 font-normal text-muted-foreground text-xs">
                    ({filteredList.length} pacientes aguardando)
                  </span>
                )}
              </Label>

              {!nextPatient ? (
                <div className="text-center py-8 bg-secondary/30 rounded-xl border border-border flex flex-col items-center gap-2">
                  <AlertCircle className="w-8 h-8 text-muted-foreground" />
                  <p className="text-muted-foreground font-semibold">
                    {waitingList.length === 0
                      ? "Fila de espera vazia"
                      : queueBlockedCount > 0
                        ? `Todos os pacientes na fila já possuem agendamento ativo nesta especialidade`
                        : `Nenhum paciente de ${professionalSpecialty} na fila`}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {waitingList.length === 0
                      ? "Não há pacientes aguardando vaga."
                      : queueBlockedCount > 0
                        ? `${queueBlockedCount} paciente(s) oculto(s) pois já possuem agendamento ativo nesta especialidade.`
                        : "Pacientes de outras especialidades foram filtrados."}
                  </p>
                  {allowDirect && (
                    <p className="text-xs text-primary mt-1">Use a aba "Busca Direta" para agendar qualquer paciente.</p>
                  )}
                </div>
              ) : (
                <div className="w-full p-4 rounded-xl border-2 border-primary bg-primary/5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center shrink-0">
                        <span className="text-xs font-black text-primary">#1</span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-base text-foreground truncate">{nextPatient.patientName}</p>
                        {nextPatient.patientProntuario && (
                          <p className="text-xs text-muted-foreground font-mono mt-0.5">{nextPatient.patientProntuario}</p>
                        )}
                      </div>
                    </div>
                    <span className={cn("px-2.5 py-1 rounded-full text-[10px] font-bold border shrink-0", PRIORITY_COLORS[nextPatient.priority])}>
                      {PRIORITY_LABELS[nextPatient.priority] || nextPatient.priority.toUpperCase()}
                    </span>
                  </div>
                  {/* Encaminhamento Interno info */}
                  {nextPatient.notes && (
                    <div className="mt-3 rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/5 p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <ArrowRightLeft className="w-3.5 h-3.5 text-fuchsia-400 shrink-0" />
                        <span className="text-xs font-bold text-fuchsia-400">
                          {nextPatient.referringProfessional
                            ? `Encaminhamento Interno — ${nextPatient.referringProfessional}`
                            : "Observação da Fila"}
                        </span>
                      </div>
                      <div className="relative">
                        <p className={cn(
                          "text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed",
                          !notesExpanded && nextPatient.notes.length > 120 && "line-clamp-2"
                        )}>
                          {nextPatient.notes}
                        </p>
                        {nextPatient.notes.length > 120 && (
                          <button
                            type="button"
                            onClick={() => setNotesExpanded(v => !v)}
                            className="flex items-center gap-1 text-[10px] font-semibold text-fuchsia-400 hover:text-fuchsia-300 mt-1 transition-colors"
                          >
                            {notesExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            {notesExpanded ? "Recolher" : "Ler mais"}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {allowDirect && mode === "direto" && (
            <div>
              <Label className="mb-2 block font-semibold">
                Buscar paciente (nome ou prontuário)
              </Label>
              <div className="relative mb-3">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  type="search"
                  autoFocus
                  value={searchTerm}
                  onChange={e => { setSearchTerm(e.target.value); setSelectedPatientId(null); }}
                  placeholder="Ex: Maria, 500, PRT-0012…"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-background/60 text-sm outline-none focus:border-primary transition"
                />
              </div>
              <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                {directMatches.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    {searchTerm ? "Nenhum paciente encontrado." : "Digite para buscar…"}
                  </p>
                ) : (
                  directMatches.map(p => {
                    const isSel = selectedPatientId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPatientId(p.id)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-lg border text-sm transition-all flex items-center justify-between gap-3",
                          isSel
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border bg-secondary/30 hover:border-primary/40 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <span className="flex flex-col min-w-0">
                          <span className="font-semibold text-foreground truncate">{p.name}</span>
                          {p.prontuario && (
                            <span className="text-[10px] font-mono text-muted-foreground">{p.prontuario}</span>
                          )}
                        </span>
                        {p.status && p.status !== "Ativo" && (
                          <span className="text-[10px] text-amber-500">{p.status}</span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
              {selectedDirect && (
                <p className="mt-3 text-xs text-primary font-semibold">
                  Selecionado: {selectedDirect.name} — agendamento direto (ignora a fila).
                </p>
              )}
              {selectedDirect && selectedDirectBookedAtSlot && !isParentalBooking && (
                <p className="mt-2 text-xs font-semibold text-red-500 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  {selectedDirect.name} já está agendado neste horário ({time}) com outro profissional.
                </p>
              )}
              {selectedDirect && selectedDirectBookedAtSlot && isParentalBooking && (
                <p className="mt-2 text-xs font-semibold text-cyan-500 bg-cyan-500/10 border border-cyan-500/30 rounded-lg px-3 py-2">
                  {selectedDirect.name} tem atendimento neste horário ({time}) com outro profissional — permitido na Psicologia Parental (orientação à mãe/responsável).
                </p>
              )}
              {selectedDirect && selectedDirectAlreadyScheduled && !selectedDirectBookedAtSlot && (
                <p className="mt-2 text-xs font-semibold text-amber-600 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                  Atenção: {selectedDirect.name} já tem horário ativo com {professionalName}.{" "}
                  {isParentalBooking
                    ? "Na Psicologia Parental é permitido agendar mesmo assim."
                    : "Só o administrador pode adicionar um segundo horário."}
                </p>
              )}
            </div>
          )}

          <div>
            <Label className="mb-2 block font-semibold">Frequência de Atendimento</Label>
            <div className="grid grid-cols-3 gap-2">
              {FREQUENCY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFrequency(opt.value as any)}
                  className={cn(
                    "flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-center transition-all text-xs",
                    frequency === opt.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-secondary/30 text-muted-foreground hover:border-primary/40"
                  )}
                >
                  <span className="text-lg leading-none">{opt.icon}</span>
                  <span className="font-bold text-xs">{opt.label}</span>
                  <span className="text-[10px] leading-tight opacity-70">{opt.desc}</span>
                </button>
              ))}
            </div>
            {frequency === "quinzenal" && (
              <p className="mt-2 text-xs text-muted-foreground px-1">
                🔄 O sistema alternará automaticamente entre <strong>Semana A</strong> e <strong>Semana B</strong> a cada 14 dias.
              </p>
            )}
            {frequency === "mensal" && (
              <p className="mt-2 text-xs text-muted-foreground px-1">
                📆 Agendamento mensal — ideal para Nutrição e Fonoaudiologia de manutenção.
              </p>
            )}
          </div>

          {((mode === "fila" && nextPatient) || (mode === "direto" && selectedDirect)) && (
            <div className="p-3 rounded-xl bg-secondary/40 border border-border text-xs text-muted-foreground leading-relaxed">
              Ao confirmar: <strong className="text-foreground">
                {mode === "direto" ? selectedDirect!.name : nextPatient!.patientName}
              </strong>{" "}
              {mode === "direto"
                ? <>é agendado diretamente com <strong>{professionalName}</strong> (sem passar pela fila).</>
                : <>é <strong>removido da fila</strong>, status muda para <strong>Atendimento</strong>, profissional <strong>{professionalName}</strong> vinculado.</>
              }
              {frequency !== "semanal" && <span className="ml-1">Frequência: <strong>{FREQUENCY_OPTIONS.find(o => o.value === frequency)?.label}</strong>.</span>}
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <div className="shrink-0 px-6 py-4 border-t border-border flex justify-end gap-3 bg-background/60">
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button
            onClick={handleSave}
            disabled={
              loading ||
              isPastOrToday ||
              (mode === "fila" && !nextPatient) ||
              (mode === "direto" && !selectedDirect)
            }
          >
            {loading ? "Agendando…" : isPastOrToday ? "Data indisponível" : mode === "direto" ? (adminMode ? "Agendar (Admin)" : "Agendar") : "Confirmar"}
          </Button>
        </div>
      </MotionCard>
    </div>
  );
}
