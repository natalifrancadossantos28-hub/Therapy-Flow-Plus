import { useState } from "react";
import { useParams } from "wouter";
import { useGetProfessional, useGetProfessionalSchedule } from "@workspace/api-client-react";
import { Card, Button, Input } from "@/components/ui-custom";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Clock, UserRound, ArrowLeft, Lock, ShieldCheck } from "lucide-react";
import { cn, getStatusColor } from "@/lib/utils";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function ProfessionalDetail() {
  const { id } = useParams<{ id: string }>();
  const profId = parseInt(id || "0");
  
  const [date, setDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [pinValue, setPinValue] = useState("");
  const [pinSaving, setPinSaving] = useState(false);
  const { toast } = useToast();

  const { data: professional } = useGetProfessional(profId);
  const { data: schedule, isLoading } = useGetProfessionalSchedule(profId, { date });

  const savePin = async () => {
    if (pinValue.length !== 4) return;
    setPinSaving(true);
    try {
      await fetch(`/api/professionals/${profId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...professional, pin: pinValue }),
      });
      toast({ title: "PIN atualizado", description: "O PIN de acesso foi salvo com sucesso." });
      setPinValue("");
    } catch {
      toast({ title: "Erro", description: "Falha ao salvar o PIN.", variant: "destructive" });
    } finally { setPinSaving(false); }
  };

  if (!professional) return <div className="p-8 text-center animate-pulse text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/professionals" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
        <h1 className="text-3xl font-display font-bold text-foreground">{professional.name}</h1>
        <p className="text-muted-foreground mt-1 text-lg">{professional.specialty}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <Card className="p-6 bg-gradient-to-br from-primary/10 to-transparent border-primary/20">
            <h3 className="font-bold font-display text-lg mb-4 flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-primary" /> Selecionar Data
            </h3>
            <Input 
              type="date" 
              value={date} 
              onChange={(e) => setDate(e.target.value)}
              className="bg-white/50 backdrop-blur-sm border-primary/30 text-lg py-6"
            />
          </Card>
          
          <Card className="p-6">
            <h3 className="font-bold font-display text-lg mb-4">Informações</h3>
            <div className="space-y-3 text-sm">
              <p className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Email:</span>
                <span className="font-medium">{professional.email || "-"}</span>
              </p>
              <p className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Telefone:</span>
                <span className="font-medium">{professional.phone || "-"}</span>
              </p>
              <p className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">PIN da Agenda:</span>
                <span className="font-medium font-mono">{(professional as any).pin ? "••••" : "Não definido"}</span>
              </p>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-bold font-display text-base mb-3 flex items-center gap-2">
              <Lock className="w-4 h-4 text-primary" /> Configurar PIN de Acesso
            </h3>
            <p className="text-xs text-muted-foreground mb-3">O profissional usa este PIN para acessar a Agenda Semanal.</p>
            <div className="flex gap-2">
              <Input
                type="password" maxLength={4}
                value={pinValue}
                onChange={e => setPinValue(e.target.value.replace(/\D/, ""))}
                placeholder="Novo PIN (4 dígitos)"
                className="font-mono tracking-widest flex-1"
              />
              <Button onClick={savePin} disabled={pinValue.length !== 4 || pinSaving} className="gap-1">
                <ShieldCheck className="w-4 h-4" /> {pinSaving ? "..." : "Salvar"}
              </Button>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            <div className="bg-secondary/50 p-6 border-b border-border">
              <h2 className="text-xl font-bold font-display flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                Agenda do Dia
              </h2>
            </div>
            
            <div className="p-0">
              {isLoading ? (
                <div className="p-8 text-center animate-pulse">Carregando horários...</div>
              ) : schedule?.slots?.length ? (
                <div className="divide-y divide-border">
                  {schedule.slots.map((slot, idx) => (
                    <div 
                      key={idx} 
                      className={cn(
                        "flex items-center p-4 hover:bg-secondary/20 transition-colors",
                        slot.isLunchBreak && "bg-slate-50 opacity-70 cursor-not-allowed"
                      )}
                    >
                      <div className="w-24 font-display font-bold text-lg text-primary flex items-center gap-2 border-r border-border mr-6">
                        {slot.time}
                      </div>
                      <div className="flex-1">
                        {slot.isLunchBreak ? (
                          <span className="text-muted-foreground font-medium italic flex items-center gap-2">
                            🌭 Horário de Almoço
                          </span>
                        ) : slot.patientId ? (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                <UserRound className="w-4 h-4" />
                              </div>
                              <Link href={`/patients/${slot.patientId}`} className="font-bold text-foreground hover:underline hover:text-primary text-lg">
                                {slot.patientName}
                              </Link>
                            </div>
                            <span className={cn("px-3 py-1 rounded-full text-xs font-semibold border", getStatusColor(slot.status || ""))}>
                              {slot.status}
                            </span>
                          </div>
                        ) : (
                          <span className="text-emerald-600 font-semibold flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            Horário Livre
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center text-muted-foreground">Nenhum horário gerado para este dia.</div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
