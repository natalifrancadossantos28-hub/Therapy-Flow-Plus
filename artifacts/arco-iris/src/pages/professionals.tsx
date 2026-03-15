import { useState } from "react";
import { Link } from "wouter";
import {
  useGetProfessionals,
  useGetProfessionalCapacity,
  useCreateProfessional,
  useDeleteProfessional,
} from "@workspace/api-client-react";
import { Card, MotionCard, Button, Input, Label } from "@/components/ui-custom";
import { useQueryClient } from "@tanstack/react-query";
import {
  UserRound,
  Plus,
  Trash2,
  Calendar,
  Stethoscope,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

function ProfessionalCapacityCard({ id }: { id: number }) {
  const { data: capacity } = useGetProfessionalCapacity(id);

  if (!capacity) {
    return <div className="h-2 w-full bg-secondary rounded-full animate-pulse mt-4" />;
  }

  const percentage = Math.min(100, (capacity.activePatients / capacity.maxCapacity) * 100);
  const isFull = capacity.availableSlots === 0;
  const isLow = capacity.activePatients < 20;
  const barColor = isFull ? "bg-emerald-500" : isLow ? "bg-amber-400" : "bg-primary";

  return (
    <div className="mt-4 pt-4 border-t border-border space-y-3">
      {/* Alert banner when below capacity */}
      {!isFull && (
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold",
            isLow
              ? "bg-amber-50 border border-amber-200 text-amber-800"
              : "bg-primary/5 border border-primary/20 text-primary"
          )}
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>
            {capacity.availableSlots === 1
              ? "1 vaga disponível — agenda não está cheia"
              : `${capacity.availableSlots} vagas disponíveis — agenda não está cheia`}
          </span>
        </div>
      )}
      {isFull && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-50 border border-emerald-200 text-emerald-800">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Agenda completa — 30 pacientes ativos</span>
        </div>
      )}

      {/* Capacity bar */}
      <div>
        <div className="flex justify-between text-xs font-semibold mb-1.5">
          <span className="text-muted-foreground">Pacientes Ativos</span>
          <span className="text-foreground">
            {capacity.activePatients} / {capacity.maxCapacity}
          </span>
        </div>
        <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-500", barColor)}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default function Professionals() {
  const { data: professionals, isLoading } = useGetProfessionals();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createMutation = useCreateProfessional();
  const deleteMutation = useDeleteProfessional();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    specialty: "",
    email: "",
    phone: "",
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createMutation.mutateAsync({ data: formData });
      queryClient.invalidateQueries({ queryKey: ["/api/professionals"] });
      toast({ title: "Sucesso", description: "Profissional cadastrado." });
      setIsDialogOpen(false);
      setFormData({ name: "", specialty: "", email: "", phone: "" });
    } catch {
      toast({
        title: "Erro",
        description: "Falha ao criar profissional.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir este profissional?")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: ["/api/professionals"] });
      toast({ title: "Sucesso", description: "Profissional excluído." });
    } catch {
      toast({ title: "Erro", description: "Falha ao excluir.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Profissionais</h1>
          <p className="text-muted-foreground mt-1">
            Cada profissional atende até 30 pacientes ativos.
          </p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Novo Profissional
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-52 animate-pulse bg-secondary/50" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {professionals?.map((prof, i) => (
            <MotionCard
              key={prof.id}
              className="p-6 relative overflow-visible group"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex gap-4 items-center">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary">
                    <UserRound className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-foreground leading-none">
                      {prof.name}
                    </h3>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                      <Stethoscope className="w-3 h-3" /> {prof.specialty}
                    </div>
                  </div>
                </div>
              </div>

              <ProfessionalCapacityCard id={prof.id} />

              <div className="mt-5 flex gap-2">
                <Link href={`/professionals/${prof.id}`} className="flex-1">
                  <Button
                    variant="outline"
                    className="w-full gap-2 group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                  >
                    <Calendar className="w-4 h-4" /> Agenda{" "}
                    <ChevronRight className="w-4 h-4 opacity-50" />
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 px-3"
                  onClick={() => handleDelete(prof.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </MotionCard>
          ))}
        </div>
      )}

      {isDialogOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <MotionCard
            className="w-full max-w-md p-6"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <h2 className="text-2xl font-bold mb-6">Novo Profissional</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label>Nome Completo</Label>
                <Input
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Dr. João Silva"
                />
              </div>
              <div>
                <Label>Especialidade</Label>
                <Input
                  required
                  value={formData.specialty}
                  onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                  placeholder="Psicologia"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="joao@clinica.com"
                  />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="(00) 00000-0000"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </form>
          </MotionCard>
        </div>
      )}
    </div>
  );
}
