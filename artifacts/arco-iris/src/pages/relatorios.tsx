import { useEffect, useMemo, useState } from "react";
import { resumoAgenda, capacidadeMax, dedupeApts, hojeISO, statusOf } from "@/lib/indicadores";
import { format, startOfMonth, subMonths } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { BarChart3, Printer } from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Card, Button } from "@/components/ui-custom";
import {
  listPatients, listWaitingList, listAppointments, listProfessionals, listProfessionalsCapacity,
  type Patient, type WaitingListEntry, type AppointmentListItem, type Professional,
} from "@/lib/arco-rpc";
import { isTransportSpecialty } from "@/lib/specialty-colors";

type Cap = Awaited<ReturnType<typeof listProfessionalsCapacity>>[number];
const REAGENDADO = new Set(["remarcado", "remanejado"]);
const hoje = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const dias = (iso: string) => Math.max(0, Math.round((Date.parse(hoje()) - Date.parse(iso)) / 86_400_000));

export default function Relatorios() {
  useDocumentTitle("Relatórios");
  const [from, setFrom] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [to, setTo] = useState(hoje);
  const [esp, setEsp] = useState("__all__");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [fila, setFila] = useState<WaitingListEntry[]>([]);
  const [profs, setProfs] = useState<Professional[]>([]);
  const [cap, setCap] = useState<Cap[]>([]);
  const [apts, setApts] = useState<AppointmentListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listPatients().then(setPatients).catch(() => {});
    listWaitingList().then(setFila).catch(() => {});
    listProfessionals().then(setProfs).catch(() => {});
    listProfessionalsCapacity().then(setCap).catch(() => {});
  }, []);
  useEffect(() => {
    if (!from || !to || from > to) return;
    setLoading(true);
    listAppointments({ dateFrom: from, dateTo: to }).then(setApts).catch(() => setApts([])).finally(() => setLoading(false));
  }, [from, to]);

  const profSpec = useMemo(() => new Map(profs.map((p) => [p.id, p.specialty ?? ""])), [profs]);
  const especialidades = useMemo(() => Array.from(new Set([...profs.map((p) => p.specialty), ...fila.map((w) => w.specialty)].filter((s): s is string => !!s && !isTransportSpecialty(s)))).sort(), [profs, fila]);

  const r = useMemo(() => {
    const aptsC = apts.filter((a) => {
      const s = profSpec.get(a.professionalId) ?? "";
      return !isTransportSpecialty(s) && (esp === "__all__" || s === esp);
    });
    const resumo = resumoAgenda(aptsC);
    const filaC = fila.filter((w) => esp === "__all__" || w.specialty === esp);
    const filaAtiva = filaC.filter((w) => !w.paused);
    const capC = cap.filter((c) => !isTransportSpecialty(c.specialty) && (esp === "__all__" || c.specialty === esp));
    const capMax = capC.reduce((s, c) => s + capacidadeMax(c), 0);
    const capCur = capC.reduce((s, c) => s + c.currentPatients, 0);
    const porEsp: Record<string, { fila: number; espera: number[] }> = {};
    for (const a of aptsC) {
      const s = profSpec.get(a.professionalId) || "Sem especialidade";
      porEsp[s] ??= { fila: 0, espera: [] };
    }
    for (const w of filaAtiva) {
      const s = w.specialty || "Sem especialidade";
      const e = (porEsp[s] ??= { fila: 0, espera: [] });
      e.fila++; if (w.entryDate) e.espera.push(dias(w.entryDate));
    }
    const esperas = filaAtiva.filter((w) => w.entryDate).map((w) => dias(w.entryDate));
    const meses: { mes: string; entradas: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const m = format(subMonths(new Date(), i), "yyyy-MM");
      meses.push({ mes: m.split("-").reverse().join("/"), entradas: filaC.filter((w) => (w.entryDate || "").startsWith(m)).length });
    }
    return {
      cadastradas: patients.length,
      realizados: resumo.realizados,
      faltas: resumo.faltas,
      justificadas: resumo.justificadas,
      cancelados: resumo.cancelados,
      reagendados: dedupeApts(aptsC).filter((a) => a.date <= hojeISO() && REAGENDADO.has(statusOf(a))).length,
      ocupacao: capMax > 0 ? Math.round((capCur / capMax) * 100) : 0,
      vagas: capC.reduce((s, c) => s + Math.max(0, capacidadeMax(c) - c.currentPatients), 0),
      prioritarios: filaAtiva.filter((w) => w.prioridadeMaxima).length,
      aguardando: filaAtiva.length,
      esperaMedia: esperas.length ? Math.round(esperas.reduce((s, d) => s + d, 0) / esperas.length) : 0,
      porEsp: Object.entries(porEsp).map(([s, v]) => ({
        s, atendidas: resumoAgenda(aptsC.filter((a) => (profSpec.get(a.professionalId) || "Sem especialidade") === s)).pacientesAtendidos, fila: v.fila,
        espera: v.espera.length ? Math.round(v.espera.reduce((a, b) => a + b, 0) / v.espera.length) : 0,
      })).sort((a, b) => b.fila + b.atendidas - (a.fila + a.atendidas)),
      meses,
    };
  }, [apts, fila, cap, patients, profSpec, esp]);

  const kpis: [string, string | number][] = [
    ["Crianças cadastradas", r.cadastradas], ["Aguardando na fila", r.aguardando],
    ["Tempo médio de espera", `${r.esperaMedia} dias`], ["Prioridade máxima na fila", r.prioritarios],
    ["Atendimentos realizados", r.realizados], ["Faltas não justificadas", r.faltas], ["Faltas justificadas", r.justificadas],
    ["Cancelamentos", r.cancelados], ["Reagendamentos", r.reagendados],
    ["Ocupação", `${r.ocupacao}%`],
  ];
  const inp = "rounded-xl border border-border bg-card px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-display font-bold flex items-center gap-2"><BarChart3 className="w-7 h-7 text-primary" /> Relatórios</h1>
          <p className="text-muted-foreground mt-1">Indicadores calculados com os dados atuais do sistema.</p>
        </div>
        <Button variant="outline" className="gap-2 print:hidden" onClick={() => window.print()}><Printer className="w-4 h-4" /> Imprimir</Button>
      </div>
      <Card className="p-4 flex flex-wrap items-end gap-3 print:hidden">
        <label className="text-xs font-semibold text-muted-foreground">De<br /><input type="date" className={inp} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-xs font-semibold text-muted-foreground">Até<br /><input type="date" className={inp} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="text-xs font-semibold text-muted-foreground">Especialidade<br />
          <select className={inp} value={esp} onChange={(e) => setEsp(e.target.value)}>
            <option value="__all__">Todas</option>
            {especialidades.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        {loading && <span className="text-xs text-muted-foreground animate-pulse">Carregando atendimentos…</span>}
      </Card>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpis.map(([t, v]) => (
          <Card key={t} className="kpi-card p-4">
            <p className="text-[11px] font-semibold text-muted-foreground">{t}</p>
            <p className="text-2xl font-bold font-display">{v}</p>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Atendimentos e faltas seguem os mesmos critérios do Painel de Gestão, até hoje. Justificadas ficam separadas. Prioridade máxima conta apenas a marcação social/idade; não representa todas as cores da fila nem o nível do ABC. Fila e ocupação refletem a situação atual.</p>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-bold mb-3">Crianças por especialidade</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground uppercase"><tr><th className="text-left py-2">Especialidade</th><th className="text-right">Atendidas no período</th><th className="text-right">Na fila</th><th className="text-right">Espera média</th></tr></thead>
              <tbody>
                {r.porEsp.map((x) => (
                  <tr key={x.s} className="border-t border-border"><td className="py-2">{x.s}</td><td className="text-right">{x.atendidas}</td><td className="text-right">{x.fila}</td><td className="text-right">{x.espera} d</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="font-bold mb-1">Evolução da fila</h3>
          <p className="text-xs text-muted-foreground mb-3">Entradas por mês de quem ainda está na fila (últimos 6 meses).</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={r.meses}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip />
                <Bar dataKey="entradas" name="Entradas" fill="#22d3ee" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
