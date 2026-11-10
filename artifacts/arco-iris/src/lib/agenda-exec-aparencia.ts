import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import * as api from "./agenda-exec-rpc";

// Minha Agenda: papel de parede e aparência de cada pessoa. Fica no aparelho
// e, com a migração 0137, também no servidor (vale em todos os aparelhos).

const BASE = import.meta.env.BASE_URL;

export type Aparencia = {
  fundo: string;    // "padrao" | "img:<id>" | "grad:<id>" | "cor:<hex>" | "foto"
  posX: number;     // 0-100
  posY: number;     // 0-100
  zoom: number;     // 100-200
  brilho: number;   // 50-150
  desfoque: number; // 0-20 px
  veu: number;      // -60 (clarear) … 80 (escurecer)
  cartoes: number;  // opacidade dos cartões 20-95
  letra: number;    // tamanho das letras 100-140 (%)
  rotina?: AtividadeRotina[]; // "Minha Rotina": atividades fixas do dia, cadastradas pela própria pessoa
};

export type AtividadeRotina = { id: string; hora: string; titulo: string; icone: string; cor: string };
export const ROTINA_MAX = 20;
function normalizarRotina(raw: unknown): AtividadeRotina[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x) => {
    const r = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const hora = typeof r.hora === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.hora) ? r.hora : null;
    const titulo = typeof r.titulo === "string" ? r.titulo.trim().slice(0, 40) : "";
    if (!hora || !titulo) return [];
    return [{
      id: typeof r.id === "string" && r.id ? r.id.slice(0, 12) : Math.random().toString(36).slice(2, 8),
      hora, titulo,
      icone: typeof r.icone === "string" ? r.icone.slice(0, 12) : "alvo",
      cor: typeof r.cor === "string" && /^#[0-9a-f]{6}$/i.test(r.cor) ? r.cor : "#a855f7",
    }];
  }).sort((a, b) => a.hora.localeCompare(b.hora)).slice(0, ROTINA_MAX);
}

export const APARENCIA_PADRAO: Aparencia = { fundo: "padrao", posX: 50, posY: 50, zoom: 100, brilho: 100, desfoque: 0, veu: 35, cartoes: 55, letra: 112 };

export type OpcaoFundo = { id: string; nome: string; grupo: "Degradês" | "Abstratos" | "Florais" | "Paisagens" | "Cores"; thumb: string; css?: string };

const GRADIENTES: [string, string, string][] = [
  ["noite", "Noite azul", "radial-gradient(circle at 20% 0%,#1d4ed8 0,transparent 45%),radial-gradient(circle at 90% 30%,#7c3aed 0,transparent 40%),linear-gradient(160deg,#050b24,#0b1540 55%,#1a0b3d)"],
  ["aurora", "Aurora", "radial-gradient(circle at 80% 10%,#38bdf8 0,transparent 40%),radial-gradient(circle at 10% 80%,#a855f7 0,transparent 45%),linear-gradient(180deg,#0b1030,#140c3a)"],
  ["lavanda", "Lavanda", "linear-gradient(160deg,#1e1b4b,#4c1d95 55%,#a78bfa)"],
  ["oceano", "Oceano", "linear-gradient(160deg,#020617,#0c4a6e 55%,#0ea5e9)"],
  ["grafite", "Grafite", "linear-gradient(160deg,#0a0a12,#1e293b 60%,#334155)"],
];
const CORES: [string, string][] = [["#0b1530", "Azul-marinho"], ["#1e1b4b", "Índigo"], ["#2e1065", "Violeta"], ["#0f172a", "Ardósia"], ["#09090b", "Preto"]];
const IMAGENS: [string, string, OpcaoFundo["grupo"]][] = [
  ["abstrato-azul", "Degradê azul", "Abstratos"], ["abstrato-lilas", "Degradê lilás", "Abstratos"], ["abstrato-suave", "Suave", "Abstratos"], ["neon", "Neon", "Abstratos"],
  ["pai-flores", "Campo de flores", "Florais"], ["pai-campo", "Campo verde", "Florais"],
  ["pai-ceu", "Céu estrelado", "Paisagens"], ["pai-montanhas", "Montanhas", "Paisagens"], ["pai-lago", "Lago sereno", "Paisagens"], ["pai-praia", "Praia", "Paisagens"],
  ["pai-por-do-sol", "Pôr do sol", "Paisagens"], ["pai-nuvens", "Nuvens", "Paisagens"], ["pai-cachoeira", "Cachoeira", "Paisagens"], ["pai-floresta", "Floresta", "Paisagens"],
];

