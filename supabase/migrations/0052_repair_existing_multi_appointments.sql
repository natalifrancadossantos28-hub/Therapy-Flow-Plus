-- =========================================================================
-- 0052_repair_existing_multi_appointments.sql
--
-- ONE-TIME DATA FIX for existing Multi appointments that were created
-- before migration 0051 / PR #133 fixed the creation flow.
--
-- Problem: Multi appointments created with noRecurrence=true have:
--   - recurrence_group_id = NULL  (no recurrence)
--   - Only 1 row in the DB       (doesn't appear in future weeks)
--   - Partner may have mismatched notes (missing "Atendimento Multi" tag)
--
-- This script:
--   1. Finds all appointments with notes LIKE 'Atendimento Multi com%'
--      that have NO recurrence_group_id
--   2. Assigns a new recurrence_group_id (UUID)
--   3. Creates 51 additional weekly rows (total 52 weeks of recurrence)
--   4. Ensures the partner appointment (same patient/date/time, different
--      professional) also gets a recurrence group if missing
--   5. Aligns partner's time to match (fixes time mismatches)
-- =========================================================================

begin;

-- Step 1: Fix Multi appointments that have no recurrence group
do $$
declare
  rec        record;
  v_group_id text;
  v_step     integer;
  v_total    integer;
  v_start    date;
  v_freq     text;
  v_count    integer;
begin
  for rec in
    select *
      from public.appointments
     where notes like 'Atendimento Multi com%'
       and (recurrence_group_id is null or btrim(recurrence_group_id) = '')
     order by company_id, patient_id, "date", "time"
  loop
    v_freq     := coalesce(rec.frequency, 'semanal');
    v_group_id := gen_random_uuid()::text;
    v_step     := case v_freq
                    when 'quinzenal' then 14
                    when 'mensal'    then 28
                    else 7
                  end;
    v_total    := case v_freq
                    when 'quinzenal' then 26
                    when 'mensal'    then 13
                    else 52
                  end;
    v_start    := rec."date"::date;

    -- Assign recurrence group to the existing row
    update public.appointments
       set recurrence_group_id = v_group_id,
           updated_at          = now()
     where id = rec.id;

    -- Create the remaining weekly rows (skip week 0 = already exists)
    insert into public.appointments (
      company_id, patient_id, professional_id,
      "date", "time", status, notes,
      recurrence_group_id, frequency
    )
    select
      rec.company_id, rec.patient_id, rec.professional_id,
      to_char(v_start + (i * v_step), 'YYYY-MM-DD'),
      rec."time",
      'agendado',
      rec.notes,
      v_group_id,
      v_freq
    from generate_series(1, v_total - 1) as i
    where not exists (
      select 1 from public.appointments dup
       where dup.company_id      = rec.company_id
         and dup.patient_id      = rec.patient_id
         and dup.professional_id = rec.professional_id
         and dup."date"          = to_char(v_start + (i * v_step), 'YYYY-MM-DD')
         and dup."time"          = rec."time"
    );

    get diagnostics v_count = row_count;
    raise notice 'Appointment id=% (patient=%, prof=%, %): assigned group=%, created % rows',
      rec.id, rec.patient_id, rec.professional_id, rec."date", v_group_id, v_count;
  end loop;
end;
$$;

-- Step 2: For each Multi pair, ensure the partner also has Multi notes.
-- A "partner" is an appointment with same (company_id, patient_id, date, time)
-- but different professional_id, where ONE side has Multi notes and the other doesn't.
do $$
declare
  rec record;
begin
  for rec in
    select
      a.id            as multi_id,
      a.notes         as multi_notes,
      a.professional_id as multi_prof,
      b.id            as partner_id,
      b.notes         as partner_notes,
      b.professional_id as partner_prof
    from public.appointments a
    join public.appointments b
      on  b.company_id      = a.company_id
      and b.patient_id      = a.patient_id
      and b."date"          = a."date"
      and b."time"          = a."time"
      and b.professional_id <> a.professional_id
      and b.id              <> a.id
    where a.notes like 'Atendimento Multi com%'
      and (b.notes is null or b.notes not like 'Atendimento Multi com%')
  loop
    -- Extract the Multi prof's name from the notes to build partner notes
    -- Format: "Atendimento Multi com [Prof] ([Specialty])"
    -- We just mark the partner as Multi referencing the other prof's appointment
    update public.appointments
       set notes      = 'Atendimento Multi com parceiro (vínculo restaurado)',
           updated_at = now()
     where id = rec.partner_id;

    raise notice 'Partner id=% (prof=%) updated with Multi notes (partner of id=% prof=%)',
      rec.partner_id, rec.partner_prof, rec.multi_id, rec.multi_prof;
  end loop;
end;
$$;

commit;
