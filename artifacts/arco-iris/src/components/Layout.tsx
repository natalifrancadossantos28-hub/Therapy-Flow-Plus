import { Link, useLocation } from "wouter";
import { Saudacao } from "@/components/Saudacao";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Users, UserRound, Calendar, CalendarDays, ClipboardList, ListTodo,
  Snowflake, Menu, X, Building2, LogOut, Brain, DoorOpen, CalendarOff, HeartHandshake, MessageSquareHeart, Inbox, PanelLeftClose, PanelLeftOpen, MonitorX, Palette, ChevronDown, BarChart3, FileText, CalendarClock } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { clearAllSessions, getCurrentScope } from "@/lib/portal-session";
import { logoutAllDevices } from "@/lib/session-epoch";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FontSizeToggle } from "@/components/FontSizeToggle";
import { useThemeTick } from "@/lib/theme";
import { BackgroundPicker } from "@/components/BackgroundPicker";
import { LembretesAviso } from "@/components/LembretesAviso";
import { appBackgroundStyle, useBackground } from "@/lib/background";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  scopes: Array<"admin" | "reception">;
  group: NavGroup;
};

type NavGroup = "Gestão" | "Atendimento" | "Organização" | "Administração";
const NAV_GROUPS: NavGroup[] = ["Gestão", "Atendimento", "Organização", "Administração"];

