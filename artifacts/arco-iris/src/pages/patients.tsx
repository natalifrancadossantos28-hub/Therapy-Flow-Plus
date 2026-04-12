import { useState } from "react";
import { useGetPatients, useCreatePatient, useGetProfessionals } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, MotionCard, Button, Input, Label, Badge, Select } from "@/components/ui-custom";
import { Users, Plus, Search, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getStatusColor } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "Fila de Espera", label: "Fila de Espera" },
  { value: "pré-cadastro", label: "Pré-cadastro" },
  { value: "Atendimento", label: "Atendimento" },
  { value: "Alta", label: "Alta" },
  { value: "Óbito", label: "Óbito" },
  { value: "Desistência", label: "Desistência" },
];

const today = () => new Date().toISOString().split("T")[0];

export default function Patients() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { data: patients, isLoading } = useGetPatients();
  const { data: professionals } = useGetProfessionals();
  const createMutation = useCreatePatient();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: "",
    prontuario: "",
    cpf: "",
    cns: "",
    phone: "",
    dateOfBirth: "",
    motherName: "",
    guardianName: "",
    guardianPhone: "",
    diagnosis: "",
    status: "Fila de Espera",
    entryDate: today(),
  });

  const filteredPatients = (patients || []).filter(p => {
    const matchName = p.name.toLowerCase().includes(search.toLowerCase()) ||
      ((p as any).prontuario || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || p.status === statusFilter;
    return matchName && matchStatus;
  });

  const resetForm = () => setFormData({
    name: "", prontuario: "", cpf: "", cns: "", phone: "", dateOfBirth: "",
    motherName: "", guardianName: "", guardianPhone: "", diagnosis: "",
    status: "Fila de Espera", entryDate: today(),
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createMutation.mutateAsync({ data: { ...formData } });
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/waiting-list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments/today"] });
      toast({ title: "Paciente cadastrado com sucesso!" });
      setIsDialogOpen(false);
      resetForm();
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
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex items-center gap-3 flex-1 bg-secondary/30 p-2 rounded-xl border border-border/50">
            <Search className="w-5 h-5 text-muted-foreground ml-2" />
            <Input
              placeholder="Buscar por nome ou prontuário..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border-0 bg-transparent shadow-none focus-visible:ring-0 px-0"
            />
          </div>
          <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-48">
            <option value="">Todos os status</option>
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 rounded-lg">
              <tr>
                <th className="px-4 py-3 rounded-l-lg">Prontuário</th>
                <th className="px-4 py-3">Nome do Paciente</th>
                <th className="px-4 py-3">Nome da Mãe</th>
                <th className="px-4 py-3">Profissional</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 rounded-r-lg">Faltas</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="text-center py-8">Carregando...</td></tr>
              ) : filteredPatients.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum paciente encontrado.</td></tr>
              ) : (
                filteredPatients.map((patient) => {
                  const prof = professionals?.find(p => p.id === patient.professionalId);
                  const hasWarning = patient.absenceCount >= 3;
                  return (
                    <tr key={patient.id} className="border-b border-border hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-4 text-muted-foreground font-mono text-xs">
                        {(patient as any).prontuario || `#${String(patient.id).padStart(4, "0")}`}
                      </td>
                      <td className="px-4 py-4 font-semibold text-foreground">{patient.name}</td>
                      <td className="px-4 py-4 text-muted-foreground">{(patient as any).motherName || "—"}</td>
                      <td className="px-4 py-4 text-muted-foreground">{prof?.name || "—"}</td>
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
          <MotionCard className="w-full max-w-lg p-6 overflow-y-auto max-h-[90vh]" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <h2 className="text-2xl font-bold font-display mb-6">Novo Paciente</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>Nome Completo *</Label>
                  <Input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Nome completo" />
                </div>
                <div>
                  <Label>Prontuário</Label>
                  <Input value={formData.prontuario} onChange={e => setFormData({ ...formData, prontuario: e.target.value })} placeholder="Ex.: PRON-0001" />
                </div>
                <div>
                  <Label>Data de Entrada *</Label>
                  <Input type="date" required value={formData.entryDate} onChange={e => setFormData({ ...formData, entryDate: e.target.value })} />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })}>
                    {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </div>
                <div>
                  <Label>Data de Nascimento</Label>
                  <Input type="date" value={formData.dateOfBirth} onChange={e => setFormData({ ...formData, dateOfBirth: e.target.value })} />
                </div>
                <div>
                  <Label>CPF</Label>
                  <Input value={formData.cpf} onChange={e => setFormData({ ...formData, cpf: e.target.value })} placeholder="000.000.000-00" />
                </div>
                <div>
                  <Label>CNS (Cartão SUS)</Label>
                  <Input value={formData.cns} onChange={e => setFormData({ ...formData, cns: e.target.value })} placeholder="Nº do cartão SUS" />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} placeholder="(00) 00000-0000" />
                </div>
                <div className="col-span-2">
                  <Label>Nome da Mãe</Label>
                  <Input value={formData.motherName} onChange={e => setFormData({ ...formData, motherName: e.target.value })} placeholder="Nome completo da mãe" />
                </div>
                <div>
                  <Label>Responsável</Label>
                  <Input value={formData.guardianName} onChange={e => setFormData({ ...formData, guardianName: e.target.value })} placeholder="Nome do responsável" />
                </div>
                <div>
                  <Label>Telefone do Responsável</Label>
                  <Input value={formData.guardianPhone} onChange={e => setFormData({ ...formData, guardianPhone: e.target.value })} placeholder="(00) 00000-0000" />
                </div>
                <div className="col-span-2">
                  <Label>Diagnóstico</Label>
                  <Input value={formData.diagnosis} onChange={e => setFormData({ ...formData, diagnosis: e.target.value })} placeholder="Ex.: TEA, TDAH, sem diagnóstico" />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <Button type="button" variant="ghost" onClick={() => { setIsDialogOpen(false); resetForm(); }}>Cancelar</Button>
                <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Salvando..." : "Salvar"}</Button>
              </div>
            </form>
          </MotionCard>
        </div>
      )}
    </div>
  );
}
