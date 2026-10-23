// Visual padrão dos relatórios impressos (modelo do Relatório de Busca Ativa):
// tabela com bordas, cabeçalho azul-claro, numeração e linha "Gerado em".

export const escHtml = (v: unknown): string =>
  String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

export const REPORT_CSS = `
  *{box-sizing:border-box;}
  body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;padding:24px;margin:0;}
  h1{font-size:20px;margin:0 0 4px;}
  .prof{font-size:14px;font-weight:700;color:#0e7490;margin:2px 0;}
  .sub{font-size:12px;color:#64748b;margin-bottom:14px;}
  table{width:100%;border-collapse:collapse;font-size:11px;}
  th{background:#e0f2fe;text-align:left;padding:6px;border:1px solid #cbd5e1;}
  td{padding:6px;border:1px solid #cbd5e1;vertical-align:top;}
  td.n{font-weight:700;color:#0e7490;text-align:center;width:34px;}
  td.nw,td.time{white-space:nowrap;} td.time{font-weight:700;color:#0e7490;}
  td.anot{min-width:140px;} .s{font-size:10px;color:#64748b;}
  .livre{color:#94a3b8;font-style:italic;}
  .section td{background:#f1f5f9;font-weight:700;text-transform:uppercase;font-size:10px;color:#475569;}
  .lunch-row td{background:#f8fafc;color:#64748b;font-style:italic;}
  .pat + .pat{margin-top:4px;padding-top:4px;border-top:1px dotted #cbd5e1;}
  table.grid{table-layout:fixed;} table.grid th{text-align:center;}
  table.grid .th-sub{font-weight:400;font-size:10px;} td.blank-cell{height:34px;}
  .day-head td{background:#e0f2fe;font-weight:700;color:#0e7490;}
  .footer{margin-top:18px;font-size:11px;color:#94a3b8;}
  @page{size:A4 landscape;margin:10mm;}
  @media print{
    .no-print{display:none!important;} body{padding:0;}
    html,body{height:auto!important;overflow:visible!important;}
    thead{display:table-header-group;} tr{break-inside:avoid;page-break-inside:avoid;} table{break-inside:auto;}
  }`;

/** Nome em negrito/maiúsculo com "Pront." embaixo, como no relatório da Busca Ativa. */
export function patientNameHtml(name: string | null | undefined, prontuario?: string | null): string {
  return `<b>${escHtml((name || "").toUpperCase())}</b>${prontuario ? `<div class="s">Pront. ${escHtml(prontuario)}</div>` : ""}`;
}

export function openReportWindow(opts: { title: string; heading?: string; subParts: string[]; body: string; footer?: string }): void {
  const gerado = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const sub = ["NFS – Gestão Terapêutica", ...opts.subParts.filter(Boolean), `Gerado em ${gerado}`].map(escHtml).join(" · ");
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escHtml(opts.title)}</title>
<style>${REPORT_CSS}</style></head><body>
  <div class="no-print" style="display:flex;gap:10px;margin-bottom:16px;">
    <button onclick="window.close()" style="padding:8px 18px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;cursor:pointer;font-weight:600;">← Voltar</button>
    <button onclick="window.print()" style="padding:8px 18px;background:#0891b2;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;">🖨 Imprimir / Salvar PDF</button>
  </div>
  <h1>${escHtml(opts.title)}</h1>
  ${opts.heading ?? ""}
  <div class="sub">${sub}</div>
  ${opts.body}
  ${opts.footer ? `<div class="footer">${escHtml(opts.footer)}</div>` : ""}
</body></html>`;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
