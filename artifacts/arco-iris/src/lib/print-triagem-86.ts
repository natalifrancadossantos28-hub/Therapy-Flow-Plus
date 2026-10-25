import { calcularResultado86, AVISO_TRIAGEM, ALERTA_RISCO, RISCO_CODES, nivelArea86, sugestoes86, previaEncaminhamento86, ENCAMINHAR_MIN } from "@/lib/triagem-86";
import { termoCienciaHtml } from "@/lib/termo-ciencia";
import { abcChecklistDoc, type AbcPrintInput } from "@/lib/abc-checklist";
import type { Triagem86 } from "@/lib/triagem-86-rpc";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

type PacienteInfo = {
  name: string; prontuario?: string | null; dateOfBirth?: string | null; cpf?: string | null; cns?: string | null;
  guardianName?: string | null; phone?: string | null; address?: string | null;
  guardianPhone?: string | null; motherName?: string | null; fatherName?: string | null; diagnosis?: string | null;
  outroAtendimento?: boolean | null; localAtendimento?: string | null; escolaPublica?: boolean | null;
  trabalhoPais?: string | null; abrigoCasaCrianca?: boolean | null;
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
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="120">${grid}${bars}</svg>`;
}

/**
 * Relatório impresso da Triagem em 2 folhas A4: folha 1 = dados do paciente e
 * da triagem; folha 2 = resultados e encaminhamentos.
 */
function triagem86Doc(t: Triagem86, p: PacienteInfo, opts?: { tipo?: string }): { titulo: string; css: string; paginas: string } {
  const r = calcularResultado86(t.respostas ?? {}, t.social ?? {});
  const criado = new Date(t.createdAt);
  const avaliadas = r.areas.filter((a) => a.respondidas);
  const max = avaliadas.length * 30 || 210;
  const totalPts = r.areas.reduce((s, a) => s + a.pontos, 0);
  const pctTotal = Math.round((totalPts / max) * 100);
  const riscos = r.prioridades.filter((x) => RISCO_CODES.includes(x.code));
  const enc = t.encaminhamento?.encaminhadas ?? previaEncaminhamento86(r);
  const pctA = (a: { pontos: number }) => Math.round((a.pontos / 30) * 100);
  const niveis = r.areas.map((a) => ({ a, n: nivelArea86(a.pontos, a.respondidas) }));
  const cont = { alta: niveis.filter((x) => x.n?.label === "Alta sinalização").length, mod: niveis.filter((x) => x.n?.label === "Sinalização moderada").length, baixa: niveis.filter((x) => x.n?.label === "Baixa sinalização").length };
  const dataStr = criado.toLocaleDateString("pt-BR");

  const cab = (sub: string) => `<div class="cab"><div class="logo"><span class="nfs">NFS</span><span class="gt">Gestão<br>Terapêutica</span></div>
    <div class="tit"><b>TRIAGEM MULTIDISCIPLINAR</b><span>${esc(sub)}</span><em>${esc(dataStr)}</em></div></div>`;
  const sec = (ico: string, titulo: string, corpo: string, extra = "") =>
    `<div class="sec"><div class="sec-h"><span class="ib">${icH(ico)}</span>${esc(titulo)}${extra}</div><div class="sec-b">${corpo}</div></div>`;
  const kv = (l: string, v?: string | null, span = false) => `<div class="kv${span ? " span" : ""}"><span class="k">${esc(l)}</span><span class="v">${esc(v || "—")}</span></div>`;
  const radio = (opts2: [string, boolean | null][]) => opts2.map(([l, on]) => `<span class="rd"><i class="${on ? "on" : ""}"></i>${esc(l)}</span>`).join("");
  const yes = (b?: boolean | null): [boolean | null, boolean | null] => [b === true, b === false];

  const [atS, atN] = yes(p.outroAtendimento);
  const estuda = p.escolaPublica == null ? null : true;
  const folha1 = `<section class="page">${cab("RELATÓRIO DE AVALIAÇÃO")}
    ${sec("user", "1. IDENTIFICAÇÃO DO PACIENTE", `<div class="g2">
      ${kv("Nome completo", p.name, true)}${kv("Data de nascimento", fmtData(p.dateOfBirth))}${kv("Idade", idade(p.dateOfBirth))}
      ${kv("CPF", p.cpf)}${kv("Cartão SUS", p.cns)}${kv("Nome da mãe", p.motherName)}${kv("Nome do pai", p.fatherName)}
      ${kv("Responsável", p.guardianName)}${kv("Telefone do responsável", p.guardianPhone)}${kv("Telefone para contato", p.phone)}${kv("Endereço", p.address)}
    </div>`, `<span class="pront"><small>PRONTUÁRIO</small>${esc(p.prontuario?.trim() || "—")}</span>`)}
    ${sec("home", "2. INFORMAÇÕES COMPLEMENTARES", `<div class="g2">
      ${kv("Diagnóstico (CID)", p.diagnosis, true)}
      <div class="kv"><span class="k">Realiza atendimento atualmente?</span><span class="v">${radio([["Sim", atS], ["Não", atN]])}</span></div>
      ${kv("Onde realiza o atendimento", p.outroAtendimento ? p.localAtendimento : null)}
      <div class="kv"><span class="k">Estuda?</span><span class="v">${radio([["Sim", estuda], ["Não", null]])}</span></div>
      <div class="kv"><span class="k">Rede de ensino</span><span class="v">${radio([["Pública", p.escolaPublica === true], ["Particular", p.escolaPublica === false]])}</span></div>
      ${kv("Trabalho dos pais", p.trabalhoPais)}
      <div class="kv"><span class="k">Reside em</span><span class="v">${radio([["Residência familiar", p.abrigoCasaCrianca === false], ["Abrigo / Casa da Criança", p.abrigoCasaCrianca === true]])}</span></div>
    </div>`)}
    ${sec("cal", "3. DADOS DA TRIAGEM", `<div class="g4">
      <div class="mini">${ic("cal")}<div><span class="k">Data da triagem</span><b>${esc(dataStr)}</b></div></div>
      <div class="mini">${ic("clock")}<div><span class="k">Horário</span><b>${esc(criado.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }))}</b></div></div>
      <div class="mini">${ic("user")}<div><span class="k">Aplicador</span><b>${esc(t.responsavel || "—")}</b></div></div>
      <div class="mini">${ic("file")}<div><span class="k">Tipo de triagem</span><b>${esc(opts?.tipo || "Triagem inicial")}</b></div></div>
    </div>`)}
    <div class="total"><span class="tb">${svg("chart", "#fff", 34)}</span>
      <div class="tt"><b>PONTUAÇÃO TOTAL</b><span>Soma das ${avaliadas.length || 7} especialidades (10 perguntas cada, de 0 a 3 pontos)</span><div class="barra"><div style="width:${pctTotal}%"></div></div></div>
      <div class="num"><b>${totalPts} / ${max}</b><span>${pctTotal}%</span></div></div>
    <div class="rod"><span>${esc(AVISO_TRIAGEM)}</span><span>Página 1 de 2</span></div>
  </section>`;

  // Teia (radar) — 0 a 100% por especialidade.
  const N = r.areas.length, cx = 260, cy = 175, R = 120;
  const pt = (i: number, f: number) => { const ang = -Math.PI / 2 + (2 * Math.PI * i) / N; return [cx + Math.cos(ang) * R * f, cy + Math.sin(ang) * R * f]; };
  const grid = [0.25, 0.5, 0.75, 1].map((f) => `<polygon points="${r.areas.map((_, i) => pt(i, f).join(",")).join(" ")}" fill="none" stroke="#dbe4ef"/>`).join("")
    + r.areas.map((_, i) => `<line x1="${cx}" y1="${cy}" x2="${pt(i, 1)[0]}" y2="${pt(i, 1)[1]}" stroke="#e5e7eb"/>`).join("")
    + [25, 50, 75, 100].map((v) => `<text x="${cx + 3}" y="${cy - R * v / 100 + 3}" font-size="8" fill="#64748b">${v}</text>`).join("");
  const poly = `<polygon points="${r.areas.map((a, i) => pt(i, pctA(a) / 100).join(",")).join(" ")}" fill="rgba(59,130,246,0.25)" stroke="#1d4ed8" stroke-width="2"/>`
    + r.areas.map((a, i) => { const [x, y] = pt(i, pctA(a) / 100); return `<circle cx="${x}" cy="${y}" r="4" fill="#1d4ed8"/>`; }).join("");
  const labels = r.areas.map((a, i) => {
    const [x, y] = pt(i, 1.28); const anchor = x < cx - 10 ? "end" : x > cx + 10 ? "start" : "middle";
    const cor = AREA_COR[a.area] ?? "#334155";
    return `<text x="${x}" y="${y}" font-size="13" font-weight="700" text-anchor="${anchor}" fill="#0f172a">${esc(a.area)}</text>
      <text x="${x}" y="${y + 15}" font-size="16" font-weight="800" text-anchor="${anchor}" fill="${cor}">${a.respondidas ? `${pctA(a)}%` : "não avaliado"}</text>`;
  }).join("");
  const teia = `<svg viewBox="0 0 520 345" width="100%" height="215">${grid}${poly}${labels}</svg>`;

  const linhas = niveis.map(({ a, n }) => {
    const pill = n ? PILL[n.label] : null;
    const ind = enc.includes(a.area) ? "Prioridade" : n?.sugerir ? "Avaliação" : n ? "Fluxo regular" : "—";
    return `<tr><td><span class="dot" style="background:${AREA_COR[a.area] ?? "#94a3b8"}"></span>${esc(a.area)}</td>
      <td class="c"><b>${a.respondidas ? a.pontos : "–"}</b></td>
      <td><div class="mb"><div style="width:${pctA(a)}%;background:${AREA_COR[a.area] ?? "#94a3b8"}"></div></div></td>
      <td class="c">${a.respondidas ? `${pctA(a)}%` : "–"}</td>
      <td class="c">${pill ? `<span class="pill" style="background:${pill[1]};color:${pill[2]}">${pill[0]}</span>` : `<span class="pill na">não avaliado</span>`}</td>
      <td class="c ${ind === "Prioridade" ? "pr" : ""}">${ind}</td></tr>`;
  }).join("");

  const totN = cont.alta + cont.mod + cont.baixa || 1, C = 2 * Math.PI * 42;
  let off = 0;
  const arcs = ([[cont.alta, "#ef4444"], [cont.mod, "#f59e0b"], [cont.baixa, "#22c55e"]] as [number, string][]).map(([v, cor]) => {
    const len = (v / totN) * C; const s = `<circle cx="55" cy="55" r="42" fill="none" stroke="${cor}" stroke-width="16" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 55 55)"/>`; off += len; return s;
  }).join("");
  const donut = `<div class="donut"><svg viewBox="0 0 110 110" width="105" height="105"><circle cx="55" cy="55" r="42" fill="none" stroke="#eef2f7" stroke-width="16"/>${arcs}
      <text x="55" y="53" font-size="17" font-weight="800" text-anchor="middle" fill="#0b1f4d">${totalPts}</text><text x="55" y="66" font-size="8" text-anchor="middle" fill="#475569">pontos (${pctTotal}%)</text></svg>
    <div class="leg"><p><i style="background:#ef4444"></i>Alta: ${cont.alta} área${cont.alta === 1 ? "" : "s"}</p><p><i style="background:#f59e0b"></i>Moderada: ${cont.mod} área${cont.mod === 1 ? "" : "s"}</p><p><i style="background:#22c55e"></i>Baixa: ${cont.baixa} área${cont.baixa === 1 ? "" : "s"}</p></div></div>`;

  const encTxt = `<p>Conforme resultados da triagem, recomenda-se encaminhamento para: <b>${esc(enc.length ? enc.join(", ") : "nenhuma especialidade com indicador de prioridade")}</b>.</p>
    ${r.prioridades.length ? `<p>Prioridades clínicas: ${esc(r.prioridades.map((x) => x.titulo).join("; "))}.</p>` : ""}
    ${r.social.length ? `<p>Vulnerabilidade social: ${esc(r.social.map((x) => x.titulo).join("; "))} — orientar serviço social/CRAS.</p>` : ""}
    <p class="s">Os encaminhamentos devem seguir o protocolo da equipe técnica do serviço.</p>`;

  const folha2 = `<section class="page p2">${cab("RESULTADOS E ENCAMINHAMENTOS")}
    ${riscos.length ? `<div class="alerta">Atenção: ${esc(ALERTA_RISCO)}</div>` : ""}
    ${sec("chart", "4. TEIA DE RESULTADOS", teia)}
    ${sec("chart", "5. RESULTADO POR ESPECIALIDADE", `<table><thead><tr><th>Especialidade</th><th class="c">Pontuação<br>(0 – 30)</th><th></th><th class="c">%</th><th class="c">Nível</th><th class="c">Indicação</th></tr></thead><tbody>${linhas}</tbody></table>`)}
    <div class="duas">${sec("target", "6. CLASSIFICAÇÃO DOS NÍVEIS", donut)}${sec("target", "7. ENCAMINHAMENTO", encTxt)}</div>
    ${termoCienciaHtml({ triagem: "Triagem Multidisciplinar", paciente: p.name, prontuario: p.prontuario, responsavel: p.guardianName, aplicador: t.responsavel, data: dataStr })}
    <div class="rod"><span>Resultados da triagem multidisciplinar. Triagem orientativa, não estabelece diagnóstico.</span><span>Página 2 de 2</span></div>
  </section>`;

  const titulo = `Triagem_${esc((p.name || "Paciente").replace(/\s+/g, "_"))}${p.prontuario ? `_${esc(p.prontuario)}` : ""}`;
  const css = `
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; background: #e2e8f0; font-size: 13px; }
  .bar { display: flex; gap: 10px; padding: 14px; justify-content: center; }
  .page { width: 210mm; height: 297mm; margin: 0 auto 14px; background: #fff; padding: 10mm 11mm 8mm; display: flex; flex-direction: column; gap: 3.5mm; overflow: hidden; }
  .cab { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #bfd3ea; padding-bottom: 6px; }
  .logo { display: flex; align-items: center; gap: 8px; } .nfs { font-size: 40px; font-weight: 900; color: #0b1f4d; letter-spacing: -1px; } .gt { font-size: 16px; line-height: 1.1; color: #0b1f4d; }
  .tit { text-align: right; } .tit b { display: block; font-size: 17px; color: #0b1f4d; } .tit span { display: block; font-size: 12px; color: #334155; letter-spacing: .06em; } .tit em { font-style: normal; font-size: 12px; color: #475569; }
  .sec { border: 1px solid #dbe4ef; border-radius: 10px; overflow: hidden; break-inside: avoid; flex-shrink: 0; }
  .sec-h { display: flex; align-items: center; gap: 10px; background: #eef4fb; padding: 4px 12px; font-weight: 800; font-size: 15px; color: #0b1f4d; position: relative; }
  .ib { width: 30px; height: 30px; border-radius: 7px; background: #0b1f4d; display: inline-flex; align-items: center; justify-content: center; }
  .pront { margin-left: auto; background: #cfe3fb; border-radius: 10px; padding: 4px 16px; text-align: center; font-size: 26px; font-weight: 900; line-height: 1; } .pront small { display: block; font-size: 9px; font-weight: 700; letter-spacing: .06em; color: #1e3a6e; }
  .sec-b { padding: 4px 12px 8px; }
  .g2 { display: grid; grid-template-columns: 1fr 1fr; column-gap: 16px; }
  .kv { display: flex; flex-direction: column; padding: 8px 0; border-bottom: 1px solid #eef2f7; } .kv.span { grid-column: 1 / -1; }
  .k { font-size: 13px; color: #334155; } .v { font-size: 16px; font-weight: 700; color: #0f172a; }
  .rd { display: inline-flex; align-items: center; gap: 6px; margin-right: 18px; font-weight: 400; } .rd i { width: 15px; height: 15px; border-radius: 50%; border: 2px solid #94a3b8; display: inline-block; } .rd i.on { border-color: #1d4ed8; background: radial-gradient(#1d4ed8 45%, #fff 50%); }
  .g4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; } .mini { display: flex; gap: 8px; align-items: center; padding: 12px 0; } .mini b { display: block; font-size: 15px; }
  .total { display: flex; align-items: center; gap: 14px; background: #eef4fb; border-radius: 10px; overflow: hidden; } .tb { background: #1d4ed8; padding: 26px; display: flex; }
  .tt { flex: 1; } .tt b { display: block; font-size: 18px; color: #0b1f4d; } .tt span { font-size: 12px; color: #334155; } .barra { height: 10px; border-radius: 9px; background: #cfe3fb; overflow: hidden; margin-top: 6px; } .barra div { height: 100%; background: #1d4ed8; }
  .num { text-align: right; padding-right: 16px; } .num b { display: block; font-size: 30px; color: #0b1f4d; } .num span { font-size: 26px; font-weight: 900; color: #0b1f4d; }
  .page.p2 { gap: 2.5mm; }
  .rod { display: flex; justify-content: space-between; gap: 10px; font-size: 10px; color: #64748b; margin-top: auto; }
  .alerta { border: 2px solid #dc2626; background: #fef2f2; color: #991b1b; font-weight: 700; border-radius: 8px; padding: 5px 10px; font-size: 11.5px; }
  table { width: 100%; border-collapse: collapse; } th { font-size: 12px; text-align: left; color: #0b1f4d; padding: 4px; border-bottom: 1px solid #dbe4ef; font-weight: 700; }
  td { padding: 2px 4px; border-bottom: 1px solid #f1f5f9; font-size: 13.5px; } .c { text-align: center; } td.pr { font-weight: 800; color: #0b1f4d; }
  .dot { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 8px; vertical-align: middle; }
  .mb { width: 90px; height: 9px; border-radius: 9px; background: #eef2f7; overflow: hidden; } .mb div { height: 100%; border-radius: 9px; }
  .pill { display: inline-block; padding: 2px 10px; border-radius: 6px; font-weight: 700; font-size: 12px; min-width: 70px; } .pill.na { background: #f1f5f9; color: #64748b; font-style: italic; }
  .duas { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; }
  .donut { display: flex; align-items: center; gap: 12px; } .leg p { margin: 6px 0; font-size: 13.5px; display: flex; align-items: center; gap: 8px; } .leg i { width: 13px; height: 13px; border-radius: 50%; display: inline-block; }
  .sec-b p { margin: 3px 0; font-size: 12.5px; } .sec-b p.s { color: #475569; font-size: 12px; }
  @page { size: A4 portrait; margin: 0; }
  @media print { body { background: #fff; } .bar { display: none !important; } .page { margin: 0; break-after: page; } .page:last-of-type { break-after: auto; } }`;
  return { titulo, css, paginas: folha1 + folha2 };
}

