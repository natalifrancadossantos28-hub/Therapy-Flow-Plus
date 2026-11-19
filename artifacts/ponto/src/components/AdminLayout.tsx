import { Link, useLocation } from "wouter";
import { ReactNode, useState } from "react";
import {
  Users, Clock, CalendarDays, LogOut, MonitorDot, LayoutDashboard,
  FileText, Settings, Building2, ShieldAlert, Menu, X,
} from "lucide-react";
import { getSession, clearSession } from "./AdminGuard";

const companyNavItems = [
  { href: "/admin/dashboard", label: "Dashboard", curto: "Início", icon: LayoutDashboard, cor: "#a78bfa" },
  { href: "/admin/employees", label: "Funcionários", curto: "Equipe", icon: Users, cor: "#60a5fa" },
  { href: "/admin/records", label: "Espelho de Ponto", curto: "Espelho", icon: Clock, cor: "#f472b6" },
  { href: "/admin/summary", label: "Resumo do Dia", curto: "Hoje", icon: CalendarDays, cor: "#34d399" },
  { href: "/admin/reports", label: "Relatórios", curto: "Relatórios", icon: FileText, cor: "#fbbf24" },
  { href: "/admin/settings", label: "Configurações", curto: "Ajustes", icon: Settings, cor: "#22d3ee" },
];

const masterNavItems = [
  { href: "/admin/companies", label: "Empresas", curto: "Empresas", icon: Building2, cor: "#a78bfa" },
];

const ativoEm = (location: string, href: string) =>
  location === href || (href === "/admin/employees" && location.startsWith("/admin/employees"));

export function AdminLayout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const [menuAberto, setMenuAberto] = useState(false);
  const session = getSession();
  const isMaster = session?.type === "master";

  const navItems = isMaster ? masterNavItems : companyNavItems;
  const menuInferior = navItems.slice(0, 4);

  const handleLogout = () => {
    clearSession();
    setLocation("/admin/login");
  };

  const companyName = session?.type === "company" ? session.companyName : null;
  const subtitulo = isMaster ? "Painel Master" : (companyName ?? "Controle de Ponto");

  const Marca = () => (
    <div className="flex items-center gap-3 min-w-0">
      <img src={`${import.meta.env.BASE_URL}nfs-logo.png`} alt="NFs systems" className="w-11 h-11 rounded-xl bg-white p-0.5 object-contain shrink-0" />
      <div className="min-w-0 leading-tight">
        <span className="block font-display font-extrabold text-xl text-white truncate">NFs Ponto</span>
        <span className={`flex items-center gap-1 text-xs font-medium truncate ${isMaster ? "text-amber-400/90" : "text-muted-foreground"}`}>
          {isMaster && <ShieldAlert className="w-3 h-3 shrink-0" />}
          <span className="truncate">{subtitulo}</span>
        </span>
      </div>
    </div>
  );

  const Navegacao = () => (
    <>
      <nav aria-label="Menu principal" className="flex flex-col gap-1.5 flex-1">
        {navItems.map((item) => {
          const ativo = ativoEm(location, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuAberto(false)}
              className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[16px] font-display font-bold transition-all border ${ativo ? "nav-active-neon" : "border-transparent text-foreground/85 hover:bg-secondary/70"}`}
            >
              <span className="grid place-items-center w-9 h-9 rounded-xl shrink-0" style={{ background: `${item.cor}22`, boxShadow: ativo ? `0 0 14px -4px ${item.cor}` : undefined }}>
                <item.icon className="w-5 h-5" style={{ color: ativo ? "#fff" : item.cor }} />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-4 pt-4 border-t border-border/60 flex flex-col gap-1.5">
        {!isMaster && (
          <Link href="/" className="flex items-center gap-3 rounded-2xl px-3 py-2.5 font-semibold border border-violet-400/40 text-violet-200 hover:bg-violet-500/15 transition-all">
            <MonitorDot className="w-5 h-5" /> Modo Quiosque
          </Link>
        )}
        <button onClick={handleLogout} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 font-semibold text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all">
          <LogOut className="w-5 h-5" /> Sair
        </button>
      </div>
    </>
  );

  return (
    <div className="h-[100dvh] flex flex-col md:flex-row overflow-hidden">
      {/* Topo do celular */}
      <div className="topo-neon md:hidden flex items-center gap-2 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] z-20">
        <button aria-label={menuAberto ? "Fechar menu" : "Abrir menu"} onClick={() => setMenuAberto(!menuAberto)} className="grid place-items-center w-11 h-11 rounded-full text-foreground hover:bg-secondary/70 shrink-0">
          {menuAberto ? <X className="w-7 h-7" /> : <Menu className="w-7 h-7" />}
        </button>
        <Marca />
      </div>

      {/* Menu do celular */}
      {menuAberto && (
        <div className="menu-neon md:hidden fixed inset-x-0 top-[calc(3.75rem+env(safe-area-inset-top))] bottom-0 overflow-y-auto overscroll-contain z-30 px-4 pt-3 pb-28 flex flex-col">
          <Navegacao />
        </div>
      )}

      {/* Menu lateral (computador) */}
      <aside className="menu-neon hidden md:flex flex-col w-[270px] shrink-0 border-r border-border h-full p-3 overflow-y-auto">
        <div className="px-2 mt-2 mb-6"><Marca /></div>
        <Navegacao />
      </aside>

      {/* Conteúdo */}
      <main className="flex-1 min-w-0 overflow-y-auto px-4 pt-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:p-8">
        <div className="max-w-6xl mx-auto">{children}</div>
      </main>

      {/* Menu de baixo (celular) */}
      {menuInferior.length > 1 && (
        <nav aria-label="Atalhos" className="menu-inferior-neon md:hidden fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 px-2 pt-2 pb-[max(0.6rem,env(safe-area-inset-bottom))]">
          {menuInferior.map((m) => {
            const on = ativoEm(location, m.href) && !menuAberto;
            return (
              <Link key={m.href} href={m.href} onClick={() => setMenuAberto(false)} className={`flex flex-col items-center gap-1 py-1 text-[13px] font-semibold ${on ? "text-violet-300" : "text-foreground/60"}`}>
                <m.icon className={`w-7 h-7 ${on ? "drop-shadow-[0_0_8px_rgba(167,139,250,.9)]" : ""}`} />
                {m.curto}
                <span className={`h-1 w-14 rounded-full ${on ? "bg-gradient-to-r from-violet-500 to-fuchsia-400 shadow-[0_0_10px_rgba(167,139,250,.9)]" : "bg-transparent"}`} />
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
