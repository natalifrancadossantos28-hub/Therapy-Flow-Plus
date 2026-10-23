// =============================================================================
// print-agenda.ts — impressão da agenda (Dia / Semana / Mês / Rascunho em branco)
// -----------------------------------------------------------------------------
// Usado tanto no Portal do Profissional (agenda-profissionais.tsx) quanto na
// Agenda Geral / administração (agenda.tsx). Gera uma janela de impressão com
// HTML estático (mesmo visual em ambos) e chama window.print().
// =============================================================================
import { format, startOfWeek, addDays, endOfMonth, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { escHtml as esc, openReportWindow, patientNameHtml } from "@/lib/print-report-shell";

export type AgendaPrintMode = "dia" | "semana" | "mes" | "rascunho";

export type PrintAppointment = {
  date: string;              // YYYY-MM-DD
  time: string;              // HH:MM
  patientId: number;
  patientName?: string | null;
  prontuario?: string | null;
  status: string;
  guardianName?: string | null;
  guardianPhone?: string | null;
};

export interface AgendaPrintOptions {
  mode: AgendaPrintMode;
  professionalName?: string | null;
  specialty?: string | null;
  timeSlots: string[];
  appointments: PrintAppointment[];
  refDate: Date;             // referência p/ dia/semana/mês
  lunchSlot?: string;        // padrão "12:10"
  includeLunch?: boolean;    // se mostra a linha de almoço (padrão true)
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function statusLabel(status: string): string {
  const s = (status || "").toLowerCase();
  const map: Record<string, string> = {
    agendado: "Avaliação",
    ativo: "Em atendimento",
    atendimento: "Em atendimento",
    em_atendimento: "Em atendimento",
    "em atendimento": "Em atendimento",
    presente: "Presente",
    falta: "Falta",
    falta_justificada: "Falta justificada",
    remanejado: "Remanejado",
    remarcado: "Remarcado",
    desmarcado: "Desmarcado",
    cancelado: "Cancelado",
    alta: "Alta",
    pausado: "Pausado",
  };
  return map[s] ?? (status ? cap(status) : "");
}

const aptsAt = (list: PrintAppointment[], date: string, time: string): PrintAppointment[] =>
  list.filter((a) => a.date === date && a.time === time);

/**
 * Linhas da grade impressa: os horários fixos mais qualquer horário que tenha
 * atendimento fora da grade (senão esses pacientes não saem no papel).
 */
function printableSlots(o: AgendaPrintOptions, dates: string[]): string[] {
  const lunch = o.lunchSlot ?? "12:10";
  const includeLunch = o.includeLunch ?? true;
  const base = o.timeSlots.filter((t) => includeLunch || t !== lunch);
  const extras = o.appointments
    .filter((a) => dates.includes(a.date) && !base.includes(a.time))
    .map((a) => a.time);
  return Array.from(new Set([...base, ...extras])).sort((a, b) => a.localeCompare(b));
}


function patientCell(apts: PrintAppointment[]): string {
  return apts.map((a) => `<div class="pat">${patientNameHtml(a.patientName || `Paciente #${a.patientId}`, a.prontuario)}</div>`).join("");
}

const COLS = 7;
const THEAD = `<thead><tr><th>Nº</th><th>Horário</th><th>Paciente</th><th>Responsável</th><th>Telefone</th><th>Status</th><th>Anotações</th></tr></thead>`;

function aptRow(n: number, a: PrintAppointment, dateLabel?: string): string {
  return `<tr>
    <td class="n">${n}º</td>
    <td class="time">${esc(a.time)}${dateLabel ? `<div class="s">${esc(dateLabel)}</div>` : ""}</td>
    <td>${patientNameHtml(a.patientName || `Paciente #${a.patientId}`, a.prontuario)}</td>
    <td>${esc(a.guardianName || "—")}</td>
    <td class="nw">${esc(a.guardianPhone || "—")}</td>
    <td class="nw">${esc(statusLabel(a.status))}</td>
    <td class="anot"></td>
  </tr>`;
}

// -----------------------------------------------------------------------------
// Blocos de HTML por modo
// -----------------------------------------------------------------------------
function buildDia(o: AgendaPrintOptions, dateStr: string): { html: string; count: number } {
  const lunch = o.lunchSlot ?? "12:10";
  const includeLunch = o.includeLunch ?? true;
  const dayApts = o.appointments.filter((a) => a.date === dateStr);
  const slots = printableSlots(o, [dateStr]);
  let n = 0;
  const rows = slots.map((time) => {
    const apts = dayApts.filter((a) => a.time === time);
    if (time === lunch && includeLunch && apts.length === 0) {
      return `<tr class="lunch-row"><td colspan="${COLS}">🍽 ${esc(time)} — Intervalo de Almoço</td></tr>`;
    }
    if (apts.length === 0) {
      return `<tr><td class="n"></td><td class="time">${esc(time)}</td><td colspan="${COLS - 2}" class="livre">Livre</td></tr>`;
    }
    return apts.map((a) => aptRow(++n, a)).join("");
  }).join("");
  return { html: `<table>${THEAD}<tbody>${rows}</tbody></table>`, count: n };
}

function buildSemanaTable(o: AgendaPrintOptions, weekDates: string[], blank: boolean): string {
  const lunch = o.lunchSlot ?? "12:10";
  const includeLunch = o.includeLunch ?? true;
  const slots = blank
    ? o.timeSlots.filter((t) => includeLunch || t !== lunch)
    : printableSlots(o, weekDates);

  const head = `<tr><th style="width:70px">Horário</th>${weekDates
    .map((d) => {
      const dt = new Date(d + "T12:00:00");
      return `<th>${cap(format(dt, "EEE", { locale: ptBR }))}<div class="th-sub">${format(dt, "dd/MM")}</div></th>`;
    })
    .join("")}</tr>`;

  const body = slots
    .map((time) => {
      const naLinha = blank ? [] : weekDates.flatMap((d) => aptsAt(o.appointments, d, time));
      if (time === lunch && includeLunch && naLinha.length === 0) {
        return `<tr class="lunch-row"><td class="time">${esc(time)}</td><td colspan="${weekDates.length}">🍽 Intervalo de Almoço</td></tr>`;
      }
      const cells = weekDates
        .map((date) => (blank ? `<td class="blank-cell"></td>` : `<td>${patientCell(aptsAt(o.appointments, date, time))}</td>`))
        .join("");
      return `<tr><td class="time">${esc(time)}</td>${cells}</tr>`;
    })
    .join("");

  return `<table class="grid"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function buildMes(o: AgendaPrintOptions): { html: string; count: number } {
  const first = startOfMonth(o.refDate);
  const last = endOfMonth(o.refDate);
  const days: Date[] = [];
  for (let d = new Date(first); d <= last; d = addDays(d, 1)) {
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5) days.push(new Date(d)); // seg..sex
  }
  let n = 0;
  const rows = days
    .map((d) => {
      const dateStr = format(d, "yyyy-MM-dd");
      const dayApts = o.appointments
        .filter((a) => a.date === dateStr)
        .sort((a, b) => a.time.localeCompare(b.time));
      const header = `<tr class="day-head"><td colspan="${COLS}">${esc(cap(format(d, "EEEE, dd 'de' MMMM", { locale: ptBR })))}</td></tr>`;
      if (dayApts.length === 0) return `<tbody class="day">${header}<tr><td colspan="${COLS}" class="livre">Sem atendimentos</td></tr></tbody>`;
      const dateLabel = cap(format(d, "EEE dd/MM", { locale: ptBR }));
      return `<tbody class="day">${header}${dayApts.map((a) => aptRow(++n, a, dateLabel)).join("")}</tbody>`;
    })
    .join("");
  return { html: `<table>${THEAD}${rows}</table>`, count: n };
}

// -----------------------------------------------------------------------------
// Entrada principal
// -----------------------------------------------------------------------------
export function openAgendaPrint(o: AgendaPrintOptions): void {
  const monday = startOfWeek(o.refDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 5 }, (_, i) => addDays(monday, i));
  const weekDates = weekDays.map((d) => format(d, "yyyy-MM-dd"));

  let title = "";
  let subtitle = "";
  let content = "";
  let count: number | null = null;

  if (o.mode === "dia") {
    title = "Agenda do Dia";
    subtitle = cap(format(o.refDate, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR }));
    const r = buildDia(o, format(o.refDate, "yyyy-MM-dd"));
    content = r.html; count = r.count;
  } else if (o.mode === "semana") {
    title = "Agenda da Semana";
    subtitle = `${format(weekDays[0], "dd/MM")} a ${format(weekDays[4], "dd/MM/yyyy")}`;
    content = buildSemanaTable(o, weekDates, false);
    count = o.appointments.filter((a) => weekDates.includes(a.date)).length;
  } else if (o.mode === "mes") {
    title = "Agenda do Mês";
    subtitle = cap(format(o.refDate, "MMMM 'de' yyyy", { locale: ptBR }));
    const r = buildMes(o);
    content = r.html; count = r.count;
  } else {
    // rascunho — grade semanal em branco pra preencher à mão
    title = "Agenda (rascunho)";
    subtitle = "Grade em branco para preenchimento manual";
    content = buildSemanaTable(o, weekDates, true);
  }

  const profLine = [o.professionalName, o.specialty].filter(Boolean).map(esc).join(" — ");
  openReportWindow({
    title,
    heading: profLine ? `<div class="prof">${profLine}</div>` : "",
    subParts: [subtitle, count === null ? "" : `${count} atendimento(s)`],
    body: content,
  });
}
