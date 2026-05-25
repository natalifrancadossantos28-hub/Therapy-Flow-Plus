import { useState, useEffect } from "react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useLocation } from "wouter";
import { Building2, UserRound, ShieldCheck, Shield, Lock, ArrowLeft } from "lucide-react";
import { requireSupabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  CompanySession,
  setCompanySession,
  setProfessionalSession,
  getCurrentScope,
  clearAllSessions,
  restoreCompanyFromDevice,
} from "@/lib/portal-session";
import { listProfessionalsPublic, verifyProfessionalPinWithSlug } from "@/lib/arco-rpc";

type CardKey = "reception" | "professional" | "admin";

type ProfOption = { id: number; name: string; specialty: string | null };

// Slug da empresa padrao (usada no card Profissional sem exigir senha).
// Quando houver multi-tenant, expor um campo dedicado no card.
const DEFAULT_SLUG = (import.meta.env.VITE_DEFAULT_COMPANY_SLUG as string | undefined) || "clinica-nfs";

// Senha compartilhada para Recepcao e Administracao. O profissional continua
// usando PIN. Pode ser sobrescrita por env (VITE_PORTAL_PASSWORD) por empresa.
const PORTAL_PASSWORD =
  (import.meta.env.VITE_PORTAL_PASSWORD as string | undefined) || "clinica123";

// Compara ignorando case, espacos e zero-width chars que o auto-complete
// do celular costuma colar (ex.: "Clinica123 ", "clinica 123").
function normalizePassword(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\s\u200b-\u200f\u2028\u2029\ufeff]/g, "")
    .toLowerCase();
}

