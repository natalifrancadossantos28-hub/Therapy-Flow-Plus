import { useEffect, useState, type CSSProperties } from "react";

// Fundo personalizado por perfil. A escolha fica só no navegador (localStorage);
// nada vai para o banco.
export type BackgroundPreset = { id: string; label: string; url: string };

const BASE = import.meta.env.BASE_URL;

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  { id: "clinica", label: "Clínica (noite)", url: `${BASE}images/fundos/clinica.jpg` },
  { id: "neon", label: "Neon saúde", url: `${BASE}images/fundos/neon.jpg` },
  { id: "sala", label: "Sala terapêutica", url: `${BASE}images/fundos/sala.jpg` },
  { id: "none", label: "Sem foto", url: "" },
];

const DEFAULTS: Record<string, string> = { portal: "clinica" };
const CHANGE_EVENT = "nfs-background-change";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function getBackgroundChoice(bgKey: string): string {
  return read(`nfs_bg_${bgKey}`) || DEFAULTS[bgKey] || "none";
}

export function getCustomBackground(bgKey: string): string | null {
  return read(`nfs_bg_custom_${bgKey}`);
}

export function resolveBackground(bgKey: string): string {
  const choice = getBackgroundChoice(bgKey);
  if (choice === "custom") return getCustomBackground(bgKey) || "";
  return BACKGROUND_PRESETS.find((p) => p.id === choice)?.url || "";
}

export function setBackgroundChoice(bgKey: string, id: string) {
  write(`nfs_bg_${bgKey}`, id);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

function fileToResizedDataUrl(file: File, maxWidth = 1600): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Imagem inválida"));
      img.onload = () => {
        const width = Math.min(maxWidth, img.width);
        const height = Math.round((img.height * width) / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export async function setCustomBackground(bgKey: string, file: File): Promise<boolean> {
  const dataUrl = await fileToResizedDataUrl(file);
  if (!write(`nfs_bg_custom_${bgKey}`, dataUrl)) return false;
  setBackgroundChoice(bgKey, "custom");
  return true;
}

export function useBackground(bgKey: string): string {
  const [url, setUrl] = useState(() => resolveBackground(bgKey));
  useEffect(() => {
    const update = () => setUrl(resolveBackground(bgKey));
    update();
    window.addEventListener(CHANGE_EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(CHANGE_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, [bgKey]);
  return url;
}

// Foto + véu escuro/claro (variáveis em index.css) para manter o texto legível.
export function appBackgroundStyle(url: string): CSSProperties | undefined {
  if (!url) return undefined;
  return {
    backgroundImage: `linear-gradient(180deg, var(--app-bg-veil-top), var(--app-bg-veil-bottom)), url("${url}")`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundAttachment: "fixed",
  };
}
