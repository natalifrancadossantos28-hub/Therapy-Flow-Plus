/**
 * Datas de conscientização sobre deficiência (Brasil).
 * Fonte principal: Calendário da Acessibilidade (UFC) e Ministério da Saúde.
 * Datas fixas (mês/dia). Alguns itens têm período (endDay no mesmo mês).
 */

export type AwarenessCategory =
  | "Autismo"
  | "Intelectual"
  | "Auditiva"
  | "Visual"
  | "Física"
  | "Saúde Mental"
  | "Geral";

export type AwarenessDate = {
  month: number; // 1-12
  day: number; // 1-31
  endDay?: number; // fim do período (mesmo mês), opcional
  title: string;
  category: AwarenessCategory;
};

export const AWARENESS_DATES: AwarenessDate[] = [
  // Janeiro
  { month: 1, day: 4, title: "Dia Mundial do Braille", category: "Visual" },
  // Fevereiro
  { month: 2, day: 18, title: "Dia Internacional da Síndrome de Asperger", category: "Autismo" },
  { month: 2, day: 28, title: "Dia Mundial das Doenças Raras", category: "Geral" },
  // Março
  { month: 3, day: 21, title: "Dia Internacional da Síndrome de Down", category: "Intelectual" },
  { month: 3, day: 26, title: "Dia Mundial de Conscientização da Epilepsia (Purple Day)", category: "Saúde Mental" },
  // Abril
  { month: 4, day: 2, title: "Dia Mundial de Conscientização do Autismo", category: "Autismo" },
  { month: 4, day: 8, title: "Dia Nacional do Sistema Braille", category: "Visual" },
  { month: 4, day: 11, title: "Dia Mundial de Conscientização da Doença de Parkinson", category: "Física" },
  { month: 4, day: 14, title: "Dia Nacional de Luta pela Educação Inclusiva", category: "Geral" },
  { month: 4, day: 23, title: "Dia Nacional da Educação dos Surdos", category: "Auditiva" },
  { month: 4, day: 24, title: "Dia Nacional da LIBRAS (Língua Brasileira de Sinais)", category: "Auditiva" },
  { month: 4, day: 25, title: "Dia Internacional do Cão-Guia", category: "Visual" },
  // Maio
  { month: 5, day: 5, title: "Dia Nacional da Pessoa com Visão Monocular", category: "Visual" },
  { month: 5, day: 13, title: "Dia Internacional de Conscientização sobre o Albinismo", category: "Geral" },
  { month: 5, day: 18, title: "Dia Mundial do Orgulho Autista", category: "Autismo" },
  { month: 5, day: 30, title: "Dia Mundial da Esclerose Múltipla", category: "Física" },
  // Junho
  { month: 6, day: 27, title: "Dia Internacional das Pessoas Surdocegas", category: "Auditiva" },
  // Julho
  { month: 7, day: 13, title: "Dia Mundial do TDAH (Déficit de Atenção/Hiperatividade)", category: "Saúde Mental" },
  { month: 7, day: 26, title: "Dia Nacional do Tradutor e Intérprete de LIBRAS", category: "Auditiva" },
  // Agosto
  { month: 8, day: 10, title: "Dia Internacional da Superdotação (Altas Habilidades)", category: "Intelectual" },
  { month: 8, day: 21, endDay: 28, title: "Semana Nacional da Pessoa com Deficiência Intelectual e Múltipla", category: "Intelectual" },
  { month: 8, day: 22, title: "Dia da Pessoa com Deficiência Intelectual", category: "Intelectual" },
  { month: 8, day: 30, title: "Dia Nacional de Conscientização sobre a Esclerose Múltipla", category: "Física" },
  // Setembro
  { month: 9, day: 7, title: "Dia Nacional de Conscientização sobre a Distrofia Muscular de Duchenne", category: "Física" },
  { month: 9, day: 10, title: "Dia Mundial da Língua de Sinais", category: "Auditiva" },
  { month: 9, day: 21, title: "Dia Nacional de Luta da Pessoa com Deficiência", category: "Geral" },
  { month: 9, day: 22, title: "Dia Nacional do Atleta Paralímpico", category: "Física" },
  { month: 9, day: 23, title: "Dia Internacional das Línguas de Sinais", category: "Auditiva" },
  { month: 9, day: 26, title: "Dia Nacional do Surdo", category: "Auditiva" },
  { month: 9, day: 30, title: "Dia Internacional da Pessoa Surda", category: "Auditiva" },
  // Outubro
  { month: 10, day: 10, title: "Dia Mundial da Dislexia", category: "Saúde Mental" },
  { month: 10, day: 10, title: "Dia Nacional dos Direitos da Pessoa com Transtornos Mentais", category: "Saúde Mental" },
  { month: 10, day: 11, title: "Dia Nacional da Pessoa com Deficiência Física", category: "Física" },
  { month: 10, day: 15, title: "Dia Mundial da Bengala Branca", category: "Visual" },
  { month: 10, day: 25, title: "Dia Nacional de Combate ao Preconceito contra Pessoas com Nanismo", category: "Física" },
  // Novembro
  { month: 11, day: 10, title: "Dia Nacional de Prevenção e Combate à Surdez", category: "Auditiva" },
  { month: 11, day: 12, title: "Dia Nacional da Pessoa com Surdocegueira", category: "Auditiva" },
  // Dezembro
  { month: 12, day: 3, title: "Dia Internacional das Pessoas com Deficiência", category: "Geral" },
  { month: 12, day: 5, title: "Dia Nacional da Acessibilidade", category: "Geral" },
  { month: 12, day: 13, title: "Dia Nacional do Cego (Santa Luzia)", category: "Visual" },
];

