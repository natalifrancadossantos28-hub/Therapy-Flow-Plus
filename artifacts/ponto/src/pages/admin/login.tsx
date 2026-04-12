import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Building2, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

type LoginMode = "company" | "master";

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [mode, setMode] = useState<LoginMode>("company");
  const [slug, setSlug] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCompanyLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug.trim() || !password.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/ponto/auth/company`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: slug.trim().toLowerCase(), password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Acesso negado", description: err.error || "Empresa ou senha incorretos.", variant: "destructive" });
        return;
      }
      const company = await res.json();
      sessionStorage.setItem("nfs_ponto_session", JSON.stringify({
        type: "company",
        companyId: company.id,
        companyName: company.name,
        companySlug: company.slug,
        adminToken: password,
        modulePonto: company.modulePonto,
        moduleTriagem: company.moduleTriagem,
        moduleArcoIris: company.moduleArcoIris,
      }));
      sessionStorage.setItem("nfs_ponto_admin", "true");
      setLocation("/admin/dashboard");
    } catch {
      toast({ title: "Erro", description: "Falha ao conectar. Tente novamente.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleMasterLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/ponto/auth/master`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        toast({ title: "Acesso negado", description: "Senha master incorreta.", variant: "destructive" });
        return;
      }
      sessionStorage.setItem("nfs_ponto_session", JSON.stringify({
        type: "master",
        masterToken: password,
      }));
      sessionStorage.setItem("nfs_ponto_admin", "true");
      setLocation("/admin/companies");
    } catch {
      toast({ title: "Erro", description: "Falha ao conectar. Tente novamente.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 bg-background">
      <div className="mb-8 text-center">
        <h1 className="font-display text-4xl font-bold text-primary mb-2">NFs – Bater Ponto</h1>
        <p className="text-muted-foreground">Sistema de Gestão de Ponto</p>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => { setMode("company"); setPassword(""); setSlug(""); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            mode === "company"
              ? "bg-primary text-primary-foreground shadow"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          <Building2 className="w-4 h-4" /> Empresa
        </button>
        <button
          onClick={() => { setMode("master"); setPassword(""); setSlug(""); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            mode === "master"
              ? "bg-primary text-primary-foreground shadow"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          <ShieldAlert className="w-4 h-4" /> Master
        </button>
      </div>

      <Card className="w-full max-w-sm glass-card">
        <CardHeader className="space-y-1">
          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4 mx-auto">
            {mode === "company" ? <Building2 className="w-6 h-6 text-primary" /> : <ShieldAlert className="w-6 h-6 text-primary" />}
          </div>
          <CardTitle className="text-2xl text-center">
            {mode === "company" ? "Acesso da Empresa" : "Acesso Master"}
          </CardTitle>
          <CardDescription className="text-center">
            {mode === "company"
              ? "Informe o identificador e senha da sua empresa."
              : "Painel de controle geral. Acesso restrito."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mode === "company" ? (
            <form onSubmit={handleCompanyLogin} className="space-y-4">
              <div className="space-y-2">
                <Input
                  placeholder="Identificador da empresa (ex: clinica-nfs)"
                  value={slug}
                  onChange={e => setSlug(e.target.value)}
                  className="bg-background/50 border-white/10"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Input
                  type="password"
                  placeholder="Senha de administrador"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="bg-background/50 border-white/10 text-center text-lg tracking-widest"
                />
              </div>
              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? "Verificando..." : "Entrar"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleMasterLogin} className="space-y-4">
              <div className="space-y-2">
                <Input
                  type="password"
                  placeholder="Senha master"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="bg-background/50 border-white/10 text-center text-lg tracking-widest"
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? "Verificando..." : <><Lock className="w-4 h-4 mr-2" />Entrar como Master</>}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
