import type { Compromisso } from "./agenda-admin-rpc";

// "Adicionar ao meu celular": o compromisso vai para a agenda do próprio
// celular, que avisa mesmo com o NFs fechado. Brasília é UTC−3 fixo (sem
// horário de verão desde 2019).
const DURACAO_MIN = 60;

function utc(c: Pick<Compromisso, "data" | "hora">, somaMin = 0): string {
  const d = new Date(`${c.data}T${c.hora}:00-03:00`);
  d.setUTCMinutes(d.getUTCMinutes() + somaMin);
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");

/** Arquivo .ics (iPhone/Calendário e outros apps de agenda), com o alerta escolhido. */
export function baixarIcs(c: Compromisso) {
  const linhas = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//NFs Gestao//Agenda Administrativa//PT-BR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:nfs-compromisso-${c.id}@nfs-gestao`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
    `DTSTART:${utc(c)}`, `DTEND:${utc(c, DURACAO_MIN)}`,
    `SUMMARY:${esc(c.titulo)}`,
    ...(c.local ? [`LOCATION:${esc(c.local)}`] : []),
    ...(c.observacao ? [`DESCRIPTION:${esc(c.observacao)}`] : []),
    "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(c.titulo)}`, `TRIGGER:-PT${c.antecedenciaMin}M`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ];
  const blob = new Blob([linhas.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `compromisso-${c.data}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Link do Google Agenda (Android). O alerta segue o padrão da conta Google (geralmente 30 min). */
export function linkGoogleAgenda(c: Compromisso): string {
  const p = new URLSearchParams({
    action: "TEMPLATE", text: c.titulo, dates: `${utc(c)}/${utc(c, DURACAO_MIN)}`, ctz: "America/Sao_Paulo",
    ...(c.local ? { location: c.local } : {}), ...(c.observacao ? { details: c.observacao } : {}),
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
