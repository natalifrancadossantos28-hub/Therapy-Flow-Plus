-- =============================================================================
-- 0040: Fix get_appointments_stats — contar apenas atendimentos JA REALIZADOS.
-- =============================================================================
--
-- Bug reportado pela Natali:
--   Os 5 cards de "Atendimentos Terapeuticos" (Semana / Mes / Trimestre /
--   Semestre / Ano) mostravam todos o mesmo valor (467).
--
-- Causa:
--   A migration 0036 (PR #77) faz com que TODAS as semanas futuras de uma
--   recorrencia herdem status='atendimento' assim que o profissional marca
--   uma. Isso popula a tabela appointments com centenas de linhas futuras
--   (ate ~52 por paciente) com status='atendimento'.
--
--   Como get_appointments_stats so filtrava por "date >= inicio_periodo",
--   essas linhas FUTURAS entravam em todos os 5 buckets — e como caem todas
--   dentro do mesmo ano corrente, o total fica identico em cada periodo.
--
-- Correcao:
--   Adiciona limite superior "date <= hoje" em todos os buckets. A partir
--   daqui o card mostra apenas atendimentos que JA aconteceram, que e a
--   leitura natural ("Esta semana = aconteceram nesta semana ate hoje").
-- =============================================================================

begin;

create or replace function public.get_appointments_stats(
  p_slug     text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id  bigint;
  v_today       date := (now() at time zone 'America/Sao_Paulo')::date;
  v_today_str   text := to_char(v_today, 'YYYY-MM-DD');
  v_week_start  text := to_char(v_today - ((extract(isodow from v_today)::int - 1)), 'YYYY-MM-DD');
  v_month_start text := to_char(date_trunc('month', v_today),                       'YYYY-MM-DD');
  v_trim_start  text := to_char(date_trunc('month', v_today) - interval '2 months', 'YYYY-MM-DD');
  v_sem_start   text := to_char(date_trunc('month', v_today) - interval '5 months', 'YYYY-MM-DD');
  v_year_start  text := to_char(date_trunc('year',  v_today),                       'YYYY-MM-DD');
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  return jsonb_build_object(
    'semanal',    (select count(*) from public.appointments
                    where company_id = v_company_id
                      and status = 'atendimento'
                      and "date" >= v_week_start
                      and "date" <= v_today_str),
    'mensal',     (select count(*) from public.appointments
                    where company_id = v_company_id
                      and status = 'atendimento'
                      and "date" >= v_month_start
                      and "date" <= v_today_str),
    'trimestral', (select count(*) from public.appointments
                    where company_id = v_company_id
                      and status = 'atendimento'
                      and "date" >= v_trim_start
                      and "date" <= v_today_str),
    'semestral',  (select count(*) from public.appointments
                    where company_id = v_company_id
                      and status = 'atendimento'
                      and "date" >= v_sem_start
                      and "date" <= v_today_str),
    'anual',      (select count(*) from public.appointments
                    where company_id = v_company_id
                      and status = 'atendimento'
                      and "date" >= v_year_start
                      and "date" <= v_today_str)
  );
end;
$$;

revoke all on function public.get_appointments_stats(text, text) from public;
grant execute on function public.get_appointments_stats(text, text) to anon, authenticated;

commit;
