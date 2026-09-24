import { useState, useEffect } from "react";
import { Calendar as CalendarIcon, Lock, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CelebrationBanner } from "@/components/CelebrationBanner";
import { MensagensComemorativas } from "@/components/MensagensComemorativas";
import { RecadoEquipeComposer } from "@/components/RecadoEquipeComposer";
import { listProfessionals, verifyProfessionalPin } from "@/lib/arco-rpc";
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
      const prof = await verifyProfessionalPin(parseInt(selectedProfId), pinInput);
      if (prof) { setPinVerified(true); }
      else { setPinError("PIN incorreto"); setPinInput(""); }
    } catch { setPinError("Erro ao verificar PIN."); }
    finally { setPinLoading(false); }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
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
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center" style={{ boxShadow: "0 0 12px rgba(0,240,255,0.3)" }}>
              <CalendarIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-bold text-foreground leading-tight">NFS – Portal do Profissional</p>
              <p className="text-xs text-muted-foreground">Agenda Semanal</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
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
          <div className="max-w-md mx-auto mt-16">
            <div className="bg-card rounded-3xl border border-primary/20 overflow-hidden" style={{ boxShadow: "0 0 60px rgba(0,0,0,0.5), 0 0 30px rgba(0,240,255,0.05)" }}>
              <div className="bg-gradient-to-r from-primary/70 to-primary/30 p-8 text-center text-primary-foreground" style={{ borderBottom: "1px solid rgba(0,240,255,0.2)" }}>
                <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ boxShadow: "0 0 20px rgba(0,240,255,0.3)" }}>
                  <Lock className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold">Acesso do Profissional</h2>
                <p className="text-sm opacity-80 mt-1">Selecione seu nome e informe o PIN</p>
              </div>
              <div className="p-8 space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">Profissional</label>
                  <select
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
                  className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground font-bold py-3 rounded-xl transition-all hover:shadow-[0_0_20px_rgba(0,240,255,0.4)]"
                >
                  {pinLoading ? "Verificando..." : "Acessar Agenda"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <CelebrationBanner
              name={selectedProf?.name}
              specialty={selectedProf?.specialty}
              birthDate={selectedProf?.birthDate}
            />
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
