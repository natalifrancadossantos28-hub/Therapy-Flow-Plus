import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useTheme();
  const isLight = theme === "light";
  const next = isLight ? "dark" : "light";
  const label = isLight ? "Modo escuro" : "Modo claro";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      title={label}
      aria-label={label}
      className={
        compact
          ? "p-2 rounded-lg text-foreground/70 hover:bg-secondary transition-colors"
          : "flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary/60 hover:bg-secondary text-foreground/80 hover:text-foreground border border-border/50 transition-colors text-sm font-medium"
      }
    >
      {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
      {!compact && <span>{label}</span>}
    </button>
  );
}
