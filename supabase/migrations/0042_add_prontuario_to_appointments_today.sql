-- Adds prontuario to list_appointments_today so the reception can display it.
create or replace function public.list_appointments_today(
  p_slug            text,
  p_password        text,
  p_professional_id bigint default null
)
returns table (
  id                    bigint,
  patient_id            bigint,
  professional_id       bigint,
  "date"                text,
  "time"                text,
  status                text,
  notes                 text,
  rescheduled_to        text,
  recurrence_group_id   text,
  frequency             text,
  patient_name          text,
  patient_phone         text,
  patient_absence_count integer,
  professional_name     text,
  professional_specialty text,
  ciclo                 text,
  prontuario            text,
  created_at            timestamptz,
  updated_at            timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_company_id bigint;
  v_today      text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  return query
    select
      a.id, a.patient_id, a.professional_id, a."date", a."time", a.status, a.notes,
      a.rescheduled_to, a.recurrence_group_id, a.frequency,
      coalesce(p.name, '')::text          as patient_name,
      p.phone::text                       as patient_phone,
      coalesce(s.abs_count, 0)            as patient_absence_count,
      coalesce(pr.name, '')::text         as professional_name,
      coalesce(pr.specialty, '')::text    as professional_specialty,
      public._ciclo(a.frequency, a."date") as ciclo,
      p.prontuario::text                  as prontuario,
      a.created_at, a.updated_at
    from public.appointments a
    left join public.patients      p  on p.id  = a.patient_id
    left join public.professionals pr on pr.id = a.professional_id
    left join lateral public._absence_stats_by_prof(v_company_id, a.patient_id, a.professional_id) s on true
    where a.company_id = v_company_id
      and a."date" = v_today
      and (p_professional_id is null or a.professional_id = p_professional_id)
      and (p.tipo_registro is null or p.tipo_registro <> 'Registro Censo Municipal')
    order by a."time";
end;
$fn$;

revoke all on function public.list_appointments_today(text, text, bigint) from public;
grant execute on function public.list_appointments_today(text, text, bigint) to anon, authenticated;
