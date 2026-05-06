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

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  if (theme === "light") html.classList.add("light");
  else html.classList.remove("light");
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