export const OPCOES_FUNDO: OpcaoFundo[] = [
  ...GRADIENTES.map(([id, nome, css]) => ({ id: `grad:${id}`, nome, grupo: "Degradês" as const, thumb: "", css })),
  ...IMAGENS.map(([id, nome, grupo]) => ({ id: `img:${id}`, nome, grupo, thumb: `${BASE}images/fundos/thumbs/${id}.jpg` })),
  ...CORES.map(([hex, nome]) => ({ id: `cor:${hex}`, nome, grupo: "Cores" as const, thumb: "", css: hex })),
];

const lim = (v: unknown, a: number, b: number, d: number) => (Number.isFinite(Number(v)) ? Math.min(b, Math.max(a, Number(v))) : d);
export function normalizar(raw: unknown): Aparencia {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = APARENCIA_PADRAO;
  const fundo = typeof r.fundo === "string" && (r.fundo === "padrao" || r.fundo === "foto" || OPCOES_FUNDO.some((o) => o.id === r.fundo)) ? r.fundo : d.fundo;
  return {
    fundo, posX: lim(r.posX, 0, 100, d.posX), posY: lim(r.posY, 0, 100, d.posY), zoom: lim(r.zoom, 100, 200, d.zoom),
    brilho: lim(r.brilho, 50, 150, d.brilho), desfoque: lim(r.desfoque, 0, 20, d.desfoque), veu: lim(r.veu, -60, 80, d.veu), cartoes: lim(r.cartoes, 20, 95, d.cartoes),
    letra: lim(r.letra, 100, 140, d.letra), rotina: normalizarRotina(r.rotina),
  };
}

/** Camadas do fundo: imagem/cor + véu. A camada fica fixa atrás de tudo. */
export function estiloFundo(ap: Aparencia, foto: string | null): { imagem: CSSProperties; veu: CSSProperties } {
  const op = OPCOES_FUNDO.find((o) => o.id === ap.fundo);
  const padrao = GRADIENTES[0][2];
  let background: string;
  let foto_ = false;
  if (ap.fundo === "foto" && foto) { background = `url("${foto}")`; foto_ = true; }
  else if (op?.css) background = op.css;
  else if (op) { background = `url("${BASE}images/fundos/${op.id.slice(4)}.jpg")`; foto_ = true; }
  else background = padrao;
  const escala = (foto_ ? ap.zoom / 100 : 1) * (ap.desfoque > 0 ? 1.06 : 1);
  const imagem: CSSProperties = {
    background, backgroundSize: "cover", backgroundRepeat: "no-repeat",
    backgroundPosition: `${ap.posX}% ${ap.posY}%`,
    filter: `brightness(${ap.brilho / 100}) blur(${ap.desfoque}px)`,
    transform: escala !== 1 ? `scale(${escala})` : undefined,
    transformOrigin: `${ap.posX}% ${ap.posY}%`,
  };
  const veu: CSSProperties = {
    background: ap.veu >= 0
      ? `linear-gradient(180deg,rgba(3,7,25,${(ap.veu / 100) * 0.8}),rgba(3,7,25,${ap.veu / 100}))`
      : `rgba(255,255,255,${-ap.veu / 100})`,
  };
  return { imagem, veu };
}

