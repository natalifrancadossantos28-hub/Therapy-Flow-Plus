import { User } from "lucide-react";

type Props = {
  url?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
};

/** Miniatura da foto do paciente (ou ícone genérico quando não há foto). */
export function PatientAvatar({ url, name, size = 32, className = "" }: Props) {
  const style = { width: size, height: size };
  if (url) {
    return (
      <img
        src={url}
        alt={name || "Foto do paciente"}
        className={`rounded-full object-cover border border-border shrink-0 ${className}`}
        style={style}
      />
    );
  }
  return (
    <span
      className={`rounded-full flex items-center justify-center bg-secondary/40 border border-border shrink-0 ${className}`}
      style={style}
    >
      <User className="text-muted-foreground" style={{ width: size * 0.5, height: size * 0.5 }} />
    </span>
  );
}
