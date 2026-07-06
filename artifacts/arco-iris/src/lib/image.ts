// Compressao/redimensionamento de imagem no navegador.
// Reduz a foto (camera do celular costuma ter 3-8MB) para um JPEG pequeno
// (~50-100kb) antes de subir ao Storage, mantendo qualidade para identificar
// o rosto. Nao usa dependencia externa — apenas <canvas>.

export type CompressOptions = {
  maxSize?: number; // maior lado da imagem, em px (default 512)
  quality?: number; // 0..1 (default 0.72)
};

export async function compressImage(
  file: File | Blob,
  opts: CompressOptions = {}
): Promise<Blob> {
  const maxSize = opts.maxSize ?? 512;
  const quality = opts.quality ?? 0.72;

  const dataUrl = await readAsDataURL(file);
  const img = await loadImage(dataUrl);

  let { width, height } = img;
  if (width > height && width > maxSize) {
    height = Math.round((height * maxSize) / width);
    width = maxSize;
  } else if (height >= width && height > maxSize) {
    width = Math.round((width * maxSize) / height);
    height = maxSize;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Nao foi possivel processar a imagem.");
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
  if (!blob) throw new Error("Falha ao comprimir a imagem.");
  return blob;
}

function readAsDataURL(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Arquivo de imagem invalido."));
    img.src = src;
  });
}
