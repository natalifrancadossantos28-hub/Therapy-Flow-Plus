-- =========================================================================
-- 0054_fix_frequency_cleanup_all_statuses.sql
--
-- The data fix in 0053 only deleted rows with status='agendado', but
-- migration 0051 had already propagated 'atendimento' to all future
-- rows. So quinzenal/mensal groups still have phantom weekly rows
-- with status='atendimento' on wrong-frequency dates.
--
-- This migration:
-- 1. Updates update_recurrence_frequency to delete rows with ANY
--    auto-propagated status (agendado, atendimento) on wrong dates
-- 2. Data fix: cleans phantom rows for all existing groups
-- =========================================================================

begin;

-- Fix the function to handle both agendado AND atendimento statuses
create or replace function public.update_recurrence_frequency(
  p_slug                text,
  p_password            text,
  p_recurrence_group_id text,
  p_frequency           text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_freq       text;
  v_count      integer;
  v_ref        record;
  v_step       integer;
  v_total      integer;
  v_deleted    integer := 0;
  v_created    integer := 0;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  if p_recurrence_group_id is null or btrim(p_recurrence_group_id) = '' then
    raise exception 'recurrence_group_id is required';
  end if;
  v_freq := lower(btrim(coalesce(p_frequency, 'semanal')));
  if v_freq not in ('semanal', 'quinzenal', 'mensal') then
    v_freq := 'semanal';
  end if;
  select * into v_ref
    from public.appointments
   where company_id = v_company_id
     and recurrence_group_id = p_recurrence_group_id
   order by "date" limit 1;
  if not found then
    raise exception 'No appointments found for group %', p_recurrence_group_id;
  end if;
  v_step  := case v_freq when 'quinzenal' then 14 when 'mensal' then 28 else 7 end;
  v_total := case v_freq when 'quinzenal' then 26 when 'mensal' then 13 else 52 end;

  update public.appointments
     set frequency = v_freq, updated_at = now()
   where company_id = v_company_id
     and recurrence_group_id = p_recurrence_group_id;
  get diagnostics v_count = row_count;

  -- Delete rows on wrong-frequency dates (both agendado AND atendimento).
  -- Preserve rows with manual statuses (presente, ausente, falta_*, etc.)
  delete from public.appointments
   where company_id = v_company_id
     and recurrence_group_id = p_recurrence_group_id
     and "date"::date > v_ref."date"::date
     and lower(coalesce(status, 'agendado')) in ('agendado', 'agendada', 'atendimento', 'scheduled')
     and (("date"::date - v_ref."date"::date) % v_step) != 0;
  get diagnostics v_deleted = row_count;

  insert into public.appointments (
    company_id, patient_id, professional_id,
    "date", "time", status, notes,
    recurrence_group_id, frequency
  )
  select
    v_ref.company_id, v_ref.patient_id, v_ref.professional_id,
    to_char(v_ref."date"::date + (i * v_step), 'YYYY-MM-DD'),
    v_ref."time", 'agendado', v_ref.notes,
    p_recurrence_group_id, v_freq
  from generate_series(1, v_total - 1) as i
  where not exists (
    select 1 from public.appointments dup
     where dup.company_id = v_company_id
       and dup.recurrence_group_id = p_recurrence_group_id
       and dup."date" = to_char(v_ref."date"::date + (i * v_step), 'YYYY-MM-DD')
  );
  get diagnostics v_created = row_count;

  return jsonb_build_object('ok', true, 'updatedCount', v_count, 'deletedCount', v_deleted, 'createdCount', v_created, 'frequency', v_freq);
end;
$$;

revoke all on function public.update_recurrence_frequency(text, text, text, text) from public;
grant execute on function public.update_recurrence_frequency(text, text, text, text) to anon, authenticated;

-- Data fix: clean up ALL phantom rows (including atendimento) on wrong dates
do $$
declare
  grp record;
  v_step integer;
  v_deleted integer;
  v_total_deleted integer := 0;
begin
  for grp in
    select distinct on (company_id, recurrence_group_id)
           company_id, recurrence_group_id, "date"::date as ref_date, frequency
      from public.appointments
     where recurrence_group_id is not null
       and btrim(recurrence_group_id) <> ''
     order by company_id, recurrence_group_id, "date"
  loop
    v_step := case coalesce(grp.frequency, 'semanal')
                when 'quinzenal' then 14
                when 'mensal'    then 28
                else 7
              end;
    if v_step > 7 then
      delete from public.appointments
       where company_id = grp.company_id
         and recurrence_group_id = grp.recurrence_group_id
         and "date"::date > grp.ref_date
         and lower(coalesce(status, 'agendado')) in ('agendado', 'agendada', 'atendimento', 'scheduled')
         and (("date"::date - grp.ref_date) % v_step) != 0;
      get diagnostics v_deleted = row_count;
      v_total_deleted := v_total_deleted + v_deleted;
    end if;
  end loop;
  raise notice 'Total phantom rows deleted: %', v_total_deleted;
end;
$$;

commit;
