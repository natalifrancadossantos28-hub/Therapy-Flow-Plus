import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Building2, Plus, Users, UserRound, CalendarDays, ListTodo,
  Power, PowerOff, Pencil, Trash2, ArrowLeft, Shield, Activity,
  ClipboardList, CheckCircle2, XCircle, ChevronDown, ChevronUp,
} from "lucide-react";
import { Card, MotionCard, Button, Badge, Input, Label } from "@/components/ui-custom";
import { requireSupabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

// ── Types ───────────────────────────────────────────────────────────────────

type Company = {
  id: number;
  name: string;
  slug: string;
  active: boolean;
  modulePonto: boolean;
  moduleTriagem: boolean;
  moduleArcoIris: boolean;
  logoUrl: string | null;
  toleranceMinutes: number;
  createdAt: string;
  updatedAt: string;
  totalPatients: number;
  totalProfessionals: number;
  totalAppointments: number;
  totalWaitingList: number;
};

type DashboardStats = {
  totalCompanies: number;
  activeCompanies: number;
  inactiveCompanies: number;
  totalPatients: number;
  totalProfessionals: number;
  totalAppointments: number;
  totalWaitingList: number;
  appointmentsToday: number;
  companiesWithArcoIris: number;
  companiesWithTriagem: number;
  companiesWithPonto: number;
};

type CompanyForm = {
  slug: string;
  name: string;
  adminPassword: string;
  modulePonto: boolean;
  moduleTriagem: boolean;
  moduleArcoIris: boolean;
  active: boolean;
  logoUrl: string;
  toleranceMinutes: number;
};

const emptyForm: CompanyForm = {
  slug: "",
  name: "",
  adminPassword: "",
  modulePonto: true,
  moduleTriagem: false,
  moduleArcoIris: false,
  active: true,
  logoUrl: "",
  toleranceMinutes: 10,
};

// ── Row mapper ──────────────────────────────────────────────────────────────

function mapCompanyRow(r: Record<string, unknown>): Company {
  return {
    id: Number(r.id),
    name: String(r.name || ""),
    slug: String(r.slug || ""),
    active: Boolean(r.active),
    modulePonto: Boolean(r.module_ponto),
    moduleTriagem: Boolean(r.module_triagem),
    moduleArcoIris: Boolean(r.module_arco_iris),
    logoUrl: r.logo_url ? String(r.logo_url) : null,
    toleranceMinutes: Number(r.tolerance_minutes || 10),
    createdAt: String(r.created_at || ""),
    updatedAt: String(r.updated_at || ""),
    totalPatients: Number(r.total_patients || 0),
    totalProfessionals: Number(r.total_professionals || 0),
    totalAppointments: Number(r.total_appointments || 0),
    totalWaitingList: Number(r.total_waiting_list || 0),
  };
}

function mapStats(r: Record<string, unknown>): DashboardStats {
  return {
    totalCompanies: Number(r.total_companies || 0),
    activeCompanies: Number(r.active_companies || 0),
    inactiveCompanies: Number(r.inactive_companies || 0),
    totalPatients: Number(r.total_patients || 0),
    totalProfessionals: Number(r.total_professionals || 0),
    totalAppointments: Number(r.total_appointments || 0),
    totalWaitingList: Number(r.total_waiting_list || 0),
    appointmentsToday: Number(r.appointments_today || 0),
    companiesWithArcoIris: Number(r.companies_with_arco_iris || 0),
    companiesWithTriagem: Number(r.companies_with_triagem || 0),
    companiesWithPonto: Number(r.companies_with_ponto || 0),
  };
}

const MASTER_SESSION_KEY = "nfs_master_session";

function getMasterPassword(): string | null {
  try {
    return sessionStorage.getItem(MASTER_SESSION_KEY);
  } catch {
    return null;
  }
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function PainelMaster() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Auth state
  const [masterPassword, setMasterPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  // Data state
  const [companies, setCompanies] = useState<Company[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CompanyForm>({ ...emptyForm });
  const [formLoading, setFormLoading] = useState(false);

  // Expand state
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Delete confirm
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // Check existing session
  useEffect(() => {
    const saved = getMasterPassword();
    if (saved) {
      setMasterPassword(saved);
      setAuthenticated(true);
    }
  }, []);

  // ── Auth ─────────────────────────────────────────────────────────────────

  const handleLogin = async () => {
    setAuthLoading(true);
    setAuthError("");
    try {
      const supabase = requireSupabase();
      const { data, error } = await supabase.rpc("authenticate_master", {
        p_password: masterPassword,
      });
      if (error) throw error;
      if (!data) {
        setAuthError("Senha master incorreta.");
        return;
      }
      sessionStorage.setItem(MASTER_SESSION_KEY, masterPassword);
      setAuthenticated(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao autenticar.";
      setAuthError(message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem(MASTER_SESSION_KEY);
    setAuthenticated(false);
    setMasterPassword("");
    setCompanies([]);
    setStats(null);
  };

  // ── Data fetching ────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    const pw = getMasterPassword();
    if (!pw) return;
    setLoading(true);
    try {
      const supabase = requireSupabase();
      const [companiesRes, statsRes] = await Promise.all([
        supabase.rpc("master_list_companies", { p_master_password: pw }),
        supabase.rpc("master_dashboard_stats", { p_master_password: pw }),
      ]);
      if (companiesRes.error) throw companiesRes.error;
      if (statsRes.error) throw statsRes.error;

      const rows = Array.isArray(companiesRes.data) ? companiesRes.data : [];
      setCompanies(rows.map((r: Record<string, unknown>) => mapCompanyRow(r)));

      const statsRow = Array.isArray(statsRes.data) ? statsRes.data[0] : statsRes.data;
      if (statsRow) setStats(mapStats(statsRow as Record<string, unknown>));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao carregar dados.";
      toast({ title: "Erro", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (authenticated) fetchData();
  }, [authenticated, fetchData]);

  // ── Company CRUD ─────────────────────────────────────────────────────────

  const handleSave = async () => {
    const pw = getMasterPassword();
    if (!pw) return;
    if (!form.slug.trim() || !form.name.trim()) {
      toast({ title: "Erro", description: "Slug e nome são obrigatórios.", variant: "destructive" });
      return;
    }
    if (!editingId && !form.adminPassword.trim()) {
      toast({ title: "Erro", description: "Senha de admin obrigatória para nova empresa.", variant: "destructive" });
      return;
    }

    setFormLoading(true);
    try {
      const supabase = requireSupabase();
      const { error } = await supabase.rpc("master_upsert_company", {
        p_master_password: pw,
        p_slug: form.slug.trim().toLowerCase(),
        p_name: form.name.trim(),
        p_admin_password: form.adminPassword.trim() || null,
        p_module_ponto: form.modulePonto,
        p_module_triagem: form.moduleTriagem,
        p_module_arco_iris: form.moduleArcoIris,
        p_active: form.active,
        p_logo_url: form.logoUrl.trim() || null,
        p_tolerance_minutes: form.toleranceMinutes,
      });
      if (error) throw error;
      toast({ title: editingId ? "Empresa atualizada" : "Empresa criada", description: form.name });
      setShowForm(false);
      setEditingId(null);
      setForm({ ...emptyForm });
      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao salvar empresa.";
      toast({ title: "Erro", description: message, variant: "destructive" });
    } finally {
      setFormLoading(false);
    }
  };

  const handleToggle = async (company: Company) => {
    const pw = getMasterPassword();
    if (!pw) return;
    try {
      const supabase = requireSupabase();
      const { error } = await supabase.rpc("master_toggle_company", {
        p_master_password: pw,
        p_company_id: company.id,
        p_active: !company.active,
      });
      if (error) throw error;
      toast({ title: company.active ? "Empresa desativada" : "Empresa ativada", description: company.name });
      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao alterar status.";
      toast({ title: "Erro", description: message, variant: "destructive" });
    }
  };

  const handleDelete = async (company: Company) => {
    const pw = getMasterPassword();
    if (!pw) return;
    try {
      const supabase = requireSupabase();
      const { error } = await supabase.rpc("master_delete_company", {
        p_master_password: pw,
        p_company_id: company.id,
      });
      if (error) throw error;
      toast({ title: "Empresa excluída", description: company.name });
      setDeleteConfirmId(null);
      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao excluir empresa.";
      toast({ title: "Erro", description: message, variant: "destructive" });
    }
  };

  const openEdit = (company: Company) => {
    setForm({
      slug: company.slug,
      name: company.name,
      adminPassword: "",
      modulePonto: company.modulePonto,
      moduleTriagem: company.moduleTriagem,
      moduleArcoIris: company.moduleArcoIris,
      active: company.active,
      logoUrl: company.logoUrl || "",
      toleranceMinutes: company.toleranceMinutes,
    });
    setEditingId(company.id);
    setShowForm(true);
  };

  const openNew = () => {
    setForm({ ...emptyForm });
    setEditingId(null);
    setShowForm(true);
  };

  // ── Login Screen ─────────────────────────────────────────────────────────

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 mb-4">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-cyan-400 bg-clip-text text-transparent">
              Painel Master
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Gerenciamento centralizado de empresas</p>
          </div>

          <div className="space-y-4">
            <div>
              <Label className="text-sm text-muted-foreground">Senha Master</Label>
              <Input
                type="password"
                placeholder="Digite a senha master..."
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                className="mt-1"
              />
            </div>
            {authError && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <XCircle className="w-4 h-4" /> {authError}
              </p>
            )}
            <Button
              onClick={handleLogin}
              disabled={authLoading || !masterPassword}
              className="w-full"
            >
              {authLoading ? "Verificando..." : "Entrar"}
            </Button>
          </div>

          <div className="mt-6 text-center">
            <button
              onClick={() => setLocation("/portal")}
              className="text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              ← Voltar ao Portal
            </button>
          </div>
        </Card>
      </div>
    );
  }

  // ── Main Dashboard ────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-primary to-cyan-400 bg-clip-text text-transparent">
                Painel Master
              </h1>
              <p className="text-xs text-muted-foreground">Gerenciamento multi-empresa</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setLocation("/portal")} className="text-xs gap-1">
              <ArrowLeft className="w-3.5 h-3.5" /> Portal
            </Button>
            <Button variant="ghost" onClick={handleLogout} className="text-xs text-muted-foreground">
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard icon={Building2} label="Empresas" value={stats.totalCompanies} sub={`${stats.activeCompanies} ativas`} color="text-primary" />
            <StatCard icon={UserRound} label="Pacientes" value={stats.totalPatients} color="text-pink-400" />
            <StatCard icon={Users} label="Profissionais" value={stats.totalProfessionals} color="text-violet-400" />
            <StatCard icon={CalendarDays} label="Agendamentos" value={stats.totalAppointments} sub={`${stats.appointmentsToday} hoje`} color="text-emerald-400" />
            <StatCard icon={ListTodo} label="Fila de Espera" value={stats.totalWaitingList} color="text-amber-400" />
            <StatCard icon={Activity} label="Módulos" value={stats.companiesWithArcoIris} sub={`${stats.companiesWithPonto} ponto / ${stats.companiesWithTriagem} triag.`} color="text-cyan-400" />
          </div>
        )}

        {/* Actions Bar */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Empresas {companies.length > 0 && <span className="text-muted-foreground font-normal text-sm">({companies.length})</span>}
          </h2>
          <Button onClick={openNew} className="gap-1.5">
            <Plus className="w-4 h-4" /> Nova Empresa
          </Button>
        </div>

        {/* Company Form Modal */}
        {showForm && (
          <Card className="p-6 border-primary/30">
            <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              {editingId ? "Editar Empresa" : "Nova Empresa"}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Nome da Empresa *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Clínica NFS" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Slug (identificador) *</Label>
                <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="Ex: clinica-nfs" className="mt-1" disabled={!!editingId} />
                {!editingId && <p className="text-[10px] text-muted-foreground mt-0.5">Usado no login. Não pode ser alterado depois.</p>}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{editingId ? "Nova Senha Admin (deixe vazio para manter)" : "Senha Admin *"}</Label>
                <Input type="password" value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} placeholder={editingId ? "••••••" : "Mínimo 6 caracteres"} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Tolerância (min)</Label>
                <Input type="number" value={form.toleranceMinutes} onChange={(e) => setForm({ ...form, toleranceMinutes: Number(e.target.value) })} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">URL do Logo</Label>
                <Input value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} placeholder="https://..." className="mt-1" />
              </div>
              <div className="flex flex-col gap-2 justify-center">
                <Label className="text-xs text-muted-foreground">Módulos Ativos</Label>
                <div className="flex flex-wrap gap-3">
                  <ModuleToggle label="Gestão Terapêutica" checked={form.moduleArcoIris} onChange={(v) => setForm({ ...form, moduleArcoIris: v })} color="bg-primary/20 text-primary border-primary/40" />
                  <ModuleToggle label="Triagem" checked={form.moduleTriagem} onChange={(v) => setForm({ ...form, moduleTriagem: v })} color="bg-violet-500/20 text-violet-400 border-violet-500/40" />
                  <ModuleToggle label="Ponto" checked={form.modulePonto} onChange={(v) => setForm({ ...form, modulePonto: v })} color="bg-emerald-500/20 text-emerald-400 border-emerald-500/40" />
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <Button onClick={handleSave} disabled={formLoading}>
                {formLoading ? "Salvando..." : editingId ? "Atualizar" : "Criar Empresa"}
              </Button>
              <Button variant="ghost" onClick={() => { setShowForm(false); setEditingId(null); }}>
                Cancelar
              </Button>
            </div>
          </Card>
        )}

        {/* Companies List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : companies.length === 0 ? (
          <Card className="p-12 text-center">
            <Building2 className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">Nenhuma empresa cadastrada.</p>
            <Button onClick={openNew} className="mt-4 gap-1.5">
              <Plus className="w-4 h-4" /> Cadastrar primeira empresa
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {companies.map((company) => (
              <MotionCard
                key={company.id}
                className={`p-4 ${!company.active ? "opacity-60" : ""}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: company.active ? 1 : 0.6, y: 0 }}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left: Company info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground truncate">{company.name}</h3>
                      <Badge className={company.active
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        : "bg-red-500/15 text-red-400 border-red-500/30"
                      }>
                        {company.active ? "Ativa" : "Inativa"}
                      </Badge>
                      <span className="text-xs text-muted-foreground font-mono">/{company.slug}</span>
                    </div>

                    {/* Stats inline */}
                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><UserRound className="w-3.5 h-3.5 text-pink-400" /> {company.totalPatients} pacientes</span>
                      <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5 text-violet-400" /> {company.totalProfessionals} profissionais</span>
                      <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5 text-emerald-400" /> {company.totalAppointments} agendamentos</span>
                      <span className="flex items-center gap-1"><ListTodo className="w-3.5 h-3.5 text-amber-400" /> {company.totalWaitingList} em espera</span>
                    </div>

                    {/* Modules */}
                    <div className="flex gap-1.5 mt-2">
                      {company.moduleArcoIris && <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px]">Gestão Terapêutica</Badge>}
                      {company.moduleTriagem && <Badge className="bg-violet-500/15 text-violet-400 border-violet-500/30 text-[10px]">Triagem</Badge>}
                      {company.modulePonto && <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">Ponto</Badge>}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setExpandedId(expandedId === company.id ? null : company.id)}
                      className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground"
                      title="Detalhes"
                    >
                      {expandedId === company.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => openEdit(company)}
                      className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-primary"
                      title="Editar"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleToggle(company)}
                      className={`p-2 rounded-lg hover:bg-secondary transition-colors ${company.active ? "text-amber-400" : "text-emerald-400"}`}
                      title={company.active ? "Desativar" : "Ativar"}
                    >
                      {company.active ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                    </button>
                    {deleteConfirmId === company.id ? (
                      <div className="flex items-center gap-1">
                        <Button variant="destructive" onClick={() => handleDelete(company)} className="text-[10px] px-2 py-1 h-auto">
                          Confirmar
                        </Button>
                        <button onClick={() => setDeleteConfirmId(null)} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground text-xs">
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmId(company.id)}
                        className="p-2 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded details */}
                {expandedId === company.id && (
                  <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                    <div>
                      <span className="text-muted-foreground">Criada em</span>
                      <p className="text-foreground font-medium">{new Date(company.createdAt).toLocaleDateString("pt-BR")}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Atualizada em</span>
                      <p className="text-foreground font-medium">{new Date(company.updatedAt).toLocaleDateString("pt-BR")}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Tolerância</span>
                      <p className="text-foreground font-medium">{company.toleranceMinutes} min</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Logo</span>
                      <p className="text-foreground font-medium truncate">{company.logoUrl || "Não definido"}</p>
                    </div>
                  </div>
                )}
              </MotionCard>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: number; sub?: string; color: string;
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </Card>
  );
}

function ModuleToggle({ label, checked, onChange, color }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; color: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
        checked ? color : "bg-secondary/50 text-muted-foreground border-border"
      }`}
    >
      {checked ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
      {label}
    </button>
  );
}
