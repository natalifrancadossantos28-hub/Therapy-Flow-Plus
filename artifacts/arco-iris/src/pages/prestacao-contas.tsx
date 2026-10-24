import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FileDown, ShieldCheck } from "lucide-react";
import { Card, Button } from "@/components/ui-custom";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import {
  listProfessionals, listProfessionalsCapacity, listWaitingList, listAppointments, listPausedOverview,
  type Professional, type ProfessionalCapacity, type WaitingListEntry, type AppointmentListItem, type PausedOverviewItem,
} from "@/lib/arco-rpc";
import { isTransportSpecialty } from "@/lib/specialty-colors";
import { openReportWindow, escHtml } from "@/lib/print-report-shell";
import { resumoAgenda, capacidadeMax, abaixoDaMeta, CAPACIDADE_META, CAPACIDADE_MAX, hojeISO, fmtPct, fmtDias, diasDesde, media, NAO_AVALIADO, type ResumoAgenda } from "@/lib/indicadores";

// Prestação de contas: só números agregados — nenhum nome, prontuário ou telefone.
export default function PrestacaoContas() {
  useDocumentTitle("Prestação de Contas");
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [mes, setMes] = useState<number | null>(null);
  const [profs, setProfs] = useState<Professional[]>([]);
  const [cap, setCap] = useState<ProfessionalCapacity[]>([]);
  const [fila, setFila] = useState<WaitingListEntry[]>([]);
  const [paused, setPaused] = useState<{ fila: PausedOverviewItem[]; agenda: PausedOverviewItem[] } | null>(null);
  const [apts, setApts] = useState<AppointmentListItem[] | null>(null);

  useEffect(() => {
    listProfessionals().then(setProfs).catch(() => {});
    listProfessionalsCapacity().then(setCap).catch(() => {});
    listWaitingList().then(setFila).catch(() => {});
    listPausedOverview().then(setPaused).catch(() => setPaused(null));
  }, []);

  const from = mes == null ? `${ano}-01-01` : `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fim = mes == null ? `${ano}-12-31` : format(new Date(ano, mes, 0), "yyyy-MM-dd");
  const to = fim < hojeISO() ? fim : hojeISO();
  useEffect(() => {
    setApts(null);
    if (from > to) { setApts([]); return; }
    listAppointments({ dateFrom: from, dateTo: to }).then(setApts).catch(() => setApts([]));
  }, [from, to]);

  const specById = useMemo(() => new Map(profs.map((p) => [p.id, (p.specialty || "").trim()])), [profs]);
  const clin = useMemo(() => (apts ?? []).filter((a) => !isTransportSpecialty(specById.get(a.professionalId) ?? "")), [apts, specById]);
  const geral = useMemo(() => resumoAgenda(clin), [clin]);

  const porMes = useMemo(() => {
    if (mes != null) return [];
    return Array.from({ length: 12 }, (_, i) => {
      const k = `${ano}-${String(i + 1).padStart(2, "0")}`;
      const futuro = `${k}-01` > hojeISO();
      return { mes: format(new Date(ano, i, 1), "MMMM", { locale: ptBR }), r: futuro ? null : resumoAgenda(clin.filter((a) => a.date.startsWith(k))) };
    });
  }, [clin, ano, mes]);

  const filaAtiva = fila.filter((w) => !w.paused);
  const especialidades = useMemo(() => {
    const s = new Set<string>();
    for (const a of clin) s.add(specById.get(a.professionalId) || "Sem especialidade");
    for (const w of filaAtiva) s.add((w.specialty || "").trim() || "Sem especialidade");
    return Array.from(s).sort();
  }, [clin, filaAtiva, specById]);
  const porEsp = especialidades.map((s) => {
    const r = resumoAgenda(clin.filter((a) => (specById.get(a.professionalId) || "Sem especialidade") === s));
    const f = filaAtiva.filter((w) => ((w.specialty || "").trim() || "Sem especialidade") === s);
    return { s, r, fila: f.length, espera: media(f.filter((w) => w.entryDate).map((w) => diasDesde(w.entryDate))) };
  });

  const capC = cap.filter((c) => !isTransportSpecialty(c.specialty));
  const capTotal = capC.reduce((s, c) => s + capacidadeMax(c), 0);
  const capUsada = capC.reduce((s, c) => s + c.currentPatients, 0);
  const vagas = capC.reduce((s, c) => s + Math.max(0, capacidadeMax(c) - c.currentPatients), 0);
  const esperaGeral = media(filaAtiva.filter((w) => w.entryDate).map((w) => diasDesde(w.entryDate)));
  const prioritarios = filaAtiva.filter((w) => (w as { prioridadeMaxima?: boolean }).prioridadeMaxima).length;
  const pausados = paused ? paused.fila.length + paused.agenda.length : null;
  const periodoLabel = mes == null ? `Ano de ${ano}${ano === anoAtual ? ` (até ${format(new Date(), "dd/MM")})` : ""}` : format(new Date(ano, mes - 1, 1), "MMMM 'de' yyyy", { locale: ptBR });
  const n = (x: number | null | undefined) => (x == null ? NAO_AVALIADO : x.toLocaleString("pt-BR"));

  const kpis: [string, string][] = [
    ["Atendimentos realizados (presença)", n(apts ? geral.realizados : null)],
    ["Pacientes distintos atendidos", n(apts ? geral.pacientesAtendidos : null)],
    ["Taxa de presença", fmtPct(geral.taxaPresenca)],
    ["Faltas não justificadas", n(apts ? geral.faltas : null)],
    ["Faltas justificadas", n(apts ? geral.justificadas : null)],
    ["Cancelamentos", n(apts ? geral.cancelados : null)],
    ["Aguardando na fila (hoje)", n(filaAtiva.length)],
    ["Espera média na fila", fmtDias(esperaGeral)],
    ["Casos prioritários na fila", n(prioritarios)],
    [`Vagas disponíveis (hoje · até ${CAPACIDADE_MAX} por profissional)`, n(capTotal ? vagas : null)],
    [`Profissionais abaixo de ${CAPACIDADE_META} pacientes`, n(capTotal ? abaixoDaMeta(capC) : null)],
    ["Ocupação da equipe (hoje)", fmtPct(capTotal ? Math.round((capUsada / capTotal) * 100) : null)],
    ["Pausas ativas (hoje)", n(pausados)],
  ];

  const linhaResumo = (r: ResumoAgenda | null) => r == null
    ? [NAO_AVALIADO, NAO_AVALIADO, NAO_AVALIADO, NAO_AVALIADO, NAO_AVALIADO]
    : [n(r.realizados), n(r.pacientesAtendidos), n(r.faltas), n(r.justificadas), fmtPct(r.taxaPresenca)];

  const gerarPdf = () => {
    const tabela = (head: string[], rows: string[][]) =>
      `<table><thead><tr>${head.map((h) => `<th>${escHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${escHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    const body = [
      `<h3>1. Indicadores gerais</h3>`,
      tabela(["Indicador", "Valor"], kpis.map(([a, b]) => [a, b])),
      porMes.length ? `<h3>2. Evolução mensal</h3>` + tabela(["Mês", "Atendimentos", "Pacientes distintos", "Faltas", "Justificadas", "Presença"], porMes.map((m) => [m.mes, ...linhaResumo(m.r)])) : "",
      `<h3>${porMes.length ? 3 : 2}. Por especialidade</h3>`,
      tabela(["Especialidade", "Atendimentos", "Pacientes distintos", "Faltas", "Justificadas", "Presença", "Na fila", "Espera média"], porEsp.map((e) => [e.s, ...linhaResumo(e.r), n(e.fila), fmtDias(e.espera)])),
      `<p class="s" style="margin-top:14px">Notas: "Atendimentos realizados" = sessões com presença registrada na agenda do NFS Gestão (não substitui o registro assistencial do e-SUS). Presença = realizados ÷ (realizados + faltas não justificadas). Fila, vagas, ocupação e pausas refletem a situação no dia da emissão. "${NAO_AVALIADO}" indica ausência de dados para o cálculo. Relatório sem dados pessoais.</p>`,
    ].join("");
    openReportWindow({ title: "Prestação de Contas — Atendimento Terapêutico", subParts: [periodoLabel], body: `<style>h3{font-size:13px;margin:16px 0 6px;color:#0e7490}@page{size:A4 portrait;margin:12mm}</style>${body}` });
  };

  const sel = "rounded-xl border border-border bg-card/70 px-3 py-2 text-sm";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-display font-bold">Prestação de Contas</h1>
          <p className="text-muted-foreground mt-1 text-sm flex items-center gap-1"><ShieldCheck className="w-4 h-4 text-emerald-400" /> Só números agregados, sem dados pessoais · <span className="capitalize">{periodoLabel}</span></p>
        </div>
        <Button className="gap-2" onClick={gerarPdf} disabled={apts === null}><FileDown className="w-4 h-4" /> Gerar PDF oficial</Button>
      </div>
      <Card className="p-3 flex flex-wrap items-center gap-2">
        <select className={sel} value={ano} onChange={(e) => setAno(Number(e.target.value))}>
          {Array.from({ length: 4 }, (_, i) => anoAtual - i).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className={sel} value={mes ?? ""} onChange={(e) => setMes(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Ano inteiro</option>
          {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{format(new Date(2000, i, 1), "MMMM", { locale: ptBR })}</option>)}
        </select>
        {apts === null && <span className="text-xs text-muted-foreground animate-pulse">Carregando agenda…</span>}
      </Card>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        {kpis.map(([t, v]) => (
          <Card key={t} className="p-4">
            <p className="text-[11px] font-semibold text-muted-foreground">{t}</p>
            <p className={v === NAO_AVALIADO ? "text-base italic text-muted-foreground mt-1" : "text-2xl font-bold font-display"}>{v}</p>
          </Card>
        ))}
      </div>
      {porMes.length > 0 && (
        <Card className="p-5 overflow-x-auto">
          <h2 className="font-bold mb-3">Evolução mensal</h2>
          <Tabela head={["Mês", "Atendimentos", "Pacientes distintos", "Faltas", "Justificadas", "Presença"]} rows={porMes.map((m) => [m.mes, ...linhaResumo(m.r)])} />
        </Card>
      )}
      <Card className="p-5 overflow-x-auto">
        <h2 className="font-bold mb-3">Por especialidade</h2>
        <Tabela head={["Especialidade", "Atendimentos", "Pacientes distintos", "Faltas", "Justificadas", "Presença", "Na fila", "Espera média"]} rows={porEsp.map((e) => [e.s, ...linhaResumo(e.r), n(e.fila), fmtDias(e.espera)])} />
      </Card>
      <p className="text-xs text-muted-foreground">"Atendimentos realizados" = presença registrada na agenda do NFS, não o registro assistencial do e-SUS. Fila, vagas, ocupação e pausas são a situação de hoje.</p>
    </div>
  );
}

function Tabela({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-muted-foreground uppercase"><tr>{head.map((h, i) => <th key={h} className={i ? "text-right py-2" : "text-left py-2"}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-border">{r.map((c, j) => <td key={j} className={j ? "text-right py-2" : "py-2 capitalize"}>{c === NAO_AVALIADO ? <i className="text-muted-foreground">{c}</i> : c}</td>)}</tr>)}</tbody>
    </table>
  );
}
