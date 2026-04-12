import { useState, useEffect } from "react";
import { Lock, ShieldCheck, Eye, EyeOff } from "lucide-react";

const STORAGE_KEY = "nfs_admin_auth";
const ADMIN_PASSWORD = "admin123";

function isAuthenticated(): boolean {
  return sessionStorage.getItem(STORAGE_KEY) === "true";
}

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(isAuthenticated);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [shaking, setShaking] = useState(false);

  useEffect(() => {
    const check = () => setAuthed(isAuthenticated());
    window.addEventListener("storage", check);
    return () => window.removeEventListener("storage", check);
  }, []);

  if (authed) return <>{children}</>;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      sessionStorage.setItem(STORAGE_KEY, "true");
      setAuthed(true);
      setError("");
    } else {
      setError("Senha incorreta. Tente novamente.");
      setPassword("");
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className={`w-full max-w-sm ${shaking ? "animate-[shake_0.4s_ease]" : ""}`}>
        <div className="bg-white rounded-3xl shadow-xl border border-border overflow-hidden">
          <div className="bg-gradient-to-br from-primary to-emerald-600 p-8 text-center text-white">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold">Área Restrita</h2>
            <p className="text-sm opacity-80 mt-1">Digite a senha administrativa para continuar</p>
          </div>

          <form onSubmit={handleSubmit} className="p-8 space-y-5">
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(""); }}
                placeholder="Senha administrativa"
                autoFocus
                className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-12 text-base focus:outline-none focus:ring-2 focus:ring-primary/50 bg-gray-50 font-medium"
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
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
              disabled={!password}
              className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" /> Entrar
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
