import { useState } from "react";
import { useGetWaitingList, useCreateWaitingListEntry, useDeleteWaitingListEntry, useGetPatients, useGetProfessionals } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, MotionCard, Button, Badge, Input, Label, Select } from "@/components/ui-custom";
import { format } from "date-fns";
import { Plus, Trash2, ListTodo } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getPriorityColor, formatDate } from "@/lib/utils";

export default function WaitingList() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { data: waitingList, isLoading } = useGetWaitingList();
  const { data: patients } = useGetPatients();
  const { data: professionals } = useGetProfessionals();
  const createMutation = useCreateWaitingListEntry();
  const deleteMutation = useDeleteWaitingListEntry();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [formData, setFormData] = useState({ 
    patientId: "", 
    professionalId: "", 
    priority: "media", 
    entryDate: format(new Date(), "yyyy-MM-dd") 
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.patientId) return;
    try {
      await createMutation.mutateAsync({ 
        data: { 
          ...formData, 
          patientId: parseInt(formData.patientId),
          professionalId: formData.professionalId ? parseInt(formData.professionalId) : undefined
        } 
      });
      queryClient.invalidateQueries({ queryKey: ["/api/waiting-list"] });
      toast({ title: "Adicionado", description: "Paciente incluído na fila." });
      setIsDialogOpen(false);
    } catch {
      toast({ title: "Erro", description: "Falha ao adicionar na fila.", variant: "destructive" });
    }
  };

  const handleRemove = async (id: number) => {
    if (!confirm("Remover paciente da fila de espera?")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: ["/api/waiting-list"] });
      toast({ title: "Removido", description: "Entrada removida com sucesso." });
    } catch {
      toast({ title: "Erro", description: "Falha ao remover.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Fila de Espera</h1>
          <p className="text-muted-foreground mt-1">Organização de triagem por prioridade e data.</p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Adicionar à Fila
        </Button>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border">
              <tr>
                <th className="px-6 py-4">Posição</th>
                <th className="px-6 py-4">Paciente</th>
                <th className="px-6 py-4">Profissional (Pref)</th>
                <th className="px-6 py-4">Prioridade</th>
                <th className="px-6 py-4">Entrada</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="text-center py-12 animate-pulse">Carregando fila...</td></tr>
              ) : waitingList?.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                      <ListTodo className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <p className="text-lg font-bold text-foreground">Fila Vazia</p>
                    <p className="text-muted-foreground">Nenhum paciente aguardando vaga.</p>
                  </td>
                </tr>
              ) : (
                waitingList?.map((entry, idx) => (
                  <tr key={entry.id} className="border-b border-border hover:bg-secondary/20 transition-colors">
                    <td className="px-6 py-4 font-display font-bold text-lg text-primary">#{idx + 1}</td>
                    <td className="px-6 py-4 font-semibold text-foreground">
                      {entry.patientName}
                      {entry.patientPhone && <div className="text-xs text-muted-foreground font-normal mt-0.5">{entry.patientPhone}</div>}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{entry.professionalName || "Qualquer um"}</td>
                    <td className="px-6 py-4">
                      <Badge className={getPriorityColor(entry.priority)}>{entry.priority.toUpperCase()}</Badge>
                    </td>
                    <td className="px-6 py-4 font-medium">{formatDate(entry.entryDate)}</td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="ghost" className="text-destructive hover:bg-destructive/10 h-8 w-8 p-0" onClick={() => handleRemove(entry.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {isDialogOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <MotionCard className="w-full max-w-md p-6 overflow-visible" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <h2 className="text-2xl font-bold font-display mb-6">Adicionar Paciente à Fila</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <Label>Paciente</Label>
                <Select required value={formData.patientId} onChange={e => setFormData({...formData, patientId: e.target.value})}>
                  <option value="">Selecione um paciente...</option>
                  {patients?.filter(p => p.status !== 'alta').map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Apenas pacientes sem alta aparecem aqui.</p>
              </div>
              <div>
                <Label>Profissional Preferencial (Opcional)</Label>
                <Select value={formData.professionalId} onChange={e => setFormData({...formData, professionalId: e.target.value})}>
                  <option value="">Qualquer Profissional</option>
                  {professionals?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Prioridade</Label>
                  <Select value={formData.priority} onChange={e => setFormData({...formData, priority: e.target.value})}>
                    <option value="alta">Alta</option>
                    <option value="media">Média</option>
                    <option value="baixa">Baixa</option>
                  </Select>
                </div>
                <div>
                  <Label>Data de Entrada</Label>
                  <Input type="date" required value={formData.entryDate} onChange={e => setFormData({...formData, entryDate: e.target.value})} />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-8">
                <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Adicionando..." : "Adicionar"}</Button>
              </div>
            </form>
          </MotionCard>
        </div>
      )}
    </div>
  );
}
