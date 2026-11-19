// Reconhecimento facial no navegador (face-api, servido de /face-api/).
// Do rosto sai uma "assinatura" de 128 números. A comparação entre assinaturas
// é feita no banco (kiosk_face_match), que nunca devolve as assinaturas.

type FaceApi = any;

const BASE = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/face-api`;

let carregando: Promise<FaceApi> | null = null;

export function carregarFaceApi(): Promise<FaceApi> {
  if (!carregando) {
    carregando = (async () => {
      const faceapi: FaceApi = await import(/* @vite-ignore */ `${BASE}/face-api.esm.js`);
      await faceapi.tf.ready();
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

// Identifica a foto usada no cálculo (o banco recusa a assinatura se a foto mudou).
export async function hashDaFoto(foto: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(foto));
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
}
