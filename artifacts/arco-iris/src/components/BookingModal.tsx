import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { X, Calendar, Clock, AlertCircle } from "lucide-react";
import { MotionCard, Button, Label } from "@/components/ui-custom";
import { useQueryClient } from "@tanstack/react-query";
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
  const [selectedEntryId, setSelectedEntryId] = useState("");
  const [frequency, setFrequency] = useState<"semanal" | "quinzenal" | "mensal">("semanal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const queryClient = useQueryClient();

  useEffect(() => {
    fetch("/api/waiting-list")
      .then(r => r.json())
      .then(setWaitingList)
      .catch(console.error);
  }, []);

  const filteredList = waitingList.filter(e => matchesSpecialty(e.specialty, professionalSpecialty));
  const hiddenCount = waitingList.length - filteredList.length;
  const selectedEntry = waitingList.find(e => String(e.id) === selectedEntryId);

  const handleSave = async () => {
    if (!selectedEntry) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: selectedEntry.patientId,
          professionalId,
          date,
          time,
          frequency,
          fromWaitingList: true,
        }),
      });
      if (!res.ok) throw new Error("Falha ao criar agendamento");

      await queryClient.invalidateQueries({ queryKey: ["/api/waiting-list"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/appointments/today"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/professionals"] });

      onSuccess();
    } catch (e: any) {
      setError(e.message || "Erro inesperado");
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

          {/* Fila de Espera */}
          <div>
            <Label className="mb-2 block font-semibold">
              Fila de Espera — Selecione o Paciente{" "}
              <span className="font-normal text-muted-foreground text-xs">(ordenada por prioridade)</span>
            </Label>
            {professionalSpecialty && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20 text-xs text-muted-foreground flex items-center gap-2">
                <span className="font-bold text-primary">Filtro ativo:</span>
                <span>{professionalSpecialty}</span>
                {hiddenCount > 0 && (
                  <span className="ml-auto text-amber-600 font-semibold">
                    {hiddenCount} paciente{hiddenCount > 1 ? "s" : ""} de outra especialidade ocultado{hiddenCount > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            )}
            {filteredList.length === 0 ? (
              <div className="text-center py-8 bg-secondary/30 rounded-xl border border-border flex flex-col items-center gap-2">
                <AlertCircle className="w-8 h-8 text-muted-foreground" />
                <p className="text-muted-foreground font-semibold">
                  {waitingList.length === 0 ? "Fila de espera vazia" : `Nenhum paciente de ${professionalSpecialty} na fila`}
                </p>
                <p className="text-sm text-muted-foreground">
                  {waitingList.length === 0
                    ? "Não há pacientes aguardando vaga."
                    : "Pacientes de outras especialidades foram filtrados."}
                </p>
              </div>
            ) : (
              /* Lista de pacientes — scroll próprio dentro do corpo já rolável */
              <div className="space-y-2">
                {filteredList.map((e, idx) => (
                  <button
                    key={e.id}
                    onClick={() => setSelectedEntryId(String(e.id))}
                    className={cn(
                      "w-full text-left p-3 rounded-xl border-2 transition-all",
                      selectedEntryId === String(e.id)
                        ? "border-primary bg-primary/5"
                        : "border-border bg-secondary/30 hover:border-primary/40 hover:bg-secondary/50"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">#{idx + 1}</span>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-foreground truncate">{e.patientName}</p>
                          {e.patientProntuario && (
                            <p className="text-xs text-muted-foreground font-mono">{e.patientProntuario}</p>
                          )}
                        </div>
                      </div>
                      <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0", PRIORITY_COLORS[e.priority])}>
                        {PRIORITY_LABELS[e.priority] || e.priority.toUpperCase()}
                      </span>
                    </div>
                  </button>
                ))}
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

          {selectedEntry && (
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 text-sm">
              <p className="font-bold text-foreground">{selectedEntry.patientName}</p>
              {selectedEntry.patientProntuario && (
                <p className="text-xs text-muted-foreground font-mono">{selectedEntry.patientProntuario}</p>
              )}
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                Ao confirmar: o paciente é <strong>removido da fila</strong>, status muda para <strong>Atendimento</strong>, profissional <strong>{professionalName}</strong> vinculado.
                {frequency !== "semanal" && <span className="ml-1">Frequência: <strong>{FREQUENCY_OPTIONS.find(o => o.value === frequency)?.label}</strong>.</span>}
              </p>
            </div>
          )}

          {error && <p className="text-destructive text-sm font-semibold">{error}</p>}
        </div>

        {/* ── Rodapé fixo (não rola) com botões sempre visíveis ───── */}
        <div className="shrink-0 flex justify-end gap-3 px-6 py-4 border-t border-border bg-card">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!selectedEntry || loading}>
            {loading ? "Agendando..." : "Confirmar Agendamento"}
          </Button>
        </div>
      </MotionCard>
    </div>
  );
}
