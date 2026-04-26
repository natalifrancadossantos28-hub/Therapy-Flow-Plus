import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, CalendarDays, X } from "lucide-react";
import { listAppointments, listProfessionals, type AppointmentListItem, type Professional } from "@/lib/arco-rpc";
import { supabase } from "@/lib/supabase";
import { Card, Button } from "@/components/ui-custom";
import { cn } from "@/lib/utils";

// Visão mensal do Admin: mostra todos os atendimentos de todos os profissionais
// num grid de mês inteiro. Reflete em tempo real qualquer mudança feita no
// Portal do Profissional ou na Recepção.

const STATUS_STYLE: Record<string, { label: string; cls: string; dot: string }> = {
  agendado:               { label: "Agendado",          cls: "bg-blue-500/15 text-blue-300 border-blue-500/30",     dot: "bg-blue-400" },
  atendimento:            { label: "Em atendimento",    cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", dot: "bg-emerald-400" },
  presente:               { label: "Presente",          cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", dot: "bg-emerald-400" },
  ausente:                { label: "Ausente",           cls: "bg-amber-500/15 text-amber-300 border-amber-500/30",  dot: "bg-amber-400" },
  falta_justificada:      { label: "Falta justificada", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30",  dot: "bg-amber-400" },
  falta_nao_justificada:  { label: "Falta",             cls: "bg-red-500/15 text-red-300 border-red-500/30",        dot: "bg-red-400" },
  cancelado:              { label: "Cancelado",         cls: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",     dot: "bg-zinc-400" },
  desmarcado:             { label: "Desmarcado",        cls: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",     dot: "bg-zinc-400" },
  remanejado:             { label: "Remanejado",        cls: "bg-orange-500/15 text-orange-300 border-orange-500/30", dot: "bg-orange-400" },
  remarcado:              { label: "Remarcado",         cls: "bg-orange-500/15 text-orange-300 border-orange-500/30", dot: "bg-orange-400" },
  alta:                   { label: "Alta",              cls: "bg-purple-500/15 text-purple-300 border-purple-500/30", dot: "bg-purple-400" },
};

function statusOf(s: string | null | undefined) {
  const key = (s ?? "agendado").toLowerCase();
  return STATUS_STYLE[key] ?? { label: s ?? "—", cls: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30", dot: "bg-zinc-400" };
}

const WEEKDAY_HEADERS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export default function AgendaMensal() {
  const [monthRef, setMonthRef] = useState<Date>(() => new Date());
  const [profFilter, setProfFilter] = useState<string>(""); // "" = todos
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [appointments, setAppointments] = useState<AppointmentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Grid: do início da semana do dia 1 até o fim da semana do último dia.
  const monthStart = startOfMonth(monthRef);
  const monthEnd = endOfMonth(monthRef);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days = useMemo(() => {
    const out: Date[] = [];
    let d = gridStart;
    while (d <= gridEnd) {
      out.push(d);
      d = addDays(d, 1);
    }
    return out;
  }, [gridStart.getTime(), gridEnd.getTime()]);

  useEffect(() => {
    listProfessionals().then(setProfessionals).catch(console.error);
  }, []);

  const fetchAppointments = () => {
    setLoading(true);
    listAppointments({
      dateFrom: format(gridStart, "yyyy-MM-dd"),
      dateTo: format(gridEnd, "yyyy-MM-dd"),
      professionalId: profFilter ? parseInt(profFilter) : null,
    })
      .then(setAppointments)
      .catch((e) => {
        console.error(e);
        setAppointments([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAppointments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthRef, profFilter]);

  // Realtime: qualquer mudança em appointments dispara reload (com debounce).
  // Sem filter: o Admin precisa ver TODOS os profissionais ao mesmo tempo.
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!supabase) return;
    const scheduleReload = () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = setTimeout(() => fetchAppointments(), 400);
    };
    const channel = supabase
      .channel("agenda-mensal-admin")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        scheduleReload
      )
      .subscribe();
    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profFilter, monthRef]);

  // Indexa por data (yyyy-MM-dd) para lookup O(1) na grade.
  const byDate = useMemo(() => {
    const m = new Map<string, AppointmentListItem[]>();
    for (const a of appointments) {
      const k = a.date;
      const arr = m.get(k);
      if (arr) arr.push(a);
      else m.set(k, [a]);
    }
    // Ordena cada dia por hora.
    for (const arr of m.values()) arr.sort((x, y) => x.time.localeCompare(y.time));
    return m;
  }, [appointments]);

  const goPrev = () => setMonthRef((d) => addMonths(d, -1));
  const goNext = () => setMonthRef((d) => addMonths(d, 1));
  const goToday = () => setMonthRef(new Date());

  const today = new Date();
  const monthLabel = format(monthRef, "MMMM 'de' yyyy", { locale: ptBR });

  // Estatísticas do mês (só do mês corrente, ignora dias overflow).
  const monthStats = useMemo(() => {
    let total = 0;
    const perStatus: Record<string, number> = {};
    for (const a of appointments) {
      const d = new Date(a.date + "T00:00:00");
      if (!isSameMonth(d, monthRef)) continue;
      total++;
      const k = (a.status ?? "agendado").toLowerCase();
      perStatus[k] = (perStatus[k] ?? 0) + 1;
    }
    return { total, perStatus };
  }, [appointments, monthRef]);

  const selectedAppointments = selectedDay ? byDate.get(selectedDay) ?? [] : [];

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
            <CalendarDays className="w-7 h-7 text-primary" />
            Agenda Mensal
          </h1>
          <p className="text-muted-foreground mt-1">
            Visão macro: todos os profissionais, todas as semanas, atualizado em tempo real.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={profFilter}
            onChange={(e) => setProfFilter(e.target.value)}
            className="bg-card border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Todos os profissionais</option>
            {professionals.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.name}{p.specialty ? ` — ${p.specialty}` : ""}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={goPrev}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            Hoje
          </Button>
          <Button variant="outline" size="sm" onClick={goNext}>
            Próximo <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-display font-bold text-foreground capitalize">{monthLabel}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {loading
                ? "Carregando…"
                : `${monthStats.total} atendimento(s) no mês`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap text-xs">
            {Object.entries(monthStats.perStatus).map(([k, n]) => {
              const s = statusOf(k);
              return (
                <span key={k} className={cn("px-2 py-1 rounded-lg border font-medium", s.cls)}>
                  {s.label}: {n}
                </span>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAY_HEADERS.map((w) => (
            <div key={w} className="text-xs font-semibold text-muted-foreground text-center py-1">
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const dateKey = format(d, "yyyy-MM-dd");
            const inMonth = isSameMonth(d, monthRef);
            const isToday = isSameDay(d, today);
            const apts = byDate.get(dateKey) ?? [];
            // Conta por status para mini-barras.
            const counts: Record<string, number> = {};
            for (const a of apts) {
              const k = (a.status ?? "agendado").toLowerCase();
              counts[k] = (counts[k] ?? 0) + 1;
            }
            return (
              <button
                key={dateKey}
                onClick={() => apts.length > 0 && setSelectedDay(dateKey)}
                className={cn(
                  "min-h-[96px] p-2 rounded-xl border text-left transition-all",
                  inMonth ? "bg-card border-border" : "bg-card/30 border-border/40 text-muted-foreground/60",
                  isToday && "ring-2 ring-primary border-primary/50",
                  apts.length > 0 ? "hover:bg-secondary/60 cursor-pointer" : "cursor-default opacity-90",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn("text-sm font-bold", isToday && "text-primary")}>
                    {format(d, "d")}
                  </span>
                  {apts.length > 0 && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-primary/15 text-primary border border-primary/30">
                      {apts.length}
                    </span>
                  )}
                </div>
                {apts.length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {Object.entries(counts).slice(0, 3).map(([k, n]) => {
                      const s = statusOf(k);
                      return (
                        <div key={k} className="flex items-center gap-1.5 text-[10px] text-foreground/80">
                          <span className={cn("w-1.5 h-1.5 rounded-full", s.dot)} />
                          <span className="truncate">{s.label}</span>
                          <span className="ml-auto font-semibold">{n}</span>
                        </div>
                      );
                    })}
                    {Object.keys(counts).length > 3 && (
                      <div className="text-[10px] text-muted-foreground">
                        +{Object.keys(counts).length - 3} status…
                      </div>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {selectedDay && (
        <DayDetailModal
          dateKey={selectedDay}
          appointments={selectedAppointments}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}

function DayDetailModal({
  dateKey,
  appointments,
  onClose,
}: {
  dateKey: string;
  appointments: AppointmentListItem[];
  onClose: () => void;
}) {
  const d = new Date(dateKey + "T00:00:00");
  const label = format(d, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-lg font-display font-bold text-foreground capitalize">{label}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {appointments.length} atendimento(s) no dia
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary text-foreground/70">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-4 space-y-2">
          {appointments.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-8">
              Nenhum atendimento neste dia.
            </div>
          )}
          {appointments.map((a) => {
            const s = statusOf(a.status);
            return (
              <div
                key={a.id}
                className="flex items-start gap-3 p-3 rounded-xl bg-secondary/40 border border-border"
              >
                <div className="text-sm font-mono font-bold text-primary w-14 shrink-0">{a.time?.slice(0, 5)}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-foreground truncate">{a.patientName}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {a.professionalName || "—"}
                  </div>
                  {a.notes && (
                    <div className="text-xs text-muted-foreground mt-1 italic">"{a.notes}"</div>
                  )}
                </div>
                <span className={cn("px-2 py-1 rounded-lg border text-xs font-medium whitespace-nowrap", s.cls)}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
