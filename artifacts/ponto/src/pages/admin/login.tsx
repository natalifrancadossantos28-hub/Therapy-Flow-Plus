import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const [password, setPassword] = useState("");
  const { toast } = useToast();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "admin123") {
      sessionStorage.setItem("nfs_ponto_admin", "true");
      setLocation("/admin/dashboard");
    } else {
      toast({
        title: "Senha incorreta",
        description: "A senha de administrador está incorreta.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4">
      <div className="mb-8 text-center">
        <h1 className="font-display text-4xl font-bold text-primary mb-2">NFs – Bater Ponto</h1>
        <p className="text-muted-foreground">Sistema de Gestão de Ponto</p>
      </div>

      <Card className="w-full max-w-sm glass-card">
        <CardHeader className="space-y-1">
          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4 mx-auto">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-2xl text-center">Acesso Restrito</CardTitle>
          <CardDescription className="text-center">
            Área administrativa. Informe a senha.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Senha de administrador"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-background/50 border-white/10 focus-visible:ring-primary/50 text-center text-lg tracking-widest"
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full" size="lg">
              Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
