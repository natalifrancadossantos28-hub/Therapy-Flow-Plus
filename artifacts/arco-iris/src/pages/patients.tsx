import { useState, useEffect, useCallback } from "react";
import { useGetPatients, useCreatePatient, useGetProfessionals } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, MotionCard, Button, Input, Label, Badge, Select } from "@/components/ui-custom";
import { Users, Plus, Search, AlertCircle, MessageCircle, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getStatusColor, cn } from "@/lib/utils";
import { Link } from "wouter";

const STATUS_OPTIONS = [
  { value: "Aguardando Triagem", label: "Aguardando Triagem" },
  { value: "Fila de Espera",     label: "Fila de Espera" },
  { value: "Atendimento",        label: "Atendimento" },
  { value: "Alta",               label: "Alta" },
  { value: "Óbito",              label: "Óbito" },
  { value: "Desistência",        label: "Desistência" },
];

const today = () => new Date().toISOString().split("T")[0];

// ── Cálculo de idade ──────────────────────────────────────────────────────────
function calcIdade(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth + "T00:00:00");
  const hoje = new Date();
  let anos = hoje.getFullYear() - dob.getFullYear();
  const m = hoje.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < dob.getDate())) anos--;
  return anos;
}

type AlertaIdade = { tipo: "critico" | "alerta" | "ok"; text: string | null; idade: number };

function alertaIdade(dateOfBirth: string | null | undefined): AlertaIdade | null {
  if (!dateOfBirth) return null;
  const idade = calcIdade(dateOfBirth);
  if (idade > 11) return { tipo: "critico", text: "🛑 Fora da faixa — Encaminhar Reabilitação", idade };
  if (idade === 11) return { tipo: "alerta", text: "⚠️ Preparar Encaminhamento (11 anos)", idade };
  return { tipo: "ok", text: null, idade };
}

function IdadeBadge({ dateOfBirth }: { dateOfBirth?: string | null }) {
  if (!dateOfBirth) return null;
  const alerta = alertaIdade(dateOfBirth);
  if (!alerta) return null;
  if (alerta.tipo === "critico") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg"
        style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444",
                 boxShadow: "0 0 8px rgba(239,68,68,0.25)", textShadow: "0 0 6px rgba(239,68,68,0.6)" }}>
        🛑 {alerta.idade} anos — Encaminhar
      </span>
    );
  }
  if (alerta.tipo === "alerta") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg"
        style={{ background: "rgba(249,115,22,0.12)", border: "1px solid rgba(249,115,22,0.4)", color: "#f97316",
                 boxShadow: "0 0 8px rgba(249,115,22,0.25)", textShadow: "0 0 6px rgba(249,115,22,0.5)" }}>
        ⚠️ {alerta.idade} anos — Transferência
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">{alerta.idade} anos</span>;
}

