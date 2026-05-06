-- =============================================================================
-- 0039: RPC list_long_attendance_patients
-- =============================================================================
--
-- Lista pacientes em "Atendimento" cujo PRIMEIRO agendamento ja completou
-- 12 meses ou mais. Usado pelo card "Atencao: Revisao de Casos (>1 ano)" no
-- dashboard, pra coordenacao acompanhar quem ja esta em terapia ha muito
-- tempo e revisar prontuario / planejar alta.
--
-- Retorno:
--   id                       -> patient_id
--   name                     -> nome do paciente
--   professional_id/name     -> profissional vinculado (patients.professional_id)
--   first_attendance_date    -> data do 1o agendamento (qualquer status)
--   months_in_attendance     -> diferenca em meses inteiros
--   years_label              -> "1a 4m" / "2a" / "11m" (formato curto BR)
-- =============================================================================

begin;

create or replace function public.list_long_attendance_patients(
  p_slug      text,
  p_password  text,
  p_min_months integer default 12
)
returns table (
  id                    bigint,
  name                  text,
  status                text,
  professional_id       bigint,
  professional_name     text,
  professional_specialty text,
  first_attendance_date date,
  months_in_attendance  integer,
  years_label           text
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_min        integer := greatest(coalesce(p_min_months, 12), 1);
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  return query
  with primeiros as (
    select
      a.company_id,
      a.patient_id,
      min((a."date")::date) as first_dt
      from public.appointments a
     where a.company_id = v_company_id
       and a."date" is not null
       and btrim(a."date") <> ''
     group by a.company_id, a.patient_id
  ),
  base as (
    select
      p.id,
      p.name,
      p.status,
      p.professional_id,
      pr.name      as professional_name,
      pr.specialty as professional_specialty,
      pf.first_dt  as first_attendance_date,
      (
        (extract(year  from age(current_date, pf.first_dt))::int * 12)
      + (extract(month from age(current_date, pf.first_dt))::int)
      ) as months_in_attendance
      from public.patients p
      join primeiros pf
        on pf.company_id = p.company_id
       and pf.patient_id = p.id
      left join public.professionals pr on pr.id = p.professional_id
     where p.company_id = v_company_id
       and coalesce(p.status, '') = 'Atendimento'
  )
  select
    b.id,
    b.name,
    b.status,
    b.professional_id,
    b.professional_name,
    b.professional_specialty,
    b.first_attendance_date,
    b.months_in_attendance,
    case
      when b.months_in_attendance >= 12 and (b.months_in_attendance % 12) = 0
        then (b.months_in_attendance / 12)::text || 'a'
      when b.months_in_attendance >= 12
        then (b.months_in_attendance / 12)::text || 'a ' || (b.months_in_attendance % 12)::text || 'm'
      else b.months_in_attendance::text || 'm'
    end as years_label
    from base b
   where b.months_in_attendance >= v_min
   order by b.months_in_attendance desc, b.name asc;
end;
$$;

revoke all on function public.list_long_attendance_patients(text, text, integer) from public;
grant execute on function public.list_long_attendance_patients(text, text, integer) to anon, authenticated;

commit;
