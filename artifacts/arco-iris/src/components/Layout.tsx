import { Link, useLocation } from "wouter";
import { SuporteBotao } from "@/components/SuporteBotao";
import { Saudacao } from "@/components/Saudacao";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Users, UserRound, Calendar, CalendarDays, ClipboardList, ListTodo,
  Snowflake, Menu, X, Building2, LogOut, Brain, DoorOpen, CalendarOff, HeartHandshake, MessageSquareHeart, Inbox, PanelLeftClose, PanelLeftOpen, MonitorX, Palette, ChevronDown, BarChart3, FileText, CalendarClock, ShieldAlert,
  Bell, Home, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { listCompromissos } from "@/lib/agenda-admin-rpc";
import { motion, AnimatePresence } from "framer-motion";
import { clearAllSessions, getCurrentScope } from "@/lib/portal-session";
import { logoutAllDevices } from "@/lib/session-epoch";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FontSizeToggle } from "@/components/FontSizeToggle";
import { useThemeTick } from "@/lib/theme";
import { BackgroundPicker } from "@/components/BackgroundPicker";
import { LembretesAviso, COMPROMISSOS_EVENTO } from "@/components/LembretesAviso";
import { appBackgroundStyle, useBackground } from "@/lib/background";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  scopes: Array<"admin" | "reception">;
  group: NavGroup;
};

type NavGroup = "Início" | "Agenda" | "Pacientes" | "Equipe" | "Relatórios" | "Configurações";
const NAV_GROUPS: NavGroup[] = ["Início", "Agenda", "Pacientes", "Equipe", "Relatórios", "Configurações"];
/** Desenho 3D (public/visual ou public/agenda-icones) e cor neon de cada grupo do menu. */
const GRUPO_VISUAL: Record<NavGroup, { img: string; cor: string }> = {
  "Início": { img: "visual/inicio", cor: "#a78bfa" },
  "Agenda": { img: "agenda-icones/calendario", cor: "#8b5cf6" },
  "Pacientes": { img: "visual/atendimento", cor: "#38bdf8" },
  "Equipe": { img: "visual/equipe", cor: "#ec4899" },
  "Relatórios": { img: "visual/relatorios", cor: "#10b981" },
  "Configurações": { img: "visual/config", cor: "#f97316" },
};
export const img3d = (n: string) => `${import.meta.env.BASE_URL.replace(/\/$/, "")}/${n}.webp`;

const navItems: NavItem[] = [
  { href: "/", label: "Painel de Gestão", icon: LayoutDashboard, scopes: ["admin"], group: "Início" },
  { href: "/agenda", label: "Agenda Geral", icon: Calendar, scopes: ["admin"], group: "Agenda" },
  { href: "/agenda-mensal", label: "Agenda Mensal", icon: CalendarDays, scopes: ["admin"], group: "Agenda" },
  { href: "/minha-agenda", label: "Minha Agenda", icon: CalendarClock, scopes: ["admin"], group: "Agenda" },
  { href: "/agenda-administrativa", label: "Agenda Administrativa", icon: CalendarClock, scopes: ["admin"], group: "Agenda" },
  { href: "/salas", label: "Gestão de Salas", icon: DoorOpen, scopes: ["admin"], group: "Agenda" },
  { href: "/feriados", label: "Feriados & Ausências", icon: CalendarOff, scopes: ["admin", "reception"], group: "Agenda" },
  { href: "/reception", label: "Recepção", icon: ClipboardList, scopes: ["admin", "reception"], group: "Pacientes" },
  { href: "/patients", label: "Pacientes", icon: Users, scopes: ["admin", "reception"], group: "Pacientes" },
  { href: "/waiting-list", label: "Fila de Espera", icon: ListTodo, scopes: ["admin"], group: "Pacientes" },
  { href: "/pausados", label: "Pausados", icon: Snowflake, scopes: ["admin", "reception"], group: "Pacientes" },
  { href: "/busca-ativa", label: "Busca Ativa", icon: ShieldAlert, scopes: ["admin", "reception"], group: "Pacientes" },
  { href: "/professionals", label: "Profissionais", icon: UserRound, scopes: ["admin"], group: "Equipe" },
  { href: "/recados-equipe", label: "Recados e Suporte", icon: Inbox, scopes: ["admin"], group: "Equipe" },
  { href: "/central-mensagens", label: "Central de Mensagens", icon: MessageSquareHeart, scopes: ["admin"], group: "Equipe" },
  { href: "/datas-conscientizacao", label: "Datas de Conscientização", icon: HeartHandshake, scopes: ["admin", "reception"], group: "Equipe" },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3, scopes: ["admin"], group: "Relatórios" },
  { href: "/prestacao-contas", label: "Prestação de Contas", icon: FileText, scopes: ["admin"], group: "Relatórios" },
  { href: "/dashboard-detalhes", label: "Painel detalhado", icon: BarChart3, scopes: ["admin"], group: "Relatórios" },
  { href: "/simulacao-fila", label: "Simulação da fila", icon: BarChart3, scopes: ["admin"], group: "Relatórios" },
  { href: "/personalizacao-visual", label: "Visual do sistema", icon: Palette, scopes: ["admin"], group: "Configurações" },
  { href: "/gestao-contratos", label: "Gestão de Contratos", icon: Building2, scopes: ["admin"], group: "Configurações" },
  { href: "/ai-brain", label: "Cérebro IA", icon: Brain, scopes: ["admin"], group: "Configurações" },
];

