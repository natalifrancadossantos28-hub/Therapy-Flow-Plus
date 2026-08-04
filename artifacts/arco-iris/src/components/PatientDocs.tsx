import { useState } from "react";
import { Check, Copy } from "lucide-react";

export type PatientDoc = { cpf: string | null; cns: string | null };

const onlyDigits = (v: string) => v.replace(/\D/g, "");

/** Cadastros antigos guardam lixo nesses campos (ex.: o nome do paciente no CPF). */
function isPlausibleDoc(value: string | null | undefined): boolean {
  if (!value || !value.trim()) return false;
  const d = onlyDigits(value);
  return d.length >= 8 && d.length <= 20;
}

export function formatCpf(value: string | null | undefined): string {
  if (!value) return "";
  const d = onlyDigits(value);
  if (d.length !== 11) return value.trim();
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function formatCns(value: string | null | undefined): string {
  if (!value) return "";
  const d = onlyDigits(value);
  if (d.length !== 15) return value.trim();
  return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7, 11)} ${d.slice(11)}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* cai no fallback abaixo */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function useCopied() {
  const [copied, setCopied] = useState(false);
  const run = async (raw: string) => {
    const ok = await copyText(onlyDigits(raw) || raw);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return { copied, run };
}

/** Linha compacta usada dentro do card da agenda. Clicar copia só os números. */
export function DocChip({
  label,
  value,
}: {
  label: "CPF" | "CNS";
  value: string | null | undefined;
}) {
  const { copied, run } = useCopied();
  if (!isPlausibleDoc(value)) return null;
  const pretty = label === "CPF" ? formatCpf(value) : formatCns(value);
  return (
    <button
      type="button"
      title={`Copiar ${label}: ${pretty}`}
      onClick={(e) => {
        e.stopPropagation();
        void run(value!);
      }}
      className="flex items-start gap-1 text-[13px] font-mono font-semibold leading-snug text-foreground/80 hover:text-cyan-400 transition-colors max-w-full text-left"
    >
      <span className="font-sans font-bold text-[11px] uppercase tracking-wide opacity-70 shrink-0">{label}</span>
      <span className="break-all">{pretty}</span>
      {copied ? (
        <Check className="w-3.5 h-3.5 shrink-0 mt-0.5 text-green-400" />
      ) : (
        <Copy className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-60" />
      )}
    </button>
  );
}

/** Linha completa usada no menu de ações rápidas, com botão de copiar. */
export function DocCopyRow({
  label,
  value,
}: {
  label: "CPF" | "CNS";
  value: string | null | undefined;
}) {
  const { copied, run } = useCopied();
  const filled = !!value && !!value.trim();
  const has = isPlausibleDoc(value);
  const pretty = has
    ? label === "CPF"
      ? formatCpf(value)
      : formatCns(value)
    : filled
      ? "⚠ valor inválido no cadastro"
      : "não cadastrado";
  return (
    <button
      type="button"
      disabled={!has}
      title={has ? `Copiar ${label}` : filled ? `${label} com valor inválido: ${value}` : `${label} não cadastrado`}
      onClick={(e) => {
        e.stopPropagation();
        if (has) void run(value!);
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        width: "100%",
        padding: "6px 8px",
        borderRadius: "8px",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.07)",
        cursor: has ? "pointer" : "default",
      }}
    >
      <span className="text-[11px] font-bold uppercase text-white/40 w-8 shrink-0 text-left">{label}</span>
      <span
        className={
          has
            ? "text-[14px] font-mono font-semibold text-white truncate flex-1 text-left"
            : filled
              ? "text-[12px] italic text-amber-400/80 truncate flex-1 text-left"
              : "text-[12px] italic text-white/30 truncate flex-1 text-left"
        }
      >
        {pretty}
      </span>
      {has &&
        (copied ? (
          <Check className="w-4 h-4 shrink-0 text-green-400" />
        ) : (
          <Copy className="w-4 h-4 shrink-0 text-white/40" />
        ))}
    </button>
  );
}
