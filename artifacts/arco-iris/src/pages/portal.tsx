import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Building2, UserRound, ShieldCheck, Lock, ArrowLeft } from "lucide-react";
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

  const CARD_STYLE: React.CSSProperties = {
    background: "linear-gradient(135deg, rgba(6,14,24,0.95), rgba(3,8,16,0.98))",
    border: "1px solid rgba(0,240,255,0.25)",
    boxShadow: "0 0 40px rgba(0,240,255,0.08), 0 0 80px rgba(0,0,0,0.6)",
  };

  // Tela dos 3 cards.
  if (!active) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-[#020612] via-[#040a18] to-[#010408]">
        <div className="text-center mb-10">
          <img
            src={`${import.meta.env.BASE_URL}images/logo.png`}
            alt="NFs"
            className="w-20 h-20 rounded-2xl mx-auto mb-4 shadow-[0_0_30px_rgba(0,240,255,0.25)]"
          />
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2" style={{ textShadow: "0 0 20px rgba(0,240,255,0.5)" }}>
            NFs Gestao Terapeutica
          </h1>
          <p className="text-sm text-white/60">Selecione o tipo de acesso</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full max-w-5xl">
          {/* Card 1 - Recepcao */}
          <button
            onClick={() => setActive("reception")}
            className="group rounded-2xl p-6 text-left transition-all hover:scale-[1.02] hover:border-cyan-400/60"
            style={CARD_STYLE}
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "rgba(0,240,255,0.12)", border: "1px solid rgba(0,240,255,0.4)", boxShadow: "0 0 20px rgba(0,240,255,0.25)" }}>
              <Building2 className="w-7 h-7" style={{ color: "#67e8f9" }} />
            </div>
            <h2 className="text-xl font-bold text-white mb-2" style={{ textShadow: "0 0 10px rgba(0,240,255,0.4)" }}>Recepcao</h2>
            <p className="text-sm text-white/55 leading-relaxed">
              Agendamentos, presencas e recepcao de pacientes.
            </p>
            <p className="text-[11px] text-cyan-300/70 mt-4 font-semibold uppercase tracking-wider">
              Acesso direto
            </p>
          </button>

          {/* Card 2 - Profissional de Saude */}
          <button
            onClick={() => setActive("professional")}
            className="group rounded-2xl p-6 text-left transition-all hover:scale-[1.02] hover:border-emerald-400/60"
            style={{ ...CARD_STYLE, border: "1px solid rgba(16,185,129,0.25)" }}
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.4)", boxShadow: "0 0 20px rgba(16,185,129,0.25)" }}>
              <UserRound className="w-7 h-7" style={{ color: "#6ee7b7" }} />
            </div>
            <h2 className="text-xl font-bold text-white mb-2" style={{ textShadow: "0 0 10px rgba(16,185,129,0.4)" }}>Profissional de Saude</h2>
            <p className="text-sm text-white/55 leading-relaxed">
              Agenda pessoal e atendimentos.
            </p>
            <p className="text-[11px] text-emerald-300/70 mt-4 font-semibold uppercase tracking-wider">
              Acesso: seu nome + PIN
            </p>
          </button>

          {/* Card 3 - Administracao */}
          <button
            onClick={() => setActive("admin")}
            className="group rounded-2xl p-6 text-left transition-all hover:scale-[1.02] hover:border-fuchsia-400/60"
            style={{ ...CARD_STYLE, border: "1px solid rgba(217,70,239,0.25)" }}
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "rgba(217,70,239,0.12)", border: "1px solid rgba(217,70,239,0.4)", boxShadow: "0 0 20px rgba(217,70,239,0.25)" }}>
              <ShieldCheck className="w-7 h-7" style={{ color: "#f0abfc" }} />
            </div>
            <h2 className="text-xl font-bold text-white mb-2" style={{ textShadow: "0 0 10px rgba(217,70,239,0.4)" }}>Administracao</h2>
            <p className="text-sm text-white/55 leading-relaxed">
              Gestao total, dashboards e configuracoes do sistema.
            </p>
            <p className="text-[11px] text-fuchsia-300/70 mt-4 font-semibold uppercase tracking-wider">
              Acesso direto
            </p>
          </button>
        </div>

        <p className="text-xs text-white/30 mt-10">&copy; 2026 NFs Systems &middot; Gestao Terapeutica</p>
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
        <div className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl" style={CARD_STYLE}>
          <div className="p-6 text-center" style={{ borderBottom: `1px solid ${accent}33` }}>
            <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-3" style={{ background: accentBg, border: `1px solid ${accent}`, boxShadow: `0 0 20px ${accent}40` }}>
              {isRecep ? <Building2 className="w-7 h-7" style={{ color: accent }} /> : <ShieldCheck className="w-7 h-7" style={{ color: accent }} />}
            </div>
            <h2 className="text-lg font-bold text-white" style={{ textShadow: `0 0 10px ${accent}66` }}>{isRecep ? "Recepcao" : "Administracao"}</h2>
            <p className="text-xs text-white/50 mt-1">Confirme o identificador da empresa</p>
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
              <p className="text-[10px] text-white/40 mt-1">Senha padrao: <span className="font-mono text-white/70">clinica123</span></p>
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
