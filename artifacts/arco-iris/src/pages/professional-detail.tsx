import { useCallback, useEffect, useState } from "react";
import { useParams } from "wouter";
import { Card, Button, Input } from "@/components/ui-custom";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Clock, ArrowLeft, Lock, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { getProfessional, upsertProfessional, type Professional } from "@/lib/arco-rpc";

export default function ProfessionalDetail() {
  const { id } = useParams<{ id: string }>();
  const profId = parseInt(id || "0");

  const [date, setDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [pinValue, setPinValue] = useState("");
  const [pinSaving, setPinSaving] = useState(false);
  const [professional, setProfessional] = useState<Professional | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = useCallback(async () => {
    if (!profId) return;
    setLoading(true);
    try {
      const p = await getProfessional(profId);
      setProfessional(p);
    } catch (err: any) {
      toast({
        title: "Erro ao carregar profissional",
        description: err?.message || "Falha inesperada.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [profId, toast]);

  useEffect(() => { void load(); }, [load]);

  const savePin = async () => {
    if (!professional || pinValue.length !== 4) return;
    setPinSaving(true);
    try {
      const updated = await upsertProfessional(professional.id, {
        name: professional.name,
        specialty: professional.specialty,
        email: professional.email,
        phone: professional.phone,
        pin: pinValue,
        cargaHoraria: professional.cargaHoraria,
        tipoContrato: professional.tipoContrato,
        salario: professional.salario,
      });
      setProfessional(updated);
      toast({ title: "PIN atualizado", description: "O PIN de acesso foi salvo com sucesso." });
      setPinValue("");
    } catch (err: any) {
      toast({
        title: "Erro ao salvar PIN",
        variant: "destructive",
        description: err?.message || "Falha ao salvar o PIN.",
      });
    } finally { setPinSaving(false); }
  };

  if (loading || !professional) {
    return <div className="p-8 text-center animate-pulse text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href="/professionals" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
        <h1 className="text-3xl font-display font-bold text-foreground">{professional.name}</h1>
        <p className="text-muted-foreground mt-1 text-lg">{professional.specialty || "—"}</p>
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
              className="bg-secondary/40 backdrop-blur-sm border-primary/30 text-lg py-6"
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
                <span className="text-muted-foreground">Carga Horária:</span>
                <span className="font-medium">{professional.cargaHoraria}</span>
              </p>
              <p className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Vínculo:</span>
                <span className="font-medium">{professional.tipoContrato}</span>
              </p>
              <p className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">PIN da Agenda:</span>
                <span className="font-medium font-mono">{professional.pin ? "••••" : "Não definido"}</span>
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
                onChange={e => setPinValue(e.target.value.replace(/\D/g, ""))}
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

            <div className="p-12 text-center text-muted-foreground">
              <p className="text-sm">
                A visualização da agenda diária será reativada na Fase 4C
                (Agenda + Appointments).
              </p>
              <p className="text-xs mt-2 opacity-70">
                Data selecionada: <strong>{date}</strong>
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
