import { useState, useEffect, useMemo } from "react";
import { SuporteBotao } from "@/components/SuporteBotao";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Home, CalendarCheck, User, Plus, Mic, Plane } from "lucide-react";
import { MinhasAusencias, lembrarPinProfissional, type AusenciaVoz } from "@/components/MinhasAusencias";
import { NeonCabecalho, useFonteAgenda, NeonMes, NeonTelas, NeonMenuInferior, glass, neon, CORES_NEON } from "@/components/AgendaNeon";
import { Saudacao } from "@/components/Saudacao";
import { Calendar as CalendarIcon, Lock, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BackgroundPicker } from "@/components/BackgroundPicker";
import { appBackgroundStyle, useBackground } from "@/lib/background";
import { MensagensComemorativas } from "@/components/MensagensComemorativas";
import { RecadoEquipeComposer } from "@/components/RecadoEquipeComposer";
import { listProfessionals, loginProfissional, listAppointments, type AppointmentListItem } from "@/lib/arco-rpc";
import { getProfessionalSession, getCurrentScope, clearAllSessions } from "@/lib/portal-session";
import { useLocation } from "wouter";
import Agenda from "@/pages/agenda";

type Professional = { id: number; name: string; specialty: string; birthDate?: string | null };

/**
 * Portal do Profissional: mesma grade e mesmas ações da Agenda da
 * Administração, com o profissional autenticado (sessão do portal ou PIN)
 * travado na própria agenda. Admin pode escolher qualquer profissional.
 */
