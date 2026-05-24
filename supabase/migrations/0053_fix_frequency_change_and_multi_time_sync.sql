-- =========================================================================
-- 0053_fix_frequency_change_and_multi_time_sync.sql
--
-- Fix 1: update_recurrence_frequency — when changing frequency (e.g.
-- semanal → quinzenal), the function now DELETES extra rows that don't
-- match the new interval AND creates missing rows if switching to a
-- higher frequency. Previously it only updated the frequency column,
-- leaving all 52 semanal rows intact even for quinzenal/mensal.
--
-- Fix 2: update_appointment — extend Multi sync to also propagate
-- date and time changes to the partner appointment. Previously only
-- status was synced. Now if a Multi appointment is rescheduled, the
-- partner moves to the same date/time automatically.
-- =========================================================================

begin;

-- ═══════════════════════════════════════════════════════════════════════
-- Fix 1: update_recurrence_frequency
-- ═══════════════════════════════════════════════════════════════════════
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

  -- Get reference appointment (earliest in group)
  select * into v_ref
    from public.appointments
   where company_id = v_company_id
     and recurrence_group_id = p_recurrence_group_id
   order by "date"
   limit 1;

  if not found then
    raise exception 'No appointments found for group %', p_recurrence_group_id;
  end if;

  v_step  := case v_freq when 'quinzenal' then 14 when 'mensal' then 28 else 7 end;
  v_total := case v_freq when 'quinzenal' then 26 when 'mensal' then 13 else 52 end;

  -- Update frequency on ALL existing rows first
  update public.appointments
     set frequency  = v_freq,
         updated_at = now()
   where company_id = v_company_id
     and recurrence_group_id = p_recurrence_group_id;
  get diagnostics v_count = row_count;

  -- Delete future "agendado" rows that don't fall on the new interval.
  -- Only deletes untouched future appointments; past and non-agendado
  -- appointments are preserved (they represent real history).
  delete from public.appointments
   where company_id = v_company_id
     and recurrence_group_id = p_recurrence_group_id
     and "date"::date > v_ref."date"::date
     and lower(coalesce(status, 'agendado')) = 'agendado'
     and (("date"::date - v_ref."date"::date) % v_step) != 0;
  get diagnostics v_deleted = row_count;

  -- Create missing rows for dates that should have appointments
  -- (needed when switching to a higher frequency, e.g. mensal → semanal)
  insert into public.appointments (
    company_id, patient_id, professional_id,
    "date", "time", status, notes,
    recurrence_group_id, frequency
  )
  select
    v_ref.company_id, v_ref.patient_id, v_ref.professional_id,
    to_char(v_ref."date"::date + (i * v_step), 'YYYY-MM-DD'),
    v_ref."time",
    'agendado',
    v_ref.notes,
    p_recurrence_group_id,
    v_freq
  from generate_series(1, v_total - 1) as i
  where not exists (
    select 1 from public.appointments dup
     where dup.company_id = v_company_id
       and dup.recurrence_group_id = p_recurrence_group_id
       and dup."date" = to_char(v_ref."date"::date + (i * v_step), 'YYYY-MM-DD')
  );
  get diagnostics v_created = row_count;

  return jsonb_build_object(
    'ok', true,
    'updatedCount', v_count,
    'deletedCount', v_deleted,
    'createdCount', v_created,
    'frequency', v_freq
  );
end;
$$;

