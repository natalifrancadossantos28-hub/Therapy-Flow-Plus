import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Settings, Clock, ShieldOff, Coffee, Lock, Save, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getSession } from "@/components/AdminGuard";
import { getCompanySettings, updateCompanySettings, type PontoCompanySettings } from "@/lib/ponto-rpc";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function SettingsPage() {
  const { toast } = useToast();
  const session = getSession();
  const companyId = session?.type === "company" ? session.companyId : null;

  const [settings, setSettings] = useState<PontoCompanySettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    if (!companyId) return;
    getCompanySettings()
      .then(s => {
        if (s) setSettings(s);
        else toast({ title: "Erro ao carregar configurações", variant: "destructive" });
      })
      .catch((e: Error) => toast({ title: "Erro ao carregar configurações", description: e.message, variant: "destructive" }));
  }, [companyId]);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await updateCompanySettings({
        name: settings.name,
        toleranceMinutes: settings.toleranceMinutes,
        overtimeBlockEnabled: settings.overtimeBlockEnabled,
        defaultBreakMinutes: settings.defaultBreakMinutes,
        logoUrl: settings.logoUrl,
        newAdminPassword: newPassword.trim() || undefined,
      });
      setSettings(updated);
      if (newPassword.trim()) {
        // Update session with new password so subsequent RPC calls authenticate.
        sessionStorage.setItem("nfs_ponto_session", JSON.stringify({
          ...(session as any),
          adminToken: newPassword,
        }));
        setNewPassword("");
      }
      toast({ title: "Configurações salvas com sucesso!" });
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message ?? "Falha ao salvar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const copyKioskUrl = () => {
    if (!settings) return;
    const url = `${window.location.origin}${BASE_URL}/?c=${settings.slug}`;
    navigator.clipboard.writeText(url);
    toast({ title: "URL do quiosque copiada!", description: url });
  };

  if (!settings) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Carregando configurações...</div>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
          <Settings className="w-8 h-8 text-primary" /> Configurações
        </h1>
        <p className="text-muted-foreground mt-1">Ajuste as regras de negócio da sua empresa.</p>
      </div>

      {/* Kiosk URL */}
      <Card className="glass-card border-primary/20">
        <CardHeader>
          <CardTitle className="text-base">URL do Quiosque</CardTitle>
          <CardDescription>Compartilhe esta URL na tela de bater ponto da sua empresa.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="flex-1 bg-secondary/50 rounded-lg px-3 py-2 text-sm font-mono text-muted-foreground truncate">
              {window.location.origin}{BASE_URL}/?c={settings.slug}
            </div>
            <Button variant="outline" size="sm" className="border-white/10 shrink-0" onClick={copyKioskUrl}>
              <Copy className="w-4 h-4 mr-2" /> Copiar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* General info */}
      <Card className="glass-card">
        <CardHeader><CardTitle className="text-base">Informações Gerais</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">Nome da Empresa</label>
            <Input
              value={settings.name}
              onChange={e => setSettings(s => s ? { ...s, name: e.target.value } : s)}
              className="bg-background/50 border-white/10"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1 block">Identificador (somente leitura)</label>
            <Input value={settings.slug} readOnly className="bg-background/20 border-white/5 font-mono text-muted-foreground" />
          </div>
        </CardContent>
      </Card>

      {/* Schedule rules */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" /> Regras de Horário
          </CardTitle>
          <CardDescription>Defina as tolerâncias e bloqueios de registro de ponto.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Tolerância de Entrada e Saída</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Quantos minutos antes/depois o registro é aceito.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number" min={0} max={60}
                value={settings.toleranceMinutes}
                onChange={e => setSettings(s => s ? { ...s, toleranceMinutes: Number(e.target.value) } : s)}
                className="bg-background/50 border-white/10 w-20 text-center"
              />
              <span className="text-sm text-muted-foreground">min</span>
            </div>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground flex items-center gap-2">
                <ShieldOff className="w-4 h-4 text-orange-400" /> Bloquear Hora Extra
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Impede saída além do horário previsto + tolerância. Se desativado, permite qualquer horário.
              </p>
            </div>
            <Switch
              checked={settings.overtimeBlockEnabled}
              onCheckedChange={v => setSettings(s => s ? { ...s, overtimeBlockEnabled: v } : s)}
            />
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground flex items-center gap-2">
                <Coffee className="w-4 h-4 text-amber-400" /> Intervalo Padrão
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tempo de intervalo padrão para novos funcionários.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={settings.defaultBreakMinutes}
                onChange={e => setSettings(s => s ? { ...s, defaultBreakMinutes: Number(e.target.value) } : s)}
                className="bg-background/50 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-foreground"
              >
                <option value={15}>15 minutos</option>
                <option value={60}>1 hora</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="w-4 h-4 text-primary" /> Senha de Administrador
          </CardTitle>
          <CardDescription>Deixe em branco para manter a senha atual.</CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            type="password"
            placeholder="Nova senha..."
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            className="bg-background/50 border-white/10"
          />
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} size="lg" className="w-full gap-2">
        <Save className="w-4 h-4" />
        {saving ? "Salvando..." : "Salvar Configurações"}
      </Button>
    </div>
  );
}
