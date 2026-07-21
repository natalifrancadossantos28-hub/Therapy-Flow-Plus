-- 0076_fix_stats_bater_visao_mensal.sql
-- Os cards "Atendimentos Terapêuticos" (Semana/Mês/Trimestre/Semestre/Ano) não
-- batiam com a "Visão Mensal → Realizados". Causa: get_appointments_stats
-- contava SÓ status = 'atendimento', sem deduplicar e sem excluir Censo, enquanto
-- a Visão Mensal (list_appointments + monthlyStats no cliente) conta
-- 'atendimento' + 'presente' + 'alta' + 'em_atendimento', deduplicado por
-- (paciente, data, hora) e excluindo pacientes 'Registro Censo Municipal'.
--
-- Correção: alinhar o RPC à MESMA definição de "realizado" usada na Visão Mensal,
-- para os números baterem. Regras aplicadas em todos os 5 períodos:
--   • status realizado: atendimento / em_atendimento / presente / alta
--   • deduplica por (patient_id, date, time)  (evita dobrar o "Multi")
--   • exclui 'Registro Censo Municipal'
--   • só até hoje (não infla com recorrências futuras) — mantém a regra da 0040

begin;

-- Contagem de atendimentos REALIZADOS num intervalo, com a mesma definição da
-- Visão Mensal (status realizado, dedup por paciente+data+hora, sem Censo).
create or replace function public._count_atendimentos_realizados(
  p_company_id bigint,
  p_from       text,
  p_to         text
)
returns integer
language sql
stable
set search_path = public, extensions, pg_temp
as $$
  select count(*)::int from (
    select distinct a.patient_id, a."date", a."time"
      from public.appointments a
      join public.patients p on p.id = a.patient_id
     where a.company_id = p_company_id
       and lower(a.status) in ('atendimento', 'em_atendimento', 'presente', 'alta')
       and a."date" >= p_from
       and a."date" <= p_to
       and (p.tipo_registro is null or p.tipo_registro <> 'Registro Censo Municipal')
  ) d;
$$;

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
    'semanal',    public._count_atendimentos_realizados(v_company_id, v_week_start,  v_today_str),
    'mensal',     public._count_atendimentos_realizados(v_company_id, v_month_start, v_today_str),
    'trimestral', public._count_atendimentos_realizados(v_company_id, v_trim_start,  v_today_str),
    'semestral',  public._count_atendimentos_realizados(v_company_id, v_sem_start,   v_today_str),
    'anual',      public._count_atendimentos_realizados(v_company_id, v_year_start,  v_today_str)
  );
end;
$$;

revoke all on function public.get_appointments_stats(text, text) from public;
grant execute on function public.get_appointments_stats(text, text) to anon, authenticated;

commit;
