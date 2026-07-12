import type { Feriado, Ausencia } from "@/lib/arco-rpc";

/**
 * Utilitários para "parar" a agenda em feriados e nas ausências do profissional
 * (férias/folga/falta). As datas são sempre "YYYY-MM-DD" (fuso local do sistema).
 *
 * Nada é apagado do banco: as recorrências continuam existindo e voltam a
 * aparecer normalmente fora do feriado/período de ausência.
 */

/** Feriado da clínica na data (bloqueia todos os profissionais), ou null. */
export function holidayOn(date: string, feriados: Feriado[]): Feriado | null {
  return feriados.find((f) => f.data === date) ?? null;
}

/** Ausência de um profissional que cobre a data (data_inicio..data_fim), ou null. */
export function absenceOn(
  date: string,
  professionalId: number,
  ausencias: Ausencia[]
): Ausencia | null {
  return (
    ausencias.find(
      (a) =>
        a.professionalId === professionalId &&
        date >= a.dataInicio &&
        date <= a.dataFim
    ) ?? null
  );
}

/**
 * O atendimento deve ser ocultado/desconsiderado nesta data?
 * true quando a data é feriado da clínica OU o profissional está ausente.
 */
export function isBlocked(
  date: string,
  professionalId: number,
  feriados: Feriado[],
  ausencias: Ausencia[]
): boolean {
  return (
    holidayOn(date, feriados) !== null ||
    absenceOn(date, professionalId, ausencias) !== null
  );
}

/** Domingo de Páscoa do ano (algoritmo de Meeus/Butcher). */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/**
 * Feriados nacionais do Brasil no ano (fixos + móveis derivados da Páscoa).
 * Não inclui feriados municipais/estaduais nem pontos facultativos — esses
 * o usuário adiciona manualmente.
 */
export function feriadosNacionais(year: number): { data: string; descricao: string }[] {
  const easter = easterSunday(year);
  return [
    { data: `${year}-01-01`, descricao: "Confraternização Universal (Ano Novo)" },
    { data: iso(addDays(easter, -48)), descricao: "Carnaval (segunda)" },
    { data: iso(addDays(easter, -47)), descricao: "Carnaval (terça)" },
    { data: iso(addDays(easter, -2)), descricao: "Sexta-feira Santa" },
    { data: `${year}-04-21`, descricao: "Tiradentes" },
    { data: `${year}-05-01`, descricao: "Dia do Trabalho" },
    { data: iso(addDays(easter, 60)), descricao: "Corpus Christi" },
    { data: `${year}-09-07`, descricao: "Independência do Brasil" },
    { data: `${year}-10-12`, descricao: "Nossa Senhora Aparecida" },
    { data: `${year}-11-02`, descricao: "Finados" },
    { data: `${year}-11-15`, descricao: "Proclamação da República" },
    { data: `${year}-11-20`, descricao: "Consciência Negra" },
    { data: `${year}-12-25`, descricao: "Natal" },
  ];
}
