import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Users, Hourglass, CalendarClock, CheckCircle2, XCircle, DoorOpen, ShieldAlert, Stethoscope } from "lucide-react";
import type { Patient, Professional, WaitingListEntry } from "@/lib/arco-rpc";
import { listFilaIndicadores, type FilaIndicador } from "@/lib/fila-indicadores";
import { isTransportSpecialty } from "@/lib/specialty-colors";

type Apt = { professionalId: number; status: string; date?: string };
type Ocup = { specialty: string; pacientesAtivos: number; capacidade: number };
type Periodo = "hoje" | "semana" | "mes" | "ano";

const REALIZADO = new Set(["atendimento", "presente", "alta"]);
const FALTA = new Set(["ausente", "falta_nao_justificada"]);
const CANCELADO = new Set(["cancelado", "desmarcado"]);

export function DashboardKpis(props: {
  patients: Patient[]; professionals: Professional[]; waitingList: WaitingListEntry[];
  today: Apt[]; week: Apt[]; month: Apt[]; year: Apt[]; ocupacao: Ocup[];
}) {
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [especialidade, setEspecialidade] = useState("__all__");
  const [situacao, setSituacao] = useState("__all__");
  const [ind, setInd] = useState<Record<string, FilaIndicador>>({});
  useEffect(() => { listFilaIndicadores().then(setInd).catch(() => {}); }, []);

  const profSpec = useMemo(() => new Map(props.professionals.map((p) => [p.id, p.specialty ?? ""])), [props.professionals]);
  const especialidades = useMemo(() => Array.from(new Set(props.professionals.map((p) => p.specialty).filter((s): s is string => !!s && !isTransportSpecialty(s)))).sort(), [props.professionals]);
  const situacoes = useMemo(() => Array.from(new Set(props.patients.map((p) => p.status).filter(Boolean) as string[])).sort(), [props.patients]);

  const k = useMemo(() => {
    const bySpec = <T extends { professionalId: number }>(rows: T[]) =>
      especialidade === "__all__" ? rows : rows.filter((a) => profSpec.get(a.professionalId) === especialidade);
    const periodRows = bySpec(periodo === "hoje" ? props.today : periodo === "semana" ? props.week : periodo === "mes" ? props.month : props.year);
    const st = (a: Apt) => (a.status || "agendado").toLowerCase();
    const todayRows = bySpec(props.today).filter((a) => !CANCELADO.has(st(a)));
    const fila = especialidade === "__all__" ? props.waitingList : props.waitingList.filter((w) => w.specialty === especialidade);
    const ocup = especialidade === "__all__" ? props.ocupacao : props.ocupacao.filter((o) => o.specialty === especialidade);
    return {
      criancas: situacao === "__all__" ? props.patients.length : props.patients.filter((p) => p.status === situacao).length,
      aguardando: new Set(fila.map((w) => w.patientId)).size,
      hoje: todayRows.length,
      realizados: periodRows.filter((a) => REALIZADO.has(st(a))).length,
      faltas: periodRows.filter((a) => FALTA.has(st(a))).length,
      vagas: ocup.reduce((s, o) => s + Math.max(0, o.capacidade - o.pacientesAtivos), 0),
      prioritarios: new Set(fila.filter((w) => {
        const n = ind[String(w.patientId)]?.prioridade?.nivel;
        return w.prioridadeMaxima || n === "maxima" || n === "elevada";
      }).map((w) => w.patientId)).size,
      profissionais: new Set(todayRows.map((a) => a.professionalId)).size,
    };
  }, [props, periodo, especialidade, situacao, profSpec, ind]);

  const periodoLabel = { hoje: "hoje", semana: "na semana", mes: "no mês", ano: "no ano" }[periodo];
  const cards = [
    { t: "Crianças cadastradas", v: k.criancas, s: situacao === "__all__" ? "todas as situações" : situacao, I: Users, c: "#a78bfa" },
    { t: "Aguardando atendimento", v: k.aguardando, s: "na fila de espera", I: Hourglass, c: "#f59e0b" },
    { t: "Atendimentos de hoje", v: k.hoje, s: "agendados para hoje", I: CalendarClock, c: "#38bdf8" },
    { t: "Atendimentos realizados", v: k.realizados, s: periodoLabel, I: CheckCircle2, c: "#34d399" },
    { t: "Faltas", v: k.faltas, s: periodoLabel, I: XCircle, c: "#f87171" },
    { t: "Vagas disponíveis", v: k.vagas, s: "pela capacidade dos profissionais", I: DoorOpen, c: "#22d3ee" },
    { t: "Avaliação prioritária", v: k.prioritarios, s: "na fila com prioridade máxima/elevada", I: ShieldAlert, c: "#fb7185" },
    { t: "Profissionais em atendimento", v: k.profissionais, s: "com agenda hoje", I: Stethoscope, c: "#60a5fa" },
  ];
  const sel = "rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <section aria-label="Indicadores principais" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-border bg-card p-1">
          {(["hoje", "semana", "mes", "ano"] as Periodo[]).map((p) => (
            <button key={p} type="button" onClick={() => setPeriodo(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${periodo === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {{ hoje: "Hoje", semana: "Semana", mes: "Mês", ano: "Ano" }[p]}
            </button>
          ))}
        </div>
        <select aria-label="Especialidade" className={sel} value={especialidade} onChange={(e) => setEspecialidade(e.target.value)}>
          <option value="__all__">Todas as especialidades</option>
          {especialidades.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select aria-label="Situação" className={sel} value={situacao} onChange={(e) => setSituacao(e.target.value)}>
          <option value="__all__">Todas as situações</option>
          {situacoes.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c, i) => (
          <motion.div key={c.t} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
            className="kpi-card bg-card border border-border p-4 flex items-center gap-3">
            <div className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center" style={{ background: `${c.c}1f`, color: c.c }}>
              <c.I className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-muted-foreground leading-tight">{c.t}</p>
              <p className="text-2xl font-bold font-display leading-tight">{c.v}</p>
              <p className="text-[10.5px] text-muted-foreground/80 truncate">{c.s}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
