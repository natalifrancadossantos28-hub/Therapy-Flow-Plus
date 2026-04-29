import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { X, Calendar, Clock, AlertCircle, Search, UserCog } from "lucide-react";
import { MotionCard, Button, Label } from "@/components/ui-custom";
import { listWaitingList, listPatients, createAppointments, listAppointments, deleteWaitingListEntry, listProfessionals, type Patient } from "@/lib/arco-rpc";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { specialtyKey } from "@/lib/specialty-colors";

type WaitingEntry = {
  id: number; patientId: number; patientName: string;
  patientProntuario?: string | null; priority: string;
  specialty?: string | null;
};

type Props = {
  date: string; time: string;
  professionalId: number; professionalName: string;
  professionalSpecialty?: string;
  adminMode?: boolean;
  onClose: () => void; onSuccess: () => void;
};

const PRIORITY_COLORS: Record<string, string> = {
  alta: "badge-neon-red",
  media: "badge-neon-orange",
  baixa: "badge-neon-green",
};

const PRIORITY_LABELS: Record<string, string> = {
  alta: "ALTA",
  media: "MÉDIA",
  baixa: "BAIXA",
};

const OPEN_SPECIALTIES = ["qualquer", "qualquer especialidade", "multidisciplinar", "todos", ""];

