import { useMemo, useState } from "react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { MotionCard } from "@/components/ui-custom";
import { HeartHandshake, Bell } from "lucide-react";
import {
  AWARENESS_DATES,
  CATEGORY_COLOR,
  MONTH_NAMES,
  dateLabel,
  awarenessOnToday,
  upcomingAwareness,
  type AwarenessCategory,
} from "@/lib/awareness-dates";

const CATEGORIES = Object.keys(CATEGORY_COLOR) as AwarenessCategory[];

export default function DatasConscientizacaoPage() {
  useDocumentTitle("Datas de Conscientização");

  const todayISO = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [filter, setFilter] = useState<AwarenessCategory | "Todas">("Todas");

  const todayDates = useMemo(() => awarenessOnToday(todayISO), [todayISO]);
  const upcoming = useMemo(() => upcomingAwareness(todayISO, 6), [todayISO]);

  const currentMonth = parseInt(todayISO.split("-")[1]);
  const currentDay = parseInt(todayISO.split("-")[2]);

  const isToday = (month: number, day: number, endDay?: number) =>
    month === currentMonth && (endDay ? currentDay >= day && currentDay <= endDay : currentDay === day);

  const byMonth = useMemo(() => {
    const groups: Record<number, typeof AWARENESS_DATES> = {};
    for (const d of AWARENESS_DATES) {
      if (filter !== "Todas" && d.category !== filter) continue;
      (groups[d.month] ??= []).push(d);
    }
    for (const m of Object.keys(groups)) groups[Number(m)].sort((a, b) => a.day - b.day);
    return groups;
  }, [filter]);

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <HeartHandshake className="w-6 h-6 text-primary" />
          Datas de Conscientização
        </h1>
        <p className="text-sm text-foreground/60 mt-1">
          Calendário anual das datas de conscientização sobre deficiência (Autismo, Down, Surdez,
          Cegueira, Deficiência Física e Intelectual, Saúde Mental e mais).
        </p>
      </div>

      {/* ── Hoje ─────────────────────────────────────────────────── */}
      {todayDates.length > 0 && (
        <MotionCard className="p-5" style={{ border: "1px solid rgba(168,85,247,0.45)", background: "rgba(168,85,247,0.08)" }}>
          <h2 className="text-lg font-bold flex items-center gap-2 mb-3" style={{ color: "#c084fc" }}>
            <Bell className="w-5 h-5" /> Hoje é dia de conscientização!
          </h2>
          <ul className="space-y-2">
            {todayDates.map((d, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: CATEGORY_COLOR[d.category] }} />
                <span className="font-semibold text-foreground">{d.title}</span>
              </li>
            ))}
          </ul>
        </MotionCard>
      )}

      {/* ── Próximas ─────────────────────────────────────────────── */}
      <MotionCard className="p-5">
        <h2 className="text-lg font-bold text-foreground mb-3">Próximas datas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {upcoming.map(({ date, when, daysUntil }, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border border-border p-3"
              style={daysUntil === 0 ? { borderColor: "rgba(168,85,247,0.5)", background: "rgba(168,85,247,0.06)" } : undefined}
            >
              <div className="flex flex-col items-center justify-center rounded-lg px-2.5 py-1 text-white text-xs font-bold shrink-0" style={{ background: CATEGORY_COLOR[date.category] }}>
                {dateLabel(date)}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-foreground text-sm leading-tight">{date.title}</div>
                <div className="text-xs text-foreground/60">{when} • {date.category}</div>
              </div>
            </div>
          ))}
        </div>
      </MotionCard>

      {/* ── Filtro por categoria ─────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter("Todas")}
          className="px-3 py-1 rounded-full text-xs font-semibold border transition-colors"
          style={filter === "Todas" ? { background: "#6366f1", color: "#fff", borderColor: "#6366f1" } : { borderColor: "var(--border)" }}
        >
          Todas
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className="px-3 py-1 rounded-full text-xs font-semibold border transition-colors flex items-center gap-1.5"
            style={filter === c ? { background: CATEGORY_COLOR[c], color: "#fff", borderColor: CATEGORY_COLOR[c] } : { borderColor: "var(--border)" }}
          >
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: filter === c ? "#fff" : CATEGORY_COLOR[c] }} />
            {c}
          </button>
        ))}
      </div>

      {/* ── Calendário por mês ───────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {MONTH_NAMES.map((name, idx) => {
          const month = idx + 1;
          const items = byMonth[month] ?? [];
          if (items.length === 0) return null;
          return (
            <MotionCard key={month} className="p-4">
              <h3 className={`font-bold mb-3 ${month === currentMonth ? "text-primary" : "text-foreground"}`}>{name}</h3>
              <ul className="space-y-2.5">
                {items.map((d, i) => {
                  const highlight = isToday(d.month, d.day, d.endDay);
                  return (
                    <li key={i} className="flex items-start gap-2.5">
                      <div
                        className="flex items-center justify-center rounded-md px-1.5 py-0.5 text-white text-[11px] font-bold shrink-0 min-w-[42px] text-center"
                        style={{ background: CATEGORY_COLOR[d.category] }}
                      >
                        {dateLabel(d)}
                      </div>
                      <span className={`text-sm leading-tight ${highlight ? "font-bold text-primary" : "text-foreground/90"}`}>
                        {d.title}
                        {highlight && " ⭐"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </MotionCard>
          );
        })}
      </div>

      <p className="text-xs text-foreground/40">
        Fontes: Calendário da Acessibilidade (UFC) e Calendário da Saúde (Ministério da Saúde).
      </p>
    </div>
  );
}
