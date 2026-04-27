import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { MotionCard, Button, Input, Label, Select, Badge } from "@/components/ui-custom";
import {
  UserRound,
  Plus,
  Trash2,
  Calendar,
  Stethoscope,
  ChevronRight,
  Clock,
  Lock,
  ShieldCheck,
  Eye,
  EyeOff,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  listProfessionals,
  upsertProfessional,
  deleteProfessional,
  type Professional,
} from "@/lib/arco-rpc";
import { SPECIALTIES, specialtyTone, specialtyShortLabel } from "@/lib/specialty-colors";

function PinManager({
  prof,
  onUpdated,
}: {
  prof: Professional;
  onUpdated: (p: Professional) => void;
}) {
  const [show, setShow] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    if (newPin.length !== 4) return;
    setSaving(true);
    try {
      const updated = await upsertProfessional(prof.id, {
        name: prof.name,
        specialty: prof.specialty,
        email: prof.email,
        phone: prof.phone,
        pin: newPin,
        cargaHoraria: prof.cargaHoraria,
        tipoContrato: prof.tipoContrato,
        salario: prof.salario,
      });
      onUpdated(updated);
      toast({ title: "PIN atualizado", description: `PIN de ${prof.name} salvo com sucesso.` });
      setNewPin(""); setShow(false);
    } catch (err: any) {
      toast({
        title: "Erro ao salvar PIN",
        variant: "destructive",
        description: err?.message || "Falha ao salvar o PIN.",
      });
    } finally { setSaving(false); }
  };

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
          <Lock className="w-3 h-3" /> PIN de Agenda
        </span>
        <span className={cn(
          "text-xs font-bold px-2 py-0.5 rounded-full border",
          prof.pin ? "badge-neon-green" : "badge-neon-orange"
        )}>
          {prof.pin ? "Definido" : "Não definido"}
        </span>
      </div>
      {prof.pin && !show && (
        <div className="flex items-center gap-2 mb-2">
          <span className="font-mono text-sm font-bold tracking-widest text-foreground">
            {showPin ? prof.pin : "••••"}
          </span>
          <button onClick={() => setShowPin(v => !v)} className="text-muted-foreground hover:text-foreground transition-colors">
            {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}
      {!show ? (
        <button onClick={() => setShow(true)} className="text-xs text-primary font-semibold hover:underline">
          {prof.pin ? "Alterar PIN" : "Definir PIN"}
        </button>
      ) : (
        <div className="flex gap-2 mt-1">
          <input
            type="password" maxLength={4}
            value={newPin}
            onChange={e => setNewPin(e.target.value.replace(/\D/g, ""))}
            onKeyDown={e => e.key === "Enter" && handleSave()}
            placeholder="Novo PIN"
            className="border border-border rounded-lg px-2 py-1.5 w-24 text-center font-mono text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/30 bg-muted text-foreground transition-all"
          />
          <button onClick={handleSave} disabled={newPin.length !== 4 || saving} className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 bg-primary text-primary-foreground rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-all hover:shadow-[0_0_12px_rgba(0,240,255,0.3)]">
            <ShieldCheck className="w-3 h-3" /> {saving ? "..." : "Salvar"}
          </button>
          <button onClick={() => { setShow(false); setNewPin(""); }} className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1">Cancelar</button>
        </div>
      )}
    </div>
  );
}

