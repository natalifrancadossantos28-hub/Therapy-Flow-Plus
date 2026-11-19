// Reconhecimento facial no navegador (face-api, servido de /face-api/).
// Do rosto sai uma "assinatura" de 128 números; duas assinaturas próximas
// (distância < LIMIAR) são a mesma pessoa.

type FaceApi = any;

const BASE = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/face-api`;
export const LIMIAR = 0.5;

let carregando: Promise<FaceApi> | null = null;

export function carregarFaceApi(): Promise<FaceApi> {
  if (!carregando) {
    carregando = (async () => {
      const faceapi: FaceApi = await import(/* @vite-ignore */ `${BASE}/face-api.esm.js`);
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(BASE),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(BASE),
        faceapi.nets.faceRecognitionNet.loadFromUri(BASE),
      ]);
      return faceapi;
    })().catch((e) => { carregando = null; throw e; });
  }
  return carregando;
}

async function assinatura(faceapi: FaceApi, fonte: HTMLImageElement | HTMLVideoElement, inputSize: number) {
  const r = await faceapi
    .detectSingleFace(fonte, new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold: 0.5 }))
    .withFaceLandmarks(true)
    .withFaceDescriptor();
  return r ? (Array.from(r.descriptor as Float32Array) as number[]) : null;
}

/** Assinatura do rosto de uma foto (data URL). null = nenhum rosto encontrado. */
export async function assinaturaDaFoto(foto: string): Promise<number[] | null> {
  const faceapi = await carregarFaceApi();
  const img = new Image();
  img.src = foto;
  await img.decode();
  return assinatura(faceapi, img, 416);
}

/** Assinatura do rosto que está na câmera agora. */
export async function assinaturaDoVideo(video: HTMLVideoElement): Promise<number[] | null> {
  const faceapi = await carregarFaceApi();
  return assinatura(faceapi, video, 320);
}

export function distancia(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}

/** Pessoa mais parecida, se estiver abaixo do limiar. */
export function reconhecer(alvo: number[], lista: { id: number; d: number[] }[]) {
  let melhor: { id: number; dist: number } | null = null;
  for (const p of lista) {
    const dist = distancia(alvo, p.d);
    if (!melhor || dist < melhor.dist) melhor = { id: p.id, dist };
  }
  return melhor && melhor.dist < LIMIAR ? melhor : null;
}
