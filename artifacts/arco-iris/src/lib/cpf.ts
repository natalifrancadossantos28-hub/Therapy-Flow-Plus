export const cpfDigits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

/** CPF com 11 dígitos e dígitos verificadores corretos. */
export function isValidCpf(value: string | null | undefined): boolean {
  const d = cpfDigits(value);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (len: number) => {
    let soma = 0;
    for (let i = 0; i < len; i++) soma += Number(d[i]) * (len + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

/** Mensagem para CPF preenchido e inválido; null se vazio ou válido. */
export function cpfProblem(value: string | null | undefined): string | null {
  if (!(value ?? "").trim()) return null;
  const d = cpfDigits(value);
  if (d.length !== 11) return `CPF inválido: tem ${d.length} número(s), precisa de 11.`;
  if (!isValidCpf(d)) return "CPF inválido: confira os números.";
  return null;
}

/** Outros cadastros com o mesmo CPF (pode ser irmão usando o CPF do responsável). */
export function cpfDuplicates<T extends { id: number; cpf?: string | null }>(
  value: string | null | undefined,
  patients: T[],
  selfId?: number | null,
): T[] {
  const d = cpfDigits(value);
  if (d.length !== 11) return [];
  return patients.filter(p => p.id !== selfId && cpfDigits(p.cpf) === d);
}

export function cpfDuplicateMessage(dups: { name: string; prontuario?: string | null }[]): string {
  const nomes = dups.map(p => `${p.name}${p.prontuario ? ` (pront. ${p.prontuario})` : ""}`).join(", ");
  return `Este CPF já está cadastrado em: ${nomes}.`;
}
