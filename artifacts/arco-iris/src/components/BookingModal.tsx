import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { X, Calendar, Clock } from "lucide-react";
import { MotionCard, Button, Label, Select } from "@/components/ui-custom";

type WaitingEntry = {
  id: number; patientId: number; patientName: string;
  patientProntuario?: string | null; priority: string;
};

type Props = {
  date: string; time: string;
  professionalId: number; professionalName: string;
  onClose: () => void; onSuccess: () => void;
};

export default function BookingModal({ date, time, professionalId, professionalName, onClose, onSuccess }: Props) {
  const [waitingList, setWaitingList] = useState<WaitingEntry[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
            <Label className="mb-2 block font-semibold">Selecionar da Fila de Espera</Label>
            {waitingList.length === 0 ? (
              <div className="text-center py-6 bg-secondary/30 rounded-xl border border-border">
                <p className="text-muted-foreground font-semibold">Fila de espera vazia</p>
                <p className="text-sm text-muted-foreground">Não há pacientes aguardando vaga.</p>
              </div>
            ) : (
              <Select value={selectedEntryId} onChange={e => setSelectedEntryId(e.target.value)}>
                <option value="">Escolha um paciente da fila...</option>
                {waitingList.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.patientName}{e.patientProntuario ? ` (${e.patientProntuario})` : ""} — {e.priority.toUpperCase()}
                  </option>
                ))}
              </Select>
            )}
          </div>

          {selectedEntry && (
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
              <p className="font-bold text-foreground">{selectedEntry.patientName}</p>
              {selectedEntry.patientProntuario && (
                <p className="text-xs text-muted-foreground font-mono">{selectedEntry.patientProntuario}</p>
              )}
              <p className="text-sm text-muted-foreground mt-1">
                Após confirmar, o paciente será removido da fila e seu status será alterado para <strong>Atendimento</strong>.
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
