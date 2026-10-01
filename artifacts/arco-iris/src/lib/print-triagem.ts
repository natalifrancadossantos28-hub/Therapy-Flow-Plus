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
<title>Triagem_${esc((info.nome || "Paciente").replace(/\s+/g, "_"))}${info.prontuario ? `_${esc(info.prontuario)}` : ""}</title>
${styles}
<style>
  html, body, #root { background: #fff !important; color: #111827 !important; min-height: 0 !important; height: auto !important; overflow: visible !important; }
  body { margin: 0; padding: 24px; font-size: 12px; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-shadow: none !important; text-shadow: none !important; }
  .print-top { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; border: 2px solid #1f2937; border-radius: 14px; padding: 14px 20px; margin-bottom: 16px; break-inside: avoid; }
  .print-top .lbl { font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: #6b7280; margin: 0 0 2px; }
  .print-top .nome { font-size: 30px; font-weight: 900; line-height: 1.1; text-transform: uppercase; margin: 0; color: #111827; }
  .print-top .pront { font-size: 34px; font-weight: 900; line-height: 1; margin: 0; color: #0e7490; text-align: right; white-space: nowrap; }
  .print-top .data { font-size: 11px; color: #4b5563; margin: 4px 0 0; text-align: right; }
  .print-title { font-size: 16px; font-weight: 800; color: #0e7490; margin: 0 0 12px; }
  .footer { margin-top: 18px; font-size: 10px; color: #94a3b8; }
  .rounded-2xl, .rounded-xl { break-inside: avoid; page-break-inside: avoid; }
  @page { size: A4 portrait; margin: 12mm; }
  @media print { .no-print { display: none !important; } body { padding: 0; } }
</style></head><body><div id="root">
  <div class="no-print" style="display:flex;gap:10px;margin-bottom:18px;align-items:center;">
    <button onclick="window.close()" style="padding:8px 18px;background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">← Voltar</button>
    <button onclick="window.print()" style="padding:8px 18px;background:#0891b2;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">🖨 Imprimir / Salvar PDF</button>
  </div>
  <div class="print-top">
    <div><p class="lbl">Paciente</p><p class="nome">${esc(info.nome || "—")}</p></div>
    <div><p class="lbl">Prontuário</p><p class="pront">${esc(info.prontuario?.trim() || "—")}</p>${info.data ? `<p class="data"><strong>Data da triagem:</strong> ${esc(info.data)}</p>` : ""}</div>
  </div>
  <p class="print-title">Triagem Multidisciplinar — Núcleo Integrado Novo Arco-Íris</p>
  ${content.outerHTML}
  <div class="footer">NFS – Gestão Terapêutica</div>
</div></body></html>`;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.addEventListener("load", () => setTimeout(() => w.print(), 300));
}