export const CATEGORY_COLOR: Record<AwarenessCategory, string> = {
  Autismo: "#3b82f6",
  Intelectual: "#a855f7",
  Auditiva: "#f59e0b",
  Visual: "#10b981",
  Física: "#ef4444",
  "Saúde Mental": "#ec4899",
  Geral: "#6366f1",
};

export const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Rótulo curto: "02/04" ou "21 a 28/08" para períodos. */
export function dateLabel(d: AwarenessDate): string {
  if (d.endDay) return `${pad2(d.day)} a ${pad2(d.endDay)}/${pad2(d.month)}`;
  return `${pad2(d.day)}/${pad2(d.month)}`;
}

/** Retorna as datas de conscientização que caem em `todayISO` (YYYY-MM-DD). */
export function awarenessOnToday(todayISO: string): AwarenessDate[] {
  const [, mStr, dStr] = todayISO.split("-");
  const m = parseInt(mStr);
  const d = parseInt(dStr);
  return AWARENESS_DATES.filter((a) =>
    a.month === m && (a.endDay ? d >= a.day && d <= a.endDay : d === a.day)
  );
}

/**
 * Próximas `limit` datas a partir de hoje (YYYY-MM-DD), incluindo as de hoje,
 * dando a volta no ano. Cada item traz quantos dias faltam.
 */
export function upcomingAwareness(
  todayISO: string,
  limit = 5,
): { date: AwarenessDate; daysUntil: number; when: string }[] {
  const [yStr, mStr, dStr] = todayISO.split("-");
  const year = parseInt(yStr);
  const today = new Date(year, parseInt(mStr) - 1, parseInt(dStr));
  const oneDay = 24 * 60 * 60 * 1000;

  const withDays = AWARENESS_DATES.map((date) => {
    let occ = new Date(year, date.month - 1, date.day);
    // Período já em curso conta como "hoje".
    if (date.endDay) {
      const end = new Date(year, date.month - 1, date.endDay);
      if (today >= occ && today <= end) occ = today;
    }
    if (occ < today) occ = new Date(year + 1, date.month - 1, date.day);
    const daysUntil = Math.round((occ.getTime() - today.getTime()) / oneDay);
    return { date, daysUntil };
  });

  withDays.sort((a, b) => a.daysUntil - b.daysUntil);

  return withDays.slice(0, limit).map(({ date, daysUntil }) => ({
    date,
    daysUntil,
    when:
      daysUntil === 0 ? "Hoje" : daysUntil === 1 ? "Amanhã" : `Em ${daysUntil} dias`,
  }));
}
