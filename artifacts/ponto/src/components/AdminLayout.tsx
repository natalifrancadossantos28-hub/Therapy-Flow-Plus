import { Link, useLocation } from "wouter";
import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Users, Clock, CalendarDays, LogOut, MonitorDot, LayoutDashboard,
  FileText, Settings, Building2, ShieldAlert,
} from "lucide-react";
import { getSession, clearSession } from "./AdminGuard";

const companyNavItems = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/employees", label: "Funcionários", icon: Users },
  { href: "/admin/records", label: "Espelho de Ponto", icon: Clock },
  { href: "/admin/summary", label: "Resumo do Dia", icon: CalendarDays },
  { href: "/admin/reports", label: "Relatórios", icon: FileText },
  { href: "/admin/settings", label: "Configurações", icon: Settings },
];

const masterNavItems = [
  { href: "/admin/companies", label: "Empresas", icon: Building2 },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const session = getSession();
  const isMaster = session?.type === "master";

  const navItems = isMaster ? masterNavItems : companyNavItems;

  const handleLogout = () => {
    clearSession();
    setLocation("/admin/login");
  };

  const companyName = session?.type === "company" ? session.companyName : null;

  return (
    <div className="min-h-[100dvh] flex bg-background">
      <aside className="w-64 flex-shrink-0 border-r border-border/50 bg-card/30 backdrop-blur-xl flex flex-col">
        <div className="h-16 flex items-center px-4 border-b border-border/50 gap-2">
          <img src="/nfs-logo.png" alt="NFs systems" className="h-9 w-auto shrink-0" />
          {isMaster
            ? <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            : <Building2 className="w-4 h-4 text-primary shrink-0" />}
          <div className="min-w-0">
            <p className="font-display font-bold text-sm text-primary truncate">
              {isMaster ? "Painel Master" : (companyName ?? "NFs – Ponto")}
            </p>
            {isMaster && <p className="text-[10px] text-amber-400/80 truncate">Controle geral</p>}
            {!isMaster && session?.type === "company" && (
              <p className="text-[10px] text-muted-foreground truncate">/{session.companySlug}</p>
            )}
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1">
          {navItems.map(item => {
            const isActive =
              location === item.href ||
              (item.href === "/admin/employees" && location.startsWith("/admin/employees"));
            return (
              <Link key={item.href} href={item.href}>
                <Button variant={isActive ? "secondary" : "ghost"} className="w-full justify-start">
                  <item.icon className="mr-2 h-4 w-4" />
                  {item.label}
                </Button>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border/50 space-y-2">
          {!isMaster && (
            <Link href="/">
              <Button variant="outline" className="w-full justify-start border-white/10">
                <MonitorDot className="mr-2 h-4 w-4" />
                Modo Quiosque
              </Button>
            </Link>
          )}
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="w-full justify-start text-muted-foreground hover:text-destructive"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto">{children}</div>
        </div>
      </main>
    </div>
  );
}
