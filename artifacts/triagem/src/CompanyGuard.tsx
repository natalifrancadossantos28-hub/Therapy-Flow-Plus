import { useState, useEffect, useCallback, type ReactNode, type FormEvent } from "react";
import { processOfflineQueue, getOfflineQueueCount } from "./lib/offline-queue";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const SESSION_KEY = "nfs_ponto_session";

type Session = {
  type: "company" | "master";
  companyId: number;
  companyName: string;
  companySlug: string;
  adminToken: string;
  moduleTriagem?: boolean;
  moduleArcoIris?: boolean;
  modulePonto?: boolean;
};

function getSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function isAuthorized(session: Session | null, module: string): boolean {
  if (!session) return false;
  if (session.type === "master") return true;
  return (session as any)[module] === true;
}

interface CompanyGuardProps {
  children: ReactNode;
  module: string;
  appName: string;
}

export default function CompanyGuard({ children, module, appName }: CompanyGuardProps) {
  const [session, setSession] = useState<Session | null>(getSession);
  const [slug, setSlug] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [offlineCount, setOfflineCount] = useState(getOfflineQueueCount);
  const [syncMsg, setSyncMsg] = useState("");

  const authorized = isAuthorized(session, module);

  useEffect(() => {
    const handleOnline = async () => {
      const synced = await processOfflineQueue();
      setOfflineCount(getOfflineQueueCount());
      if (synced > 0) {
        setSyncMsg(`${synced} triagem(s) sincronizada(s) com sucesso!`);
        setTimeout(() => setSyncMsg(""), 5000);
      }
    };
    window.addEventListener("online", handleOnline);
    if (navigator.onLine) handleOnline();
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  const handleLogin = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${BASE_URL}/api/ponto/auth/company`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Credenciais inválidas."); return; }
      if (!data[module]) {
        setError("Esta empresa não tem acesso a este módulo. Contate o suporte.");
        return;
      }
      const s: Session = {
        type: "company",
        companyId: data.id,
        companyName: data.name,
        companySlug: data.slug,
        adminToken: password,
        moduleTriagem: data.moduleTriagem,
        moduleArcoIris: data.moduleArcoIris,
        modulePonto: data.modulePonto,
      };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
      setSession(s);
    } catch {
      setError("Erro de conexão. Verifique sua internet.");
    } finally {
      setLoading(false);
    }
  }, [slug, password, module]);

  if (!authorized) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="bg-[#111118] rounded-3xl shadow-2xl border border-white/10 overflow-hidden">
            <div className="bg-gradient-to-br from-violet-600/80 to-purple-800/60 p-8 text-center text-white border-b border-white/10">
              <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold">{appName}</h2>
              <p className="text-sm opacity-70 mt-1">Acesso exclusivo por empresa</p>
            </div>
            <form onSubmit={handleLogin} className="p-8 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-400 mb-1 block uppercase tracking-wider">Identificador da Empresa</label>
                <input
                  type="text"
                  value={slug}
                  onChange={e => { setSlug(e.target.value); setError(""); }}
                  placeholder="minha-clinica"
                  autoFocus
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 font-mono placeholder:text-gray-600"
                />
              </div>
              <div className="relative">
                <label className="text-xs font-medium text-gray-400 mb-1 block uppercase tracking-wider">Senha</label>
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(""); }}
                  placeholder="••••••••"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-12 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 placeholder:text-gray-600"
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 bottom-3 text-gray-500 hover:text-gray-300">
                  {showPw ? "🙈" : "👁"}
                </button>
              </div>
              {error && <p className="text-sm text-red-400 font-medium">⚠ {error}</p>}
              <button
                type="submit"
                disabled={!slug || !password || loading}
                className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-all mt-2"
              >
                {loading ? "Verificando..." : "Entrar"}
              </button>
            </form>
          </div>
          <p className="text-center text-xs text-gray-600 mt-4">© 2026 NFs – Sistema Multidisciplinar</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {syncMsg && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-900/90 text-emerald-300 border border-emerald-700/50 rounded-xl px-4 py-3 text-sm font-medium shadow-lg">
          ✅ {syncMsg}
        </div>
      )}
      {offlineCount > 0 && !navigator.onLine && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-amber-900/90 text-amber-300 border border-amber-700/50 rounded-xl px-4 py-2 text-sm font-medium shadow-lg">
          📡 Offline — {offlineCount} triagem(s) aguardando sincronização
        </div>
      )}
      {children}
    </>
  );
}
