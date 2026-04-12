import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { X, Calendar, Clock, AlertCircle } from "lucide-react";
import { MotionCard, Button, Label, Select } from "@/components/ui-custom";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

type WaitingEntry = {
  id: number; patientId: number; patientName: string;
  patientProntuario?: string | null; priority: string;
};

type Props = {
  date: string; time: string;
  professionalId: number; professionalName: string;
  onClose: () => void; onSuccess: () => void;
};

const PRIORITY_COLORS: Record<string, string> = {
  alta: "bg-rose-100 text-rose-700 border-rose-200",
  media: "bg-amber-100 text-amber-700 border-amber-200",
  baixa: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const PRIORITY_LABELS: Record<string, string> = {
  alta: "ALTA",
  media: "MÉDIA",
  baixa: "BAIXA",
};

export default function BookingModal({ date, time, professionalId, professionalName, onClose, onSuccess }: Props) {
  const [waitingList, setWaitingList] = useState<WaitingEntry[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const queryClient = useQueryClient();

  useEffect(() => {
    fetch("/api/waiting-list")
      .then(r => r.json())
      .then(setWaitingList)
      .catch(console.error);
  }, []);

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
          fromWaitingList: true,
        }),
      });
      if (!res.ok) throw new Error("Falha ao criar agendamento");

      // Invalidar todos os módulos afetados → sincronização automática
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
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <MotionCard
        className="w-full max-w-md p-0 overflow-hidden shadow-2xl"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
      >
        {/* Header */}
        <div className="bg-primary p-6 text-primary-foreground">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-bold font-display">Agendar Paciente</h2>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/20 transition-colors">
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

        {/* Body */}
        <div className="p-6 space-y-5">
          <div>
            <Label className="mb-2 block font-semibold">
              Fila de Espera — Selecione o Paciente{" "}
              <span className="font-normal text-muted-foreground text-xs">(ordenada por prioridade)</span>
            </Label>
            {waitingList.length === 0 ? (
              <div className="text-center py-8 bg-secondary/30 rounded-xl border border-border flex flex-col items-center gap-2">
                <AlertCircle className="w-8 h-8 text-muted-foreground" />
                <p className="text-muted-foreground font-semibold">Fila de espera vazia</p>
                <p className="text-sm text-muted-foreground">Não há pacientes aguardando vaga.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {waitingList.map((e, idx) => (
                  <button
                    key={e.id}
                    onClick={() => setSelectedEntryId(String(e.id))}
                    className={cn(
                      "w-full text-left p-3 rounded-xl border-2 transition-all",
                      selectedEntryId === String(e.id)
                        ? "border-primary bg-primary/5"
                        : "border-border bg-white hover:border-primary/40 hover:bg-secondary/20"
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

          {selectedEntry && (
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 text-sm">
              <p className="font-bold text-foreground">{selectedEntry.patientName}</p>
              {selectedEntry.patientProntuario && (
                <p className="text-xs text-muted-foreground font-mono">{selectedEntry.patientProntuario}</p>
              )}
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                Ao confirmar: o paciente é <strong>removido da fila</strong>, seu status muda para <strong>Atendimento</strong> e o profissional <strong>{professionalName}</strong> é vinculado ao cadastro.
              </p>
            </div>
          )}

          {error && <p className="text-destructive text-sm font-semibold">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!selectedEntry || loading}>
              {loading ? "Agendando..." : "Confirmar Agendamento"}
            </Button>
          </div>
        </div>
      </MotionCard>
    </div>
  );
}
