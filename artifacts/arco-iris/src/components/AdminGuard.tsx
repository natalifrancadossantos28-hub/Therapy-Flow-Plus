import { useEffect } from "react";
import { useLocation } from "wouter";
import { getCompanySession, getCurrentScope, getProfessionalSession } from "@/lib/portal-session";

// Fase 6: AdminGuard agora redireciona pro /portal quando nao ha sessao
// apropriada. Aceita um `requiredScope` pra diferenciar acesso admin (pleno)
// de recepcao (restrito ao /reception e rotas compartilhadas).

type Props = {
  children: React.ReactNode;
  requiredScope?: "admin" | "reception";
};

// Mantido para compatibilidade com chamadas existentes (arco-rpc, paginas).
export function isAuthenticated(): boolean {
  const scope = getCurrentScope();
  return scope === "admin" || scope === "reception";
}

export function getCompanyId(): number | null {
  return getCompanySession()?.companyId ?? null;
}

export default function AdminGuard({ children, requiredScope = "admin" }: Props) {
  const [, setLocation] = useLocation();
  const scope = getCurrentScope();

  useEffect(() => {
    if (!scope) {
      setLocation("/portal");
      return;
    }
    if (scope === "professional") {
      // Profissional nao deve ver telas admin/recepcao.
      setLocation("/agenda-profissionais");
      return;
    }
    // requiredScope == "admin": recepcao nao pode entrar.
    if (requiredScope === "admin" && scope === "reception") {
      setLocation("/reception");
    }
  }, [scope, requiredScope, setLocation]);

  if (!scope) return null;
  if (scope === "professional") return null;
  if (requiredScope === "admin" && scope === "reception") return null;
  // Evita warning de unused import em builds estritos.
  void getProfessionalSession;
  return <>{children}</>;
}
