import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  CalendarClock, MessageSquare, Search, Bus, Copy, Check, X, Send, TrendingUp, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  listAppointments,
  listWaitingList,
  listBuscaAtivaCasos,
  type AppointmentListItem,
  type AppointmentToday,
  type Ausencia,
  type Feriado,
  type Patient,
  type Professional,
  type WaitingListEntry,
  type BuscaAtivaCaso,
} from "@/lib/arco-rpc";
import { casoAberto } from "@/lib/busca-ativa";
import { isBlocked, holidayOn } from "@/lib/blocked-dates";
import { isHiddenByPatientStatus, worksThroughLunch } from "@/lib/schedule";
import { isTransportSpecialty, specialtyKey } from "@/lib/specialty-colors";
import { MotionCard } from "@/components/ui-custom";
import { cn, todayBR } from "@/lib/utils";

const UNIDADE = "Núcleo de Atendimento Novo Arco-íris 🌈";

const TIME_SLOTS = [
  "07:10", "08:00", "08:50", "09:40", "10:30", "11:20",
  "12:10",
  "13:10", "14:00", "14:50", "15:40", "16:30",
];

/** Status em que o horário não está ocupado (vaga liberada). */
// "remanejado"/"remarcado" ficam gravados no NOVO horário, que está ocupado.
const LIVRE_STATUSES = ["desmarcado", "cancelado"];

