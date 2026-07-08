// =============================================================================
// print-agenda.ts — impressão da agenda (Dia / Semana / Mês / Rascunho em branco)
// -----------------------------------------------------------------------------
// Usado tanto no Portal do Profissional (agenda-profissionais.tsx) quanto na
// Agenda Geral / administração (agenda.tsx). Gera uma janela de impressão com
// HTML estático (mesmo visual em ambos) e chama window.print().
// =============================================================================
import { format, startOfWeek, addDays, endOfMonth, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

export type AgendaPrintMode = "dia" | "semana" | "mes" | "rascunho";

export type PrintAppointment = {
  date: string;              // YYYY-MM-DD
  time: string;              // HH:MM
  patientId: number;
  patientName?: string | null;
  prontuario?: string | null;
  status: string;
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

const esc = (v: unknown): string =>
  String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function statusLabel(status: string): string {
  const s = (status || "").toLowerCase();
  const map: Record<string, string> = {
    agendado: "Agendado",
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

function patientCell(apt: PrintAppointment | undefined): string {
  if (!apt) return '<span style="color:#9ca3af;font-style:italic">Livre</span>';
  const pront = apt.prontuario
    ? `<strong style="color:#0891b2">[${esc(apt.prontuario)}]</strong> `
    : "";
  return `${pront}${esc(apt.patientName || `Paciente #${apt.patientId}`)}`;
}

// -----------------------------------------------------------------------------
// Blocos de HTML por modo
// -----------------------------------------------------------------------------
function buildDia(o: AgendaPrintOptions, dateStr: string): string {
  const lunch = o.lunchSlot ?? "12:10";
  const includeLunch = o.includeLunch ?? true;
  const dayApts = o.appointments.filter((a) => a.date === dateStr);
  const slots = o.timeSlots.filter((t) => includeLunch || t !== lunch);

  const rowFor = (time: string): string => {
    if (time === lunch && includeLunch) {
      return `<tr class="lunch-row"><td colspan="3">🍽 ${esc(time)} — Intervalo de Almoço</td></tr>`;
    }
    const apt = dayApts.find((a) => a.time === time);
    return `<tr>
      <td class="time">${esc(time)}</td>
      <td>${patientCell(apt)}</td>
      <td>${apt ? esc(statusLabel(apt.status)) : ""}</td>
    </tr>`;
  };

  return `
    <table>
      <thead><tr><th style="width:90px">Horário</th><th>Paciente</th><th style="width:150px">Status</th></tr></thead>
      <tbody>${slots.map(rowFor).join("")}</tbody>
    </table>`;
}

function buildSemanaTable(o: AgendaPrintOptions, weekDates: string[], blank: boolean): string {
  const lunch = o.lunchSlot ?? "12:10";
  const includeLunch = o.includeLunch ?? true;
  const slots = o.timeSlots.filter((t) => includeLunch || t !== lunch);

  const head = `<tr><th style="width:70px">Horário</th>${weekDates
    .map((d) => {
      const dt = new Date(d + "T12:00:00");
      return `<th>${cap(format(dt, "EEE", { locale: ptBR }))}<div class="th-sub">${format(dt, "dd/MM")}</div></th>`;
    })
    .join("")}</tr>`;

  const body = slots
    .map((time) => {
      if (time === lunch && includeLunch) {
        return `<tr class="lunch-row"><td class="time">${esc(time)}</td><td colspan="${weekDates.length}">🍽 Intervalo de Almoço</td></tr>`;
      }
      const cells = weekDates
        .map((date) => {
          if (blank) return `<td class="blank-cell"></td>`;
          const apt = o.appointments.find((a) => a.date === date && a.time === time);
          return `<td>${apt ? patientCell(apt) : ""}</td>`;
        })
        .join("");
      return `<tr><td class="time">${esc(time)}</td>${cells}</tr>`;
    })
    .join("");

  return `<table class="grid"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function buildMes(o: AgendaPrintOptions): string {
  const first = startOfMonth(o.refDate);
  const last = endOfMonth(o.refDate);
  const days: Date[] = [];
  for (let d = new Date(first); d <= last; d = addDays(d, 1)) {
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5) days.push(new Date(d)); // seg..sex
  }

  return days
    .map((d) => {
      const dateStr = format(d, "yyyy-MM-dd");
      const dayApts = o.appointments
        .filter((a) => a.date === dateStr)
        .sort((a, b) => a.time.localeCompare(b.time));
      const header = `<div class="mes-day-head">${cap(format(d, "EEEE, dd 'de' MMMM", { locale: ptBR }))}</div>`;
      if (dayApts.length === 0) {
        return `<div class="mes-day">${header}<div class="mes-empty">Sem atendimentos</div></div>`;
      }
      const rows = dayApts
        .map(
          (apt) =>
            `<div class="mes-row"><span class="mes-time">${esc(apt.time)}</span><span class="mes-pat">${patientCell(apt)}</span><span class="mes-status">${esc(statusLabel(apt.status))}</span></div>`,
        )
        .join("");
      return `<div class="mes-day">${header}${rows}</div>`;
    })
    .join("");
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

  if (o.mode === "dia") {
    const dateStr = format(o.refDate, "yyyy-MM-dd");
    title = "Agenda do Dia";
    subtitle = cap(format(o.refDate, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR }));
    content = buildDia(o, dateStr);
  } else if (o.mode === "semana") {
    title = "Agenda da Semana";
    subtitle = `${format(weekDays[0], "dd/MM")} a ${format(weekDays[4], "dd/MM/yyyy")}`;
    content = buildSemanaTable(o, weekDates, false);
  } else if (o.mode === "mes") {
    title = "Agenda do Mês";
    subtitle = cap(format(o.refDate, "MMMM 'de' yyyy", { locale: ptBR }));
    content = buildMes(o);
  } else {
    // rascunho — grade semanal em branco pra preencher à mão
    title = "Agenda (rascunho)";
    subtitle = "Grade em branco para preenchimento manual";
    content = buildSemanaTable(o, weekDates, true);
  }

  const profLine = [o.professionalName, o.specialty].filter(Boolean).map(esc).join(" — ");

  const html = `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="utf-8"><title>${esc(title)}</title>
<style>
  *{box-sizing:border-box;}
  body{font-family:Arial,Helvetica,sans-serif;padding:28px;color:#111827;margin:0;}
  h1{font-size:22px;margin:0 0 2px;}
  .prof{font-size:15px;font-weight:700;color:#0e7490;margin:6px 0 0;}
  .sub{color:#6b7280;font-size:13px;margin:2px 0 20px;}
  table{width:100%;border-collapse:collapse;font-size:13px;}
  th{text-align:left;padding:9px 10px;background:#ecfeff;color:#0e7490;border-bottom:2px solid #0891b2;font-size:11px;text-transform:uppercase;letter-spacing:.04em;}
  td{padding:8px 10px;border-bottom:1px solid #e5e7eb;vertical-align:top;}
  td.time{font-weight:700;color:#0e7490;white-space:nowrap;}
  .lunch-row td{background:#f1f5f9;color:#64748b;font-style:italic;font-size:12px;}
  table.grid{table-layout:fixed;}
  table.grid th{text-align:center;}
  table.grid th .th-sub{font-weight:400;font-size:10px;text-transform:none;}
  table.grid td{font-size:12px;}
  td.blank-cell{height:34px;}
  .mes-day{margin-bottom:14px;break-inside:avoid;}
  .mes-day-head{background:#ecfeff;color:#0e7490;font-weight:700;font-size:13px;padding:6px 10px;border-left:3px solid #0891b2;}
  .mes-row{display:flex;gap:12px;padding:5px 10px;border-bottom:1px solid #eef2f7;font-size:12px;}
  .mes-time{font-weight:700;color:#0e7490;width:52px;flex:0 0 52px;}
  .mes-pat{flex:1;}
  .mes-status{color:#6b7280;width:130px;flex:0 0 130px;text-align:right;}
  .mes-empty{padding:5px 10px;color:#9ca3af;font-style:italic;font-size:12px;}
  .footer{margin-top:22px;font-size:11px;color:#94a3b8;}
  @media print{.no-print{display:none!important;} body{padding:0;}}
</style></head><body>
  <div class="no-print" style="display:flex;gap:10px;margin-bottom:18px;align-items:center;">
    <button onclick="window.close()" style="padding:8px 18px;background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">← Voltar</button>
    <button onclick="window.print()" style="padding:8px 18px;background:#0891b2;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">🖨 Imprimir</button>
  </div>
  <h1>${esc(title)}</h1>
  ${profLine ? `<div class="prof">${profLine}</div>` : ""}
  <div class="sub">${esc(subtitle)}</div>
  ${content}
  <div class="footer">NFS – Gestão Terapêutica</div>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
