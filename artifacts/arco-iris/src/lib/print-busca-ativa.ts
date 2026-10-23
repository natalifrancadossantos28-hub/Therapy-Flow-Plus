// Relatório imprimível da Busca Ativa (lista para a assistente social).
import type { PausedOverviewItem } from "@/lib/arco-rpc";
import { buscaStatusLabel } from "@/lib/busca-ativa";

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function fmt(d: string | null | undefined): string {
  if (!d) return "—";
  const iso = d.slice(0, 10);
  const [y, m, day] = iso.split("-");
  return y && m && day ? `${day}/${m}/${y}` : d;
}

export function printBuscaAtivaReport(items: PausedOverviewItem[], filtro?: string): void {
  const dataHora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const rows = items.map((i, idx) => `<tr>
      <td class="n">${idx + 1}º</td>
      <td><b>${esc(i.patientName)}</b>${i.prontuario ? `<div class="s">Pront. ${esc(i.prontuario)}</div>` : ""}</td>
      <td>${esc(i.guardianName || "—")}</td>
      <td class="nw">${esc(i.patientPhone || "—")}</td>
      <td>${esc(i.address || "—")}</td>
      <td>${esc(i.specialty || "—")}${i.professionalName ? `<div class="s">${esc(i.professionalName)}</div>` : ""}</td>
      <td>${esc(i.pausedReason || "—")}</td>
      <td class="nw">${fmt(i.pausedAt)}</td>
      <td class="nw">${esc(buscaStatusLabel(i.buscaStatus))}</td>
      <td>${esc(i.buscaObs || "")}</td>
      <td class="visita"></td>
    </tr>`).join("");

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório Busca Ativa</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;padding:24px;}
  h1{font-size:20px;margin:0 0 4px;} .sub{font-size:12px;color:#64748b;margin-bottom:14px;}
  table{width:100%;border-collapse:collapse;font-size:11px;}
  th{background:#e0f2fe;text-align:left;padding:6px;border:1px solid #cbd5e1;}
  td{padding:6px;border:1px solid #cbd5e1;vertical-align:top;}
  td.n{font-weight:700;color:#0e7490;text-align:center;} td.nw{white-space:nowrap;}
  td.visita{min-width:140px;} .s{font-size:10px;color:#64748b;}
  @page{size:A4 landscape;margin:10mm;}
  @media print{.no-print{display:none!important;} body{padding:0;} tr{break-inside:avoid;}}
</style></head><body>
  <div class="no-print" style="display:flex;gap:10px;margin-bottom:16px;">
    <button onclick="window.close()" style="padding:8px 18px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;cursor:pointer;font-weight:600;">← Voltar</button>
    <button onclick="window.print()" style="padding:8px 18px;background:#0891b2;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;">🖨 Imprimir / Salvar PDF</button>
  </div>
  <h1>Relatório de Busca Ativa</h1>
  <div class="sub">NFS – Gestão Terapêutica · ${items.length} paciente(s)${filtro ? ` · ${esc(filtro)}` : ""} · Gerado em ${esc(dataHora)}</div>
  <table>
    <thead><tr><th>Nº</th><th>Paciente</th><th>Responsável</th><th>Telefone</th><th>Endereço</th><th>Especialidade</th><th>Motivo</th><th>Desde</th><th>Situação</th><th>Observação</th><th>Anotações da visita</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="11" style="text-align:center;color:#94a3b8;">Nenhum paciente na Busca Ativa.</td></tr>`}</tbody>
  </table>
</body></html>`;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
