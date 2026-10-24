import { calcularResultado86, AVISO_TRIAGEM, ALERTA_RISCO, RISCO_CODES, nivelArea86, sugestoes86 } from "@/lib/triagem-86";
import type { Triagem86 } from "@/lib/triagem-86-rpc";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

type PacienteInfo = {
  name: string; prontuario?: string | null; dateOfBirth?: string | null; cpf?: string | null; cns?: string | null;
  guardianName?: string | null; phone?: string | null; address?: string | null;
};

const fmtData = (iso?: string | null) => (iso ? new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("pt-BR") : "");
function idade(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`), h = new Date();
  let a = h.getFullYear() - d.getFullYear();
  if (h < new Date(h.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a >= 0 ? `${a} ano${a === 1 ? "" : "s"}` : "";
}


// Ícones (traço tipo lucide) em SVG embutido: não dependem de fonte de emoji.
const P: Record<string, string> = {
  cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="12" r="2"/><path d="M14 10h4M14 14h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  home: '<path d="M3 10l9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  chart: '<path d="M3 3v18h18"/><path d="M8 17V11M13 17V7M18 17v-4"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/>',
  trend: '<path d="M22 7l-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
};
const svg = (k: string, cor = "#0b1f4d", tam = 16) =>
  `<svg width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="${cor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[k]}</svg>`;
const ic = (k: string) => svg(k);
const icH = (k: string) => svg(k, "#fff", 13);

const AREA_SHORT: Record<string, string> = {
  Fonoaudiologia: "Fono", Psicologia: "Psico", "Terapia Ocupacional": "TO", Fisioterapia: "Fisio",
  Psicomotricidade: "Psicomot", Nutrição: "Nutri", "Educação Física": "Ed. Física",
};
const AREA_COR: Record<string, string> = {
  Fonoaudiologia: "#f472b6", Psicologia: "#86efac", "Terapia Ocupacional": "#fcd34d", Fisioterapia: "#60a5fa",
  Psicomotricidade: "#c4b5fd", Nutrição: "#fb7185", "Educação Física": "#7dd3fc",
};
const PILL: Record<string, [string, string, string]> = {
  "Baixa sinalização": ["Baixa", "#dcfce7", "#166534"],
  "Sinalização moderada": ["Moderada", "#fef3c7", "#92400e"],
  "Alta sinalização": ["Alta", "#ffe4e6", "#9f1239"],
};

function grafico(areas: { area: string; pontos: number; respondidas: number }[]) {
  const W = 300, H = 150, top = 12, base = 120, left = 22, bw = 26, gap = (W - left - areas.length * bw) / areas.length;
  const y = (v: number) => base - (v / 30) * (base - top);
  const grid = [0, 10, 20, 30].map((v) => `<line x1="${left}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="#e5e7eb"/><text x="${left - 4}" y="${y(v) + 3}" font-size="8" text-anchor="end" fill="#6b7280">${v}</text>`).join("");
  const bars = areas.map((a, i) => {
    const x = left + gap / 2 + i * (bw + gap);
    const lbl = AREA_SHORT[a.area] ?? a.area;
    return `<rect x="${x}" y="${y(a.pontos)}" width="${bw}" height="${base - y(a.pontos)}" rx="3" fill="${AREA_COR[a.area] ?? "#94a3b8"}"/>
      <text x="${x + bw / 2}" y="${y(a.pontos) - 3}" font-size="9" font-weight="700" text-anchor="middle" fill="#0f172a">${a.respondidas ? a.pontos : "–"}</text>
      <text x="${x + bw / 2}" y="${base + 11}" font-size="7.5" text-anchor="middle" fill="#475569">${esc(lbl)}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="150">${grid}${bars}</svg>`;
}

/**
 * Relatório impresso da Triagem em 2 folhas A4: folha 1 = dados do paciente e
 * da triagem; folha 2 = resultados e encaminhamentos.
 */
export function printTriagem86(t: Triagem86, p: PacienteInfo, opts?: { tipo?: string }) {
  const r = calcularResultado86(t.respostas ?? {}, t.social ?? {});
  const criado = new Date(t.createdAt);
  const totalPts = r.areas.reduce((s, a) => s + a.pontos, 0);
  const pctTotal = Math.round((totalPts / 210) * 100);
  const riscos = r.prioridades.filter((x) => RISCO_CODES.includes(x.code));
  const sugest = sugestoes86(r).filter((x) => x !== ALERTA_RISCO);

  const cab = (sub: string) => `<div class="cab">
    <div class="logo"><span class="nfs">NFS</span><span class="gt">Gestão<br>Terapêutica</span></div>
    <div class="linha"></div>
    <div class="tit"><b>TRIAGEM MULTIDISCIPLINAR</b><span>${esc(sub)}</span></div></div>`;
  const campo = (ic: string, l: string, v?: string | null, extra = "") =>
    `<div class="campo"><span class="ic">${ic}</span><div><p class="l">${esc(l)}</p><p class="v ${extra}">${esc(v || "—")}</p></div></div>`;
  const secao = (ic: string, t2: string, corpo: string, cls = "") =>
    `<div class="sec ${cls}"><div class="sec-h"><span class="ic sm">${ic}</span>${esc(t2)}</div><div class="sec-b">${corpo}</div></div>`;

  const linhas = r.areas.map((a) => {
    const n = nivelArea86(a.pontos, a.respondidas);
    const pill = n ? PILL[n.label] : null;
    return `<tr><td class="esp"><span class="ai" style="background:${AREA_COR[a.area] ?? "#94a3b8"}"></span>${esc(a.area)}</td>
      <td class="c">${a.respondidas ? a.pontos : "–"}</td><td class="c">${a.respondidas ? `${a.pct}%` : "–"}</td>
      <td class="c">${pill ? `<span class="pill" style="background:${pill[1]};color:${pill[2]}">${pill[0]}</span>` : `<span class="pill na">não avaliado</span>`}</td></tr>`;
  }).join("");

  const folha1 = `<section class="page">${cab("RELATÓRIO DE TRIAGEM")}
    <div class="pac">
      <div class="pac-n"><p class="lbl">PACIENTE</p><p class="nome">${esc(p.name || "—")}</p></div>
      <div class="pac-p"><span class="ic big">${svg("file", "#0b1f4d", 30)}</span><div><p class="lbl">PRONTUÁRIO</p><p class="pront">${esc(p.prontuario?.trim() || "—")}</p></div></div>
    </div>
    ${secao(icH("user"), "DADOS DO PACIENTE", `<div class="grid">
      ${campo(ic("cal"), "Data de nascimento", fmtData(p.dateOfBirth), "b")}${campo(ic("users"), "Idade", idade(p.dateOfBirth), "b")}
      ${campo(ic("card"), "CPF", p.cpf)}${campo(ic("plus"), "Cartão SUS", p.cns)}
      ${campo(ic("user"), "Responsável", p.guardianName)}${campo(ic("phone"), "Telefone", p.phone)}
      ${campo(ic("home"), "Endereço", p.address)}${campo(ic("users"), "Preenchido por", t.responsavel)}
    </div>`)}
    ${secao(icH("file"), "DADOS DA TRIAGEM", `<div class="grid">
      ${campo(ic("cal"), "Data da triagem", criado.toLocaleDateString("pt-BR"), "b")}${campo(ic("clock"), "Horário", criado.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }), "b")}
      ${campo(ic("user"), "Aplicador", t.responsavel)}${campo(ic("file"), "Tipo de triagem", opts?.tipo || "Triagem inicial")}
    </div>`)}
    ${secao(icH("msg"), "OBSERVAÇÕES", `<div class="branco"></div>`, "obs")}
    <div class="rod"><span>${esc(AVISO_TRIAGEM)}</span><span>Página 1 de 2</span></div>
  </section>`;

  const folha2 = `<section class="page">${cab("RESULTADOS E ENCAMINHAMENTOS")}
    <div class="total">
      <span class="ic big">${svg("chart", "#0b1f4d", 30)}</span>
      <div class="tt"><p class="h">PONTUAÇÃO CLÍNICA TOTAL</p><p class="s">Soma das 7 especialidades (10 perguntas cada, 0 a 3 pontos)</p>
        <div class="barra"><div style="width:${pctTotal}%"></div></div></div>
      <div class="num"><b>${totalPts} / 210</b><span>${pctTotal}%</span></div>
    </div>
    ${riscos.length ? `<div class="alerta">Atenção: ${esc(ALERTA_RISCO)}</div>` : ""}
    <div class="duas">
      ${secao(icH("search"), "RESULTADO POR ÁREA", `<table><thead><tr><th>ESPECIALIDADE</th><th class="c">PONTOS<br>(0–30)</th><th class="c">%</th><th class="c">NÍVEL</th></tr></thead><tbody>${linhas}</tbody></table>`, "res")}
      ${secao(icH("trend"), "GRÁFICO COMPARATIVO", `${grafico(r.areas)}
        <div class="faixa"><p class="fh">FAIXA DE CLASSIFICAÇÃO <span>(por especialidade)</span></p>
          <p><i style="background:#22c55e"></i><b>0 – 8</b> Baixa sinalização</p>
          <p><i style="background:#f59e0b"></i><b>9 – 17</b> Sinalização moderada</p>
          <p><i style="background:#ef4444"></i><b>18 – 30</b> Alta sinalização</p>
          <p class="nt">“Não sei” e “Não se aplica” não somam pontos.</p></div>`, "graf")}
    </div>
    <div class="duas iguais">
      ${secao(icH("target"), "PRIORIDADES CLÍNICAS IDENTIFICADAS", r.prioridades.length
        ? `<ul class="red">${r.prioridades.map((x) => `<li><b>${x.code}</b> ${esc(x.titulo)}</li>`).join("")}</ul>`
        : `<p class="vazio">Nenhum sinal marcado</p>`, "prio")}
      ${secao(icH("users"), "VULNERABILIDADE SOCIAL", r.social.length
        ? `<ul>${r.social.map((x) => `<li>${esc(x.titulo)}${x.intensidade === "parcial" ? " (em parte)" : ""}</li>`).join("")}</ul>`
        : `<p class="vazio">Nenhuma barreira marcada</p>`)}
    </div>
    ${secao(icH("file"), "CONSIDERAÇÕES FINAIS", `<p class="sg">Sugestões de encaminhamento (orientativas; a equipe técnica valida):</p><ul class="sug">${sugest.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><div class="branco curto"></div>`, "cons")}
    <div class="rod"><span>NFS – Gestão Terapêutica · gerado em ${esc(new Date().toLocaleDateString("pt-BR"))}</span><span>Página 2 de 2</span></div>
  </section>`;

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Triagem_${esc((p.name || "Paciente").replace(/\s+/g, "_"))}${p.prontuario ? `_${esc(p.prontuario)}` : ""}</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; background: #e2e8f0; font-size: 12px; }
  .bar { display: flex; gap: 10px; padding: 14px; justify-content: center; }
  .page { width: 210mm; height: 297mm; margin: 0 auto 14px; background: #fff; padding: 11mm 11mm 9mm; display: flex; flex-direction: column; gap: 4mm; overflow: hidden; }
  .cab { display: flex; align-items: center; gap: 14px; }
  .logo { display: flex; align-items: center; gap: 6px; }
  .nfs { font-size: 34px; font-weight: 900; color: #0b1f4d; letter-spacing: -1px; }
  .gt { font-size: 13px; line-height: 1.1; color: #0b1f4d; }
  .linha { flex: 1; height: 1px; background: #94a3b8; }
  .tit { text-align: right; } .tit b { display: block; font-size: 15px; color: #0b1f4d; } .tit span { font-size: 11px; color: #64748b; letter-spacing: .08em; font-weight: 700; }
  .ic { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 8px; background: #eef2f7; font-size: 15px; flex-shrink: 0; }
  .ic.sm { width: 24px; height: 24px; font-size: 12px; background: #0b1f4d; margin-right: 8px; }
  .ic.big { width: 40px; height: 40px; font-size: 20px; background: transparent; }
  .pac { display: flex; gap: 0; border-radius: 10px; overflow: hidden; background: #eef2f7; }
  .pac-n { flex: 1; padding: 12px 16px; } .pac-p { display: flex; align-items: center; gap: 8px; background: #dbe4ef; padding: 12px 18px; }
  .lbl { font-size: 11px; font-weight: 800; margin: 0 0 2px; color: #0b1f4d; }
  .nome { font-size: 25px; font-weight: 900; text-transform: uppercase; margin: 0; color: #0b1f4d; line-height: 1.1; }
  .pront { font-size: 34px; font-weight: 900; margin: 0; color: #0b1f4d; line-height: 1; }
  .sec { border: 1px solid #dbe4ef; border-radius: 10px; overflow: hidden; break-inside: avoid; }
  .sec-h { display: flex; align-items: center; background: #eef2f7; padding: 7px 12px; font-weight: 800; font-size: 12.5px; color: #0b1f4d; }
  .sec-b { padding: 6px 12px 8px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; }
  .campo { display: flex; gap: 10px; align-items: center; padding: 7px 4px; border-bottom: 1px solid #f1f5f9; }
  .campo .l { margin: 0; font-size: 10.5px; font-weight: 700; color: #334155; } .campo .v { margin: 1px 0 0; font-size: 14px; } .campo .v.b { font-weight: 800; font-size: 16px; }
  .obs { flex: 1; display: flex; flex-direction: column; } .obs .sec-b { flex: 1; } .branco { height: 100%; min-height: 30mm; }
  .branco.curto { min-height: 16mm; }
  .rod { display: flex; justify-content: space-between; gap: 10px; font-size: 9.5px; color: #64748b; margin-top: auto; }
  .total { display: flex; align-items: center; gap: 12px; background: #eef2f7; border-radius: 10px; padding: 10px 14px; }
  .tt { flex: 1; } .tt .h { margin: 0; font-weight: 800; font-size: 13px; color: #0b1f4d; } .tt .s { margin: 2px 0 6px; font-size: 10px; color: #475569; }
  .barra { height: 9px; border-radius: 9px; background: #dbe4ef; overflow: hidden; } .barra div { height: 100%; background: #1e3a6e; border-radius: 9px; }
  .num { text-align: right; } .num b { display: block; font-size: 24px; color: #0b1f4d; } .num span { font-size: 15px; font-weight: 800; color: #0b1f4d; }
  .alerta { border: 2px solid #dc2626; background: #fef2f2; color: #991b1b; font-weight: 700; border-radius: 8px; padding: 6px 10px; font-size: 11px; }
  .duas { display: grid; grid-template-columns: 1.15fr 1fr; gap: 4mm; } .duas.iguais { grid-template-columns: 1fr 1fr; }
  table { width: 100%; border-collapse: collapse; }
  th { font-size: 9.5px; text-align: left; color: #0b1f4d; padding: 5px 4px; border-bottom: 1px solid #dbe4ef; }
  td { padding: 5px 4px; border-bottom: 1px solid #f1f5f9; font-size: 11.5px; } .c { text-align: center; }
  .esp { white-space: nowrap; } .ai { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 8px; vertical-align: middle; }
  .pill { display: inline-block; padding: 3px 8px; border-radius: 6px; font-weight: 700; font-size: 10.5px; min-width: 64px; } .pill.na { background: #f1f5f9; color: #64748b; font-style: italic; }
  .faixa { background: #f8fafc; border-radius: 8px; padding: 6px 8px; margin-top: 4px; }
  .faixa p { margin: 2px 0; font-size: 10.5px; display: flex; align-items: center; gap: 6px; } .faixa i { width: 11px; height: 11px; border-radius: 50%; display: inline-block; } .faixa b { width: 42px; }
  .faixa .fh { font-weight: 800; color: #0b1f4d; display: block; } .faixa .fh span { font-weight: 400; } .faixa .nt { color: #64748b; font-size: 9.5px; display: block; }
  .prio { border-color: #fecdd3; } .prio .sec-h { background: #fff1f2; color: #9f1239; } .prio .ic.sm { background: #be123c; } .prio .sec-b { background: #fff7f8; }
  ul { margin: 2px 0; padding-left: 16px; } li { margin: 3px 0; font-size: 11.5px; } ul.red li::marker { color: #dc2626; }
  .vazio { color: #64748b; margin: 4px 0; }
  .cons { flex: 1; display: flex; flex-direction: column; } .cons .sec-b { flex: 1; }
  .sg { margin: 2px 0; font-size: 10.5px; font-weight: 700; color: #334155; } ul.sug li { font-size: 10.5px; margin: 2px 0; }
  @page { size: A4 portrait; margin: 0; }
  @media print { body { background: #fff; } .bar { display: none !important; } .page { margin: 0; break-after: page; } .page:last-child { break-after: auto; } }
</style></head><body>
  <div class="bar">
    <button onclick="window.close()" style="padding:8px 18px;background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">← Voltar</button>
    <button onclick="window.print()" style="padding:8px 18px;background:#0b1f4d;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">Imprimir / Salvar PDF</button>
  </div>
  ${folha1}${folha2}
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.addEventListener("load", () => setTimeout(() => w.print(), 300));
}
