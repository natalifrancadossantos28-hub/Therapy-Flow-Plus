import type { ProfessionalCapacity, WaitingListEntry, AppointmentListItem } from "@/lib/arco-rpc";
import { isTransportSpecialty } from "@/lib/specialty-colors";
import { escHtml } from "@/lib/print-report-shell";
import { CAPACIDADE_MAX, hojeISO, diasDesde } from "@/lib/indicadores";

// Ofício de resposta a requerimento (Câmara): só números agregados, sem dado pessoal.
export type RequerimentoOpts = {
  numero: string;
  destinatario: string;
  assunto: string;
};

export type RequerimentoDados = {
  cap: ProfessionalCapacity[];
  fila: WaitingListEntry[];
  pacientesEmAtendimento: number;
  apts: AppointmentListItem[];
  specByProf: Map<number, string>;
  meses: string[];
};

const TEAL = "#0e5c75", TEAL2 = "#4fa3b8", GOLD = "#c8962e", GRAY = "#d6dde2";
const MESN = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const EXC = new Set(["desmarcado", "cancelado", "remanejado", "pausado", "remarcado"]);
const n = (x: number) => x.toLocaleString("pt-BR");
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function norm(s: string | null | undefined): string {
  const t = (s || "").trim();
  if (!t || t === "Oficina Pacientes") return "Outros";
  if (t.toLowerCase().startsWith("educação física")) return "Educação Física (Oficina)";
  return t;
}

