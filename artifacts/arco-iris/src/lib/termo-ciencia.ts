// Termo de ciência impresso ao final de cada triagem (Multidisciplinar e ABC).
// Estilos inline: funciona dentro de qualquer folha de impressão.

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

export type TermoInfo = {
  triagem: string;
  paciente: string;
  prontuario?: string | null;
  responsavel?: string | null;
  aplicador?: string | null;
  data?: string | null;
};

export function termoCienciaHtml(i: TermoInfo): string {
  const v = (s?: string | null) => (s?.trim() ? esc(s.trim()) : "______________________");
  const ass = (rotulo: string, nome?: string | null) => `<div style="text-align:center">
      <div style="border-bottom:1px solid #0f172a;height:1px"></div>
      <p style="margin:3px 0 0;font-size:10.5px;font-weight:700;color:#334155">${rotulo}</p>
      <p style="margin:1px 0 0;font-size:10px;color:#64748b;min-height:12px">${nome?.trim() ? esc(nome.trim()) : ""}</p>
    </div>`;
  return `<div class="termo" style="border:1px solid #cbd5e1;border-radius:10px;padding:8px 12px 6px;break-inside:avoid;page-break-inside:avoid;font-family:Arial,Helvetica,sans-serif;color:#0f172a;background:#fff">
    <p style="margin:0 0 4px;font-size:11.5px;font-weight:800;color:#0b1f4d;letter-spacing:.04em">TERMO DE CIÊNCIA · ${esc(i.triagem.toUpperCase())}</p>
    <p style="margin:0;font-size:10.5px;line-height:1.45;text-align:justify">Declaro que participei da <b>${esc(i.triagem)}</b> do(a) paciente <b>${v(i.paciente)}</b>, prontuário nº <b>${v(i.prontuario)}</b>, realizada em <b>${v(i.data)}</b> por <b>${v(i.aplicador)}</b>, e que fui informado(a) sobre a sua finalidade. Esta assinatura comprova a participação e a ciência sobre a realização da triagem; não representa concordância obrigatória com os resultados nem substitui a avaliação técnica.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12mm;margin-top:10mm">
      ${ass("Assinatura da mãe / responsável", i.responsavel)}
      ${ass("Assinatura do aplicador", i.aplicador)}
    </div>
  </div>`;
}
