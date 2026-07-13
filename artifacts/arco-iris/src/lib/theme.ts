// Tema claro/escuro persistente. Usado por Arco-Iris e Triagem (mesma chave
// nfs_theme). A classe ".light" e aplicada em <html> antes do React montar.

import { useEffect, useState } from "react";

export type Theme = "dark" | "light";
const STORAGE_KEY = "nfs_theme";

export function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return "dark";
}

const THEME_EVENT = "nfs-theme-change";

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  if (theme === "light") html.classList.add("light");
  else html.classList.remove("light");
  if (typeof window !== "undefined") window.dispatchEvent(new Event(THEME_EVENT));
}

/**
 * Re-renderiza o componente quando o tema muda. Usado no Layout pra que
 * cores calculadas em JS (ex.: `specialtyTone`) atualizem na hora do toggle.
 */
export function useThemeTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener(THEME_EVENT, bump);
    return () => window.removeEventListener(THEME_EVENT, bump);
  }, []);
  return tick;
}

// Bootstrap antes do React montar pra evitar flash.
export function bootstrapTheme() {
  applyTheme(getInitialTheme());
}

export function useTheme(): [Theme, (next: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch { /* localStorage indisponivel */ }
  }, [theme]);

  return [theme, setTheme];
}