// Fase 6: Portal unificado com 3 cards.
// - Recepcao: login empresa, session scope = "reception" -> /reception.
// - Profissional: seleciona nome + PIN, session profissional -> /agenda-profissionais.
// - Administracao: login empresa, session scope = "admin" -> /.
export default function Portal() {
  useDocumentTitle("Portal");
  const [, setLocation] = useLocation();
  const [active, setActive] = useState<CardKey | null>(null);
  const [slug, setSlug] = useState(DEFAULT_SLUG);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [professionals, setProfessionals] = useState<ProfOption[]>([]);
  const [selectedProfId, setSelectedProfId] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");

  useEffect(() => {
    // Se ja tem sessao ativa, redireciona direto pra area correspondente.
    const scope = getCurrentScope();
    if (scope === "admin") setLocation("/");
    else if (scope === "reception") setLocation("/reception");
    else if (scope === "professional") setLocation("/agenda-profissionais");
  }, [setLocation]);

  useEffect(() => {
    if (active === "professional") {
      listProfessionalsPublic(DEFAULT_SLUG)
        .then((list) => setProfessionals(list))
        .catch((err) => {
          console.error(err);
          setError(err?.message || "Nao foi possivel carregar a lista.");
          setProfessionals([]);
        });
    }
  }, [active]);

  const resetForm = () => {
    setActive(null);
    setSlug(DEFAULT_SLUG);
    setError("");
    setSelectedProfId("");
    setPinInput("");
    setPasswordInput("");
  };

  const submitCompany = async (scope: "admin" | "reception") => {
    setLoading(true);
    setError("");
    try {
      if (normalizePassword(passwordInput) !== normalizePassword(PORTAL_PASSWORD)) {
        setError("Senha incorreta.");
        return;
      }
      if (!isSupabaseConfigured) {
        setError("Supabase nao configurado.");
        return;
      }
      const supabase = requireSupabase();
      const { data, error: rpcError } = await supabase.rpc("lookup_company_by_slug", {
        p_slug: slug.trim().toLowerCase(),
      });
      if (rpcError) throw rpcError;
      const company = Array.isArray(data) ? data[0] : data;
      if (!company?.id) {
        setError("Empresa nao encontrada.");
        return;
      }
      if (!company.module_arco_iris) {
        setError("Esta empresa nao tem acesso ao modulo Gestao Terapeutica.");
        return;
      }
      // Garante que nao haja sessao profissional remanescente.
      clearAllSessions();
      const session: CompanySession = {
        type: "company",
        scope,
        companyId: Number(company.id),
        companyName: company.name,
        companySlug: company.slug,
        // Token de bypass aceito pelas RPCs (Recepcao/Admin nao pedem senha).
        adminToken: "__noauth__",
        moduleArcoIris: Boolean(company.module_arco_iris),
        moduleTriagem: Boolean(company.module_triagem),
        modulePonto: Boolean(company.module_ponto),
      };
      setCompanySession(session);
      if (scope === "reception") setLocation("/reception");
      else setLocation("/");
    } catch (err: any) {
      setError(err?.message || "Erro ao autenticar.");
    } finally {
      setLoading(false);
    }
  };

  const submitProfessional = async () => {
    setLoading(true);
    setError("");
    try {
      const prof = professionals.find((p) => String(p.id) === selectedProfId);
      if (!prof) {
        setError("Selecione seu nome.");
        return;
      }
      const ok = await verifyProfessionalPinWithSlug(DEFAULT_SLUG, prof.id, pinInput);
      if (!ok) {
        setError("PIN incorreto.");
        return;
      }
      clearAllSessions();
      // Restaura credenciais da empresa do enrollment do dispositivo para que
      // /agenda-profissionais consiga chamar as RPCs protegidas (listAppointments,
      // updateAppointment, etc). Se o dispositivo nunca teve um admin logado,
      // avisa o usuario.
      const restored = restoreCompanyFromDevice();
      if (!restored) {
        setError(
          "Este dispositivo ainda nao foi configurado. Peca ao administrador para fazer login uma vez antes."
        );
        return;
      }
      setProfessionalSession({
        professionalId: prof.id,
        professionalName: prof.name,
        specialty: prof.specialty ?? undefined,
      });
      // Mantem compatibilidade com o fluxo antigo em agenda-profissionais.
      sessionStorage.setItem(`professional_pin_${prof.id}`, "verified");
      sessionStorage.setItem("nfs_professional_slug", DEFAULT_SLUG);
      setLocation("/agenda-profissionais");
    } catch (err: any) {
      setError(err?.message || "Erro ao verificar PIN.");
    } finally {
      setLoading(false);
    }
  };

  const neonCard = (color: string, rgb: string): React.CSSProperties => ({
    background: "linear-gradient(145deg, rgba(6,14,30,0.92), rgba(2,6,14,0.98))",
    border: `2px solid ${color}`,
    borderRadius: "1.25rem",
    boxShadow: `0 0 15px ${rgb}, 0 0 40px ${rgb}, inset 0 0 30px rgba(0,0,0,0.5)`,
  });

  const CARD_STYLE = neonCard("rgba(0,240,255,0.5)", "rgba(0,240,255,0.15)");

  // Tela dos 3 cards.
  if (!active) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-[#020612] via-[#040a18] to-[#010408]">
        <div className="text-center mb-10">
          <img
            src={`${import.meta.env.BASE_URL}images/logo.png`}
            alt="NFs"
            className="w-20 h-20 rounded-2xl mx-auto mb-4"
            style={{ boxShadow: "0 0 30px rgba(0,200,255,0.35), 0 0 60px rgba(0,200,255,0.15)" }}
          />
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2" style={{ textShadow: "0 0 25px rgba(0,200,255,0.6), 0 0 50px rgba(0,200,255,0.3)" }}>
            NFs Gest\u00e3o Terap\u00eautica
          </h1>
          <p className="text-sm text-white/50">Selecione o tipo de acesso</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full max-w-5xl">
          {/* Card 1 - Recepcao */}
          <button
            onClick={() => setActive("reception")}
            className="group rounded-2xl p-6 text-left transition-all hover:scale-[1.03] active:scale-[0.98]"
            style={neonCard("#22c55e", "rgba(34,197,94,0.25)")}
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.6)", boxShadow: "0 0 20px rgba(34,197,94,0.35)" }}>
              <Building2 className="w-7 h-7" style={{ color: "#86efac" }} />
            </div>
            <h2 className="text-xl font-bold text-white mb-2" style={{ textShadow: "0 0 12px rgba(34,197,94,0.5)" }}>Recep\u00e7\u00e3o</h2>
            <p className="text-sm text-white/55 leading-relaxed">
              Agendamentos, presen\u00e7as e recep\u00e7\u00e3o de pacientes.
            </p>
            <p className="text-[11px] mt-4 font-bold uppercase tracking-wider" style={{ color: "#86efac", textShadow: "0 0 8px rgba(34,197,94,0.6)" }}>
              Acesso direto
            </p>
          </button>

          {/* Card 2 - Profissional de Saude */}
          <button
            onClick={() => setActive("professional")}
            className="group rounded-2xl p-6 text-left transition-all hover:scale-[1.03] active:scale-[0.98]"
            style={neonCard("#06b6d4", "rgba(6,182,212,0.25)")}
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "rgba(6,182,212,0.12)", border: "1px solid rgba(6,182,212,0.6)", boxShadow: "0 0 20px rgba(6,182,212,0.35)" }}>
              <UserRound className="w-7 h-7" style={{ color: "#67e8f9" }} />
            </div>
            <h2 className="text-xl font-bold text-white mb-2" style={{ textShadow: "0 0 12px rgba(6,182,212,0.5)" }}>Profissional de Sa\u00fade</h2>
            <p className="text-sm text-white/55 leading-relaxed">
              Agenda pessoal e atendimentos.
            </p>
            <p className="text-[11px] mt-4 font-bold uppercase tracking-wider" style={{ color: "#67e8f9", textShadow: "0 0 8px rgba(6,182,212,0.6)" }}>
              Acesso: seu nome + PIN
            </p>
          </button>

          {/* Card 3 - Administracao */}
          <button
            onClick={() => setActive("admin")}
            className="group rounded-2xl p-6 text-left transition-all hover:scale-[1.03] active:scale-[0.98]"
            style={neonCard("#a855f7", "rgba(168,85,247,0.25)")}
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.6)", boxShadow: "0 0 20px rgba(168,85,247,0.35)" }}>
              <ShieldCheck className="w-7 h-7" style={{ color: "#d8b4fe" }} />
            </div>
            <h2 className="text-xl font-bold text-white mb-2" style={{ textShadow: "0 0 12px rgba(168,85,247,0.5)" }}>Administra\u00e7\u00e3o</h2>
            <p className="text-sm text-white/55 leading-relaxed">
              Gest\u00e3o total, dashboards e configura\u00e7\u00f5es do sistema.
            </p>
            <p className="text-[11px] mt-4 font-bold uppercase tracking-wider" style={{ color: "#d8b4fe", textShadow: "0 0 8px rgba(168,85,247,0.6)" }}>
              Acesso direto
            </p>
          </button>
        </div>

        {/* Link para Painel Master */}
        <button
          onClick={() => setLocation("/master")}
          className="mt-6 text-xs text-white/30 hover:text-amber-400/80 transition-colors flex items-center gap-1.5"
        >
          <Shield className="w-3.5 h-3.5" />
          Painel Master (Multi-Empresa)
        </button>

        <p className="text-xs text-white/30 mt-6">&copy; 2026 NFs Systems &middot; Gest\u00e3o Terap\u00eautica</p>
      </div>
    );
  }

  // Formulario de login para Recepcao ou Admin.
  if (active === "reception" || active === "admin") {
    const isRecep = active === "reception";
    const accent = isRecep ? "#67e8f9" : "#f0abfc";
    const accentBg = isRecep ? "rgba(0,240,255,0.12)" : "rgba(217,70,239,0.12)";
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-[#020612] via-[#040a18] to-[#010408]">
        <div className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl" style={neonCard(isRecep ? "rgba(34,197,94,0.5)" : "rgba(168,85,247,0.5)", isRecep ? "rgba(34,197,94,0.15)" : "rgba(168,85,247,0.15)")}>
          <div className="p-6 text-center" style={{ borderBottom: `1px solid ${accent}33` }}>
            <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-3" style={{ background: accentBg, border: `1px solid ${accent}`, boxShadow: `0 0 20px ${accent}40` }}>
              {isRecep ? <Building2 className="w-7 h-7" style={{ color: accent }} /> : <ShieldCheck className="w-7 h-7" style={{ color: accent }} />}
            </div>
            <h2 className="text-lg font-bold text-white" style={{ textShadow: `0 0 10px ${accent}66` }}>{isRecep ? "Recep\u00e7\u00e3o" : "Administra\u00e7\u00e3o"}</h2>
            <p className="text-xs text-white/50 mt-1">Confirme a senha da empresa</p>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); submitCompany(isRecep ? "reception" : "admin"); }} className="p-6 space-y-4">
            <div>
              <label className="text-[11px] font-semibold text-white/60 mb-1 block uppercase tracking-wider">Empresa (slug)</label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="ex: clinica-nfs"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-400/50"
                disabled={loading}
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-white/60 mb-1 block uppercase tracking-wider">Senha</label>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-black/40 border rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none"
                style={{ borderColor: `${accent}33`, boxShadow: `inset 0 0 8px ${accent}10` }}
                disabled={loading}
                autoFocus
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>

            {error && <p className="text-xs text-red-400 bg-red-950/30 border border-red-500/30 rounded-xl px-3 py-2">{error}</p>}

            <button
              type="submit"
              disabled={loading || !slug.trim() || !passwordInput.trim()}
              className="w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-50"
              style={{ background: accentBg, border: `1px solid ${accent}`, color: accent, boxShadow: `0 0 20px ${accent}40`, textShadow: `0 0 8px ${accent}` }}
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>

            <button type="button" onClick={resetForm} className="w-full flex items-center justify-center gap-2 text-xs text-white/40 hover:text-white/70">
              <ArrowLeft className="w-3 h-3" /> Voltar para selecao
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Formulario de PIN para Profissional.
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-[#020612] via-[#040a18] to-[#010408]">
      <div className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl" style={{ ...CARD_STYLE, border: "1px solid rgba(16,185,129,0.35)" }}>
        <div className="p-6 text-center" style={{ borderBottom: "1px solid rgba(16,185,129,0.25)" }}>
          <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-3" style={{ background: "rgba(16,185,129,0.12)", border: "1px solid #10b981", boxShadow: "0 0 20px rgba(16,185,129,0.35)" }}>
            <Lock className="w-7 h-7" style={{ color: "#6ee7b7" }} />
          </div>
          <h2 className="text-lg font-bold text-white" style={{ textShadow: "0 0 10px rgba(16,185,129,0.5)" }}>Acesso do Profissional</h2>
          <p className="text-xs text-white/50 mt-1">Selecione seu nome e informe o PIN</p>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); submitProfessional(); }} className="p-6 space-y-4">
          <div>
            <label className="text-[11px] font-semibold text-white/60 mb-1 block uppercase tracking-wider">Profissional</label>
            <select
              value={selectedProfId}
              onChange={(e) => setSelectedProfId(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-400/50"
              disabled={loading}
            >
              <option value="">Selecione seu nome...</option>
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.specialty ? ` — ${p.specialty}` : ""}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-white/60 mb-1 block uppercase tracking-wider">PIN</label>
            <input
              type="password"
              inputMode="numeric"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white tracking-[0.3em] text-center focus:outline-none focus:border-emerald-400/50"
              disabled={loading || !selectedProfId}
              placeholder="&#9679;&#9679;&#9679;&#9679;"
            />
          </div>

          {error && <p className="text-xs text-red-400 bg-red-950/30 border border-red-500/30 rounded-xl px-3 py-2">{error}</p>}

          <button
            type="submit"
            disabled={loading || !selectedProfId || !pinInput}
            className="w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-50"
            style={{ background: "rgba(16,185,129,0.15)", border: "1px solid #10b981", color: "#6ee7b7", boxShadow: "0 0 20px rgba(16,185,129,0.4)", textShadow: "0 0 8px #10b981" }}
          >
            {loading ? "Verificando..." : "Acessar Agenda"}
          </button>

          <button type="button" onClick={resetForm} className="w-full flex items-center justify-center gap-2 text-xs text-white/40 hover:text-white/70">
            <ArrowLeft className="w-3 h-3" /> Voltar para selecao
          </button>
        </form>
      </div>
    </div>
  );
}
