// Tema claro/escuro persistente. Classe ".light" e aplicada em <html>.

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

export function bootstrapTheme() {
  applyTheme(getInitialTheme());
}

export function useTheme(): [Theme, (next: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch { /* ignore */ }
  }, [theme]);

  return [theme, setTheme];
}
