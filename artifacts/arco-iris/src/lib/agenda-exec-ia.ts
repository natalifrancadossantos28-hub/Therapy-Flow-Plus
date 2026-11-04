import type { AgxCompromisso, Categoria } from "./agenda-exec-rpc";
import { getSessao } from "./agenda-exec-rpc";

// Microfone que funciona também no iPhone com o app na Tela de Início (lá o reconhecimento de voz do navegador não existe):
// grava o áudio, converte para WAV e manda para /api/agenda/voz, que transcreve e entende o pedido.

export type VozIA = {
  transcricao: string;
  acao: "criar" | "desmarcar" | "remarcar" | "concluir" | "comando" | "nada";
  comando: "salvar" | "cancelar" | "corrigir" | null;
  titulo: string | null; data: string | null; hora: string | null; diaTodo: boolean;
  local: string | null; observacao: string | null; categoria: Categoria; antecedenciaMin: number | null;
  alvoId: number | null; novaData: string | null; novaHora: string | null;
};

export const gravadorSuportado = () =>
  typeof window !== "undefined" && "MediaRecorder" in window && !!navigator.mediaDevices?.getUserMedia;

export type Gravacao = { parar: () => Promise<Blob>; cancelar: () => void };

export async function gravar(maxSeg = 25, aoAcabar?: () => void): Promise<Gravacao> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const tipo = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((t) => MediaRecorder.isTypeSupported?.(t));
  const rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
  const partes: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) partes.push(e.data); };
  const fim = new Promise<Blob>((ok) => { rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); ok(new Blob(partes, { type: rec.mimeType || tipo || "audio/mp4" })); }; });
  rec.start(250);
  const limite = setTimeout(() => { if (rec.state !== "inactive") { rec.stop(); aoAcabar?.(); } }, maxSeg * 1000);
  return {
    parar: () => { clearTimeout(limite); if (rec.state !== "inactive") rec.stop(); return fim; },
    cancelar: () => { clearTimeout(limite); if (rec.state !== "inactive") rec.stop(); },
  };
}

async function paraWav(blob: Blob): Promise<string> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
  void ctx.close();
  const taxa = 16000;
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(audio.duration * taxa)), taxa);
  const src = off.createBufferSource();
  src.buffer = audio; src.connect(off.destination); src.start();
  const pcm = (await off.startRendering()).getChannelData(0);
  const buf = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const txt = (o: number, s: string) => [...s].forEach((c, i) => buf.setUint8(o + i, c.charCodeAt(0)));
  txt(0, "RIFF"); buf.setUint32(4, 36 + pcm.length * 2, true); txt(8, "WAVE"); txt(12, "fmt ");
  buf.setUint32(16, 16, true); buf.setUint16(20, 1, true); buf.setUint16(22, 1, true); buf.setUint32(24, taxa, true);
  buf.setUint32(28, taxa * 2, true); buf.setUint16(32, 2, true); buf.setUint16(34, 16, true); txt(36, "data"); buf.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) buf.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
  const bytes = new Uint8Array(buf.buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function entenderVoz(entrada: { texto?: string; audio?: Blob }, lista: AgxCompromisso[]): Promise<VozIA> {
  const token = getSessao()?.token;
  if (!token) throw Object.assign(new Error("Entre com seu PIN."), { code: "28P01" });
  const audio = entrada.audio ? await paraWav(entrada.audio) : undefined;
  const r = await fetch("/api/agenda/voz", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      token, texto: entrada.texto, audio, mime: audio ? "audio/wav" : undefined,
      compromissos: lista.filter((c) => !c.concluido).map((c) => ({ id: c.id, data: c.data, hora: c.hora, titulo: c.titulo })),
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) throw Object.assign(new Error("Entre com seu PIN."), { code: "28P01" });
  if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
  return j as VozIA;
}
