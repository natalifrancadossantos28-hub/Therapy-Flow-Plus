import { useEffect, useState } from "react";
import { isSupabaseConfigured, requireSupabase } from "./supabase";
import { getCompanySession } from "./portal-session";

// Personalização Visual: fundo da tela inicial definido pela administração
// e salvo no servidor (vale para todos os usuários e dispositivos).

const BASE = import.meta.env.BASE_URL;

export type GalleryCategory = "inc" | "sau" | "inf" | "tec" | "amb" | "abs";

export const GALLERY_CATEGORIES: Array<{ id: GalleryCategory | "all" | "own"; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "inc", label: "Inclusão e diversidade" },
  { id: "sau", label: "Saúde e reabilitação" },
  { id: "inf", label: "Desenvolvimento infantil" },
  { id: "tec", label: "Tecnologia" },
  { id: "amb", label: "Ambientes" },
  { id: "abs", label: "Abstratos" },
  { id: "own", label: "Minhas imagens" },
];

export type BuiltinImage = { id: string; name: string; cat: GalleryCategory };

// Imagens originais geradas para o NFs (sem fotos de pacientes).
export const BUILTIN_IMAGES: BuiltinImage[] = [
  { id: "clinica", name: "Clínica (noite)", cat: "amb" },
  { id: "acolhimento", name: "Recepção acolhedora", cat: "amb" },
  { id: "sala", name: "Sala terapêutica", cat: "amb" },
  { id: "inclusao", name: "Mãos unidas", cat: "inc" },
  { id: "reabilitacao", name: "Sala de reabilitação", cat: "sau" },
  { id: "desenvolvimento", name: "Brinquedos educativos", cat: "inf" },
  { id: "tecnologia", name: "Saúde digital", cat: "tec" },
  { id: "neon", name: "Neon saúde", cat: "tec" },
  { id: "abstrato-azul", name: "Degradê azul", cat: "abs" },
  { id: "abstrato-lilas", name: "Degradê lilás", cat: "abs" },
  { id: "abstrato-suave", name: "Degradê suave", cat: "abs" },
];

export const DEFAULT_REF = "builtin:clinica";
export const DEFAULT_VEIL = 45;

export const builtinUrl = (id: string) => `${BASE}images/fundos/${id}.jpg`;

export type VisualOrder = "seq" | "random" | "week";
export type VisualConfig = {
  mode: "fixed" | "daily";
  order: VisualOrder;
  veil: number;
  fixed: string;
  rotation: string[];
  week: Record<string, string>; // "1" = segunda ... "7" = domingo
};

export const DEFAULT_CONFIG: VisualConfig = {
  mode: "fixed",
  order: "seq",
  veil: DEFAULT_VEIL,
  fixed: DEFAULT_REF,
  rotation: [],
  week: {},
};

export type CustomImage = { id: number; name: string; thumb: string; createdAt: string };
export type ScheduleDay = { date: string; ref: string };

export function parseRef(ref: string | null | undefined): { kind: "builtin"; id: string } | { kind: "custom"; id: number } | null {
  if (!ref) return null;
  if (ref.startsWith("builtin:")) return { kind: "builtin", id: ref.slice(8) };
  if (ref.startsWith("custom:")) {
    const id = Number(ref.slice(7));
    return Number.isFinite(id) ? { kind: "custom", id } : null;
  }
  return null;
}

// Véu azul sobre a foto. 45 = o mesmo da tela inicial aprovada.
export function portalVeilGradient(veil: number): string {
  const f = Math.max(20, Math.min(80, veil)) / 45;
  const a = (v: number) => Math.min(0.95, v * f).toFixed(2);
  return `linear-gradient(180deg, rgba(5,14,50,${a(0.3)}), rgba(4,12,40,${a(0.45)}) 55%, rgba(3,8,30,${a(0.78)})), linear-gradient(90deg, rgba(20,50,160,0.22), rgba(20,40,140,0.10))`;
}

function normalizeConfig(raw: any): VisualConfig {
  return {
    mode: raw?.mode === "daily" ? "daily" : "fixed",
    order: raw?.order === "random" || raw?.order === "week" ? raw.order : "seq",
    veil: Number.isFinite(Number(raw?.veil)) ? Number(raw.veil) : DEFAULT_VEIL,
    fixed: typeof raw?.fixed === "string" ? raw.fixed : DEFAULT_REF,
    rotation: Array.isArray(raw?.rotation) ? raw.rotation.filter((r: unknown) => typeof r === "string") : [],
    week: raw?.week && typeof raw.week === "object" ? { ...raw.week } : {},
  };
}

function creds(): { slug: string; password: string } {
  const s = getCompanySession();
  if (!s?.companySlug || !s.adminToken) throw new Error("Sessão expirada. Faça login novamente.");
  return { slug: s.companySlug, password: s.adminToken };
}

function slugOnly(): string {
  return creds().slug;
}

export async function getVisualSettings(): Promise<{ config: VisualConfig; today: string; images: CustomImage[] }> {
  const { slug, password } = creds();
  const { data, error } = await requireSupabase().rpc("get_visual_settings", { p_slug: slug, p_password: password });
  if (error) throw error;
  return {
    config: normalizeConfig(data?.config),
    today: String(data?.today ?? ""),
    images: ((data?.images ?? []) as any[]).map((i) => ({ id: Number(i.id), name: String(i.name), thumb: String(i.thumb), createdAt: String(i.createdAt) })),
  };
}

