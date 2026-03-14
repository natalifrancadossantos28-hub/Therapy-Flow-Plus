import { useState } from "react";
import { Link } from "wouter";
import { useGetPatients, useCreatePatient, useGetProfessionals } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, MotionCard, Button, Input, Label, Badge, Select } from "@/components/ui-custom";
import { Users, Plus, Search, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getStatusColor } from "@/lib/utils";

export default function Patients() {
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { data: patients, isLoading } = useGetPatients();
  const { data: professionals } = useGetProfessionals();
  const createMutation = useCreatePatient();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [formData, setFormData] = useState({ name: "", status: "ativo", professionalId: "" });

  const filteredPatients = patients?.filter(p => p.name.toLowerCase().includes(search.toLowerCase())) || [];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createMutation.mutateAsync({ 
        data: { 
          ...formData, 
          professionalId: formData.professionalId ? parseInt(formData.professionalId) : undefined 
        } 
      });
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({ title: "Sucesso", description: "Paciente cadastrado." });
      setIsDialogOpen(false);
      setFormData({ name: "", status: "ativo", professionalId: "" });
    } catch {
      toast({ title: "Erro", description: "Falha ao criar paciente.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Pacientes</h1>
          <p className="text-muted-foreground mt-1">Gestão de prontuários e acompanhamento.</p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Novo Paciente
        </Button>
      </div>

      <Card className="p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-6 bg-secondary/30 p-2 rounded-xl border border-border/50">
          <Search className="w-5 h-5 text-muted-foreground ml-2" />
          <Input 
            placeholder="Buscar paciente por nome..." 
            value={search} 
            onChange={(e) => setSearch(e.target.value)}
            className="border-0 bg-transparent shadow-none focus-visible:ring-0 px-0"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 rounded-lg">
              <tr>
                <th className="px-4 py-3 rounded-l-lg">Nome</th>
                <th className="px-4 py-3">Profissional</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Faltas</th>
                <th className="px-4 py-3 text-right rounded-r-lg">Ação</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="text-center py-8">Carregando...</td></tr>
              ) : filteredPatients.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum paciente encontrado.</td></tr>
              ) : (
                filteredPatients.map((patient) => {
                  const prof = professionals?.find(p => p.id === patient.professionalId);
                  const hasWarning = patient.absenceCount >= 3;
                  return (
                    <tr key={patient.id} className="border-b border-border hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-4 font-semibold text-foreground">
                        {patient.name}
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {prof?.name || "Não atribuído"}
                      </td>
                      <td className="px-4 py-4">
                        <Badge className={getStatusColor(patient.status)}>{patient.status}</Badge>
                      </td>
                      <td className="px-4 py-4">
                        {hasWarning ? (
                          <Badge className="bg-rose-100 text-rose-800 border-rose-300 gap-1">
                            <AlertCircle className="w-3 h-3" /> {patient.absenceCount}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground ml-2">{patient.absenceCount}</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Link href={`/patients/${patient.id}`}>
                          <Button variant="outline" className="text-xs h-8">Abrir Prontuário</Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {isDialogOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <MotionCard className="w-full max-w-md p-6" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <h2 className="text-2xl font-bold font-display mb-6">Novo Paciente</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>Nome Completo</Label>
                <Input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Maria Silva" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Status</Label>
                  <Select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                  </Select>
                </div>
                <div>
                  <Label>Profissional</Label>
                  <Select value={formData.professionalId} onChange={e => setFormData({...formData, professionalId: e.target.value})}>
                    <option value="">Selecione...</option>
                    {professionals?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Salvando..." : "Salvar"}</Button>
              </div>
            </form>
          </MotionCard>
        </div>
      )}
    </div>
  );
}