const BARRA = `<div class="bar">
    <button onclick="window.close()" style="padding:8px 18px;background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">← Voltar</button>
    <button onclick="window.print()" style="padding:8px 18px;background:#0b1f4d;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">Imprimir / Salvar PDF</button>
  </div>`;

/** Isola o CSS de outra folha (ex.: ABC) dentro de `scope`, para juntar no mesmo arquivo. */
function scopeCss(css: string, scope: string): string {
  return css
    .replace(/@page[^{]*\{[^}]*\}/g, "")
    .replace(/@media print\s*\{(?:[^{}]*\{[^}]*\})*\s*\}/g, "")
    .replace(/([^{}]+)\{([^}]*)\}/g, (_m, sel: string, body: string) =>
      `${sel.split(",").map((s) => (s.trim() === "body" ? scope : `${scope} ${s.trim()}`)).join(", ")} {${body}}`);
}

function abrir(titulo: string, css: string, corpo: string) {
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${titulo}</title>
<style>${css}</style></head><body>
  ${BARRA}
  ${corpo}
</body></html>`;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.addEventListener("load", () => setTimeout(() => w.print(), 300));
}

/** PDF 1 — Triagem Multidisciplinar (2 folhas A4, termo de ciência no fim). */
export function printTriagem86(t: Triagem86, p: PacienteInfo, opts?: { tipo?: string }) {
  const d = triagem86Doc(t, p, opts);
  abrir(d.titulo, d.css, d.paginas);
}

/** Arquivo único: Triagem Multidisciplinar + Triagem ABC, cada uma com o seu termo de ciência. */
export function printTriagemCompleta(t: Triagem86, p: PacienteInfo, abc: AbcPrintInput, opts?: { tipo?: string }) {
  const d = triagem86Doc(t, p, opts);
  const a = abcChecklistDoc(abc);
  const css = `${d.css}
  ${scopeCss(a.css, ".abc-doc")}
  .abc-doc { page: abc; width: 210mm; margin: 0 auto 14px; background: #fff; padding: 15mm; break-before: page; }
  @page abc { size: A4 portrait; margin: 15mm; }
  @media print { .abc-doc { width: auto; margin: 0; padding: 0; } }`;
  abrir(d.titulo.replace(/^Triagem_/, "Triagens_"), css, `${d.paginas}<section class="abc-doc">${a.corpo}</section>`);
}
