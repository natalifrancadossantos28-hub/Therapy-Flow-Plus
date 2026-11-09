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

// O microfone fica aberto enquanto a tela de falar estiver aberta: a 2ª fala já começa a gravar na hora.
let microfone: MediaStream | null = null;
export function liberarMicrofone() { microfone?.getTracks().forEach((t) => t.stop()); microfone = null; }

export type Gravacao = { parar: () => Promise<Blob>; cancelar: () => void };

// Para sozinho quando a pessoa termina de falar (≈0,8 s de silêncio depois da fala), sem precisar tocar de novo.
function vigiarSilencio(stream: MediaStream, aoCalar: () => void): () => void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const an = ctx.createAnalyser(); an.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Float32Array(an.fftSize);
    let falou = false, calado = 0, base = 0.01;
    const t0 = Date.now();
    const id = window.setInterval(() => {
      an.getFloatTimeDomainData(buf);
      let soma = 0; for (const v of buf) soma += v * v;
      const rms = Math.sqrt(soma / buf.length);
      if (Date.now() - t0 < 300) { base = Math.max(base, rms * 1.5); return; }
      if (rms > Math.max(0.02, base * 2)) { falou = true; calado = 0; }
      else if (falou && (calado += 100) >= 800) { parar(); aoCalar(); }
      else if (!falou && Date.now() - t0 > 7000) { parar(); aoCalar(); }
    }, 100);
    const parar = () => { window.clearInterval(id); void ctx.close().catch(() => {}); };
    return parar;
  } catch { return () => {}; }
}

export async function gravar(maxSeg = 25, aoAcabar?: () => void): Promise<Gravacao> {
  if (!microfone || microfone.getAudioTracks().every((t) => t.readyState === "ended"))
    microfone = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const stream = microfone;
  const tipo = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((t) => MediaRecorder.isTypeSupported?.(t));
  const rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
  const partes: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) partes.push(e.data); };
  const fim = new Promise<Blob>((ok) => { rec.onstop = () => { ok(new Blob(partes, { type: rec.mimeType || tipo || "audio/mp4" })); }; });
  rec.start(250);
  const acabar = () => { if (rec.state !== "inactive") { rec.stop(); aoAcabar?.(); } };
  const limite = setTimeout(acabar, maxSeg * 1000);
  const silencio = vigiarSilencio(stream, acabar);
  const soltar = () => { clearTimeout(limite); silencio(); };
  return {
    parar: () => { soltar(); if (rec.state !== "inactive") rec.stop(); return fim; },
    cancelar: () => { soltar(); if (rec.state !== "inactive") rec.stop(); },
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

// Só os compromissos de ontem até 60 dias para frente: pergunta menor = resposta mais rápida.
function proximos(lista: AgxCompromisso[]) {
  const iso = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString("en-CA"); };
  const de = iso(-1), ate = iso(60);
  return lista.filter((c) => !c.concluido && c.data >= de && c.data <= ate).slice(0, 80);
}

export async function entenderVoz(entrada: { texto?: string; audio?: Blob; confirmando?: boolean }, lista: AgxCompromisso[]): Promise<VozIA> {
  const token = getSessao()?.token;
  if (!token) throw Object.assign(new Error("Entre com seu PIN."), { code: "28P01" });
  const audio = entrada.audio ? await paraWav(entrada.audio) : undefined;
  const r = await fetch("/api/agenda/voz", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      token, texto: entrada.texto, audio, confirmando: entrada.confirmando === true, mime: audio ? "audio/wav" : undefined,
      compromissos: proximos(lista).map((c) => ({ id: c.id, data: c.data, hora: c.hora, titulo: c.titulo })),
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) throw Object.assign(new Error("Entre com seu PIN."), { code: "28P01" });
  if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
  return j as VozIA;
}