export default function AgendaProfissionais() {
  const [, setLocation] = useLocation();
  const portalScope = getCurrentScope();
  const portalProf = getProfessionalSession();
  const isAdminViewing = portalScope === "admin";
  const isProfessionalSession = portalScope === "professional" && !!portalProf;
  const bgKey = portalProf ? `prof_${portalProf.professionalId}` : "prof_admin";
  const bgUrl = useBackground(bgKey);
  const profFromQuery =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("prof") || ""
      : "";

  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [selectedProfId, setSelectedProfId] = useState(
    isProfessionalSession
      ? String(portalProf!.professionalId)
      : isAdminViewing
        ? profFromQuery
        : ""
  );
  const [pinInput, setPinInput] = useState("");
  const [pinVerified, setPinVerified] = useState(isAdminViewing || isProfessionalSession);
  const [pinError, setPinError] = useState("");
  const [pinLoading, setPinLoading] = useState(false);

  useEffect(() => {
    listProfessionals()
      .then((list) =>
        setProfessionals(
          list.map((p) => ({
            id: p.id,
            name: p.name,
            specialty: p.specialty ?? "",
            birthDate: p.birthDate,
          }))
        )
      )
      .catch(console.error);
  }, []);

  const selectedProf = professionals.find(p => String(p.id) === selectedProfId);

  const handleProfChange = (id: string) => {
    setSelectedProfId(id); setPinVerified(false); setPinInput(""); setPinError("");
  };

  const verifyPin = async () => {
    if (!selectedProfId || pinInput.length !== 4) return;
    setPinLoading(true); setPinError("");
    try {
      const token = await loginProfissional(parseInt(selectedProfId), pinInput);
      if (token) { lembrarPinProfissional(parseInt(selectedProfId), token); setPinVerified(true); }
      else { setPinError("PIN incorreto"); setPinInput(""); }
    } catch { setPinError("Erro ao verificar PIN."); }
    finally { setPinLoading(false); }
  };

  const sair = () => {
    if (isAdminViewing) {
      setLocation("/");
    } else {
      clearAllSessions();
      setLocation("/portal");
    }
  };

  if (pinVerified) {
    const agendaEl = (
      <Agenda
        portal={{
          professionalId: selectedProfId,
          allowPickProfessional: isAdminViewing,
          onProfessionalChange: setSelectedProfId,
        }}
      />
    );
    return (
      <PortalNeon
        prof={selectedProf ?? null}
        bgUrl={bgUrl}
        bgKey={bgKey}
        isAdminViewing={isAdminViewing}
        portalProfName={portalProf?.professionalName ?? null}
        onSair={sair}
        agenda={agendaEl}
      />
    );
  }

  return (
    <div className={`min-h-screen bg-background text-foreground${bgUrl ? " has-app-bg" : ""}`} style={appBackgroundStyle(bgUrl)}>
      <div className="bg-slate-800 text-white px-4 py-2 flex items-center">
        <a
          href={import.meta.env.BASE_URL || "/"}
          className="flex items-center gap-2 text-sm font-semibold text-slate-200 hover:text-white transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          Ir para o Painel Administrativo
        </a>
      </div>

      <div className="bg-card border-b border-border shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center" style={{ boxShadow: "0 0 12px rgba(139,92,246,0.3)" }}>
              <CalendarIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-bold text-foreground leading-tight">NFS – Portal do Profissional</p>
              <p className="text-xs text-muted-foreground">Agenda Semanal</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <BackgroundPicker bgKey={bgKey} subtitle={portalProf ? `Minha agenda · ${portalProf.professionalName}` : "Agenda do profissional"} placement="down-right" />
            <ThemeToggle compact />
            {pinVerified && (
              <button
                onClick={() => {
                  if (isAdminViewing) {
                    setLocation("/");
                  } else {
                    clearAllSessions();
                    setLocation("/portal");
                  }
                }}
                className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground text-sm font-semibold rounded-xl hover:bg-[rgba(255,30,90,0.1)] hover:text-[#ff2060] border border-border hover:border-[rgba(255,30,90,0.3)] transition-all"
              >
                <LogOut className="w-4 h-4" /> {isAdminViewing ? "Voltar ao painel" : "Sair da Agenda"}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {!pinVerified ? (
          <div className="max-w-md mx-auto mt-4 sm:mt-12">
            <div className="bg-card rounded-3xl border border-primary/20 overflow-hidden" style={{ boxShadow: "0 0 60px rgba(0,0,0,0.5), 0 0 30px rgba(139,92,246,0.05)" }}>
              <img src={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/visual/hero-profissionais.webp`} alt="Equipe de terapeutas" width={1024} height={683} className="w-full h-48 object-cover object-top" />
              <div className="bg-gradient-to-r from-primary/70 to-primary/30 px-8 pb-6 pt-4 text-center text-primary-foreground" style={{ borderBottom: "1px solid rgba(139,92,246,0.2)" }}>
                <h2 className="text-2xl font-bold">Acesso do Profissional</h2>
                <p className="text-sm opacity-80 mt-1">Selecione seu nome e informe o PIN</p>
              </div>
              <div className="p-8 space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">Profissional</label>
                  <select
                    aria-label="Escolha seu nome"
                    value={selectedProfId}
                    onChange={e => handleProfChange(e.target.value)}
                    className="w-full border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/30 bg-muted text-foreground font-medium transition-all"
                  >
                    <option value="">Selecione seu nome...</option>
                    {professionals.map(p => <option key={p.id} value={p.id}>{p.name} – {p.specialty}</option>)}
                  </select>
                </div>

                {selectedProfId && (
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">PIN (4 dígitos)</label>
                    <input
                      type="password" maxLength={4}
                      value={pinInput}
                      onChange={e => setPinInput(e.target.value.replace(/\D/, ""))}
                      onKeyDown={e => e.key === "Enter" && verifyPin()}
                      placeholder="••••"
                      className="w-full border border-border rounded-xl px-4 py-4 text-center font-mono text-2xl tracking-[1em] focus:outline-none focus:ring-2 focus:ring-primary/30 bg-muted text-foreground transition-all"
                    />
                    {pinError && <p className="text-destructive text-sm mt-2 font-semibold">{pinError}</p>}
                  </div>
                )}

                <button
                  onClick={verifyPin}
                  disabled={!selectedProfId || pinInput.length !== 4 || pinLoading}
                  className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground font-bold py-3 rounded-xl transition-all hover:shadow-[0_0_20px_rgba(139,92,246,0.4)]"
                >
                  {pinLoading ? "Verificando..." : "Acessar Agenda"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {selectedProf && <Saudacao nome={selectedProf.name} detalhe={selectedProf.specialty} pessoaId={selectedProf.id} />}
            <MensagensComemorativas professionalId={selectedProf?.id ?? null} />
            {!isAdminViewing && selectedProf && (
              <RecadoEquipeComposer
                professionalId={selectedProf.id}
                professionalName={selectedProf.name}
                specialty={selectedProf.specialty}
              />
            )}
            <Agenda
              portal={{
                professionalId: selectedProfId,
                allowPickProfessional: isAdminViewing,
                onProfessionalChange: setSelectedProfId,
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

const TELAS = ["Início", "Agenda", "Ausências", "Perfil"];
const MENU_IDS = ["inicio", "agenda", "ausencias", "perfil"];
const abrirVoz = () => setTimeout(() => window.dispatchEvent(new Event("agenda-voz-abrir")), 50);
const INATIVOS = new Set(["desmarcado", "cancelado", "remanejado", "remarcado", "alta", "desistência", "desistencia", "óbito", "obito"]);
const STATUS_TXT: Record<string, string> = {
  agendado: "Agendado", presente: "Presente", atendimento: "Atendido", ausente: "Falta",
  falta_nao_justificada: "Falta", falta_justificada: "Falta justificada", justificado: "Falta justificada", abonado: "Abonado",
};

/** Portal do profissional no visual neon: Início, Agenda e Perfil, com menu inferior e troca deslizando. */
function PortalNeon({ prof, bgUrl, bgKey, isAdminViewing, portalProfName, onSair, agenda }: {
  prof: Professional | null; bgUrl: string; bgKey: string; isAdminViewing: boolean; portalProfName: string | null;
  onSair: () => void; agenda: React.ReactNode;
}) {
  const [pagina, setPagina] = useState(0);
  const [ausenciaVoz, setAusenciaVoz] = useState<AusenciaVoz | null>(null);
  const fonte = useFonteAgenda();
  const hoje = format(new Date(), "yyyy-MM-dd");
  const [mes, setMes] = useState(() => startOfMonth(new Date()));
  const [diaSel, setDiaSel] = useState(hoje);
  const [lista, setLista] = useState<AppointmentListItem[]>([]);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!prof) { setLista([]); return; }
    let vivo = true;
    setCarregando(true);
    listAppointments({
      professionalId: prof.id,
      dateFrom: format(startOfWeek(startOfMonth(mes)), "yyyy-MM-dd"),
      dateTo: format(endOfWeek(endOfMonth(mes)), "yyyy-MM-dd"),
    })
      .then((r) => { if (vivo) setLista(r); })
      .catch(console.error)
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [prof?.id, mes, pagina]);

  const porDia = useMemo(() => {
    const m = new Map<string, AppointmentListItem[]>();
    for (const a of lista) {
      if (INATIVOS.has((a.status || "").toLowerCase())) continue;
      const arr = m.get(a.date) ?? [];
      arr.push(a);
      m.set(a.date, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.time.localeCompare(b.time));
    return m;
  }, [lista]);
  const doDia = porDia.get(diaSel) ?? [];
  const titDia = diaSel === hoje ? "Hoje" : format(new Date(diaSel + "T12:00:00"), "EEEE", { locale: ptBR });
  const ir = (n: number) => { setPagina(n); window.scrollTo({ top: 0, behavior: "smooth" }); };
  // Comando de voz: "ir para ausências", "registrar férias de 10 a 20 de dezembro"...
  useEffect(() => {
    const irPara = (e: Event) => { const i = MENU_IDS.indexOf((e as CustomEvent<string>).detail); if (i >= 0) ir(i); };
    const ausencia = (e: Event) => { setAusenciaVoz({ ...(e as CustomEvent<AusenciaVoz>).detail, chave: Date.now() }); ir(2); };
    window.addEventListener("agenda-voz-ir", irPara);
    window.addEventListener("agenda-voz-ausencia", ausencia);
    return () => { window.removeEventListener("agenda-voz-ir", irPara); window.removeEventListener("agenda-voz-ausencia", ausencia); };
  }, []);

  const inicio = (
    <div className="agenda-neon space-y-4" style={{ zoom: fonte.zoom }}>
      {prof ? <NeonCabecalho nome={prof.name} pessoaId={prof.id} subtitulo={prof.specialty ? `${prof.specialty} · seus atendimentos` : undefined} fonte={fonte} /> : (
        <div className={glass} style={neon("#a855f7")}><p className="text-lg text-[#1e1b4b]">Escolha o profissional na tela <b>Agenda</b>.</p></div>
      )}
      {prof && <MensagensComemorativas professionalId={prof.id} />}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px] items-start">
      {prof && (
        <section className={glass} style={neon("#a855f7")} aria-live="polite">
          <div className="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/agenda-icones/realizados.webp`} alt="" aria-hidden width={56} height={56} className="w-14 h-14 shrink-0 object-contain" />
            <span className="flex-1 min-w-0">
              <span className="block text-xl font-bold leading-tight capitalize text-[#1e1b4b]">{titDia}</span>
              <span className="block text-base text-[#3b3561] first-letter:uppercase">{format(new Date(diaSel + "T12:00:00"), "EEEE, dd 'de' MMMM", { locale: ptBR })}</span>
            </span>
            <span className="text-sm font-semibold text-[#3b3561]">{doDia.length} atendimento{doDia.length === 1 ? "" : "s"}</span>
          </div>
          {doDia.length === 0 ? (
            <button type="button" onClick={() => ir(1)} className="mt-3 w-full rounded-2xl bg-violet-50 border border-violet-200 text-[#1e1b4b] px-4 py-3 text-left text-lg font-semibold flex items-center gap-2">
              <Plus size={22} className="shrink-0" /> {carregando ? "Carregando…" : "Nenhum atendimento neste dia. Toque para abrir a agenda."}
            </button>
          ) : (
            <div className="mt-3 space-y-2">
              {doDia.map((a, i) => (
                <button type="button" key={a.id} onClick={() => ir(1)} className="w-full text-left rounded-2xl bg-violet-50 px-2.5 py-2 border border-violet-100 flex items-center gap-3">
                  <span className="rounded-xl px-2.5 py-1 text-lg font-bold tabular-nums shrink-0 text-white" style={{ background: "linear-gradient(135deg, #8b5cf6, #6d28d9)", boxShadow: "0 6px 14px -6px #6d28d9" }}>{a.time.slice(0, 5)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-semibold leading-snug break-words text-[#1e1b4b]">{a.prontuario && <span className="text-violet-700 mr-1">[{a.prontuario}]</span>}{a.patientName || `Paciente #${a.patientId}`}</span>
                    <span className="block text-sm text-[#3b3561]">{STATUS_TXT[(a.status || "").toLowerCase()] ?? a.status}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {diaSel !== hoje && <button type="button" onClick={() => setDiaSel(hoje)} className="mt-3 text-base font-semibold text-violet-700 underline">Voltar para hoje</button>}
        </section>
      )}
      {prof && (
        <div className={`${glass} !p-3`} style={neon("#8b5cf6")}>
          <p className="text-base text-[#3b3561] mb-2 text-center">Toque num dia para ver os atendimentos</p>
          <NeonMes mes={mes} setMes={setMes} diaSel={diaSel} onDia={setDiaSel} contar={(d) => porDia.get(d)?.length ?? 0} hoje={hoje} />
        </div>
      )}
      </div>
      <button type="button" onClick={() => ir(1)} className={`${glass} w-full !py-3 flex items-center justify-center gap-2 text-lg font-semibold`} style={neon("#38bdf8")}>
        <CalendarCheck size={22} /> Abrir agenda da semana
      </button>
    </div>
  );

  const ausencias = prof && !isAdminViewing ? <MinhasAusencias professionalId={prof.id} voz={ausenciaVoz} /> : (
    <div className="agenda-neon"><div className={glass} style={neon("#a855f7")}><p className="text-lg text-[#1e1b4b]">{isAdminViewing ? "As ausências de todos os profissionais ficam em Feriados & Ausências, no painel." : "Escolha o profissional na tela Agenda."}</p></div></div>
  );
  const perfil = (
    <div className="agenda-neon space-y-4">
      <div className={`${glass} flex items-center gap-4`} style={neon("#a855f7")}>
        <img src={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/visual/equipe.webp`} alt="" aria-hidden width={64} height={64} className="w-16 h-16 shrink-0 object-contain" />
        <div className="min-w-0">
          <p className="text-xl font-bold leading-tight break-words text-[#1e1b4b]">{prof?.name ?? portalProfName ?? "Profissional"}</p>
          {prof?.specialty && <p className="text-base text-[#3b3561]">{prof.specialty}</p>}
        </div>
      </div>
      <div className={`${glass} space-y-3`} style={neon("#38bdf8")}>
        <p className="text-lg font-bold text-[#1e1b4b]">Aparência</p>
        <div className="flex flex-wrap items-center gap-3">
          <BackgroundPicker bgKey={bgKey} subtitle={portalProfName ? `Minha agenda · ${portalProfName}` : "Agenda do profissional"} placement="down-right" />
          <ThemeToggle compact />
        </div>
      </div>
      {!isAdminViewing && prof && (
        <RecadoEquipeComposer professionalId={prof.id} professionalName={prof.name} specialty={prof.specialty} />
      )}
      <button type="button" onClick={onSair} className={`${glass} w-full !py-3 flex items-center justify-center gap-2 text-lg font-semibold text-rose-600`} style={neon("#f43f5e")}>
        <LogOut size={20} /> {isAdminViewing ? "Voltar ao painel" : "Sair da Agenda"}
      </button>
      <a href={import.meta.env.BASE_URL || "/"} className="block text-center text-sm text-violet-900/60 underline">Ir para o Painel Administrativo</a>
    </div>
  );

  return (
    <div className={`min-h-screen text-foreground ${bgUrl ? "has-app-bg" : "agenda-neon-fundo"}`} style={appBackgroundStyle(bgUrl)}>
      <div className="max-w-[1500px] mx-auto px-3 sm:px-5 pt-5 pb-[calc(13rem+env(safe-area-inset-bottom))]">
        <NeonTelas titulos={TELAS} pagina={pagina} setPagina={ir}>
          {[inicio, agenda, ausencias, perfil]}
        </NeonTelas>
      </div>
      <SuporteBotao className="bottom-28" profissional={isAdminViewing || !prof ? null : { id: prof.id, name: prof.name }} />
      <NeonMenuInferior
        ativo={MENU_IDS[pagina]}
        onItem={(id) => { if (id === "falar") { ir(1); abrirVoz(); return; } ir(Math.max(0, MENU_IDS.indexOf(id))); }}
        itens={[
          { id: "inicio", label: "Início", icon: <Home size={21} /> },
          { id: "agenda", label: "Agenda", icon: <CalendarCheck size={21} /> },
          { id: "falar", label: "Falar", icon: <Mic size={30} />, destaque: true },
          { id: "ausencias", label: "Ausências", icon: <Plane size={21} /> },
          { id: "perfil", label: "Perfil", icon: <User size={21} /> },
        ]}
      />
    </div>
  );
}