export function waPhone(p: string | null | undefined): string {
  const digits = (p ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("55") && digits.length >= 12 ? digits : `55${digits}`;
}

export function openWhatsApp(phone: string | null | undefined, msg: string) {
  const ph = waPhone(phone);
  const url = ph
    ? `https://wa.me/${ph}?text=${encodeURIComponent(msg)}`
    : `https://web.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
  const w = window.open(url, "whatsapp_nfs");
  if (w) w.focus();
}

function firstName(name: string): string {
  return (name || "").trim().split(/\s+/)[0] || name;
}

function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
}

/** Próximo dia útil (pula sábado, domingo e feriado). */
export function nextWorkingDay(from: string, feriados: Feriado[]): string {
  let d = addDaysISO(from, 1);
  for (let i = 0; i < 14; i++) {
    const wd = new Date(`${d}T12:00:00`).getDay();
    if (wd !== 0 && wd !== 6 && !holidayOn(d, feriados)) return d;
    d = addDaysISO(d, 1);
  }
  return d;
}

/** "amanhã, terça-feira (24/11)" ou "na segunda-feira (30/11)". */
function diaTexto(date: string, today: string): string {
  const d = new Date(`${date}T12:00:00`);
  const wd = d.toLocaleDateString("pt-BR", { weekday: "long" });
  const dm = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return date === addDaysISO(today, 1) ? `amanhã, ${wd} (${dm})` : `${wd} (${dm})`;
}

function nowHHMM(): string {
  return new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false });
}

// ── Envio em massa ─────────────────────────────────────────────────────────

export type Envio = { key: string; name: string; sub?: string; phone: string | null; message: string };

function sentStorageKey(listId: string) {
  return `nfs_envios_${listId}_${todayBR()}`;
}

function useSentSet(listId: string) {
  const [sent, setSent] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(sentStorageKey(listId)) || "[]")); } catch { return new Set(); }
  });
  const mark = (key: string) => setSent(prev => {
    const n = new Set(prev); n.add(key);
    try { localStorage.setItem(sentStorageKey(listId), JSON.stringify([...n])); } catch { /* sem storage */ }
    return n;
  });
  const unmark = (key: string) => setSent(prev => {
    const n = new Set(prev); n.delete(key);
    try { localStorage.setItem(sentStorageKey(listId), JSON.stringify([...n])); } catch { /* sem storage */ }
    return n;
  });
  return { sent, mark, unmark };
}

export function EnvioEmMassaModal({
  listId, titulo, descricao, envios, onClose,
}: { listId: string; titulo: string; descricao?: string; envios: Envio[]; onClose: () => void }) {
  const { sent, mark, unmark } = useSentSet(listId);
  const [aberto, setAberto] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const comTelefone = envios.filter(e => waPhone(e.phone));
  const pendentes = comTelefone.filter(e => !sent.has(e.key));
  const enviar = (e: Envio) => { openWhatsApp(e.phone, e.message); mark(e.key); };
  const copiar = (e: Envio) => {
    navigator.clipboard.writeText(e.message).catch(() => {});
    setCopiado(e.key);
    setTimeout(() => setCopiado(null), 1500);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <MotionCard
        className="w-full max-w-2xl max-h-[88vh] flex flex-col shadow-2xl"
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        onClick={(ev: React.MouseEvent) => ev.stopPropagation()}
      >
        <div className="p-5 border-b border-border flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
            <Send className="w-5 h-5 text-green-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold">{titulo}</h2>
            {descricao && <p className="text-xs text-muted-foreground mt-0.5">{descricao}</p>}
            <p className="text-xs text-muted-foreground mt-1">
              {comTelefone.length - pendentes.length} de {comTelefone.length} enviados hoje
              {envios.length > comTelefone.length && ` · ${envios.length - comTelefone.length} sem telefone`}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Fechar"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 border-b border-border">
          <button
            disabled={pendentes.length === 0}
            onClick={() => pendentes[0] && enviar(pendentes[0])}
            className="w-full h-11 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-green-500 to-emerald-600 shadow-lg shadow-green-500/20 hover:opacity-95 disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <MessageSquare className="w-4 h-4" />
            {pendentes.length === 0 ? "Todos enviados" : `Enviar próxima — ${pendentes[0].name} (${pendentes.length} faltando)`}
          </button>
          <p className="text-[11px] text-muted-foreground mt-2 text-center">
            Cada clique abre o WhatsApp com a mensagem pronta; é só apertar enviar lá e voltar aqui para a próxima. Se não chegou a enviar, clique em "Enviado" para voltar para a lista.
          </p>
        </div>

        <div className="overflow-y-auto p-3 space-y-2">
          {envios.map(e => {
            const ok = sent.has(e.key);
            const temTel = !!waPhone(e.phone);
            return (
              <div key={e.key} className={cn("rounded-xl border p-3", ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-border/60")}>
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{e.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {e.sub ? `${e.sub} · ` : ""}{e.phone || "sem telefone no cadastro"}
                    </p>
                  </div>
                  <button onClick={() => setAberto(aberto === e.key ? null : e.key)} className="text-[11px] font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1">
                    Ver {aberto === e.key ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  <button onClick={() => copiar(e)} className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground" title="Copiar mensagem">
                    {copiado === e.key ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    disabled={!temTel}
                    onClick={() => (ok ? unmark(e.key) : enviar(e))}
                    title={ok ? "Não enviou? Clique para voltar para a lista" : "Abrir WhatsApp com a mensagem"}
                    className={cn(
                      "h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-40",
                      ok ? "border border-emerald-500/40 text-emerald-400" : "bg-green-600 text-white hover:bg-green-700",
                    )}
                  >
                    {ok ? <><Check className="w-3.5 h-3.5" /> Enviado</> : <><MessageSquare className="w-3.5 h-3.5" /> Enviar</>}
                  </button>
                </div>
                {aberto === e.key && (
                  <p className="text-xs leading-relaxed whitespace-pre-line mt-2 p-2.5 rounded-lg bg-background/60 border border-border/40">{e.message}</p>
                )}
              </div>
            );
          })}
          {envios.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Ninguém na lista.</p>}
        </div>
      </MotionCard>
    </div>
  );
}

// ── Cards ──────────────────────────────────────────────────────────────────

function AssistCard({
  icon, cor, titulo, sub, children, className,
}: { icon: React.ReactNode; cor: string; titulo: string; sub?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn("rounded-2xl border p-4 flex flex-col gap-3 bg-card/70 backdrop-blur", className)}
      style={{ borderColor: `${cor}55`, boxShadow: `0 0 24px ${cor}14` }}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: `${cor}26`, color: cor }}>
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="font-bold text-[15px] leading-tight">{titulo}</h3>
          {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

const btnVerde = "w-full h-10 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-green-500 to-emerald-600 shadow-md shadow-green-500/20 hover:opacity-95 disabled:opacity-40 flex items-center justify-center gap-2";
const btnContorno = "w-full h-9 rounded-xl font-semibold text-xs border border-border hover:bg-secondary disabled:opacity-40 flex items-center justify-center gap-2";

type Props = {
  dayAppointments: AppointmentToday[];
  transportByPatient: Map<number, string[]>;
  professionals: Professional[];
  patients: Patient[];
  feriados: Feriado[];
  ausencias: Ausencia[];
  ready: boolean;
};

type Modal = { listId: string; titulo: string; descricao?: string; envios: Envio[] };

export function RecepcaoAssistente({ dayAppointments, transportByPatient, professionals, patients, feriados, ausencias, ready }: Props) {
  const today = todayBR();
  const [modal, setModal] = useState<Modal | null>(null);
  const [fila, setFila] = useState<WaitingListEntry[]>([]);
  const [casos, setCasos] = useState<BuscaAtivaCaso[]>([]);
  const [proximo, setProximo] = useState<AppointmentListItem[] | null>(null);
  const [semana, setSemana] = useState<AppointmentListItem[] | null>(null);
  const [verTodosEncaixes, setVerTodosEncaixes] = useState(false);

  const proximoDia = useMemo(() => nextWorkingDay(today, feriados), [today, feriados]);

  useEffect(() => {
    listWaitingList().then(setFila).catch(console.error);
    listBuscaAtivaCasos().then(setCasos).catch(console.error);
    const wd = new Date(`${today}T12:00:00`).getDay();
    const monday = addDaysISO(today, -((wd + 6) % 7));
    listAppointments({ dateFrom: monday, dateTo: today }).then(setSemana).catch(() => setSemana([]));
  }, [today]);

  useEffect(() => {
    if (!ready) return;
    listAppointments({ date: proximoDia }).then(setProximo).catch(() => setProximo([]));
  }, [proximoDia, ready]);

  const patientById = useMemo(() => new Map(patients.map(p => [p.id, p])), [patients]);
  const profById = useMemo(() => new Map(professionals.map(p => [p.id, p])), [professionals]);
  const phoneOf = (patientId: number, fallback?: string | null) => {
    const p = patientById.get(patientId);
    return p?.guardianPhone || p?.phone || fallback || null;
  };

  // ── Encaixe: horários vagos de hoje + 1º da fila da especialidade ─────
  const encaixes = useMemo(() => {
    const agora = nowHHMM();
    const porProf = new Map<number, AppointmentToday[]>();
    for (const a of dayAppointments) {
      if (isTransportSpecialty(a.professionalSpecialty)) continue;
      porProf.set(a.professionalId, [...(porProf.get(a.professionalId) ?? []), a]);
    }
    const filaAtiva = fila.filter(f => !(f as { paused?: boolean }).paused);
    const ocupadoHoje = new Set(dayAppointments.map(a => `${a.patientId}|${a.time}`));
    const usados = new Set<number>();
    const out: { time: string; prof: string; specialty: string; sugerido: WaitingListEntry }[] = [];
    for (const [profId, apts] of porProf) {
      const prof = profById.get(profId);
      const spec = prof?.specialty || apts[0].professionalSpecialty;
      const key = specialtyKey(spec);
      const manha = apts.some(a => a.time < "12:10");
      const tarde = apts.some(a => a.time > "12:10");
      const ocupados = new Set(
        apts.filter(a => !LIVRE_STATUSES.includes((a.status ?? "").toLowerCase())).map(a => a.time),
      );
      for (const t of TIME_SLOTS) {
        if (t <= agora || ocupados.has(t)) continue;
        if (t === "12:10" && !worksThroughLunch(prof?.name)) continue;
        if ((t < "12:10" && !manha) || (t > "12:10" && !tarde)) continue;
        const sug = filaAtiva.find(f =>
          specialtyKey(f.specialty) === key && !usados.has(f.patientId) && !ocupadoHoje.has(`${f.patientId}|${t}`),
        );
        if (!sug) continue;
        usados.add(sug.patientId);
        out.push({ time: t, prof: apts[0].professionalName, specialty: spec, sugerido: sug });
      }
    }
    return out.sort((a, b) => a.time.localeCompare(b.time));
  }, [dayAppointments, fila, profById]);

  const msgEncaixe = (e: (typeof encaixes)[number]) =>
    `Olá! Aqui é da recepção do ${UNIDADE}\n\n` +
    `Surgiu um horário hoje, às ${e.time}, em ${e.specialty} (${e.prof}), e o(a) ${e.sugerido.patientName} está na nossa fila de espera.\n\n` +
    `Vocês conseguem vir hoje nesse horário? Responda esta mensagem para confirmarmos. Obrigado!`;

  // ── Lembrete do próximo dia ────────────────────────────────────────────
  const lembretes = useMemo<{ todos: Envio[]; van: Envio[] }>(() => {
    if (!proximo) return { todos: [], van: [] };
    const ativos = proximo.filter(a =>
      !a.paused &&
      !LIVRE_STATUSES.includes((a.status ?? "").toLowerCase()) &&
      (a.status ?? "").toLowerCase() !== "pausado" &&
      !isHiddenByPatientStatus(a.patientStatus, a.date, today) &&
      !isBlocked(a.date, a.professionalId, feriados, ausencias),
    );
    const isDriver = (id: number) => isTransportSpecialty(profById.get(id)?.specialty);
    const clinicos = new Map<number, AppointmentListItem[]>();
    const vans = new Map<number, string[]>();
    const vanTimes = new Map<number, string[]>();
    for (const a of ativos) {
      if (isDriver(a.professionalId)) {
        vans.set(a.patientId, [...new Set([...(vans.get(a.patientId) ?? []), a.professionalName])]);
        vanTimes.set(a.patientId, [...new Set([...(vanTimes.get(a.patientId) ?? []), a.time])].sort());
      } else {
        clinicos.set(a.patientId, [...(clinicos.get(a.patientId) ?? []), a]);
      }
    }
    const dia = diaTexto(proximoDia, today);
    const todos: Envio[] = [];
    const van: Envio[] = [];
    for (const [pid, apts] of clinicos) {
      apts.sort((a, b) => a.time.localeCompare(b.time));
      const nome = apts[0].patientName;
      const linhas = apts.map(a => `• ${a.time} — ${profById.get(a.professionalId)?.specialty ?? "Atendimento"} com ${a.professionalName}`).join("\n");
      const motoristas = vans.get(pid);
      const horaVan = (vanTimes.get(pid) ?? [apts[0].time]).join(" e ");
      const phone = apts[0].guardianPhone || phoneOf(pid);
      todos.push({
        key: `lembrete-${pid}`,
        name: nome,
        sub: apts.map(a => a.time).join(", ") + (motoristas ? " · Van" : ""),
        phone,
        message:
          `Olá! Aqui é da recepção do ${UNIDADE}\n\n` +
          `Lembramos que ${firstName(nome)} tem atendimento ${dia}:\n${linhas}\n\n` +
          (motoristas ? `🚐 A van vai buscar ${firstName(nome)} para o horário das ${horaVan} (motorista ${motoristas.join(" / ")}).\n\n` : "") +
          `Por favor, confirme a presença respondendo esta mensagem. Se não for possível vir, avise com antecedência. Obrigado!`,
      });
      if (motoristas) {
        van.push({
          key: `van-${pid}`,
          name: nome,
          sub: `${horaVan} · motorista ${motoristas.join(" / ")}`,
          phone,
          message:
            `Olá! Aqui é da recepção do ${UNIDADE}\n\n` +
            `${dia.charAt(0).toUpperCase()}${dia.slice(1)}, a van (motorista ${motoristas.join(" / ")}) vai buscar ${firstName(nome)} para o atendimento das ${horaVan}.\n\n` +
            `Por favor, responda esta mensagem confirmando. Se ${firstName(nome)} não puder vir, avise a recepção com antecedência: assim o motorista não faz a viagem sem necessidade e consegue buscar as outras crianças no horário.\n\n` +
            `Obrigado pela colaboração!`,
        });
      }
    }
    todos.sort((a, b) => (a.sub ?? "").localeCompare(b.sub ?? ""));
    van.sort((a, b) => (a.sub ?? "").localeCompare(b.sub ?? ""));
    return { todos, van };
  }, [proximo, proximoDia, today, feriados, ausencias, profById, patientById]);

  // ── Busca Ativa ────────────────────────────────────────────────────────
  const buscaEnvios = useMemo<Envio[]>(() => {
    const porPaciente = new Map<number, BuscaAtivaCaso>();
    for (const c of casos.filter(casoAberto)) if (!porPaciente.has(c.patientId)) porPaciente.set(c.patientId, c);
    return [...porPaciente.values()].map(c => ({
      key: `busca-${c.patientId}`,
      name: c.patientName,
      sub: [c.specialty, c.motivo].filter(Boolean).join(" · "),
      phone: c.patientPhone || phoneOf(c.patientId),
      message:
        `Olá${c.guardianName ? `, ${firstName(c.guardianName)}` : ""}! Aqui é da administração do ${UNIDADE}\n\n` +
        `Estamos entrando em contato a respeito do(a) ${c.patientName}. Pedimos, por gentileza, que compareça à unidade assim que possível para conversar com a administração.\n\n` +
        `Se preferir, responda esta mensagem para combinarmos o melhor dia e horário.\n\n` +
        `Atenciosamente,\nAdministração`,
    }));
  }, [casos, patientById]);

  // ── Van: faltas de hoje sem aviso ──────────────────────────────────────
  const faltasVan = useMemo<Envio[]>(() => {
    // O transporte é agendado no mesmo horário do atendimento que a van atende.
    const vanSlots = new Set<string>();
    for (const a of dayAppointments) {
      const st = (a.status ?? "").toLowerCase();
      if (isTransportSpecialty(a.professionalSpecialty) && st !== "desmarcado" && st !== "cancelado") vanSlots.add(`${a.patientId}|${a.time}`);
    }
    const porPaciente = new Map<number, AppointmentToday[]>();
    for (const a of dayAppointments) {
      if (isTransportSpecialty(a.professionalSpecialty) || !transportByPatient.has(a.patientId)) continue;
      if (!vanSlots.has(`${a.patientId}|${a.time}`)) continue;
      porPaciente.set(a.patientId, [...(porPaciente.get(a.patientId) ?? []), a]);
    }
    const out: Envio[] = [];
    for (const [pid, apts] of porPaciente) {
      const st = apts.map(a => (a.status ?? "").toLowerCase());
      const semAviso = st.some(s => s === "ausente" || s === "falta_nao_justificada");
      const avisou = st.some(s => s === "falta_justificada" || s === "justificado" || s === "abonado" || s === "presente");
      if (!semAviso || avisou) continue;
      apts.sort((a, b) => a.time.localeCompare(b.time));
      const nome = apts[0].patientName;
      out.push({
        key: `faltavan-${pid}`,
        name: nome,
        sub: `${apts[0].time} · motorista ${(transportByPatient.get(pid) ?? []).join(" / ")}`,
        phone: phoneOf(pid, apts[0].patientPhone),
        message:
          `Olá! Aqui é da recepção do ${UNIDADE}\n\n` +
          `Hoje ${firstName(nome)} tinha atendimento às ${apts[0].time}, com transporte pela van, e não compareceu. Não recebemos aviso e esperamos que esteja tudo bem.\n\n` +
          `Pedimos, por gentileza, que sempre que ${firstName(nome)} não puder vir, a recepção seja avisada com antecedência pelo WhatsApp. Assim o motorista não faz a viagem sem necessidade e consegue buscar as outras crianças no horário.\n\n` +
          `Contamos com a colaboração de vocês. Obrigado!`,
      });
    }
    return out;
  }, [dayAppointments, transportByPatient, patientById]);

  // ── Resultado da semana ────────────────────────────────────────────────
  const resumoSemana = useMemo(() => {
    if (!semana) return null;
    const dias = ["S", "T", "Q", "Q", "S"];
    const porDia = dias.map(() => ({ p: 0, f: 0 }));
    let p = 0, f = 0;
    for (const a of semana) {
      if (isTransportSpecialty(profById.get(a.professionalId)?.specialty)) continue;
      const wd = new Date(`${a.date}T12:00:00`).getDay();
      if (wd < 1 || wd > 5) continue;
      const s = (a.status ?? "").toLowerCase();
      if (s === "presente") { p++; porDia[wd - 1].p++; }
      else if (s === "ausente" || s === "falta_nao_justificada") { f++; porDia[wd - 1].f++; }
    }
    const pct = p + f > 0 ? Math.round((p / (p + f)) * 100) : null;
    return { pct, p, f, porDia: porDia.map((d, i) => ({ dia: dias[i], pct: d.p + d.f > 0 ? d.p / (d.p + d.f) : null })) };
  }, [semana, profById]);

  const encaixesVisiveis = verTodosEncaixes ? encaixes : encaixes.slice(0, 3);
  const diaLabel = diaTexto(proximoDia, today);

  return (
    <section className="space-y-4">
      <div className="flex items-baseline gap-3">
        <h2 className="text-lg font-bold">Assistente da recepção</h2>
        <span className="text-xs text-muted-foreground">mensagens prontas a partir da agenda</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <AssistCard
          icon={<CalendarClock className="w-5 h-5" />} cor="#8b5cf6"
          titulo="Horários livres para encaixe"
          sub={encaixes.length > 0 ? `${encaixes.length} horário(s) vago(s) hoje com paciente da fila` : "Vagas de hoje x fila de espera"}
        >
          {encaixesVisiveis.map(e => (
            <div key={`${e.time}-${e.prof}`} className="flex items-center gap-3 rounded-xl bg-secondary/40 border border-border/40 p-2.5">
              <span className="font-bold text-sm w-12 shrink-0">{e.time}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate">{e.prof} · {e.specialty}</p>
                <p className="text-[11px] text-muted-foreground truncate">Sugerido: {e.sugerido.patientName}</p>
              </div>
              <button
                onClick={() => openWhatsApp(e.sugerido.patientPhone || phoneOf(e.sugerido.patientId), msgEncaixe(e))}
                className="h-8 px-3 rounded-lg text-xs font-bold text-white bg-gradient-to-br from-violet-500 to-indigo-600 hover:opacity-95 shrink-0"
                title="Oferecer o horário à família pelo WhatsApp"
              >
                Encaixar
              </button>
            </div>
          ))}
          {encaixes.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum horário vago no resto do dia.</p>
          )}
          {encaixes.length > 3 && (
            <button onClick={() => setVerTodosEncaixes(v => !v)} className="text-xs font-semibold text-violet-400 hover:underline self-start">
              {verTodosEncaixes ? "Mostrar menos" : `Ver todos (${encaixes.length})`}
            </button>
          )}
          <p className="text-[11px] text-muted-foreground mt-auto">"Encaixar" abre o WhatsApp oferecendo o horário. Depois de confirmar, marque na <Link href="/agenda" className="underline">Agenda</Link>.</p>
        </AssistCard>

        <AssistCard
          icon={<MessageSquare className="w-5 h-5" />} cor="#22c55e"
          titulo="Lembrete de confirmação"
          sub={proximo === null ? "Carregando a agenda..." : `${lembretes.todos.length} paciente(s) com atendimento ${diaLabel}`}
        >
          <div className="rounded-xl border border-green-500/25 bg-green-500/5 p-3 text-xs leading-relaxed">
            Olá! Lembramos que <strong>[paciente]</strong> tem atendimento {diaLabel}: <strong>[horário] — [especialidade] com [profissional]</strong>. Por favor, confirme a presença...
          </div>
          <p className="text-[11px] text-muted-foreground">Nome, horários e profissionais saem da agenda. Quem vem de van recebe também o aviso do motorista.</p>
          <button
            className={cn(btnVerde, "mt-auto")}
            disabled={lembretes.todos.length === 0}
            onClick={() => setModal({
              listId: `lembrete-${proximoDia}`,
              titulo: `Lembrete — atendimentos de ${diaLabel}`,
              descricao: "Uma mensagem por paciente, com todos os horários do dia.",
              envios: lembretes.todos,
            })}
          >
            <Send className="w-4 h-4" /> Enviar lembrete para todos ({lembretes.todos.length})
          </button>
        </AssistCard>

        <AssistCard
          icon={<Search className="w-5 h-5" />} cor="#f59e0b"
          titulo="Busca Ativa"
          sub={`${buscaEnvios.length} caso(s) em aberto`}
        >
          {buscaEnvios.slice(0, 2).map(e => (
            <div key={e.key} className="flex items-center gap-3 rounded-xl bg-secondary/40 border border-border/40 p-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate">{e.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">{e.sub || "—"}</p>
              </div>
              <button
                disabled={!waPhone(e.phone)}
                onClick={() => openWhatsApp(e.phone, e.message)}
                className="h-8 px-3 rounded-lg text-xs font-bold text-white bg-green-600 hover:bg-green-700 disabled:opacity-40 shrink-0"
              >
                Enviar
              </button>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">
            Mensagem pronta: "Estamos entrando em contato a respeito do(a) [paciente]. Pedimos que compareça à unidade para conversar com a administração."
          </p>
          <div className="mt-auto space-y-2">
            <button
              className={btnVerde}
              disabled={buscaEnvios.length === 0}
              onClick={() => setModal({
                listId: "busca-ativa",
                titulo: "Busca Ativa — chamar para conversar",
                descricao: "Convida a família a comparecer à unidade para conversar com a administração.",
                envios: buscaEnvios,
              })}
            >
              <Send className="w-4 h-4" /> Enviar para todos da Busca Ativa ({buscaEnvios.length})
            </button>
            <Link href="/busca-ativa" className={btnContorno}>Abrir Busca Ativa</Link>
          </div>
        </AssistCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <AssistCard
          className="lg:col-span-2"
          icon={<Bus className="w-5 h-5" />} cor="#3b82f6"
          titulo="Transporte (van)"
          sub={`Faltas de van sem aviso hoje: ${faltasVan.length} · ${lembretes.van.length} criança(s) de van ${diaLabel}`}
        >
          {faltasVan.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhuma falta de van sem aviso hoje. Quando marcar <strong>Falta</strong> em um paciente com a etiqueta azul <strong>Van</strong>, ele aparece aqui com a mensagem pronta para a família.
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              {faltasVan.map(e => (
                <div key={e.key} className="flex items-center gap-3 rounded-xl bg-red-500/5 border border-red-400/30 p-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate">{e.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{e.sub}</p>
                  </div>
                  <button
                    disabled={!waPhone(e.phone)}
                    onClick={() => setModal({ listId: "falta-van", titulo: "Falta de van sem aviso", envios: [e] })}
                    className="h-8 px-3 rounded-lg text-xs font-bold text-white bg-green-600 hover:bg-green-700 disabled:opacity-40 shrink-0"
                  >
                    Avisar família
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-2 mt-auto">
            {faltasVan.length > 1 && (
              <button
                className={cn(btnContorno, "sm:flex-1")}
                onClick={() => setModal({ listId: "falta-van", titulo: "Faltas de van sem aviso — hoje", envios: faltasVan })}
              >
                Avisar todas as faltas de van ({faltasVan.length})
              </button>
            )}
            <button
              className={cn(btnVerde, "sm:flex-1")}
              disabled={lembretes.van.length === 0}
              onClick={() => setModal({
                listId: `van-${proximoDia}`,
                titulo: `Van — confirmar a busca de ${diaLabel}`,
                descricao: "Só para as famílias que vêm de van: pede para confirmar ou avisar antes do motorista sair.",
                envios: lembretes.van,
              })}
            >
              <Send className="w-4 h-4" /> Pedir confirmação a quem vem de van ({lembretes.van.length})
            </button>
          </div>
        </AssistCard>

        <AssistCard icon={<TrendingUp className="w-5 h-5" />} cor="#2dd4bf" titulo="Resultado da semana" sub="presenças x faltas marcadas">
          {resumoSemana?.pct == null ? (
            <p className="text-xs text-muted-foreground">{resumoSemana ? "Ainda sem presenças ou faltas marcadas nesta semana." : "Carregando..."}</p>
          ) : (
            <div className="flex items-end gap-4">
              <div>
                <p className="text-4xl font-extrabold text-teal-300 leading-none">{resumoSemana.pct}%</p>
                <p className="text-[11px] text-muted-foreground mt-1">compareceram · {resumoSemana.p} presenças, {resumoSemana.f} faltas</p>
              </div>
              <div className="flex items-end gap-1.5 ml-auto h-12">
                {resumoSemana.porDia.map((d, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <div className="w-4 h-10 rounded bg-secondary/60 flex items-end overflow-hidden">
                      <div className="w-full rounded bg-gradient-to-t from-teal-500 to-emerald-300" style={{ height: `${Math.round((d.pct ?? 0) * 100)}%` }} />
                    </div>
                    <span className="text-[9px] text-muted-foreground">{d.dia}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </AssistCard>
      </div>

      {modal && (
        <EnvioEmMassaModal
          listId={modal.listId} titulo={modal.titulo} descricao={modal.descricao} envios={modal.envios}
          onClose={() => setModal(null)}
        />
      )}
    </section>
  );
}