export async function previewVisualSchedule(config: VisualConfig, days = 10): Promise<ScheduleDay[]> {
  const { slug, password } = creds();
  const { data, error } = await requireSupabase().rpc("preview_visual_schedule", {
    p_slug: slug, p_password: password, p_config: config, p_days: days,
  });
  if (error) throw error;
  return ((data ?? []) as any[]).map((d) => ({ date: String(d.date), ref: String(d.ref) }));
}

export async function getCustomImage(id: number): Promise<string | null> {
  const { slug, password } = creds();
  const { data, error } = await requireSupabase().rpc("get_visual_image", { p_slug: slug, p_password: password, p_id: id });
  if (error) throw error;
  return (data as string | null) ?? null;
}

export async function verifyVisualAdmin(adminPassword: string): Promise<void> {
  const { error } = await requireSupabase().rpc("verify_visual_admin", { p_slug: slugOnly(), p_admin_password: adminPassword });
  if (error) throw error;
}

export async function saveVisualSettings(adminPassword: string, config: VisualConfig): Promise<VisualConfig> {
  const { data, error } = await requireSupabase().rpc("save_visual_settings", {
    p_slug: slugOnly(), p_admin_password: adminPassword, p_config: config,
  });
  if (error) throw error;
  clearPortalCache();
  return normalizeConfig(data);
}

export async function addVisualImage(adminPassword: string, name: string, image: string, thumb: string): Promise<CustomImage> {
  const { data, error } = await requireSupabase().rpc("add_visual_image", {
    p_slug: slugOnly(), p_admin_password: adminPassword, p_name: name, p_image: image, p_thumb: thumb,
  });
  if (error) throw error;
  return { id: Number(data.id), name: String(data.name), thumb: String(data.thumb), createdAt: String(data.createdAt) };
}

export async function deleteVisualImage(adminPassword: string, id: number): Promise<VisualConfig> {
  const { data, error } = await requireSupabase().rpc("delete_visual_image", {
    p_slug: slugOnly(), p_admin_password: adminPassword, p_id: id,
  });
  if (error) throw error;
  clearPortalCache();
  return normalizeConfig(data);
}

// Reduz a imagem enviada antes de guardar no servidor.
export async function fileToDataUrls(file: File): Promise<{ image: string; thumb: string }> {
  const src = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Arquivo de imagem inválido."));
    el.src = src;
  });
  const draw = (maxW: number, quality: number) => {
    const scale = Math.min(1, maxW / img.naturalWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  };
  return { image: draw(1920, 0.82), thumb: draw(480, 0.7) };
}

// ── Tela inicial: fundo do dia (público) ───────────────────────────────────

const PORTAL_CACHE = "nfs_visual_portal";
const IMG_CACHE_PREFIX = "nfs_visual_img_";

type PortalCache = { ref: string; veil: number; date: string };

function readCache(): PortalCache | null {
  try {
    const raw = localStorage.getItem(PORTAL_CACHE);
    return raw ? (JSON.parse(raw) as PortalCache) : null;
  } catch {
    return null;
  }
}

function clearPortalCache() {
  try {
    localStorage.removeItem(PORTAL_CACHE);
  } catch {
    /* ignore */
  }
}

function cachedImage(id: number): string | null {
  try {
    return localStorage.getItem(IMG_CACHE_PREFIX + id);
  } catch {
    return null;
  }
}

function storeImage(id: number, data: string) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(IMG_CACHE_PREFIX) && k !== IMG_CACHE_PREFIX + id) localStorage.removeItem(k);
    }
    localStorage.setItem(IMG_CACHE_PREFIX + id, data);
  } catch {
    /* sem espaço: segue sem cache */
  }
}

function resolveCached(c: PortalCache | null): { url: string; veil: number } {
  if (!c) return { url: builtinUrl("clinica"), veil: DEFAULT_VEIL };
  const p = parseRef(c.ref);
  if (p?.kind === "builtin") return { url: builtinUrl(p.id), veil: c.veil };
  if (p?.kind === "custom") return { url: cachedImage(p.id) || builtinUrl("clinica"), veil: c.veil };
  return { url: builtinUrl("clinica"), veil: c.veil };
}

export function usePortalBackground(slug: string): { url: string; veil: number } {
  const [bg, setBg] = useState(() => resolveCached(readCache()));

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let alive = true;
    (async () => {
      const supabase = requireSupabase();
      const { data, error } = await supabase.rpc("get_visual_background", { p_slug: slug });
      if (error || !data) return;
      const ref = String(data.ref || DEFAULT_REF);
      const veil = Number(data.veil ?? DEFAULT_VEIL);
      const p = parseRef(ref);
      let url = builtinUrl("clinica");
      if (p?.kind === "builtin") url = builtinUrl(p.id);
      else if (p?.kind === "custom") {
        let img = cachedImage(p.id);
        if (!img) {
          const res = await supabase.rpc("get_visual_background_image", { p_slug: slug, p_id: p.id });
          img = (res.data as string | null) ?? null;
          if (img) storeImage(p.id, img);
        }
        if (img) url = img;
      }
      try {
        localStorage.setItem(PORTAL_CACHE, JSON.stringify({ ref, veil, date: String(data.date ?? "") }));
      } catch {
        /* ignore */
      }
      if (alive) setBg({ url, veil });
    })().catch(() => { /* mantém o fundo atual */ });
    return () => {
      alive = false;
    };
  }, [slug]);

  return bg;
}
