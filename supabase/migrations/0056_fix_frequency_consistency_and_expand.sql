-- =========================================================================
-- 0056_fix_frequency_consistency_and_expand.sql
--
-- Data fix: aligns frequency across all rows in each recurrence group.
-- If any row in a group has a non-semanal frequency, ALL rows in that
-- group get updated to match (uses the most restrictive frequency).
-- Also syncs frequency between Multi partners.
-- =========================================================================

begin;

-- Step 1: Fix inconsistent frequencies within each recurrence group
-- Take the most recent frequency value (from the latest updated_at row)
do $$
declare
  grp record;
  v_latest_freq text;
  v_updated integer;
begin
  for grp in
    select distinct company_id, recurrence_group_id
      from public.appointments
     where recurrence_group_id is not null
       and btrim(recurrence_group_id) <> ''
     group by company_id, recurrence_group_id
    having count(distinct coalesce(frequency, 'semanal')) > 1
  loop
    -- Get the frequency from the most recently updated row
    select coalesce(frequency, 'semanal') into v_latest_freq
      from public.appointments
     where company_id = grp.company_id
       and recurrence_group_id = grp.recurrence_group_id
     order by updated_at desc nulls last
     limit 1;

    update public.appointments
       set frequency = v_latest_freq,
           updated_at = now()
     where company_id = grp.company_id
       and recurrence_group_id = grp.recurrence_group_id
       and coalesce(frequency, 'semanal') <> v_latest_freq;

    get diagnostics v_updated = row_count;
    if v_updated > 0 then
      raise notice 'Group % (company=%): aligned % rows to frequency=%',
        grp.recurrence_group_id, grp.company_id, v_updated, v_latest_freq;
    end if;
  end loop;
end;
$$;

-- Step 2: Sync frequency between Multi partners
-- If prof A has frequency='mensal' and prof B (same patient/date/time) has 'semanal',
-- update prof B to match prof A (use the most recently updated)
do $$
declare
  pair record;
  v_correct_freq text;
  v_updated integer;
begin
  for pair in
    select a1.company_id,
           a1.recurrence_group_id as group1,
           a2.recurrence_group_id as group2,
           a1.patient_id
      from public.appointments a1
      join public.appointments a2
        on a2.company_id = a1.company_id
       and a2.patient_id = a1.patient_id
       and a2."date" = a1."date"
       and a2."time" = a1."time"
       and a2.professional_id <> a1.professional_id
       and a2.recurrence_group_id is not null
       and btrim(a2.recurrence_group_id) <> ''
       and a1.recurrence_group_id <> a2.recurrence_group_id
     where a1.recurrence_group_id is not null
       and btrim(a1.recurrence_group_id) <> ''
       and coalesce(a1.frequency, 'semanal') <> coalesce(a2.frequency, 'semanal')
     group by a1.company_id, a1.recurrence_group_id, a2.recurrence_group_id, a1.patient_id
  loop
    -- Use the most recently updated frequency
    select coalesce(frequency, 'semanal') into v_correct_freq
      from public.appointments
     where company_id = pair.company_id
       and recurrence_group_id in (pair.group1, pair.group2)
     order by updated_at desc nulls last
     limit 1;

    update public.appointments
       set frequency = v_correct_freq,
           updated_at = now()
     where company_id = pair.company_id
       and recurrence_group_id in (pair.group1, pair.group2)
       and coalesce(frequency, 'semanal') <> v_correct_freq;

    get diagnostics v_updated = row_count;
    if v_updated > 0 then
      raise notice 'Multi sync (patient=%): aligned % rows to frequency=%',
        pair.patient_id, v_updated, v_correct_freq;
    end if;
  end loop;
end;
$$;

commit;
