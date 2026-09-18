-- =========================================================================
-- 0100_duplicados_ignorar_motorista.sql
--
-- Motorista só transporta o paciente (não faz atendimento): sua agenda é livre
-- e não conta como conflito de horário. Atualiza _remover_duplicados_agenda()
-- para ignorar linhas de motorista, como já faz com Parental/Oficina/Multi.
-- =========================================================================

begin;

create or replace function public._remover_duplicados_agenda()
returns table (
  removed_id        bigint,
  motivo            text,
  patient_id        bigint,
  patient_name      text,
  professional_name text,
  "date"            text,
  "time"            text,
  mantido_com       text
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
#variable_conflict use_column
declare
  v_today text := to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD');
begin
  create temp table if not exists _dup_remover (
    removed_id        bigint primary key,
    motivo            text,
    patient_id        bigint,
    patient_name      text,
    professional_name text,
    "date"            text,
    "time"            text,
    mantido_com       text
  ) on commit drop;
  truncate _dup_remover;

  -- (a) linha repetida
  insert into _dup_remover
  select a.id, 'linha repetida', a.patient_id, p.name, pr.name, a."date", a."time", pr.name
    from public.appointments a
    join public.patients p on p.id = a.patient_id
    left join public.professionals pr on pr.id = a.professional_id
   where a."date" >= v_today
     and lower(coalesce(a.status, 'agendado')) in ('agendado', 'agendada', 'atendimento', 'scheduled')
     and exists (
       select 1 from public.appointments k
        where k.company_id = a.company_id
          and k.patient_id = a.patient_id
          and k.professional_id = a.professional_id
          and k."date" = a."date"
          and k."time" = a."time"
          and k.id < a.id
     )
  on conflict do nothing;

  -- (b) mesmo horário com outro profissional
  insert into _dup_remover
  select a.id, 'mesmo horário com outro profissional', a.patient_id, p.name, pr.name, a."date", a."time", kpr.name
    from public.appointments a
    join public.patients p on p.id = a.patient_id
    join public.professionals pr on pr.id = a.professional_id
    join lateral (
      select k.*
        from public.appointments k
        join public.professionals kp on kp.id = k.professional_id
       where k.company_id = a.company_id
         and k.patient_id = a.patient_id
         and k."date" = a."date"
         and k."time" = a."time"
         and k.professional_id <> a.professional_id
         and k.id not in (select d.removed_id from _dup_remover d)
         and lower(coalesce(k.status, 'agendado')) in ('agendado', 'agendada', 'atendimento', 'scheduled', 'presente')
         and coalesce(k.notes, '') not like 'Atendimento Multi com %'
         and lower(coalesce(kp.specialty, '')) not like '%parental%'
         and lower(coalesce(kp.specialty, '')) not like '%oficina%'
         and lower(coalesce(kp.specialty, '')) not like '%motorista%'
         and lower(coalesce(kp.specialty, '')) not like '%transporte%'
         and (k.created_at, k.id) < (a.created_at, a.id)
       order by k.created_at, k.id
       limit 1
    ) k on true
    join public.professionals kpr on kpr.id = k.professional_id
   where a."date" >= v_today
     and lower(coalesce(a.status, 'agendado')) in ('agendado', 'agendada', 'atendimento', 'scheduled')
     and coalesce(a.notes, '') not like 'Atendimento Multi com %'
     and lower(coalesce(pr.specialty, '')) not like '%parental%'
     and lower(coalesce(pr.specialty, '')) not like '%oficina%'
     and lower(coalesce(pr.specialty, '')) not like '%motorista%'
     and lower(coalesce(pr.specialty, '')) not like '%transporte%'
  on conflict do nothing;

  delete from public.appointments x
   where x.id in (select d.removed_id from _dup_remover d);

  return query
    select d.removed_id, d.motivo, d.patient_id, d.patient_name, d.professional_name, d."date", d."time", d.mantido_com
      from _dup_remover d
     order by d.patient_name, d."date", d."time";
end;
$$;

revoke all on function public._remover_duplicados_agenda() from public;

commit;