const navItems: NavItem[] = [
  { href: "/", label: "Painel de Gestão", icon: LayoutDashboard, scopes: ["admin"], group: "Gestão" },
  { href: "/prestacao-contas", label: "Prestação de Contas", icon: FileText, scopes: ["admin"], group: "Gestão" },
  { href: "/dashboard-detalhes", label: "Painel detalhado", icon: BarChart3, scopes: ["admin"], group: "Gestão" },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3, scopes: ["admin"], group: "Gestão" },
  { href: "/simulacao-fila", label: "Simulação da fila", icon: BarChart3, scopes: ["admin"], group: "Gestão" },
  { href: "/patients", label: "Pacientes", icon: Users, scopes: ["admin", "reception"], group: "Atendimento" },
  { href: "/professionals", label: "Profissionais (cadastro)", icon: UserRound, scopes: ["admin"], group: "Atendimento" },
  { href: "/reception", label: "Recepção", icon: ClipboardList, scopes: ["admin", "reception"], group: "Atendimento" },
  { href: "/waiting-list", label: "Fila de Espera", icon: ListTodo, scopes: ["admin"], group: "Organização" },
  { href: "/pausados", label: "Pausados / Busca Ativa", icon: Snowflake, scopes: ["admin", "reception"], group: "Atendimento" },
  { href: "/agenda", label: "Agenda Geral", icon: Calendar, scopes: ["admin"], group: "Organização" },
  { href: "/agenda-mensal", label: "Agenda Mensal", icon: CalendarDays, scopes: ["admin"], group: "Organização" },
  { href: "/agenda-administrativa", label: "Agenda Administrativa", icon: CalendarClock, scopes: ["admin"], group: "Organização" },
  { href: "/salas", label: "Gestão de Salas", icon: DoorOpen, scopes: ["admin"], group: "Organização" },
  { href: "/feriados", label: "Feriados & Ausências", icon: CalendarOff, scopes: ["admin", "reception"], group: "Organização" },
  { href: "/datas-conscientizacao", label: "Datas de Conscientização", icon: HeartHandshake, scopes: ["admin", "reception"], group: "Administração" },
  { href: "/central-mensagens", label: "Central de Mensagens", icon: MessageSquareHeart, scopes: ["admin"], group: "Administração" },
  { href: "/recados-equipe", label: "Recados da Equipe", icon: Inbox, scopes: ["admin"], group: "Administração" },
  { href: "/gestao-contratos", label: "Gestão de Contratos", icon: Building2, scopes: ["admin"], group: "Administração" },
  { href: "/ai-brain", label: "Cérebro IA", icon: Brain, scopes: ["admin"], group: "Administração" },
  { href: "/personalizacao-visual", label: "Configurações · Visual", icon: Palette, scopes: ["admin"], group: "Administração" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  useThemeTick(); // re-renderiza as páginas quando o tema muda (cores via JS)
  const [location, setLocation] = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem("nfs_sidebar_collapsed") === "1"; } catch { return false; }
  });
  const [closedGroups, setClosedGroups] = useState<NavGroup[]>(() => {
    try { return JSON.parse(localStorage.getItem("nfs_nav_closed") || "[]"); } catch { return []; }
  });
  const toggleGroup = (g: NavGroup) => setClosedGroups((c) => {
    const n = c.includes(g) ? c.filter((x) => x !== g) : [...c, g];
    try { localStorage.setItem("nfs_nav_closed", JSON.stringify(n)); } catch { /* ignore */ }
    return n;
  });
  const scope = getCurrentScope();
  // Recepcao/admin compartilham o mesmo Layout; profissional tem tela propria.
  const effectiveScope: "admin" | "reception" = scope === "reception" ? "reception" : "admin";
  const visibleItems = navItems.filter((i) => i.scopes.includes(effectiveScope));
  const bgKey = effectiveScope;
  const bgSubtitle = effectiveScope === "reception" ? "Telas da Recepção" : "Telas da Administração";
  const bgUrl = useBackground(bgKey);

  const handleLogout = () => {
    clearAllSessions();
    setLocation("/portal");
  };

  const handleLogoutOthers = async () => {
    if (!window.confirm("Desconectar todos os outros computadores e celulares? Eles vão precisar entrar de novo com a senha.")) return;
    try {
      await logoutAllDevices();
      window.alert("Pronto! Os outros computadores foram desconectados.");
    } catch (err: any) {
      window.alert(err?.message || "Não foi possível desconectar os outros computadores.");
    }
  };

  const NavLinks = ({ collapsed = false }: { collapsed?: boolean }) => (
    <>
      {NAV_GROUPS.map((group) => {
        const items = visibleItems.filter((i) => i.group === group);
        if (items.length === 0) return null;
        const closed = closedGroups.includes(group) && !collapsed;
        return (
          <div key={group} className="flex flex-col gap-1">
            {collapsed ? <div className="h-px bg-border/60 mx-2 my-1" /> : (
              <button type="button" onClick={() => toggleGroup(group)}
                className="flex items-center justify-between px-3 pt-3 pb-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground/80 hover:text-foreground">
                {group}<ChevronDown className={cn("w-3.5 h-3.5 transition-transform", closed && "-rotate-90")} />
              </button>
            )}
            {!closed && items.map((item) => {
        const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
        return (
          <Link key={item.href} href={item.href} onClick={() => setIsMobileOpen(false)}
            className={cn(
              "flex items-center rounded-xl font-medium transition-all duration-200 group",
              collapsed ? "justify-center px-2 py-3" : "gap-3 px-4 py-2.5",
              isActive
                ? "nav-active-neon font-semibold"
                : "text-foreground/60 hover:bg-secondary/80 hover:text-foreground"
            )}
            title={collapsed ? item.label : undefined}
          >
            <item.icon className={cn("w-5 h-5 shrink-0 transition-transform duration-200", isActive ? "scale-110" : "group-hover:scale-110")} />
            {!collapsed && item.label}
          </Link>
        );
      })}
          </div>
        );
      })}
      {scope === "admin" && (
        <button
          onClick={handleLogoutOthers}
          className={cn(
            "flex items-center rounded-xl font-medium transition-all duration-200 text-foreground/60 hover:bg-destructive/10 hover:text-destructive mt-2",
            collapsed ? "justify-center px-2 py-3" : "gap-3 px-4 py-3"
          )}
          title={collapsed ? "Desconectar outros computadores" : undefined}
        >
          <MonitorX className="w-5 h-5 shrink-0" />
          {!collapsed && "Desconectar outros computadores"}
        </button>
      )}
      <button
        onClick={handleLogout}
        className={cn(
          "flex items-center rounded-xl font-medium transition-all duration-200 text-foreground/60 hover:bg-destructive/10 hover:text-destructive mt-2",
          collapsed ? "justify-center px-2 py-3" : "gap-3 px-4 py-3"
        )}
        title={collapsed ? "Sair" : undefined}
      >
        <LogOut className="w-5 h-5 shrink-0" />
        {!collapsed && "Sair"}
      </button>
    </>
  );

  return (
    <div className={cn("h-screen bg-background flex flex-col md:flex-row overflow-hidden", bgUrl && "has-app-bg")} style={appBackgroundStyle(bgUrl)}>
      {/* Skip-to-content — acessibilidade para navegação por teclado */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:rounded-xl focus:bg-primary focus:text-primary-foreground focus:text-sm focus:font-semibold"
      >
        Ir para o conteúdo
      </a>
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-card border-b border-border z-20">
        <div className="flex items-center gap-2">
          <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="w-8 h-8 rounded-lg" />
          <span className="font-display font-bold text-lg text-primary hidden min-[420px]:inline">NFS</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <BackgroundPicker bgKey={bgKey} subtitle={bgSubtitle} placement="down-right" />
          <FontSizeToggle />
          <ThemeToggle compact />
          <button aria-label={isMobileOpen ? "Fechar menu" : "Abrir menu"} onClick={() => setIsMobileOpen(!isMobileOpen)} className="p-2 text-foreground/70 hover:bg-secondary rounded-lg">
            {isMobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-card border-b border-border overflow-y-auto overscroll-contain max-h-[calc(100dvh-4rem)] z-10"
          >
            <nav aria-label="Menu principal" className="flex flex-col p-4 gap-2">
              <NavLinks />
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <aside className={cn(
        "hidden md:flex flex-col bg-card border-r border-border h-full p-4 z-10 shadow-[4px_0_32px_rgba(0,0,0,0.5)] overflow-y-auto shrink-0 transition-all duration-300",
        isSidebarCollapsed ? "w-[68px]" : "w-64"
      )}>
        <div className={cn("flex items-center px-2 mb-8 mt-2", isSidebarCollapsed ? "justify-center" : "gap-3")}>
          <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className={cn("rounded-xl shadow-sm shrink-0 transition-all duration-300", isSidebarCollapsed ? "w-8 h-8" : "w-10 h-10")} />
          {!isSidebarCollapsed && (
            <div className="flex flex-col">
              <span className="font-display font-bold text-xl leading-tight text-primary">NFS</span>
              <span className="text-xs text-muted-foreground font-medium">
                {effectiveScope === "reception" ? "Recepção" : "Gestão Terapêutica"}
              </span>
            </div>
          )}
        </div>
        <nav aria-label="Navegação principal" className="flex flex-col gap-1 flex-1">
          <NavLinks collapsed={isSidebarCollapsed} />
        </nav>
        {!isSidebarCollapsed && (
          <div className="mt-2 mb-3 px-1 flex flex-col gap-2">
            <BackgroundPicker bgKey={bgKey} subtitle={bgSubtitle} variant="button" placement="side" />
            <FontSizeToggle />
            <ThemeToggle />
          </div>
        )}
        <button
          onClick={() => { const v = !isSidebarCollapsed; setIsSidebarCollapsed(v); try { localStorage.setItem("nfs_sidebar_collapsed", v ? "1" : "0"); } catch { /* ignore */ } }}
          className="flex items-center justify-center p-2 rounded-xl text-foreground/50 hover:bg-secondary/80 hover:text-foreground transition-all duration-200 mt-2"
          title={isSidebarCollapsed ? "Expandir menu" : "Recolher menu"}
          aria-label={isSidebarCollapsed ? "Expandir menu" : "Recolher menu"}
        >
          {isSidebarCollapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
        </button>
        {!isSidebarCollapsed && (
          <div className="p-4 bg-secondary/50 rounded-2xl mt-2">
            <p className="text-xs text-center text-muted-foreground">© 2026 NFS – Gestão Terapêutica</p>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main id="main-content" className="flex-1 p-4 md:p-8 overflow-y-auto w-full mx-auto relative">
        <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-primary/5 to-transparent -z-10 pointer-events-none" />
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Saudacao />
          {children}
          {scope === "admin" && <LembretesAviso />}
        </motion.div>
      </main>
    </div>
  );
}