/** Últimos `qtd` meses completos antes do mês atual, como "yyyy-mm". */
export function ultimosMesesCompletos(qtd = 4): string[] {
  const [y, m] = hojeISO().split("-").map(Number);
  return Array.from({ length: qtd }, (_, i) => {
    const d = new Date(y, m - 1 - qtd + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

function hbar(items: [string, number][], color: string, fmt: (v: number) => string = n, w = 640, bh = 18, lw = 190) {
  const mx = Math.max(1, ...items.map(([, v]) => v));
  const h = items.length * (bh + 8) + 6;
  const o = [`<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" font-family="Arial" font-size="11">`];
  items.forEach(([l, v], i) => {
    const y = i * (bh + 8) + 4, bw = ((w - lw - 70) * v) / mx;
    o.push(`<text x="${lw - 8}" y="${y + bh / 2 + 4}" text-anchor="end" fill="#1f2937">${escHtml(l)}</text>`);
    o.push(`<rect x="${lw}" y="${y}" width="${Math.max(bw, 2).toFixed(1)}" height="${bh}" rx="3" fill="${color}"/>`);
    o.push(`<text x="${(lw + bw + 6).toFixed(1)}" y="${y + bh / 2 + 4}" fill="#111" font-weight="bold">${fmt(v)}</text>`);
  });
  return o.join("") + "</svg>";
}

function stack(items: [string, number, number][], w = 640, bh = 18, lw = 190) {
  const mx = Math.max(1, ...items.map(([, t]) => t));
  const h = items.length * (bh + 8) + 30;
  const sc = (w - lw - 170) / mx;
  const o = [`<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" font-family="Arial" font-size="11">`];
  items.forEach(([l, t, oc], i) => {
    const y = i * (bh + 8) + 4;
    o.push(`<text x="${lw - 8}" y="${y + bh / 2 + 4}" text-anchor="end" fill="#1f2937">${escHtml(l)}</text>`);
    o.push(`<rect x="${lw}" y="${y}" width="${(t * sc).toFixed(1)}" height="${bh}" rx="3" fill="${GRAY}"/>`);
    o.push(`<rect x="${lw}" y="${y}" width="${(oc * sc).toFixed(1)}" height="${bh}" rx="3" fill="${TEAL}"/>`);
    o.push(`<text x="${(lw + t * sc + 6).toFixed(1)}" y="${y + bh / 2 + 4}" fill="#111"><tspan font-weight="bold">${oc}</tspan> de ${t} · ${t - oc} disponíveis</text>`);
  });
  const y = items.length * (bh + 8) + 14;
  o.push(`<rect x="${lw}" y="${y}" width="12" height="12" fill="${TEAL}"/><text x="${lw + 18}" y="${y + 10}">Vagas ocupadas</text><rect x="${lw + 130}" y="${y}" width="12" height="12" fill="${GRAY}"/><text x="${lw + 148}" y="${y + 10}">Vagas disponíveis</text>`);
  return o.join("") + "</svg>";
}

function tab(head: string[], body: (string | number)[][], foot: (string | number)[]) {
  return `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${body
    .map((r) => `<tr>${r.map((c) => `<td>${escHtml(String(c))}</td>`).join("")}</tr>`)
    .join("")}<tr class="tot">${foot.map((c) => `<td>${c}</td>`).join("")}</tr></tbody></table>`;
}

function Q(num: number, perg: string, resp: string, corpo = "") {
  return `<section><h2><span>${num}</span>${perg}</h2>${resp ? `<div class="resp">${resp}</div>` : ""}${corpo}</section>`;
}

export function requerimentoHtml(d: RequerimentoDados, o: RequerimentoOpts): string {
  const hoje = hojeISO();
  const [hy, hm, hd] = hoje.split("-").map(Number);
  const cap = d.cap.filter((c) => !isTransportSpecialty(c.specialty));
  const byS = new Map<string, ProfessionalCapacity[]>();
  for (const c of cap) byS.set(norm(c.specialty), [...(byS.get(norm(c.specialty)) ?? []), c]);
  const ESP = Array.from(byS.keys()).sort((a, b) => a.localeCompare(b, "pt-BR"));

  const seen = new Set<string>();
  const ses = new Map<string, Map<string, number>>();
  for (const a of d.apts) {
    const sp = d.specByProf.get(a.professionalId);
    if (sp == null || isTransportSpecialty(sp) || a.date > hoje) continue;
    const k = `${a.professionalId}|${a.patientId}|${a.date}|${a.time}`;
    if (seen.has(k)) continue;
    seen.add(k);
    if (EXC.has(String(a.status || "agendado").toLowerCase())) continue;
    const s = norm(sp), m = a.date.slice(0, 7);
    if (!ses.has(s)) ses.set(s, new Map());
    ses.get(s)!.set(m, (ses.get(s)!.get(m) ?? 0) + 1);
  }
  const med = new Map(ESP.map((s) => [s, Math.round(mean(d.meses.map((m) => ses.get(s)?.get(m) ?? 0)))]));
  const vag = new Map(ESP.map((s) => [s, CAPACIDADE_MAX * byS.get(s)!.length]));
  const ocu = new Map(ESP.map((s) => [s, Math.min(vag.get(s)!, byS.get(s)!.reduce((t, c) => t + c.currentPatients, 0))]));

  const ativos = d.fila.filter((w) => !w.paused);
  const agu = new Map<string, number>();
  for (const w of d.fila) { const s = norm(w.specialty); if (s !== "Outros") agu.set(s, (agu.get(s) ?? 0) + 1); }
  const fS = new Map<string, number[]>();
  for (const w of ativos) if (w.entryDate) { const s = norm(w.specialty); fS.set(s, [...(fS.get(s) ?? []), diasDesde(w.entryDate)]); }
  const esp: [string, number][] = Array.from(fS.entries()).filter(([s]) => s !== "Outros").map(([s, v]) => [s, Math.round(mean(v))]);
  const allw = Array.from(fS.values()).flat();
  const espGeral = Math.round(mean(allw));
  const dist = new Set(d.fila.map((w) => w.patientId)).size;
  const semprof = Array.from(agu.keys()).filter((s) => !byS.has(s));
  const TV = Array.from(vag.values()).reduce((a, b) => a + b, 0);
  const TO = Array.from(ocu.values()).reduce((a, b) => a + b, 0);
  const totMed = Array.from(med.values()).reduce((a, b) => a + b, 0);
  const emMeses = (x: number) => `${x} dias (≈ ${(x / 30).toFixed(1).replace(".", ",")} meses)`;
  const mesesLabel = d.meses.length
    ? `${MESN[Number(d.meses[0].slice(5)) - 1]} a ${MESN[Number(d.meses[d.meses.length - 1].slice(5)) - 1]} de ${d.meses[d.meses.length - 1].slice(0, 4)}`
    : "";
  const kpi: [string, string][] = [
    [String(ESP.length), "especialidades"], [String(cap.length), "profissionais"], [n(totMed), "atendimentos por mês"],
    [n(d.pacientesEmAtendimento), "pacientes em atendimento"], [n(dist), "crianças aguardando"], [`${espGeral} dias`, "espera média"],
  ];
  const desc = <T,>(xs: [string, T][], f: (x: [string, T]) => number) => [...xs].sort((a, b) => f(b) - f(a));

  const q1 = tab(["Especialidade", "Profissionais"], ESP.map((s) => [s, byS.get(s)!.length]), ["Total", cap.length]);
  const q2 = hbar(desc(Array.from(med.entries()), (x) => x[1]), TEAL);
  const q4 = stack(ESP.map((s) => [s, vag.get(s)!, ocu.get(s)!] as [string, number, number]).sort((a, b) => b[1] - a[1]));
  const q5 = hbar(desc(Array.from(agu.entries()), (x) => x[1]), GOLD);
  const q6 = hbar(desc(esp, (x) => x[1]), TEAL2, (v) => `${v} dias`);
  const dataExt = `${hd} de ${MESN[hm - 1]} de ${hy}`;
  const reqNum = escHtml(o.numero || "____");

  const css = `@page{size:A4;margin:14mm 16mm 16mm}
body{font-family:Arial,Helvetica,sans-serif;font-size:11.5px;color:#1f2937;line-height:1.5;margin:0;background:#fff}
.bar{display:flex;gap:10px;margin:0 0 16px}.bar button{padding:8px 18px;border-radius:8px;cursor:pointer;font-weight:600;border:1px solid #cbd5e1;background:#f1f5f9}.bar .p{background:${TEAL};color:#fff;border:none}
.doc{max-width:180mm;margin:0 auto}
.top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid ${TEAL};padding-bottom:8px}
.top h1{margin:0;font-size:18px;color:${TEAL};letter-spacing:.5px}.top p{margin:1px 0;color:#4b5563;font-size:10.5px}
.oficio{text-align:right;font-size:10.5px;color:#374151}
.dest{margin:14px 0 8px}.ass2{font-weight:bold;margin:6px 0}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0 6px}
.k{border:1px solid #cfe3ea;border-top:4px solid ${TEAL};border-radius:6px;padding:8px 10px;background:#f5fafc}
.k b{display:block;font-size:20px;color:${TEAL}}.k span{font-size:10.5px;color:#4b5563}
section{page-break-inside:avoid;margin-top:14px}
h2{font-size:12.5px;color:#111;margin:0 0 6px;display:flex;gap:8px;align-items:flex-start}
h2 span{background:${TEAL};color:#fff;border-radius:50%;min-width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center;font-size:11px}
.resp{background:#f5fafc;border-left:4px solid ${GOLD};padding:7px 10px;margin-bottom:6px}
table{width:100%;border-collapse:collapse;margin:4px 0}th{background:${TEAL};color:#fff;padding:5px;font-size:10.5px}td{border:1px solid #d9e2e7;padding:4px 6px;text-align:center}td:first-child{text-align:left}tr:nth-child(even) td{background:#f7fafb}tr.tot td{font-weight:bold;background:#e3f0f4}
.nota{font-size:9.5px;color:#6b7280;margin:3px 0 0}
.linha{border-bottom:1px solid #9ca3af;height:24px}
.ass{margin-top:22px;text-align:center}.ass div{border-top:1px solid #111;width:55%;margin:0 auto;padding-top:4px}
.lgpd{font-size:9.5px;color:#6b7280;border-top:1px solid #e5e7eb;margin-top:18px;padding-top:6px}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
@media print{.bar{display:none!important}}`;

  const body = `<div class="doc">
<div class="top"><div><h1>CENTRO INTEGRADO ARCO-ÍRIS</h1><p>Prefeitura da Estância Turística de Ibiúna</p><p>Secretaria Municipal dos Direitos da Pessoa com Deficiência</p></div>
<div class="oficio">Ofício nº ____/${hy}<br>Ibiúna, ${dataExt}</div></div>
<div class="dest">À Câmara Municipal da Estância Turística de Ibiúna${o.destinatario ? `<br>A/C <b>${escHtml(o.destinatario)}</b>` : ""}</div>
<div class="ass2">Assunto: Resposta ao Requerimento nº ${reqNum} — ${escHtml(o.assunto || "atendimentos realizados no Centro Integrado Arco-Íris")}</div>
<p>${/\bSra\b|Vereadora/i.test(o.destinatario) ? "Excelentíssima Senhora Vereadora," : o.destinatario ? "Excelentíssimo Senhor Vereador," : "Senhores Vereadores,"}</p>
<p>Em atenção ao Requerimento nº ${reqNum}, apresentamos as informações solicitadas sobre os atendimentos do Centro Integrado Arco-Íris. Os dados foram extraídos do sistema de gestão da unidade em ${hoje.split("-").reverse().join("/")} e as respostas seguem a mesma ordem das perguntas.</p>
<div class="kpis">${kpi.map(([v, l]) => `<div class="k"><b>${v}</b><span>${l}</span></div>`).join("")}</div>
${Q(1, "Quais são as especialidades e os atendimentos atualmente oferecidos?", `O Centro oferece <b>${ESP.length} especialidades</b>, com <b>${cap.length} profissionais</b>. Os atendimentos são terapêuticos, individuais e agendados semanalmente. A entrada é feita pela <b>Triagem Multidisciplinar</b>, que indica as especialidades de que cada criança precisa.`, q1)}
${Q(2, "Quantos atendimentos são realizados mensalmente em cada especialidade?", `São realizados, em média, <b>${n(totMed)} atendimentos por mês</b>.`, `${q2}<p class="nota">Média dos meses de ${mesesLabel}. Não inclui sessões desmarcadas ou remanejadas.</p>`)}
${Q(3, "Qual é o número total de pacientes que utilizam os serviços?", `Atualmente, <b>${n(d.pacientesEmAtendimento)} pacientes</b> estão em atendimento no Centro. Muitos são atendidos em mais de uma especialidade.`)}
${Q(4, "Quantas vagas são disponibilizadas e quantas estão ocupadas?", `São <b>${n(TV)} vagas</b>, com <b>${n(TO)} ocupadas</b> (${TV ? Math.round((TO * 100) / TV) : 0}%). Cada profissional atende até ${CAPACIDADE_MAX} pacientes.`, q4 + tab(["Especialidade", "Vagas", "Ocupadas", "Disponíveis"], ESP.map((s) => [s, vag.get(s)!, ocu.get(s)!, vag.get(s)! - ocu.get(s)!]), ["Total", TV, TO, TV - TO]))}
${Q(5, "Qual é o número de pacientes que aguardam atendimento por especialidade?", `<b>${n(dist)} crianças</b> aguardam atendimento. Como uma mesma criança pode aguardar em mais de uma especialidade, a soma do gráfico é maior que esse número.${semprof.length ? ` A especialidade de <b>${escHtml(semprof.join(", "))}</b> não conta hoje com profissional na equipe.` : ""}`, q5)}
${Q(6, "Qual é o tempo médio de espera em cada especialidade?", `O tempo médio de espera é de <b>${emMeses(espGeral)}</b>.`, `${q6}<p class="nota">Tempo contado da entrada na fila até a data deste ofício. A ordem da fila segue critérios técnicos: primeiro os casos de urgência, depois a alternância entre crianças da primeira infância (0 a 5 anos) e crianças maiores, e então a ordem de chegada. Bebês com menos de 2 anos têm prioridade na Fisioterapia (estimulação precoce).</p>`)}
${Q(7, "Existe previsão de ampliação de vagas ou profissionais? Quais medidas e qual o prazo?", "", '<div class="linha"></div>'.repeat(4))}
<p style="margin-top:16px">Sem mais para o momento, colocamo-nos à disposição para quaisquer esclarecimentos.</p>
<p>Respeitosamente,</p>
<div class="ass"><div>Coordenação do Centro Integrado Arco-Íris</div></div>
<p class="lgpd">Este documento contém somente números agregados, sem nome ou dado pessoal de pacientes, conforme a LGPD (Lei 13.709/2018) e o ECA.</p>
</div>`;

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Resposta ao Requerimento nº ${reqNum}</title><style>${css}</style></head><body>
<div class="bar"><button onclick="window.close()">← Voltar</button><button class="p" onclick="window.print()">🖨 Imprimir / Salvar PDF</button></div>
${body}</body></html>`;
}

export function openRequerimento(d: RequerimentoDados, o: RequerimentoOpts) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(requerimentoHtml(d, o));
  w.document.close();
}
