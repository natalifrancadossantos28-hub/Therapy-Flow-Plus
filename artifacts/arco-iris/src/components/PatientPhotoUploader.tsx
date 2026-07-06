import { useRef, useState } from "react";
import { Camera, Upload, Trash2, Loader2, User } from "lucide-react";
import { compressImage } from "@/lib/image";
import { uploadPatientPhoto } from "@/lib/arco-rpc";

type Props = {
  value: string | null;
  patientId: number | null;
  onChange: (url: string | null) => void;
  onError?: (message: string) => void;
  size?: number; // diametro do avatar em px (default 96)
};

// Foto do paciente: envia do computador ou tira na hora pela camera do celular
// (capture="environment" abre a camera traseira). Comprime no navegador antes
// de subir ao Storage.
export function PatientPhotoUploader({ value, patientId, onChange, onError, size = 96 }: Props) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const compressed = await compressImage(file, { maxSize: 512, quality: 0.72 });
      const url = await uploadPatientPhoto(compressed, patientId);
      onChange(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha ao enviar a foto.";
      onError?.(msg);
    } finally {
      setBusy(false);
      if (galleryRef.current) galleryRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div
        className="rounded-full overflow-hidden flex items-center justify-center bg-secondary/40 border border-border shrink-0"
        style={{ width: size, height: size }}
      >
        {busy ? (
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        ) : value ? (
          <img src={value} alt="Foto do paciente" className="w-full h-full object-cover" />
        ) : (
          <User className="w-8 h-8 text-muted-foreground" />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white disabled:opacity-50 transition-colors"
          >
            <Camera className="w-4 h-4" /> Câmera
          </button>
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/70 text-foreground border border-border disabled:opacity-50 transition-colors"
          >
            <Upload className="w-4 h-4" /> Enviar arquivo
          </button>
          {value && !busy && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="w-4 h-4" /> Remover
            </button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">A imagem é reduzida automaticamente antes de salvar.</p>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
