// =============================================================================
// print-dashboard.ts — relatório de gestão imprimível (Dashboard)
// -----------------------------------------------------------------------------
// Gera uma janela com um relatório estático a partir dos números já calculados
// no Dashboard (cadastros, atendimento, fila, ocupação e produção por
// especialidade), pronto para imprimir/salvar em PDF e apresentar à chefia —
// sem precisar tirar prints da tela.
// =============================================================================

export type DashboardReport = {
  totalPatients: number;
  activePatients: number;
  waitingCount: number;
  totalProfessionals: number;
  today: {
    total: number;
    realizado: number;
    falta: number;
    pendente: number;
    cancelado: number;
    taxaPresenca: number | null;
  };
  monthly: { total: number; realizados: number; faltas: number; agendados: number; cancelados: number };
  periodStats: { semanal: number; mensal: number; trimestral: number; semestral: number; anual: number };
  ocupacao: Array<{ name: string; specialty: string; pacientesAtivos: number; capacidade: number; pct: number }>;
  yearBySpecialty: Array<[string, number]>;
  yearTotal: number;
  filaBySpecialty: Array<[string, number]>;
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function statCard(label: string, value: string | number, sub?: string): string {
  return `<div class="card">
    <div class="card-val">${esc(String(value))}</div>
    <div class="card-lbl">${esc(label)}</div>
    ${sub ? `<div class="card-sub">${esc(sub)}</div>` : ""}
  </div>`;
}

export function printDashboardReport(data: DashboardReport): void {
  const now = new Date();
  const dataHora = now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  const taxa = data.today.taxaPresenca != null ? `${data.today.taxaPresenca}%` : "—";

  const topCards = [
    statCard("Total de Cadastros", data.totalPatients, "todos os pacientes na base"),
    statCard("Em Atendimento", data.activePatients, "com agendamento ativo"),
    statCard("Fila de Espera", data.waitingCount, "aguardando vaga"),
    statCard("Profissionais", data.totalProfessionals, "equipe ativa"),
  ].join("");

  const hojeCards = [
    statCard("Agendados hoje", data.today.total),
    statCard("Realizados", data.today.realizado),
    statCard("Faltas", data.today.falta),
    statCard("Pendentes", data.today.pendente),
    statCard("Taxa de presença", taxa),
  ].join("");

  const mesCards = [
    statCard("Total do mês", data.monthly.total),
    statCard("Realizados", data.monthly.realizados),
    statCard("Faltas", data.monthly.faltas),
    statCard("Agendados (pacientes)", data.monthly.agendados),
  ].join("");

  const periodCards = [
    statCard("Esta semana", data.periodStats.semanal),
    statCard("Este mês", data.periodStats.mensal),
    statCard("Trimestre", data.periodStats.trimestral),
    statCard("Semestre", data.periodStats.semestral),
    statCard("Este ano", data.periodStats.anual),
  ].join("");

  const ocupacaoRows = data.ocupacao.length
    ? data.ocupacao
        .map(o => `<tr>
          <td>${esc(o.name)}</td>
          <td>${esc(o.specialty || "—")}</td>
          <td class="num">${o.pacientesAtivos}</td>
          <td class="num">${o.capacidade}</td>
          <td class="num">${o.pct}%</td>
        </tr>`)
        .join("")
    : `<tr><td colspan="5" class="empty">Sem dados de ocupação.</td></tr>`;

  const yearRows = data.yearBySpecialty.length
    ? data.yearBySpecialty
        .map(([sp, n]) => `<tr><td>${esc(sp)}</td><td class="num">${n}</td></tr>`)
        .join("")
    : `<tr><td colspan="2" class="empty">Sem atendimentos no ano.</td></tr>`;

  const filaRows = data.filaBySpecialty.length
    ? data.filaBySpecialty
        .map(([sp, n]) => `<tr><td>${esc(sp)}</td><td class="num">${n}</td></tr>`)
        .join("")
    : `<tr><td colspan="2" class="empty">Fila vazia.</td></tr>`;

  const html = `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="utf-8"><title>Relatório de Gestão — NFS</title>
<style>
  *{box-sizing:border-box;}
  body{font-family:Arial,Helvetica,sans-serif;padding:28px;color:#111827;margin:0;}
  h1{font-size:24px;margin:0 0 2px;}
  h2{font-size:15px;color:#0e7490;margin:26px 0 10px;text-transform:uppercase;letter-spacing:.04em;border-bottom:2px solid #0891b2;padding-bottom:4px;}
  .sub{color:#6b7280;font-size:13px;margin:2px 0 10px;}
  .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;}
  .cards.five{grid-template-columns:repeat(5,1fr);}
  .card{border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;background:#f8fafc;}
  .card-val{font-size:26px;font-weight:800;color:#0e7490;line-height:1.1;}
  .card-lbl{font-size:12px;font-weight:700;color:#334155;margin-top:2px;}
  .card-sub{font-size:10px;color:#94a3b8;margin-top:1px;}
  table{width:100%;border-collapse:collapse;font-size:13px;margin-top:4px;}
  th{text-align:left;padding:8px 10px;background:#ecfeff;color:#0e7490;border-bottom:2px solid #0891b2;font-size:11px;text-transform:uppercase;letter-spacing:.03em;}
  td{padding:7px 10px;border-bottom:1px solid #e5e7eb;}
  td.num{text-align:right;font-weight:700;color:#0e7490;white-space:nowrap;}
  td.empty{color:#9ca3af;font-style:italic;text-align:center;}
  .footer{margin-top:26px;font-size:11px;color:#94a3b8;border-top:1px solid #e5e7eb;padding-top:8px;}
  @media print{.no-print{display:none!important;} body{padding:0;} h2{break-after:avoid;} table{break-inside:auto;}}
</style></head><body>
  <div class="no-print" style="display:flex;gap:10px;margin-bottom:18px;align-items:center;">
    <button onclick="window.close()" style="padding:8px 18px;background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">← Voltar</button>
    <button onclick="window.print()" style="padding:8px 18px;background:#0891b2;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">🖨 Imprimir / Salvar PDF</button>
  </div>

  <h1>Relatório de Gestão</h1>
  <div class="sub">NFS – Gestão Terapêutica · Gerado em ${esc(dataHora)}</div>

  <h2>Visão Geral</h2>
  <div class="cards">${topCards}</div>

  <h2>Hoje</h2>
  <div class="cards five">${hojeCards}</div>

  <h2>Mês Atual</h2>
  <div class="cards">${mesCards}</div>

  <h2>Atendimentos Terapêuticos (por período)</h2>
  <div class="cards five">${periodCards}</div>

  <h2>Ocupação por Profissional</h2>
  <table>
    <thead><tr><th>Profissional</th><th>Especialidade</th><th style="text-align:right;">Ativos</th><th style="text-align:right;">Capacidade</th><th style="text-align:right;">Ocupação</th></tr></thead>
    <tbody>${ocupacaoRows}</tbody>
  </table>

  <h2>Atendimentos no Ano por Especialidade (01/01 → hoje · total ${data.yearTotal})</h2>
  <table>
    <thead><tr><th>Especialidade</th><th style="text-align:right;">Atendimentos</th></tr></thead>
    <tbody>${yearRows}</tbody>
  </table>

  <h2>Fila de Espera por Especialidade (total ${data.waitingCount})</h2>
  <table>
    <thead><tr><th>Especialidade</th><th style="text-align:right;">Aguardando</th></tr></thead>
    <tbody>${filaRows}</tbody>
  </table>

  <div class="footer">NFS – Gestão Terapêutica · Relatório gerado automaticamente pelo Dashboard.</div>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