export default function Professionals() {
  const { toast } = useToast();
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    specialty: "",
    email: "",
    phone: "",
    pin: "",
    cargaHoraria: "30h",
    tipoContrato: "Contratado",
    salario: "",
  });

  const loadProfessionals = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = await listProfessionals();
      setProfessionals(rows);
    } catch (err: any) {
      toast({
        title: "Erro ao carregar profissionais",
        description: err?.message || "Falha inesperada.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => { void loadProfessionals(); }, [loadProfessionals]);

  // Teto de faturamento baseado na carga horária (JS puro)
  const TETO = { "20h": 3600, "30h": 5400 };
  const tetoForm = TETO[formData.cargaHoraria as "20h" | "30h"] ?? 5400;
  const salarioNum = parseInt(formData.salario) || 0;
  const prejuizoForm = salarioNum > tetoForm ? salarioNum - tetoForm : 0;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const created = await upsertProfessional(null, {
        name: formData.name,
        specialty: formData.specialty || null,
        email: formData.email || null,
        phone: formData.phone || null,
        pin: formData.pin || null,
        cargaHoraria: formData.cargaHoraria,
        tipoContrato: formData.tipoContrato,
        salario: salarioNum || null,
      });
      setProfessionals(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      toast({ title: "Sucesso", description: "Profissional cadastrado." });
      setIsDialogOpen(false);
      setFormData({ name: "", specialty: "", email: "", phone: "", pin: "", cargaHoraria: "30h", tipoContrato: "Contratado", salario: "" });
    } catch (err: any) {
      toast({
        title: "Erro",
        description: err?.message || "Falha ao criar profissional.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir este profissional?")) return;
    try {
      await deleteProfessional(id);
      setProfessionals(prev => prev.filter(p => p.id !== id));
      toast({ title: "Sucesso", description: "Profissional excluído." });
    } catch (err: any) {
      toast({
        title: "Erro",
        description: err?.message || "Falha ao excluir.",
        variant: "destructive",
      });
    }
  };

  const updateProfessionalInList = (updated: Professional) => {
    setProfessionals(prev => prev.map(p => (p.id === updated.id ? updated : p)));
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Profissionais</h1>
          <p className="text-muted-foreground mt-1">
            Profissionais com 30h atendem até 30 pacientes · 20h atendem até 20 pacientes.
          </p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Novo Profissional
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <MotionCard key={i} className="h-52 animate-pulse bg-secondary/50" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {professionals.map((prof, i) => (
            <MotionCard
              key={prof.id}
              className="p-6 relative overflow-visible group"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex gap-4 items-center">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary" style={{ boxShadow: "0 0 12px rgba(0,240,255,0.15)" }}>
                    <UserRound className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-foreground leading-none">
                      {prof.name}
                    </h3>
                    <div className="flex items-center gap-1 text-sm mt-1">
                      <Stethoscope className="w-3 h-3 text-muted-foreground" />
                      <span
                        className="text-[11px] font-bold px-1.5 py-0.5 rounded"
                        style={{
                          color: specialtyTone(prof.specialty).fg,
                          background: specialtyTone(prof.specialty).bg,
                          border: `1px solid ${specialtyTone(prof.specialty).border}`,
                        }}
                      >
                        {prof.specialty || specialtyShortLabel(prof.specialty)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <Badge className={cn(
                    "text-xs font-bold px-2.5 py-1 flex items-center gap-1",
                    prof.cargaHoraria === "20h" ? "badge-neon-orange" : "badge-neon-blue"
                  )}>
                    <Clock className="w-3 h-3" />
                    {prof.cargaHoraria ?? "30h"}
                    <span className="text-[10px] font-semibold opacity-80">
                      · {prof.cargaHoraria === "20h" ? "20" : "30"} pac.
                    </span>
                  </Badge>
                  {(prof.tipoContrato ?? "Contratado") === "Concursado" ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.25)", color: "#7dd3fc" }}>
                      Concursado
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(0,255,159,0.08)", border: "1px solid rgba(0,255,159,0.2)", color: "#86efac" }}>
                      Contratado
                    </span>
                  )}
                </div>
              </div>

              <PinManager prof={prof} onUpdated={updateProfessionalInList} />

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
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <MotionCard
            className="w-full max-w-md p-6 max-h-[calc(100vh-2rem)] overflow-y-auto my-auto"
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
                <Select
                  required
                  value={formData.specialty}
                  onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                >
                  <option value="" disabled>Selecione…</option>
                  {SPECIALTIES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Lista oficial — define a cor neon na agenda e nos avisos.
                </p>
              </div>
              <div>
                <Label>Tipo de Vínculo</Label>
                <Select
                  value={formData.tipoContrato}
                  onChange={(e) => setFormData({ ...formData, tipoContrato: e.target.value, salario: e.target.value === "Concursado" ? "" : formData.salario })}
                >
                  <option value="Contratado">Contratado — CLT / RPA (custo gerenciado pela empresa)</option>
                  <option value="Concursado">Concursado — Servidor público (sem custo para a empresa)</option>
                </Select>
                {formData.tipoContrato === "Concursado" && (
                  <p className="text-xs mt-1.5 px-3 py-1.5 rounded-lg"
                    style={{ background: "rgba(0,212,255,0.07)", border: "1px solid rgba(0,212,255,0.2)", color: "#7dd3fc" }}>
                    O custo mensal não é aplicável para servidores concursados. Eles aparecem na agenda e nos relatórios de atendimento, mas não entram na folha de pagamento da empresa.
                  </p>
                )}
              </div>
              <div>
                <Label>Carga Horária</Label>
                <Select
                  value={formData.cargaHoraria}
                  onChange={(e) => setFormData({ ...formData, cargaHoraria: e.target.value })}
                >
                  <option value="30h">30 horas — até 35 pacientes</option>
                  <option value="20h">20 horas — até 25 pacientes</option>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Define o limite de pacientes ativos para este profissional.
                </p>
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
              {formData.tipoContrato !== "Concursado" && (
                <div>
                  <Label>Custo Mensal (R$)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={100}
                    value={formData.salario}
                    onChange={(e) => setFormData({ ...formData, salario: e.target.value })}
                    placeholder={`Ex: ${tetoForm.toLocaleString("pt-BR")}`}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Teto de faturamento para {formData.cargaHoraria}:{" "}
                    <strong className="text-foreground">
                      R$ {tetoForm.toLocaleString("pt-BR")}
                    </strong>
                  </p>
                </div>
              )}
              {prejuizoForm > 0 && (
                <div className="rounded-xl px-4 py-3 flex items-start gap-2"
                  style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)" }}>
                  <span className="text-red-400 text-sm mt-0.5">⚠️</span>
                  <p className="text-sm" style={{ color: "#f87171" }}>
                    <strong>Atenção:</strong> Este custo excede o faturamento máximo de {formData.cargaHoraria}{" "}
                    (R$ {tetoForm.toLocaleString("pt-BR")}). Gerando prejuízo de{" "}
                    <strong>R$ {prejuizoForm.toLocaleString("pt-BR")}</strong>.
                  </p>
                </div>
              )}
              <div>
                <Label>PIN de Acesso à Agenda (4 dígitos)</Label>
                <Input
                  type="password"
                  maxLength={4}
                  value={formData.pin}
                  onChange={(e) => setFormData({ ...formData, pin: e.target.value.replace(/\D/g, "") })}
                  placeholder="••••"
                  className="tracking-widest font-mono"
                />
                <p className="text-xs text-muted-foreground mt-1">O profissional usará este PIN para acessar a Agenda.</p>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </form>
          </MotionCard>
        </div>
      )}
    </div>
  );
}