revoke all on function public.update_recurrence_frequency(text, text, text, text) from public;
grant execute on function public.update_recurrence_frequency(text, text, text, text) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- Fix 2: update_appointment — add date/time sync for Multi
-- (replaces the version from 0051, same 9-param signature)
-- ═══════════════════════════════════════════════════════════════════════
create or replace function public.update_appointment(
  p_slug           text,
  p_password       text,
  p_id             bigint,
  p_status         text     default null,
  p_rescheduled_to text     default null,
  p_notes          text     default null,
  p_date           text     default null,
  p_time           text     default null,
  p_frequency      text     default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id   bigint;
  v_existing     public.appointments%rowtype;
  v_updated      public.appointments%rowtype;
  v_patient      public.patients%rowtype;
  v_is_abs       boolean;
  v_was_abs      boolean;
  v_new_abs      integer;
  v_new_conseq   integer;
  v_freq         text;
  v_propagated   integer := 0;
  v_multi_synced integer := 0;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  select * into v_existing from public.appointments
   where id = p_id and company_id = v_company_id;
  if not found then raise exception 'Appointment % not found', p_id; end if;

  -- Resolve frequency
  v_freq := null;
  if p_frequency is not null and btrim(p_frequency) <> '' then
    v_freq := lower(btrim(p_frequency));
    if v_freq not in ('semanal', 'quinzenal', 'mensal') then
      v_freq := null;
    end if;
  end if;

  -- Update the target appointment
  update public.appointments
     set status         = coalesce(p_status, status),
         rescheduled_to = coalesce(p_rescheduled_to, rescheduled_to),
         notes          = coalesce(p_notes, notes),
         "date"         = coalesce(p_date, "date"),
         "time"         = coalesce(p_time, "time"),
         frequency      = coalesce(v_freq, frequency),
         updated_at     = now()
   where id = p_id and company_id = v_company_id
   returning * into v_updated;

  select * into v_patient from public.patients
   where id = v_updated.patient_id;

  -- Absence tracking
  v_is_abs  := coalesce(v_updated.status, '') in ('ausente','falta_nao_justificada');
  v_was_abs := coalesce(v_existing.status, '') in ('ausente','falta_nao_justificada');

  if p_status is not null then
    if v_is_abs and not v_was_abs then
      v_new_abs    := coalesce(v_patient.absence_count, 0) + 1;
      v_new_conseq := coalesce(v_patient.consecutive_unjustified_absences, 0);
      if v_updated.status = 'falta_nao_justificada' then
        v_new_conseq := v_new_conseq + 1;
      end if;
      update public.patients
         set absence_count = v_new_abs,
             consecutive_unjustified_absences = v_new_conseq,
             updated_at = now()
       where id = v_patient.id
       returning * into v_patient;

    elsif v_was_abs and not v_is_abs then
      v_new_abs    := greatest(0, coalesce(v_patient.absence_count, 1) - 1);
      v_new_conseq := coalesce(v_patient.consecutive_unjustified_absences, 0);
      if v_existing.status in ('ausente','falta_nao_justificada') then
        v_new_conseq := greatest(0, v_new_conseq - 1);
      end if;
      update public.patients
         set absence_count = v_new_abs,
             consecutive_unjustified_absences = v_new_conseq,
             updated_at = now()
       where id = v_patient.id
       returning * into v_patient;
    end if;
  end if;

  -- ── Recurrence propagation (from 0036/0051) ──
  if p_status = 'atendimento'
     and v_existing.recurrence_group_id is not null
     and btrim(v_existing.recurrence_group_id) <> '' then
    update public.appointments
       set status     = 'atendimento',
           updated_at = now()
     where company_id = v_company_id
       and recurrence_group_id = v_existing.recurrence_group_id
       and id <> v_updated.id
       and "date" > v_updated."date"
       and lower(coalesce(status, 'agendado')) in ('agendado','agendada','scheduled');
    get diagnostics v_propagated = row_count;
  end if;

  -- ── Multi sync: status + date + time ──
  -- Uses the ORIGINAL date/time (v_existing) to find the partner,
  -- then updates them to the NEW values.
  if p_status is not null or p_date is not null or p_time is not null then
    update public.appointments
       set status     = case when p_status is not null then p_status else status end,
           "date"     = case when p_date is not null then p_date else "date" end,
           "time"     = case when p_time is not null then p_time else "time" end,
           updated_at = now()
     where company_id = v_company_id
       and patient_id = v_updated.patient_id
       and "date"     = v_existing."date"
       and "time"     = v_existing."time"
       and id        <> v_updated.id
       and professional_id <> v_updated.professional_id;
    get diagnostics v_multi_synced = row_count;

    -- Propagate "atendimento" to the partner's future recurrence
    if p_status = 'atendimento' and v_multi_synced > 0 then
      update public.appointments future_apt
         set status     = 'atendimento',
             updated_at = now()
        from (
          select distinct recurrence_group_id
            from public.appointments
           where company_id = v_company_id
             and patient_id = v_updated.patient_id
             and "date"     = v_updated."date"
             and "time"     = v_updated."time"
             and id        <> v_updated.id
             and professional_id <> v_updated.professional_id
             and recurrence_group_id is not null
             and btrim(recurrence_group_id) <> ''
        ) partner
       where future_apt.company_id = v_company_id
         and future_apt.recurrence_group_id = partner.recurrence_group_id
         and future_apt."date" > v_updated."date"
         and lower(coalesce(future_apt.status, 'agendado')) in ('agendado','agendada','scheduled');
    end if;
  end if;

  -- ── Multi notes propagation ──
  if p_notes is not null
     and p_notes like 'Atendimento Multi com%'
     and v_updated.recurrence_group_id is not null
     and btrim(v_updated.recurrence_group_id) <> '' then
    update public.appointments
       set notes      = p_notes,
           updated_at = now()
     where company_id = v_company_id
       and recurrence_group_id = v_updated.recurrence_group_id
       and id <> v_updated.id
       and "date" >= v_updated."date";
  end if;

  return jsonb_build_object(
    'id',                v_updated.id,
    'companyId',         v_updated.company_id,
    'patientId',         v_updated.patient_id,
    'professionalId',    v_updated.professional_id,
    'date',              v_updated.date,
    'time',              v_updated.time,
    'status',            v_updated.status,
    'notes',             v_updated.notes,
    'rescheduledTo',     v_updated.rescheduled_to,
    'recurrenceGroupId', v_updated.recurrence_group_id,
    'frequency',         v_updated.frequency,
    'consecutiveUnjustifiedAbsences', coalesce(v_patient.consecutive_unjustified_absences, 0),
    'escolaPublica',     coalesce(v_patient.escola_publica, false),
    'trabalhoNaRoca',    coalesce(v_patient.trabalho_na_roca, false),
    'propagatedCount',   v_propagated,
    'multiSyncedCount',  v_multi_synced
  );
end;
$$;

revoke all on function public.update_appointment(text, text, bigint, text, text, text, text, text, text) from public;
grant execute on function public.update_appointment(text, text, bigint, text, text, text, text, text, text) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- Data fix: clean up rows from frequency changes that already happened.
-- For each recurrence group, delete future "agendado" rows that don't
-- match the current frequency interval.
-- ═══════════════════════════════════════════════════════════════════════
do $$
declare
  grp record;
  v_step integer;
  v_deleted integer;
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

    -- Only clean up non-semanal groups (semanal keeps every 7-day row)
    if v_step > 7 then
      delete from public.appointments
       where company_id = grp.company_id
         and recurrence_group_id = grp.recurrence_group_id
         and "date"::date > grp.ref_date
         and lower(coalesce(status, 'agendado')) = 'agendado'
         and (("date"::date - grp.ref_date) % v_step) != 0;

      get diagnostics v_deleted = row_count;
      if v_deleted > 0 then
        raise notice 'Group % (company=%): deleted % stale rows (freq=%)',
          grp.recurrence_group_id, grp.company_id, v_deleted, grp.frequency;
      end if;
    end if;
  end loop;
end;
$$;

commit;
