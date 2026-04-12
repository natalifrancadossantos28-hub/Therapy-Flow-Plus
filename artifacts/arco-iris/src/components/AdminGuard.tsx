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
        <div className="bg-card rounded-3xl shadow-[0_0_60px_rgba(0,0,0,0.6)] border border-primary/20 overflow-hidden" style={{ boxShadow: "0 0 60px rgba(0,0,0,0.6), 0 0 30px rgba(0,240,255,0.06)" }}>
          <div className="bg-gradient-to-br from-primary/80 to-primary/40 p-8 text-center text-primary-foreground" style={{ borderBottom: "1px solid rgba(0,240,255,0.2)" }}>
            <div className="w-16 h-16 bg-white/15 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ boxShadow: "0 0 20px rgba(0,240,255,0.3)" }}>
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
                className="w-full border border-border rounded-xl px-4 py-3 pr-12 text-base focus:outline-none focus:ring-2 focus:ring-primary/30 bg-muted text-foreground font-medium placeholder:text-muted-foreground transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
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
              className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground font-bold py-3 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(0,240,255,0.4)]"
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
