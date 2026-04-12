import { useState, useCallback } from "react";
import { Lock, ShieldCheck, Eye, EyeOff, Building2 } from "lucide-react";

const SESSION_KEY = "nfs_ponto_session";
const LEGACY_KEY = "nfs_admin_auth";
const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type Session = {
  type: "company" | "master";
  companyId?: number;
  companyName?: string;
  companySlug?: string;
  adminToken?: string;
  masterToken?: string;
  moduleArcoIris?: boolean;
};

function getSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function isAuthenticated(): boolean {
  const session = getSession();
  if (session?.type === "master") return true;
  if (session?.type === "company" && session.moduleArcoIris) return true;
  return sessionStorage.getItem(LEGACY_KEY) === "true";
}

export function getCompanyId(): number | null {
  const session = getSession();
  return session?.companyId ?? null;
}

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(isAuthenticated);
  const [slug, setSlug] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shaking, setShaking] = useState(false);

  const shake = () => { setShaking(true); setTimeout(() => setShaking(false), 500); };

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/ponto/auth/company`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Empresa ou senha incorretos.");
        shake();
        return;
      }
      if (!data.moduleArcoIris) {
        setError("Esta empresa não tem acesso ao módulo Gestão Terapêutica.");
        shake();
        return;
      }
      const session: Session = {
        type: "company",
        companyId: data.id,
        companyName: data.name,
        companySlug: data.slug,
        adminToken: password,
        moduleArcoIris: true,
        moduleTriagem: data.moduleTriagem,
        modulePonto: data.modulePonto,
      };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      sessionStorage.setItem(LEGACY_KEY, "true");
      setAuthed(true);
    } catch {
      setError("Erro de conexão. Tente novamente.");
      shake();
    } finally {
      setLoading(false);
    }
  }, [slug, password]);

  if (authed) return <>{children}</>;

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className={`w-full max-w-sm ${shaking ? "animate-[shake_0.4s_ease]" : ""}`}>
        <div className="bg-card rounded-3xl shadow-[0_0_60px_rgba(0,0,0,0.6)] border border-primary/20 overflow-hidden" style={{ boxShadow: "0 0 60px rgba(0,0,0,0.6), 0 0 30px rgba(0,240,255,0.06)" }}>
          <div className="bg-gradient-to-br from-primary/80 to-primary/40 p-8 text-center text-primary-foreground" style={{ borderBottom: "1px solid rgba(0,240,255,0.2)" }}>
            <div className="w-16 h-16 bg-white/15 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ boxShadow: "0 0 20px rgba(0,240,255,0.3)" }}>
              <Lock className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold">Área Restrita</h2>
            <p className="text-sm opacity-80 mt-1">Acesse com as credenciais da sua empresa</p>
          </div>

          <form onSubmit={handleSubmit} className="p-8 space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block uppercase tracking-wider flex items-center gap-1">
                <Building2 className="w-3 h-3" /> Identificador da Empresa
              </label>
              <input
                type="text"
                value={slug}
                onChange={e => { setSlug(e.target.value); setError(""); }}
                placeholder="minha-clinica"
                autoFocus
                className="w-full border border-border rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary/30 bg-muted text-foreground font-mono placeholder:text-muted-foreground transition-all"
              />
            </div>
            <div className="relative">
              <label className="text-xs font-semibold text-muted-foreground mb-1 block uppercase tracking-wider">Senha Administrativa</label>
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(""); }}
                placeholder="Senha administrativa"
                className="w-full border border-border rounded-xl px-4 py-3 pr-12 text-base focus:outline-none focus:ring-2 focus:ring-primary/30 bg-muted text-foreground font-medium placeholder:text-muted-foreground transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-3 bottom-3 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {error && (
              <p className="text-sm text-destructive font-semibold flex items-center gap-1.5">
                <span>⚠</span> {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!slug || !password || loading}
              className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground font-bold py-3 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(0,240,255,0.4)]"
            >
              <ShieldCheck className="w-4 h-4" /> {loading ? "Verificando..." : "Entrar"}
            </button>
          </form>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-4">© 2026 NFS – Gestão Terapêutica</p>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}
