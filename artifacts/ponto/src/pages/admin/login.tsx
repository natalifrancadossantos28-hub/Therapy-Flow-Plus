import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Building2, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";

type LoginMode = "company" | "master";

/**
 * Converts any exception from a Supabase call into a human-readable message
 * that actually tells the user what to fix. Replaces the old generic
 * "Verifique sua internet" / "Falha ao conectar".
 */
function describeAuthError(err: unknown): string {
  if (!isSupabaseConfigured) {
    return (
      "Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY " +
      "no painel da Vercel (Settings → Environment Variables) e refaça o deploy."
    );
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "Sem conexão com a internet. Verifique sua rede e tente de novo.";
  }
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return (
      "Não foi possível alcançar o Supabase. Confirme que VITE_SUPABASE_URL está " +
      "correta e que o projeto Supabase está ativo."
    );
  }
  return msg || "Erro inesperado ao autenticar.";
}

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
      const supabase = requireSupabase();
      const { data, error } = await supabase.rpc("authenticate_company", {
        p_slug: slug.trim().toLowerCase(),
        p_password: password,
      });
      if (error) {
        toast({ title: "Erro", description: describeAuthError(error), variant: "destructive" });
        return;
      }
      // RPC returns a single row or null. PostgREST normalises that to
      // either an object or null depending on the function signature; handle
      // both defensively.
      const company = Array.isArray(data) ? data[0] : data;
      if (!company) {
        toast({ title: "Acesso negado", description: "Empresa ou senha incorretos.", variant: "destructive" });
        return;
      }
      sessionStorage.setItem("nfs_ponto_session", JSON.stringify({
        type: "company",
        companyId: company.id,
        companyName: company.name,
        companySlug: company.slug,
        adminToken: password,
        modulePonto: company.module_ponto,
        moduleTriagem: company.module_triagem,
        moduleArcoIris: company.module_arco_iris,
      }));
      sessionStorage.setItem("nfs_ponto_admin", "true");
      setLocation("/admin/dashboard");
    } catch (err) {
      toast({ title: "Erro", description: describeAuthError(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleMasterLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    try {
      const supabase = requireSupabase();
      const { data, error } = await supabase.rpc("authenticate_master", {
        p_password: password,
      });
      if (error) {
        toast({ title: "Erro", description: describeAuthError(error), variant: "destructive" });
        return;
      }
      if (data !== true) {
        toast({ title: "Acesso negado", description: "Senha master incorreta.", variant: "destructive" });
        return;
      }
      sessionStorage.setItem("nfs_ponto_session", JSON.stringify({
        type: "master",
        masterToken: password,
      }));
      sessionStorage.setItem("nfs_ponto_admin", "true");
      setLocation("/admin/companies");
    } catch (err) {
      toast({ title: "Erro", description: describeAuthError(err), variant: "destructive" });
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
