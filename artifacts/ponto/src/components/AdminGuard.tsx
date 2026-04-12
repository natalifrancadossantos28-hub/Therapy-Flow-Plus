import { useLocation } from "wouter";
import { ReactNode, useEffect, useState } from "react";

export type PontoSession =
  | { type: "company"; companyId: number; companyName: string; companySlug: string; adminToken: string }
  | { type: "master"; masterToken: string };

export function getSession(): PontoSession | null {
  try {
    const raw = sessionStorage.getItem("nfs_ponto_session");
    if (!raw) return null;
    return JSON.parse(raw) as PontoSession;
  } catch {
    return null;
  }
}

export function clearSession() {
  sessionStorage.removeItem("nfs_ponto_session");
  sessionStorage.removeItem("nfs_ponto_admin");
}

export function AdminGuard({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const session = getSession();
    if (session) {
      setIsAuthenticated(true);
    } else {
      setIsAuthenticated(false);
      setLocation("/admin/login");
    }
  }, [setLocation]);

  if (isAuthenticated === null) return null;
  return isAuthenticated ? <>{children}</> : null;
}

export function MasterGuard({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    const session = getSession();
    if (session?.type === "master") {
      setIsAuthorized(true);
    } else {
      setIsAuthorized(false);
      setLocation("/admin/login");
    }
  }, [setLocation]);

  if (isAuthorized === null) return null;
  return isAuthorized ? <>{children}</> : null;
}
