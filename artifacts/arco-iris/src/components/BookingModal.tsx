import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { X, Calendar, Clock, AlertCircle } from "lucide-react";
import { MotionCard, Button, Label } from "@/components/ui-custom";
import { listWaitingList, createAppointments } from "@/lib/arco-rpc";
import { cn } from "@/lib/utils";

type WaitingEntry = {
  id: number; patientId: number; patientName: string;
  patientProntuario?: string | null; priority: string;
  specialty?: string | null;
};

type Props = {
  date: string; time: string;
  professionalId: number; professionalName: string;
  professionalSpecialty?: string;
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
  return s.includes(profSpecialty.trim().toLowerCase()) ||
    profSpecialty.trim().toLowerCase().includes(s);
}

const FREQUENCY_OPTIONS = [
  { value: "semanal",   label: "Semanal",   desc: "Toda semana — 52 sessões/ano", icon: "📅" },
  { value: "quinzenal", label: "Quinzenal", desc: "A cada 14 dias — Semana A e B", icon: "🔄" },
  { value: "mensal",    label: "Mensal",    desc: "Uma vez por mês — 13 sessões/ano", icon: "📆" },
];

export default function BookingModal({ date, time, professionalId, professionalName, professionalSpecialty = "", onClose, onSuccess }: Props) {
  const [waitingList, setWaitingList] = useState<WaitingEntry[]>([]);
  const [frequency, setFrequency] = useState<"semanal" | "quinzenal" | "mensal">("semanal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listWaitingList()
      .then((list) => setWaitingList(list.map(e => ({
        id: e.id,
        patientId: e.patientId,
        patientName: e.patientName,
        patientProntuario: e.patientProntuario ?? null,
        priority: e.priority,
        specialty: e.specialty ?? null,
      }))))
      .catch(console.error);
  }, []);

  const filteredList = waitingList.filter(e => matchesSpecialty(e.specialty, professionalSpecialty));
  // Apenas o primeiro da fila é exibido — impede escolha por perfil do paciente
  const nextPatient = filteredList[0] ?? null;

  const handleSave = async () => {
    if (!nextPatient) return;
    setLoading(true);
    setError("");
    try {
      await createAppointments({
        patientId: nextPatient.patientId,
        professionalId,
        date,
        time,
        frequency,
        fromWaitingList: true,
      });
      onSuccess();
    } catch (e: any) {
      setError(e?.message || "Erro inesperado");
    } finally {
      setLoading(false);
    }
  };

  const formattedDate = format(new Date(date + "T12:00:00"), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  return (
    /* Backdrop — clique fora fecha o modal */
    <div
      className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Card — stopPropagation evita que o clique interno feche o modal */}
      <MotionCard
        className="w-full max-w-md p-0 overflow-hidden shadow-2xl flex flex-col"
        style={{ maxHeight: "90vh" }}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {/* ── Header fixo (não rola) ───────────────────────────────── */}
        <div className="bg-primary p-5 text-primary-foreground shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-bold font-display">Agendar Paciente</h2>
            {/* Botão X bem visível */}
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

        {/* ── Corpo com rolagem ────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Próximo da Fila — exibição somente do #1, sem escolha */}
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
                    : `Nenhum paciente de ${professionalSpecialty} na fila`}
                </p>
                <p className="text-sm text-muted-foreground">
                  {waitingList.length === 0
                    ? "Não há pacientes aguardando vaga."
                    : "Pacientes de outras especialidades foram filtrados."}
                </p>
              </div>
            ) : (
              /* Card do único paciente exibido — não é clicável, não há escolha */
              <div className="w-full p-4 rounded-xl border-2 border-primary bg-primary/5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Badge de posição na fila */}
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

          {/* Frequência de atendimento */}
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

          {nextPatient && (
            <div className="p-3 rounded-xl bg-secondary/40 border border-border text-xs text-muted-foreground leading-relaxed">
              Ao confirmar: <strong className="text-foreground">{nextPatient.patientName}</strong> é <strong>removido da fila</strong>, status muda para <strong>Atendimento</strong>, profissional <strong>{professionalName}</strong> vinculado.
              {frequency !== "semanal" && <span className="ml-1">Frequência: <strong>{FREQUENCY_OPTIONS.find(o => o.value === frequency)?.label}</strong>.</span>}
            </div>
          )}

          {error && <p className="text-destructive text-sm font-semibold">{error}</p>}
        </div>

        {/* ── Rodapé fixo (não rola) com botões sempre visíveis ───── */}
        <div className="shrink-0 flex justify-end gap-3 px-6 py-4 border-t border-border bg-card">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!nextPatient || loading}>
            {loading ? "Agendando..." : "Confirmar Agendamento"}
          </Button>
        </div>
      </MotionCard>
    </div>
  );
}