export function arquivoParaFoto(file: File, max = 1600): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) { reject(new Error("Escolha uma imagem.")); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Não consegui abrir esta imagem.")); };
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.82));
    };
    img.src = url;
  });
}

type Local = { prefs: Aparencia; em: string };
const chave = (id: number) => `nfs_agx_aparencia_${id}`;
const chaveFoto = (id: number) => `nfs_agx_foto_${id}`;
function lerLocal(id: number): Local | null {
  try { const r = localStorage.getItem(chave(id)); if (!r) return null; const j = JSON.parse(r); return { prefs: normalizar(j.prefs), em: String(j.em ?? "") }; } catch { return null; }
}
function gravarLocal(id: number, prefs: Aparencia, em: string) { try { localStorage.setItem(chave(id), JSON.stringify({ prefs, em })); } catch { /* sem espaço */ } }
function gravarFotoLocal(id: number, foto: string | null) {
  try { if (foto) localStorage.setItem(chaveFoto(id), foto); else localStorage.removeItem(chaveFoto(id)); } catch { /* foto grande demais para o aparelho */ }
}

export type EstadoSync = "ok" | "salvando" | "so-aparelho";

export function useAparencia(usuarioId: number) {
  const [ap, setAp] = useState<Aparencia>(() => lerLocal(usuarioId)?.prefs ?? APARENCIA_PADRAO);
  const [foto, setFotoSt] = useState<string | null>(() => { try { return localStorage.getItem(chaveFoto(usuarioId)); } catch { return null; } });
  const [sync, setSync] = useState<EstadoSync>("ok");
  const timer = useRef<number | null>(null);
  const fotoPendente = useRef<string | null>(null); // null = não mudou; "" = apagar

  useEffect(() => {
    let vivo = true;
    api.lerAparencia().then((s) => {
      if (!vivo || !s) return;
      const local = lerLocal(usuarioId);
      if (local && local.em && local.em >= s.updatedAt) return;
      const p = normalizar(s.prefs);
      setAp(p); gravarLocal(usuarioId, p, s.updatedAt);
      setFotoSt(s.foto); gravarFotoLocal(usuarioId, s.foto);
    }).catch((e) => { if (vivo && api.migracaoPendente(e)) setSync("so-aparelho"); });
    return () => { vivo = false; };
  }, [usuarioId]);

  const enviar = useCallback((p: Aparencia) => {
    if (timer.current) window.clearTimeout(timer.current);
    setSync("salvando");
    timer.current = window.setTimeout(() => {
      const f = fotoPendente.current;
      api.salvarAparencia(p, f).then(() => {
        if (fotoPendente.current === f) fotoPendente.current = null;
        gravarLocal(usuarioId, p, new Date().toISOString());
        setSync("ok");
      }).catch(() => setSync("so-aparelho"));
    }, 700);
  }, [usuarioId]);

  const mudar = useCallback((parcial: Partial<Aparencia>) => {
    setAp((a) => { const p = normalizar({ ...a, ...parcial }); gravarLocal(usuarioId, p, new Date().toISOString()); enviar(p); return p; });
  }, [usuarioId, enviar]);

  const definirFoto = useCallback((f: string | null) => {
    setFotoSt(f); gravarFotoLocal(usuarioId, f); fotoPendente.current = f ?? "";
    setAp((a) => { const p = normalizar({ ...a, fundo: f ? "foto" : a.fundo === "foto" ? "padrao" : a.fundo, ...(f ? { posX: 50, posY: 50, zoom: 100 } : {}) }); gravarLocal(usuarioId, p, new Date().toISOString()); enviar(p); return p; });
  }, [usuarioId, enviar]);

  const restaurar = useCallback(() => {
    setAp((a) => { const p = { ...APARENCIA_PADRAO, rotina: a.rotina ?? [] }; gravarLocal(usuarioId, p, new Date().toISOString()); enviar(p); return p; });
  }, [usuarioId, enviar]);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  return { ap, foto, sync, mudar, definirFoto, restaurar };
}
