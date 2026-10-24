import { ITENS_86, AREAS_86, opcoesDe, calcularResultado86, FAIXAS_RENDA, AVISO_TRIAGEM, ALERTA_RISCO, RISCO_CODES, nivelArea86, sugestoes86 } from "@/lib/triagem-86";
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

/**
 * Relatório impresso da Triagem 86 no modelo simples (o mesmo da impressão
 * antiga): dados do paciente, pontuação por área, prioridades, situação social
 * e respostas em tabela compacta. Sem gráficos.
 */
export function printTriagem86(t: Triagem86, p: PacienteInfo) {
  const r = calcularResultado86(t.respostas ?? {}, t.social ?? {});
  const data = fmtData(t.createdAt);
  const campo = (l: string, v?: string | null) => (v ? `<div><p class="l">${esc(l)}</p><p class="v">${esc(v)}</p></div>` : "");
  const label = (code: string) => {
    const it = ITENS_86.find((i) => i.code === code)!;
    if (code === "S01") {
      const s = t.social ?? {};
      return [s.moradores ? `${s.moradores} moradores` : "", FAIXAS_RENDA.find((o) => o.valor === s.renda)?.label ?? ""].filter(Boolean).join(" · ") || "—";
    }
    if (code === "S02") {
      const s = t.social ?? {};
      return s.beneficio === "sim" ? `Sim${s.beneficioTipo ? ` (${s.beneficioTipo})` : ""}` : s.beneficio === "nao" ? "Não" : s.beneficio === "pni" ? "Prefere não informar" : "—";
    }
    return opcoesDe(it).find((o) => o.valor === t.respostas?.[code])?.label ?? "—";
  };
  const totalPts = r.areas.reduce((s, a) => s + a.pontos, 0);
  const riscos = r.prioridades.filter((x) => RISCO_CODES.includes(x.code));

  const areasRows = r.areas.map((a) => {
    const n = nivelArea86(a.pontos, a.respondidas);
    const obs = [a.naoSei ? `${a.naoSei} não sei` : "", a.naoAplica ? `${a.naoAplica} não se aplica` : ""].filter(Boolean).join(" · ");
    return `<tr><td><b>${esc(a.area)}</b></td><td class="c"><b>${a.pontos}</b>/30</td><td class="c">${a.respondidas ? `${a.pct}%` : "não avaliado"}</td>
      <td>${n ? `<span class="dot" style="background:${n.hex}"></span>${esc(n.label)}` : "não avaliado"}</td><td class="s">${esc(obs)}</td></tr>`;
  }).join("");

  const respostas = [...AREAS_86, "Sociofamiliar", "Prioridades"].map((g) => {
    const its = ITENS_86.filter((i) => i.grupo === g);
    return `<div class="grp"><h4>${esc(g)}</h4><table class="resp">${its.map((i) =>
      `<tr><td class="code">${i.code}</td><td>${esc(i.titulo)}</td><td class="ans">${esc(label(i.code))}</td></tr>`).join("")}</table></div>`;
  }).join("");

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Triagem_${esc((p.name || "Paciente").replace(/\s+/g, "_"))}${p.prontuario ? `_${esc(p.prontuario)}` : ""}</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 0; padding: 24px; font-size: 12px; background: #fff; }
  .print-top { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; border: 2px solid #1f2937; border-radius: 14px; padding: 14px 20px; margin-bottom: 16px; break-inside: avoid; }
  .lbl { font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: #6b7280; margin: 0 0 2px; }
  .nome { font-size: 26px; font-weight: 900; line-height: 1.1; text-transform: uppercase; margin: 0; }
  .pront { font-size: 30px; font-weight: 900; line-height: 1; margin: 0; color: #0e7490; text-align: right; white-space: nowrap; }
  .data { font-size: 11px; color: #4b5563; margin: 4px 0 0; text-align: right; }
  .print-title { font-size: 16px; font-weight: 800; color: #0e7490; margin: 0 0 12px; }
  .box { border: 1px solid #d1d5db; border-radius: 12px; padding: 12px 14px; margin-bottom: 12px; break-inside: avoid; }
  .box h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #0e7490; margin: 0 0 8px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 16px; }
  .l { color: #6b7280; font-weight: 600; margin: 0; font-size: 10px; } .v { font-weight: 700; margin: 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 5px 6px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  th { font-size: 10px; text-transform: uppercase; color: #6b7280; }
  .c { text-align: center; } .s { color: #6b7280; font-size: 10px; }
  .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; }
  .total { display: flex; justify-content: space-between; align-items: center; }
  .total b { font-size: 22px; }
  .alerta { border: 2px solid #dc2626; background: #fef2f2; color: #991b1b; font-weight: 700; border-radius: 10px; padding: 8px 12px; margin-bottom: 12px; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .resps { columns: 2; column-gap: 14px; }
  .grp { break-inside: avoid; margin-bottom: 8px; }
  .grp h4 { font-size: 11px; margin: 0 0 3px; color: #0e7490; }
  .resp td { padding: 2px 4px; font-size: 10px; } .code { font-family: monospace; color: #6b7280; width: 34px; } .ans { font-weight: 700; text-align: right; white-space: nowrap; }
  .nota { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e3a8a; border-radius: 12px; padding: 10px 14px; break-inside: avoid; }
  .footer { margin-top: 18px; font-size: 10px; color: #94a3b8; }
  @page { size: A4 portrait; margin: 12mm; }
  @media print { .no-print { display: none !important; } body { padding: 0; } }
</style></head><body>
  <div class="no-print" style="display:flex;gap:10px;margin-bottom:18px;">
    <button onclick="window.close()" style="padding:8px 18px;background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">← Voltar</button>
    <button onclick="window.print()" style="padding:8px 18px;background:#0891b2;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">🖨 Imprimir / Salvar PDF</button>
  </div>
  <div class="print-top">
    <div><p class="lbl">Paciente</p><p class="nome">${esc(p.name || "—")}</p></div>
    <div><p class="lbl">Prontuário</p><p class="pront">${esc(p.prontuario?.trim() || "—")}</p>${data ? `<p class="data"><strong>Data da triagem:</strong> ${esc(data)}</p>` : ""}</div>
  </div>
  <p class="print-title">Triagem Multidisciplinar — Núcleo Integrado Novo Arco-Íris</p>
  ${riscos.length ? `<div class="alerta">⚠ ${esc(ALERTA_RISCO)}</div>` : ""}
  <div class="box"><h3>Dados do Paciente</h3><div class="grid">
    ${campo("Nome", p.name)}${campo("Nascimento", fmtData(p.dateOfBirth))}${campo("Idade", idade(p.dateOfBirth))}
    ${campo("CPF", p.cpf)}${campo("Cartão SUS", p.cns)}${campo("Responsável", p.guardianName)}
    ${campo("Telefone", p.phone)}${campo("Endereço", p.address)}${campo("Preenchido por", t.responsavel)}
  </div></div>
  <div class="box total"><div><p class="lbl">Pontuação clínica total</p><p style="margin:0">Soma das 7 especialidades (10 perguntas cada, 0 a 3 pontos)</p></div><div><b>${totalPts}</b> / 210</div></div>
  <div class="box"><h3>Resultado por Área</h3>
    <table><thead><tr><th>Área</th><th class="c">Pontos</th><th class="c">%</th><th>Nível</th><th>Observação</th></tr></thead><tbody>${areasRows}</tbody></table>
    <p class="s" style="margin:6px 0 0">Faixas: 0–8 baixa · 9–17 moderada · 18–30 alta sinalização. “Não sei” e “Não se aplica” não somam pontos.</p>
  </div>
  <div class="cols">
    <div class="box"><h3>Prioridade Clínica</h3>${r.prioridades.length ? r.prioridades.map((x) => `<p style="margin:2px 0">• ${x.code} ${esc(x.titulo)}</p>`).join("") : `<p style="margin:0;color:#6b7280">Nenhum sinal marcado</p>`}${r.prioridadesNaoSei ? `<p class="s">${r.prioridadesNaoSei} item(ns) “não sei”</p>` : ""}</div>
    <div class="box"><h3>Vulnerabilidade Social</h3>${r.social.length ? r.social.map((x) => `<p style="margin:2px 0">• ${esc(x.titulo)}${x.intensidade === "parcial" ? " (em parte)" : ""}</p>`).join("") : `<p style="margin:0;color:#6b7280">Nenhuma barreira marcada</p>`}${r.socialNaoInformado ? `<p class="s">${r.socialNaoInformado} preferiu(ram) não informar</p>` : ""}</div>
  </div>
  <div class="box"><h3>Sugestões de Encaminhamento</h3>${sugestoes86(r).filter((x) => x !== ALERTA_RISCO).map((x) => `<p style="margin:2px 0">• ${esc(x)}</p>`).join("")}<p class="s" style="margin:6px 0 0">Sugestões orientativas: a equipe técnica valida cada especialidade.</p></div>
  <div class="box"><h3>Respostas</h3><div class="resps">${respostas}</div></div>
  <div class="nota"><p style="margin:0 0 4px;font-weight:700">Nota Técnica</p><p style="margin:0">${esc(AVISO_TRIAGEM)} Os resultados indicam possíveis necessidades e servem como apoio para encaminhamento para avaliação especializada.</p></div>
  <div class="footer">NFS – Gestão Terapêutica · Documento gerado em ${esc(new Date().toLocaleDateString("pt-BR"))}</div>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.addEventListener("load", () => setTimeout(() => w.print(), 300));
}
