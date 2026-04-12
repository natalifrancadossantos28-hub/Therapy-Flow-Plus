import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Building2, Trash2, Users, Edit, X, Check, Copy, Clock, Stethoscope, LayoutDashboard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getSession } from "@/components/AdminGuard";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

type Company = {
  id: number; name: string; slug: string; active: boolean;
  toleranceMinutes: number; overtimeBlockEnabled: boolean;
  defaultBreakMinutes: number; logoUrl: string | null;
  modulePonto: boolean; moduleTriagem: boolean; moduleArcoIris: boolean;
  employeeCount: number; createdAt: string;
};

type FormData = {
  name: string; slug: string; adminPassword: string;
  toleranceMinutes: number; overtimeBlockEnabled: boolean; defaultBreakMinutes: number;
  modulePonto: boolean; moduleTriagem: boolean; moduleArcoIris: boolean;
};

function authHeaders() {
  const s = getSession();
  if (!s || s.type !== "master") return {};
  return { "x-master-auth": s.masterToken };
}

async function fetchCompanies(): Promise<Company[]> {
  const res = await fetch(`${BASE_URL}/api/ponto/companies`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Falha ao carregar empresas.");
  return res.json();
}

export default function CompaniesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: companies = [], isLoading } = useQuery({ queryKey: ["ponto-companies"], queryFn: fetchCompanies });

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>({
    name: "", slug: "", adminPassword: "admin123",
    toleranceMinutes: 10, overtimeBlockEnabled: true, defaultBreakMinutes: 60,
    modulePonto: true, moduleTriagem: false, moduleArcoIris: false,
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await fetch(`${BASE_URL}/api/ponto/companies`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ponto-companies"] });
      toast({ title: "Empresa criada com sucesso!" });
      setShowForm(false);
      resetForm();
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<FormData> }) => {
      const res = await fetch(`${BASE_URL}/api/ponto/companies/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ponto-companies"] });
      toast({ title: "Empresa atualizada." });
      setEditId(null);
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE_URL}/api/ponto/companies/${id}`, {
        method: "DELETE", headers: authHeaders(),
      });
      if (!res.ok && res.status !== 204) throw new Error("Falha ao excluir.");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ponto-companies"] }); toast({ title: "Empresa excluída." }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const resetForm = () => setForm({
    name: "", slug: "", adminPassword: "admin123",
    toleranceMinutes: 10, overtimeBlockEnabled: true, defaultBreakMinutes: 60,
    modulePonto: true, moduleTriagem: false, moduleArcoIris: false,
  });

  const copyKioskUrl = (slug: string) => {
    const url = `${window.location.origin}${BASE_URL}/?c=${slug}`;
    navigator.clipboard.writeText(url);
    toast({ title: "URL do quiosque copiada!", description: url });
  };

  const MODULE_LABELS = [
    { key: "modulePonto", label: "Bater Ponto", icon: Clock, color: "text-blue-400" },
    { key: "moduleTriagem", label: "Triagem", icon: Stethoscope, color: "text-violet-400" },
    { key: "moduleArcoIris", label: "Gestão Terapêutica", icon: LayoutDashboard, color: "text-cyan-400" },
  ] as const;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Empresas</h1>
          <p className="text-muted-foreground mt-1">Gerencie todas as empresas e seus módulos ativos.</p>
        </div>
        <Button onClick={() => { setShowForm(true); resetForm(); }} className="gap-2">
          <Plus className="w-4 h-4" /> Nova Empresa
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <Card className="glass-card border-primary/20">
          <CardHeader>
            <CardTitle className="text-lg">Nova Empresa</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">Nome da Empresa</label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Clínica São Paulo" className="bg-background/50 border-white/10" />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">Identificador (slug)</label>
                <Input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") }))} placeholder="clinica-sao-paulo" className="bg-background/50 border-white/10 font-mono" />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">Senha do Admin</label>
                <Input type="password" value={form.adminPassword} onChange={e => setForm(f => ({ ...f, adminPassword: e.target.value }))} className="bg-background/50 border-white/10" />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1 block">Tolerância (minutos)</label>
                <Input type="number" min={0} max={60} value={form.toleranceMinutes} onChange={e => setForm(f => ({ ...f, toleranceMinutes: Number(e.target.value) }))} className="bg-background/50 border-white/10" />
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.overtimeBlockEnabled} onCheckedChange={v => setForm(f => ({ ...f, overtimeBlockEnabled: v }))} />
                <label className="text-sm font-medium">Bloquear hora extra</label>
              </div>
            </div>

            <div className="mt-5 border-t border-white/10 pt-5">
              <p className="text-sm font-semibold text-foreground mb-3">Módulos Contratados</p>
              <div className="flex flex-wrap gap-4">
                {MODULE_LABELS.map(({ key, label, icon: Icon, color }) => (
                  <div key={key} className="flex items-center gap-2">
                    <Switch checked={form[key]} onCheckedChange={v => setForm(f => ({ ...f, [key]: v }))} />
                    <Icon className={`w-4 h-4 ${color}`} />
                    <label className="text-sm">{label}</label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button onClick={() => createMutation.mutate(form)} disabled={!form.name || !form.slug || createMutation.isPending}>
                {createMutation.isPending ? "Criando..." : <><Check className="w-4 h-4 mr-2" />Criar Empresa</>}
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>
                <X className="w-4 h-4 mr-2" />Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Companies list */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1,2,3].map(i => <Card key={i} className="h-48 animate-pulse bg-secondary/50" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {companies.map(company => (
            <Card key={company.id} className="glass-card">
              <CardContent className="p-6">
                {editId === company.id ? (
                  <EditCompanyForm
                    company={company}
                    onSave={data => updateMutation.mutate({ id: company.id, data })}
                    onCancel={() => setEditId(null)}
                    saving={updateMutation.isPending}
                  />
                ) : (
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-bold text-foreground">{company.name}</h3>
                          <p className="text-xs text-muted-foreground font-mono">/{company.slug}</p>
                        </div>
                      </div>
                      <Badge variant={company.active ? "default" : "secondary"} className="text-xs">
                        {company.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>

                    {/* Module badges */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {MODULE_LABELS.map(({ key, label, icon: Icon, color }) => (
                        company[key] ? (
                          <span key={key} className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-white/5 border border-white/10 ${color}`}>
                            <Icon className="w-3 h-3" />{label}
                          </span>
                        ) : null
                      ))}
                    </div>

                    <div className="grid grid-cols-3 gap-2 mb-4 text-xs">
                      <div className="bg-secondary/50 rounded-lg p-2 text-center">
                        <p className="text-muted-foreground">Tolerância</p>
                        <p className="font-bold text-foreground">{company.toleranceMinutes} min</p>
                      </div>
                      <div className="bg-secondary/50 rounded-lg p-2 text-center">
                        <p className="text-muted-foreground">H. extra</p>
                        <p className={`font-bold ${company.overtimeBlockEnabled ? "text-red-400" : "text-green-400"}`}>
                          {company.overtimeBlockEnabled ? "Bloqueado" : "Livre"}
                        </p>
                      </div>
                      <div className="bg-secondary/50 rounded-lg p-2 text-center">
                        <p className="text-muted-foreground">Funcionários</p>
                        <p className="font-bold text-foreground flex items-center justify-center gap-1">
                          <Users className="w-3 h-3" />{company.employeeCount}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 border-white/10 text-xs" onClick={() => copyKioskUrl(company.slug)}>
                        <Copy className="w-3 h-3 mr-1" /> URL Quiosque
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditId(company.id)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => { if (confirm(`Excluir "${company.name}" e todos os seus dados?`)) deleteMutation.mutate(company.id); }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function EditCompanyForm({ company, onSave, onCancel, saving }: {
  company: Company; onSave: (d: Partial<FormData>) => void; onCancel: () => void; saving: boolean;
}) {
  const [form, setForm] = useState({
    name: company.name,
    adminPassword: "",
    toleranceMinutes: company.toleranceMinutes,
    overtimeBlockEnabled: company.overtimeBlockEnabled,
    defaultBreakMinutes: company.defaultBreakMinutes,
    active: company.active,
    modulePonto: company.modulePonto,
    moduleTriagem: company.moduleTriagem,
    moduleArcoIris: company.moduleArcoIris,
  });
  return (
    <div className="space-y-3">
      <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome" className="bg-background/50 border-white/10 text-sm" />
      <Input type="password" value={form.adminPassword} onChange={e => setForm(f => ({ ...f, adminPassword: e.target.value }))} placeholder="Nova senha (deixe em branco para manter)" className="bg-background/50 border-white/10 text-sm" />
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground w-28">Tolerância (min)</label>
        <Input type="number" min={0} max={60} value={form.toleranceMinutes} onChange={e => setForm(f => ({ ...f, toleranceMinutes: Number(e.target.value) }))} className="bg-background/50 border-white/10 text-sm w-20" />
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={form.overtimeBlockEnabled} onCheckedChange={v => setForm(f => ({ ...f, overtimeBlockEnabled: v }))} />
        <label className="text-sm">Bloquear hora extra</label>
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={form.active} onCheckedChange={v => setForm(f => ({ ...f, active: v }))} />
        <label className="text-sm">Empresa ativa</label>
      </div>

      <div className="border-t border-white/10 pt-3">
        <p className="text-xs text-muted-foreground mb-2 font-semibold uppercase tracking-wider">Módulos</p>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Switch checked={form.modulePonto} onCheckedChange={v => setForm(f => ({ ...f, modulePonto: v }))} />
            <label className="text-sm flex items-center gap-1"><Clock className="w-3 h-3 text-blue-400" />Bater Ponto</label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.moduleTriagem} onCheckedChange={v => setForm(f => ({ ...f, moduleTriagem: v }))} />
            <label className="text-sm flex items-center gap-1"><Stethoscope className="w-3 h-3 text-violet-400" />Triagem Multidisciplinar</label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.moduleArcoIris} onCheckedChange={v => setForm(f => ({ ...f, moduleArcoIris: v }))} />
            <label className="text-sm flex items-center gap-1"><LayoutDashboard className="w-3 h-3 text-cyan-400" />Gestão Terapêutica</label>
          </div>
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button size="sm" onClick={() => onSave(form)} disabled={saving}><Check className="w-3 h-3 mr-1" />{saving ? "..." : "Salvar"}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}><X className="w-3 h-3 mr-1" />Cancelar</Button>
      </div>
    </div>
  );
}
