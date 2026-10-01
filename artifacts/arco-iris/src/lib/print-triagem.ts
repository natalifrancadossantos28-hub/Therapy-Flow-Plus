const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

/**
 * Abre o relatório da Triagem Multidisciplinar numa janela própria para
 * impressão/PDF: só o relatório (sem menu/prontuário), tema claro, cores
 * das áreas preservadas e nome + prontuário em destaque no topo.
 */
export function printTriagemMulti(
  el: HTMLElement | null,
  info: { nome: string; prontuario?: string | null; data?: string | null },
) {
  if (!el) return;
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((n) => n.outerHTML)
    .join("\n");
  const content = el.cloneNode(true) as HTMLElement;
  content.querySelectorAll(".no-print").forEach((n) => n.remove());

  const html = `<!DOCTYPE html><html lang="pt-BR" class="light"><head>
<meta charset="utf-8">
<base href="${esc(window.location.origin)}/">
<title>Triagem_${esc((info.nome || "Paciente").replace(/\s+/g, "_"))}${info.prontuario ? `_${esc(info.prontuario)}` : ""}</title>
${styles}
<style>
  html, body, #root { background: #fff !important; color: #111827 !important; min-height: 0 !important; height: auto !important; overflow: visible !important; }
  body { margin: 0; padding: 24px; font-size: 12px; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-shadow: none !important; text-shadow: none !important; }
  .print-top { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; border: 2px solid #1f2937; border-radius: 14px; padding: 14px 20px; margin-bottom: 16px; break-inside: avoid; }
  .print-top .lbl { font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: #6b7280; margin: 0 0 2px; }
  .print-top .nome { font-size: 30px; font-weight: 900; line-height: 1.1; text-transform: uppercase; margin: 0; color: #111827; }
  .print-top .pront { font-size: 34px; font-weight: 900; line-height: 1; margin: 0; color: #111827; text-align: right; white-space: nowrap; }
  .print-top .data { font-size: 11px; color: #4b5563; margin: 4px 0 0; text-align: right; }
  .print-head { display: flex; align-items: center; gap: 16px; border-bottom: 2px solid #1f2937; padding-bottom: 14px; margin-bottom: 16px; }
  .print-head img { height: 64px; width: auto; }
  .print-head h1 { font-size: 22px; font-weight: 800; margin: 0; color: #111827; }
  .print-head p { font-size: 12px; color: #6b7280; margin: 2px 0 0; }
  .footer { margin-top: 18px; padding-top: 12px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 10px; color: #6b7280; }
  .recharts-text, svg text { fill: #374151 !important; }
  .recharts-tooltip-wrapper { display: none !important; }
  .rounded-2xl, .rounded-xl { break-inside: avoid; page-break-inside: avoid; }
  @page { size: A4 portrait; margin: 12mm; }
  @media print { .no-print { display: none !important; } body { padding: 0; } }
</style></head><body><div id="root">
  <div class="no-print" style="display:flex;gap:10px;margin-bottom:18px;align-items:center;">
    <button onclick="window.close()" style="padding:8px 18px;background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">← Voltar</button>
    <button onclick="window.print()" style="padding:8px 18px;background:#0891b2;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">🖨 Imprimir / Salvar PDF</button>
  </div>
  <div class="print-head">
    <img src="/nfs-logo.png" alt="NFs systems" />
    <div><h1>NFs – Triagem Multidisciplinar</h1><p>Avaliação multidisciplinar para crianças e adolescentes (0–18 anos)</p></div>
  </div>
  <div class="print-top">
    <div><p class="lbl">Paciente</p><p class="nome">${esc(info.nome || "—")}</p></div>
    <div><p class="lbl">Prontuário</p><p class="pront">${esc(info.prontuario?.trim() || "—")}</p>${info.data ? `<p class="data"><strong>Data da triagem:</strong> ${esc(info.data)}</p>` : ""}</div>
  </div>
  ${content.outerHTML}
  <div class="footer">© ${new Date().getFullYear()} NFs – Triagem Multidisciplinar — Documento gerado em ${esc(new Date().toLocaleDateString("pt-BR"))}</div>
</div></body></html>`;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.addEventListener("load", () => setTimeout(() => w.print(), 300));
}