const ativoEm = (location: string, href: string) => location === href || (href !== "/" && location.startsWith(href));

/** Quantos compromissos da Agenda Administrativa ainda abertos hoje (sino do topo). */
function useAvisosHoje(ligado: boolean) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!ligado) return;
    const hoje = format(new Date(), "yyyy-MM-dd");
    let vivo = true;
    const carregar = () => listCompromissos(hoje, hoje).then((l) => { if (vivo) setN(l.filter((c) => !c.concluido).length); }).catch(() => {});
    void carregar();
    window.addEventListener(COMPROMISSOS_EVENTO, carregar);
    return () => { vivo = false; window.removeEventListener(COMPROMISSOS_EVENTO, carregar); };
  }, [ligado]);
  return n;
}

export function Layout({ children }: { children: React.ReactNode }) {
  useThemeTick(); // re-renderiza as páginas quando o tema muda (cores via JS)
  const [location, setLocation] = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem("nfs_sidebar_collapsed") === "1"; } catch { return false; }
  });
  const [closedGroups, setClosedGroups] = useState<NavGroup[]>(() => {
    try { return JSON.parse(localStorage.getItem("nfs_nav_closed_v2") || "null") ?? NAV_GROUPS.filter((g) => g !== "Início"); } catch { return []; }
  });
  const toggleGroup = (g: NavGroup) => setClosedGroups((c) => {
    const n = c.includes(g) ? c.filter((x) => x !== g) : [...c, g];
    try { localStorage.setItem("nfs_nav_closed_v2", JSON.stringify(n)); } catch { /* ignore */ }
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

  const avisos = useAvisosHoje(scope === "admin");
  const grupoAtivo = visibleItems.find((i) => ativoEm(location, i.href))?.group;
  const inicioHref = effectiveScope === "reception" ? "/reception" : "/";
  const menuInferior = effectiveScope === "reception"
    ? [
        { href: "/reception", label: "Início", icon: Home },
        { href: "/patients", label: "Pacientes", icon: Users },
        { href: "/pausados", label: "Pausados", icon: Snowflake },
        { href: "/busca-ativa", label: "Busca Ativa", icon: ShieldAlert },
      ]
    : [
        { href: "/", label: "Início", icon: Home },
        { href: "/agenda", label: "Agenda", icon: Calendar },
        { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
        { href: "/personalizacao-visual", label: "Ajustes", icon: Settings },
      ];

  const NavLinks = ({ collapsed = false }: { collapsed?: boolean }) => (
    <>
      {NAV_GROUPS.map((group) => {
        const items = visibleItems.filter((i) => i.group === group);
        if (items.length === 0) return null;
        const { img, cor } = GRUPO_VISUAL[group];
        const temAtivo = grupoAtivo === group;
        const closed = closedGroups.includes(group) && !collapsed && !temAtivo;
        const unico = items.length === 1;
        const cabeca = (
          <>
            <img src={img3d(img)} alt="" aria-hidden width={36} height={36} className="w-9 h-9 shrink-0 object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,.45)]" />
            {!collapsed && <span className="flex-1 text-left font-display text-[16px] font-bold">{unico ? items[0].label : group}</span>}
            {!collapsed && !unico && <ChevronDown className={cn("w-4 h-4 opacity-60 transition-transform", closed && "-rotate-90")} />}
          </>
        );
        const classeCabeca = cn(
          "menu-3d flex items-center rounded-2xl transition-all duration-200 border",
          collapsed ? "justify-center p-1.5" : "gap-3 px-2.5 py-2",
          temAtivo ? "border-[color:var(--c)] bg-[color:var(--c)]/15 text-foreground shadow-[0_0_20px_-8px_var(--c)]" : "border-transparent text-foreground/85 hover:bg-secondary/70",
        );
        return (
          <div key={group} className="flex flex-col gap-1" style={{ ["--c" as string]: cor } as React.CSSProperties}>
            {collapsed && !unico ? (
              <>
                <div className={classeCabeca} title={group} aria-hidden>{cabeca}</div>
                {items.map((item) => {
                  const isActive = ativoEm(location, item.href);
                  return (
                    <Link key={item.href} href={item.href} onClick={() => setIsMobileOpen(false)} title={item.label} aria-label={item.label}
                      className={cn("flex justify-center rounded-xl py-2 transition-all",
                        isActive ? "nav-active-neon" : "hover:bg-secondary/80")}>
                      <item.icon className="w-5 h-5 shrink-0" style={isActive ? undefined : { color: cor }} />
                    </Link>
                  );
                })}
              </>
            ) : unico || collapsed ? (
              <Link href={items[0].href} onClick={() => setIsMobileOpen(false)} className={classeCabeca} title={collapsed ? group : undefined}>{cabeca}</Link>
            ) : (
              <button type="button" onClick={() => toggleGroup(group)} aria-expanded={!closed} className={classeCabeca}>{cabeca}</button>
            )}
            {!collapsed && !unico && !closed && (
              <div className="ml-6 pl-3 border-l-2 flex flex-col gap-0.5 mb-1" style={{ borderColor: `${cor}55` }}>
                {items.map((item) => {
                  const isActive = ativoEm(location, item.href);
                  return (
                    <Link key={item.href} href={item.href} onClick={() => setIsMobileOpen(false)}
                      className={cn("flex items-center gap-2.5 rounded-xl px-3 py-2 text-[15px] font-medium transition-all",
                        isActive ? "nav-active-neon font-semibold" : "text-foreground/70 hover:bg-secondary/80 hover:text-foreground")}>
                      <item.icon className="w-4 h-4 shrink-0" style={isActive ? undefined : { color: cor }} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {scope === "admin" && (
        <button
          onClick={handleLogoutOthers}
          className={cn(
            "flex items-center rounded-xl font-medium transition-all duration-200 text-foreground/60 hover:bg-destructive/10 hover:text-destructive mt-2",
            collapsed ? "justify-center px-2 py-3" : "gap-3 px-4 py-2.5 text-[14px]"
          )}
          title={collapsed ? "Desconectar outros computadores" : undefined}
        >
          <MonitorX className="w-5 h-5 shrink-0" />
          {!collapsed && "Desconectar outros aparelhos"}
        </button>
      )}
      <button
        onClick={handleLogout}
        className={cn(
          "flex items-center rounded-xl font-medium transition-all duration-200 text-foreground/60 hover:bg-destructive/10 hover:text-destructive",
          collapsed ? "justify-center px-2 py-3" : "gap-3 px-4 py-2.5 text-[14px]"
        )}
        title={collapsed ? "Sair" : undefined}
      >
        <LogOut className="w-5 h-5 shrink-0" />
        {!collapsed && "Sair"}
      </button>
    </>
  );

  const sino = scope === "admin" && (
    <Link href="/agenda-administrativa" aria-label={avisos ? `${avisos} compromisso(s) hoje` : "Agenda administrativa"} className="relative grid place-items-center w-11 h-11 rounded-full text-foreground hover:bg-secondary/70">
      <Bell className="w-7 h-7" />
      {avisos > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[22px] h-[22px] px-1 grid place-items-center rounded-full bg-rose-500 text-white text-xs font-bold shadow-[0_0_10px_rgba(244,63,94,.8)]">{avisos}</span>}
    </Link>
  );

  return (
    <div className={cn("h-[100dvh] bg-background flex flex-col md:flex-row overflow-hidden", bgUrl && "has-app-bg")} style={appBackgroundStyle(bgUrl)}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:rounded-xl focus:bg-primary focus:text-primary-foreground focus:text-sm focus:font-semibold"
      >
        Ir para o conteúdo
      </a>
      {/* Topo do celular: menu · marca · sino */}
      <div className="topo-neon md:hidden flex items-center justify-between gap-2 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] z-20">
        <button aria-label={isMobileOpen ? "Fechar menu" : "Abrir menu"} onClick={() => setIsMobileOpen(!isMobileOpen)} className="grid place-items-center w-11 h-11 rounded-full text-foreground hover:bg-secondary/70">
          {isMobileOpen ? <X className="w-7 h-7" /> : <Menu className="w-7 h-7" />}
        </button>
        <Link href={inicioHref} className="flex items-center gap-2 min-w-0">
          <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="" className="w-10 h-10 rounded-xl bg-white p-0.5 shrink-0" />
          <span className="min-w-0 leading-tight">
            <span className="block font-display font-extrabold text-xl text-white truncate">NFs Gestão</span>
            <span className="block text-xs text-foreground/70 truncate">{effectiveScope === "reception" ? "Recepção" : "Gestão Terapêutica"}</span>
          </span>
        </Link>
        <div className="w-11 flex justify-end">{sino}</div>
      </div>

      {/* Menu do celular */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="menu-neon md:hidden absolute inset-x-0 top-[calc(3.75rem+env(safe-area-inset-top))] bottom-0 overflow-y-auto overscroll-contain z-30 px-4 pt-3 pb-28"
          >
            <div className="flex items-center gap-2 mb-3 [&>*]:shrink-0">
              <BackgroundPicker bgKey={bgKey} subtitle={bgSubtitle} placement="down-right" />
              <FontSizeToggle />
              <ThemeToggle />
            </div>
            <nav aria-label="Menu principal" className="flex flex-col gap-1.5">
              <NavLinks />
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Menu lateral (computador) */}
      <aside className={cn(
        "menu-neon hidden md:flex flex-col border-r border-border h-full p-3 z-10 overflow-y-auto shrink-0 transition-all duration-300",
        isSidebarCollapsed ? "w-[76px]" : "w-[270px]"
      )}>
        <div className={cn("flex items-center px-2 mb-6 mt-2", isSidebarCollapsed ? "justify-center" : "gap-3")}>
          <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className={cn("rounded-xl bg-white p-0.5 shrink-0 transition-all duration-300", isSidebarCollapsed ? "w-9 h-9" : "w-11 h-11")} />
          {!isSidebarCollapsed && (
            <div className="flex flex-col">
              <span className="font-display font-extrabold text-xl leading-tight text-white">NFs Gestão</span>
              <span className="text-xs text-muted-foreground font-medium">
                {effectiveScope === "reception" ? "Recepção" : "Gestão Terapêutica"}
              </span>
            </div>
          )}
        </div>
        <nav aria-label="Navegação principal" className="flex flex-col gap-1.5 flex-1">
          <NavLinks collapsed={isSidebarCollapsed} />
        </nav>
        {!isSidebarCollapsed && (
          <div className="mt-3 mb-2 px-1 flex flex-col gap-2">
            <BackgroundPicker bgKey={bgKey} subtitle={bgSubtitle} variant="button" placement="side" />
            <FontSizeToggle />
            <ThemeToggle />
          </div>
        )}
        <button
          onClick={() => { const v = !isSidebarCollapsed; setIsSidebarCollapsed(v); try { localStorage.setItem("nfs_sidebar_collapsed", v ? "1" : "0"); } catch { /* ignore */ } }}
          className="flex items-center justify-center p-2 rounded-xl text-foreground/50 hover:bg-secondary/80 hover:text-foreground transition-all duration-200 mt-1"
          title={isSidebarCollapsed ? "Expandir menu" : "Recolher menu"}
          aria-label={isSidebarCollapsed ? "Expandir menu" : "Recolher menu"}
        >
          {isSidebarCollapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
        </button>
      </aside>

      {/* Conteúdo */}
      <main id="main-content" className="flex-1 px-4 pt-3 pb-[calc(9rem+env(safe-area-inset-bottom))] md:p-8 md:pb-24 overflow-y-auto min-w-0 w-full mx-auto relative">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {location !== "/" && !location.startsWith("/agenda") && <Saudacao />}
          {children}
          {scope === "admin" && <LembretesAviso />}
        </motion.div>
      </main>
      <SuporteBotao className="bottom-24 md:bottom-4" />

      {/* Menu de baixo (celular) */}
      <nav aria-label="Atalhos" className="menu-inferior-neon md:hidden fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 px-2 pt-2 pb-[max(0.6rem,env(safe-area-inset-bottom))]">
        {menuInferior.map((m) => {
          const on = ativoEm(location, m.href) && !isMobileOpen;
          return (
            <Link key={m.href} href={m.href} onClick={() => setIsMobileOpen(false)} className={cn("flex flex-col items-center gap-1 py-1 text-[13px] font-semibold", on ? "text-violet-300" : "text-foreground/60")}>
              <m.icon className={cn("w-7 h-7", on && "drop-shadow-[0_0_8px_rgba(167,139,250,.9)]")} />
              {m.label}
              <span className={cn("h-1 w-14 rounded-full", on ? "bg-gradient-to-r from-violet-500 to-fuchsia-400 shadow-[0_0_10px_rgba(167,139,250,.9)]" : "bg-transparent")} />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