export default function Patients() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [redeFilter, setRedeFilter] = useState(false);
  const [idadeAlertaFilter, setIdadeAlertaFilter] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
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
    entryDate: today(),
    escolaPublica: false,
  });

  const [nextProntuario, setNextProntuario] = useState<string>("");
  const [prontuarioAlerta, setProntuarioAlerta] = useState<string | null>(null);
  const [prontuarioChecking, setProntuarioChecking] = useState(false);
  const [fromWhatsapp, setFromWhatsapp] = useState(false);

  // Busca próximo prontuário disponível
  const fetchNextProntuario = useCallback(async () => {
    try {
      const r = await fetch("/api/patients/next-prontuario");
      const d = await r.json();
      setNextProntuario(d.nextProntuario);
      return d.nextProntuario as string;
    } catch { return ""; }
  }, []);

  // Verificação de duplicidade de prontuário
  const checkProntuario = useCallback(async (pron: string) => {
    if (!pron || !pron.trim()) { setProntuarioAlerta(null); return; }
    setProntuarioChecking(true);
    try {
      const r = await fetch(`/api/patients/check-prontuario/${encodeURIComponent(pron.trim())}`);
      const d = await r.json();
      if (d.existe) {
        setProntuarioAlerta(`⚠️ Prontuário ${pron} já cadastrado para: ${d.paciente.name}`);
      } else {
        setProntuarioAlerta(null);
      }
    } catch { setProntuarioAlerta(null); }
    finally { setProntuarioChecking(false); }
  }, []);

  // Pré-preencher telefone do responsável via query param (alerta da Carla)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const telefone = params.get("guardianPhone");
    if (telefone) {
      const num = telefone.replace(/\D/g, "");
      const formatado = num.length === 11
        ? `(${num.slice(0,2)}) ${num.slice(2,7)}-${num.slice(7)}`
        : num.length === 10
          ? `(${num.slice(0,2)}) ${num.slice(2,6)}-${num.slice(6)}`
          : telefone;
      setFormData(prev => ({ ...prev, guardianPhone: formatado }));
      setFromWhatsapp(true);
      setIsDialogOpen(true);
      window.history.replaceState({}, "", window.location.pathname);
      fetchNextProntuario().then(n => {
        if (n) setFormData(prev => ({ ...prev, guardianPhone: formatado, prontuario: n }));
      });
    }
  }, [fetchNextProntuario]);

  const openNewForm = async () => {
    const next = await fetchNextProntuario();
    setFromWhatsapp(false);
    setProntuarioAlerta(null);
    setFormData({
      name: "", prontuario: next, cpf: "", cns: "", phone: "", dateOfBirth: "",
      motherName: "", guardianName: "", guardianPhone: "", diagnosis: "",
      entryDate: today(), escolaPublica: false,
    });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setFromWhatsapp(false);
    setProntuarioAlerta(null);
    setFormData({
      name: "", prontuario: "", cpf: "", cns: "", phone: "", dateOfBirth: "",
      motherName: "", guardianName: "", guardianPhone: "", diagnosis: "",
      entryDate: today(), escolaPublica: false,
    });
  };

  const filteredPatients = (patients || []).filter(p => {
    const matchName = p.name.toLowerCase().includes(search.toLowerCase()) ||
      ((p as any).prontuario || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || p.status === statusFilter;
    const matchRede = !redeFilter || (p as any).escolaPublica === true;
    const matchIdade = !idadeAlertaFilter || (() => {
      const a = alertaIdade((p as any).dateOfBirth);
      return a && a.tipo !== "ok";
    })();
    return matchName && matchStatus && matchRede && matchIdade;
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (prontuarioAlerta) {
      toast({ title: "Prontuário duplicado", description: prontuarioAlerta, variant: "destructive" });
      return;
    }
    try {
      await createMutation.mutateAsync({
        data: {
          ...formData,
          escolaPublica: formData.escolaPublica,
          status: "Aguardando Triagem",
        },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({ title: "Paciente cadastrado!", description: `Prontuário ${formData.prontuario || "—"} • Aguardando Triagem.` });
      setIsDialogOpen(false);
      resetForm();
    } catch {
      toast({ title: "Erro", description: "Não foi possível cadastrar o paciente.", variant: "destructive" });
    }
  };

  const handleMigrarContatos = async () => {
    setIsMigrating(true);
    try {
      const r = await fetch("/api/whatsapp/migrar-contatos", { method: "POST" });
      const d = await r.json();
      if (d.ok) {
        queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
        toast({
          title: "Migração concluída!",
          description: `${d.criados} pré-cadastros criados, ${d.duplicados} já existiam.`,
        });
      } else {
        toast({ title: "Aviso", description: d.mensagem || d.erro || "Erro na migração." });
      }
    } catch {
      toast({ title: "Erro", description: "Bot indisponível para migração.", variant: "destructive" });
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Pacientes</h1>
        <p className="text-muted-foreground mt-1">Cadastro e gestão dos pacientes da clínica.</p>
      </div>

      <Card className="p-6">
        {/* Toolbar */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-border pb-6">
          <div className="flex items-center gap-2 flex-wrap">
            <Users className="w-5 h-5 text-primary" />
            <span className="font-bold text-lg">{filteredPatients.length} paciente{filteredPatients.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-50"
              onClick={handleMigrarContatos}
              disabled={isMigrating}
              title="Importar contatos do WhatsApp (padrão 402 - Maria Oliveira)"
            >
              <Download className="w-3.5 h-3.5" />
              {isMigrating ? "Importando..." : "Importar do WhatsApp"}
            </button>
            <Button className="gap-2" onClick={openNewForm}>
              <Plus className="w-4 h-4" /> Novo Paciente
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar por nome ou prontuário..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select className="w-48" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">Todos os Status</option>
            {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
          <button
            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all",
              redeFilter
                ? "border-emerald-400 text-emerald-700 bg-emerald-50"
                : "border-border text-muted-foreground hover:bg-secondary")}
            onClick={() => setRedeFilter(v => !v)}
          >
            🏫 {redeFilter ? "Rede Municipal Ibiúna" : "Filtrar Rede Municipal"}
          </button>
          <button
            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all",
              idadeAlertaFilter
                ? "border-orange-400 text-orange-700 bg-orange-50"
                : "border-border text-muted-foreground hover:bg-secondary")}
            onClick={() => setIdadeAlertaFilter(v => !v)}
          >
            🔢 {idadeAlertaFilter ? "Somente alertas" : "Filtrar alertas de idade"}
          </button>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Prontuário</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Nome</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Mãe</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Idade</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Profissional</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Faltas</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="text-center py-8 animate-pulse text-muted-foreground">Carregando...</td></tr>
              ) : filteredPatients.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum paciente encontrado.</td></tr>
              ) : (
                filteredPatients.map((patient) => {
                  const prof = professionals?.find(p => p.id === patient.professionalId);
                  const hasWarning = patient.absenceCount >= 3;
                  const idAlerta = alertaIdade((patient as any).dateOfBirth);
                  const isRede = (patient as any).escolaPublica;
                  return (
                    <tr key={patient.id}
                      className={cn(
                        "border-b border-border hover:bg-secondary/20 transition-colors cursor-pointer",
                        idAlerta?.tipo === "critico" && "bg-rose-50/50",
                        idAlerta?.tipo === "alerta" && "bg-orange-50/30",
                      )}
                      onClick={() => window.location.href = `/patients/${patient.id}`}
                    >
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                        {(patient as any).prontuario || `#${String(patient.id).padStart(4, "0")}`}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-foreground">{patient.name}</span>
                        {isRede && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold">🏫 Mun.</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{(patient as any).motherName || "—"}</td>
                      <td className="px-4 py-3">
                        <IdadeBadge dateOfBirth={(patient as any).dateOfBirth} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{prof?.name || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge className={getStatusColor(patient.status)}>{patient.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
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

      {/* Modal de Novo Paciente */}
      {isDialogOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <MotionCard className="w-full max-w-lg p-6 overflow-y-auto max-h-[90vh]" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>

            {/* Banner WhatsApp */}
            {fromWhatsapp && (
              <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-xl text-xs font-medium"
                style={{ background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.2)", color: "#7c3aed" }}>
                <MessageCircle className="w-3.5 h-3.5 flex-shrink-0" />
                Número pré-preenchido a partir do alerta da Carla
              </div>
            )}

            {/* Próximo prontuário hint */}
            {nextProntuario && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl text-xs font-medium bg-secondary border border-border text-muted-foreground">
                📋 Próximo prontuário sugerido: <strong className="text-foreground ml-1">{nextProntuario}</strong>
              </div>
            )}

            <h2 className="text-2xl font-bold font-display mb-1">Novo Paciente</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Será cadastrado com status <strong>Aguardando Triagem</strong>.
            </p>

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>Nome Completo *</Label>
                  <Input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Nome completo" />
                </div>
                <div>
                  <Label>Prontuário</Label>
                  <Input
                    value={formData.prontuario}
                    onChange={e => {
                      setFormData({ ...formData, prontuario: e.target.value });
                      if (e.target.value.trim().length >= 2) checkProntuario(e.target.value);
                      else setProntuarioAlerta(null);
                    }}
                    placeholder="Ex.: 401"
                    className={prontuarioAlerta ? "border-rose-400" : ""}
                  />
                  {prontuarioAlerta && (
                    <p className="text-xs text-rose-600 mt-1 font-medium">{prontuarioAlerta}</p>
                  )}
                  {prontuarioChecking && (
                    <p className="text-xs text-muted-foreground mt-1">Verificando...</p>
                  )}
                </div>
                <div>
                  <Label>Data de Entrada *</Label>
                  <Input type="date" required value={formData.entryDate} onChange={e => setFormData({ ...formData, entryDate: e.target.value })} />
                </div>
                <div>
                  <Label>Data de Nascimento</Label>
                  <Input type="date" value={formData.dateOfBirth} onChange={e => setFormData({ ...formData, dateOfBirth: e.target.value })} />
                  {formData.dateOfBirth && (() => {
                    const a = alertaIdade(formData.dateOfBirth);
                    if (!a || a.tipo === "ok") return <p className="text-xs text-muted-foreground mt-1">{a?.idade} anos</p>;
                    if (a.tipo === "alerta") return <p className="text-xs font-bold mt-1" style={{ color: "#f97316" }}>⚠️ {a.idade} anos — Preparar Encaminhamento</p>;
                    return <p className="text-xs font-bold mt-1" style={{ color: "#ef4444" }}>🛑 {a.idade} anos — Fora da faixa etária</p>;
                  })()}
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

                {/* Rede Municipal Ibiúna */}
                <div className="col-span-2">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className={cn(
                      "w-5 h-5 rounded border-2 flex items-center justify-center transition-all flex-shrink-0",
                      formData.escolaPublica
                        ? "bg-emerald-500 border-emerald-500"
                        : "border-border group-hover:border-emerald-400"
                    )}>
                      {formData.escolaPublica && <span className="text-white text-xs font-bold">✓</span>}
                    </div>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={formData.escolaPublica}
                      onChange={e => setFormData({ ...formData, escolaPublica: e.target.checked })}
                    />
                    <div>
                      <p className="text-sm font-semibold text-foreground">🏫 Rede Municipal de Ibiúna</p>
                      <p className="text-xs text-muted-foreground">Matriculado em escola municipal de Ibiúna (prioridade na fila)</p>
                    </div>
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <Button type="button" variant="ghost" onClick={() => { setIsDialogOpen(false); resetForm(); }}>Cancelar</Button>
                <Button type="submit" disabled={createMutation.isPending || !!prontuarioAlerta}>
                  {createMutation.isPending ? "Salvando..." : "Cadastrar"}
                </Button>
              </div>
            </form>
          </MotionCard>
        </div>
      )}
    </div>
  );
}