function matchesSpecialty(entrySpecialty: string | null | undefined, profSpecialty: string): boolean {
  if (!profSpecialty) return true;
  const s = (entrySpecialty ?? "").trim().toLowerCase();
  if (OPEN_SPECIALTIES.includes(s)) return true;
  const entryKey = specialtyKey(entrySpecialty);
  const profKey = specialtyKey(profSpecialty);
  if (entryKey === "default" || profKey === "default") {
    return s.includes(profSpecialty.trim().toLowerCase()) ||
      profSpecialty.trim().toLowerCase().includes(s);
  }
  return entryKey === profKey;
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
  const [mode, setMode] = useState<"fila" | "direto">("fila");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  // Filtro de Disponibilidade: IDs de pacientes já agendados neste mesmo horário com QUALQUER profissional
  const [bookedAtSlotIds, setBookedAtSlotIds] = useState<Set<number>>(new Set());
  // Mapa professionalId → specialty para validação de duplicidade
  const [profSpecialtyMap, setProfSpecialtyMap] = useState<Map<number, string>>(new Map());

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
      })));
    } catch (err) { console.error(err); }

    if (adminMode) {
      listPatients().then(setPatients).catch(console.error);
    }

    // Trava de selecao: carrega pacientes que ja tem horario ativo futuro
    // com esse profissional para nao aparecerem como "disponiveis".
    const today = new Date().toISOString().slice(0, 10);
    try {
      const apts = await listAppointments({ professionalId, dateFrom: today });
      const ids = new Set<number>();
      for (const a of apts) {
        if (a.status === "agendado" || a.status === "em_atendimento") {
          ids.add(a.patientId);
        }
      }
      setAlreadyScheduledIds(ids);
    } catch (err) { console.error(err); }

    // Carrega mapa de especialidades dos profissionais para validação de duplicidade
    try {
      const profs = await listProfessionals();
      const map = new Map<number, string>();
      for (const p of profs) {
        if (p.specialty) map.set(p.id, p.specialty);
      }
      setProfSpecialtyMap(map);
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
  }, [adminMode, professionalId, date, time]);

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
      .channel("booking-modal-realtime")
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
    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [loadData]);

  const matchedBySpec = waitingList.filter(e => matchesSpecialty(e.specialty, professionalSpecialty));
  // Filtro de Disponibilidade: remove pacientes já agendados neste horário com outro profissional.
  // No Portal do Profissional (adminMode=false) também remove quem já tem horário com ESTE profissional.
  const filteredList = matchedBySpec.filter(e => {
    if (bookedAtSlotIds.has(e.patientId)) return false;
    if (!adminMode && alreadyScheduledIds.has(e.patientId)) return false;
    return true;
  });
  const nextPatient = filteredList[0] ?? null;
  const queueBlockedCount = matchedBySpec.length - filteredList.length;

  const directMatches = useMemo(() => {
    if (!adminMode || mode !== "direto") return [];
    const term = searchTerm.trim().toLowerCase();
    const active = patients.filter(p => !["Alta", "Óbito", "Desistência"].includes(p.status ?? ""));
    if (!term) return active.slice(0, 30);
    return active.filter(p =>
      (p.name ?? "").toLowerCase().includes(term) ||
      (p.prontuario ?? "").toLowerCase().includes(term)
    ).slice(0, 30);
  }, [adminMode, mode, patients, searchTerm]);

  const selectedDirectAlreadyScheduled =
    selectedPatientId != null && alreadyScheduledIds.has(selectedPatientId);
  const selectedDirectBookedAtSlot =
    selectedPatientId != null && bookedAtSlotIds.has(selectedPatientId);

  const selectedDirect = directMatches.find(p => p.id === selectedPatientId) ?? null;

  const handleSave = async () => {
    setError("");
    const isDirect = adminMode && mode === "direto";
    if (isDirect && !selectedDirect) { setError("Selecione um paciente."); return; }
    if (!isDirect && !nextPatient) return;

    const targetPatientId = isDirect ? selectedDirect!.id : nextPatient!.patientId;
    const targetPatientName = isDirect ? selectedDirect!.name : nextPatient!.patientName;
    // Trava final: no Portal do Profissional, nao permite agendar paciente
    // que ja tem horario ativo com esse profissional. Admin (adminMode=true)
    // passa direto e pode adicionar 2o/3o horario.
    if (!adminMode && alreadyScheduledIds.has(targetPatientId)) {
      setError(
        `${targetPatientName} já tem horário ativo com você. Solicite à Recepção para agendar um segundo horário.`
      );
      return;
    }

    setLoading(true);
    try {
      // Bloqueio de Duplicidade: re-valida se o paciente ainda está disponível
      // neste horário antes de confirmar. Protege contra dois profissionais
      // clicando no mesmo paciente ao mesmo tempo.
      const freshApts = await listAppointments({ date });
      const alreadyTaken = freshApts.some(
        a => a.patientId === targetPatientId && a.time === time &&
             (a.status === "agendado" || a.status === "atendimento")
      );
      if (alreadyTaken) {
        setError(
          `${targetPatientName} já foi puxado por outro profissional para este horário. ` +
          `A lista será atualizada automaticamente.`
        );
        void loadData();
        setLoading(false);
        return;
      }

      // Validação de Duplicidade por Especialidade: impede novo agendamento
      // para o mesmo paciente se já tem agendamento ativo/recorrente com
      // qualquer profissional da mesma especialidade.
      if (professionalSpecialty) {
        const today = new Date().toISOString().slice(0, 10);
        const patientApts = await listAppointments({ patientId: targetPatientId, dateFrom: today });
        const hasActiveInSpecialty = patientApts.some(a => {
          if (a.status !== "agendado" && a.status !== "atendimento") return false;
          const aptSpec = profSpecialtyMap.get(a.professionalId) ?? "";
          return aptSpec.trim().toLowerCase() === professionalSpecialty.trim().toLowerCase();
        });
        if (hasActiveInSpecialty) {
          setError(
            `${targetPatientName} já possui um agendamento ativo/recorrente em ${professionalSpecialty}. ` +
            `Não é possível criar outro agendamento para a mesma especialidade.`
          );
          setLoading(false);
          return;
        }
      }

      await createAppointments({
        patientId: targetPatientId,
        professionalId,
        date,
        time,
        frequency,
        fromWaitingList: !isDirect,
      });

      // Trigger de Remoção: ao agendar da fila, remove o paciente da fila de espera
      // para a especialidade correspondente. Busca TODAS as entradas desse paciente
      // que correspondem à especialidade do profissional e remove.
      if (!isDirect && nextPatient) {
        const entriesToRemove = waitingList.filter(
          e => e.patientId === targetPatientId &&
               matchesSpecialty(e.specialty, professionalSpecialty)
        );
        for (const entry of entriesToRemove) {
          try { await deleteWaitingListEntry(entry.id); } catch { /* silencioso */ }
        }
      }

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
          {adminMode && (
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
                <UserCog className="w-3.5 h-3.5" /> Admin — Busca Direta
              </button>
            </div>
          )}

          {(!adminMode || mode === "fila") && (
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
                        ? `Todos os pacientes de ${professionalSpecialty} na fila já têm horário com você`
                        : `Nenhum paciente de ${professionalSpecialty} na fila`}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {waitingList.length === 0
                      ? "Não há pacientes aguardando vaga."
                      : queueBlockedCount > 0
                        ? "Fale com a Recepção se precisar de um segundo horário para o mesmo paciente."
                        : "Pacientes de outras especialidades foram filtrados."}
                  </p>
                  {adminMode && (
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
                </div>
              )}
            </div>
          )}

          {adminMode && mode === "direto" && (
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
              {selectedDirect && selectedDirectBookedAtSlot && (
                <p className="mt-2 text-xs font-semibold text-red-500 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  {selectedDirect.name} já está agendado neste horário ({time}) com outro profissional.
                </p>
              )}
              {selectedDirect && selectedDirectAlreadyScheduled && !selectedDirectBookedAtSlot && (
                <p className="mt-2 text-xs font-semibold text-amber-600 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                  Atenção: {selectedDirect.name} já tem horário ativo com {professionalName}. Só o administrador pode adicionar um segundo horário.
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
              (mode === "fila" && !nextPatient) ||
              (mode === "direto" && !selectedDirect)
            }
          >
            {loading ? "Agendando…" : mode === "direto" ? "Agendar (Admin)" : "Confirmar"}
          </Button>
        </div>
      </MotionCard>
    </div>
  );
}
