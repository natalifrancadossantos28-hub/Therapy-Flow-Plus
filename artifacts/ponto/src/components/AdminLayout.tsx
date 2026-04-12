import { Link, useLocation } from "wouter";
import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Users, Clock, CalendarDays, LogOut, MonitorDot, LayoutDashboard, FileText } from "lucide-react";

const navItems = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/employees", label: "Funcionários", icon: Users },
  { href: "/admin/records", label: "Espelho de Ponto", icon: Clock },
  { href: "/admin/summary", label: "Resumo do Dia", icon: CalendarDays },
  { href: "/admin/reports", label: "Relatórios", icon: FileText },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();

  const handleLogout = () => {
    sessionStorage.removeItem("nfs_ponto_admin");
    setLocation("/admin/login");
  };

  return (
    <div className="min-h-[100dvh] flex bg-background">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-border/50 bg-card/30 backdrop-blur-xl flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-border/50">
          <h1 className="font-display font-bold text-lg text-primary">NFs – Bater Ponto</h1>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1">
          {navItems.map(item => {
            const isActive = location === item.href || location.startsWith(item.href + "/") || (item.href === "/admin/employees" && location.startsWith("/admin/employees"));
            return (
              <Link key={item.href} href={item.href}>
                <Button
                  variant={isActive ? "secondary" : "ghost"}
                  className="w-full justify-start"
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  {item.label}
                </Button>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border/50 space-y-2">
          <Link href="/">
            <Button variant="outline" className="w-full justify-start border-white/10">
              <MonitorDot className="mr-2 h-4 w-4" />
              Modo Quiosque
            </Button>
          </Link>
          <Button variant="ghost" onClick={handleLogout} className="w-full justify-start text-muted-foreground hover:text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
