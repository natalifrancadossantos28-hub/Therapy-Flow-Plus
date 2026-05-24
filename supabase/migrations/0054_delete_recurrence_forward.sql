-- =============================================================================
-- 0054: delete_recurrence_forward
-- Deletes appointments in a recurrence group from a given date ONWARD only.
-- Past appointments (date < p_from_date) are preserved for clinical history.
-- Also handles Multi partner recurrence groups.
-- =============================================================================

begin;

create or replace function public.delete_recurrence_forward(
  p_slug                text,
  p_password            text,
  p_recurrence_group_id text,
  p_from_date           text,
  p_patient_id          bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id    bigint;
  v_deleted_count integer := 0;
  v_extra         integer := 0;
  v_partner_group text;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  if p_recurrence_group_id is null or btrim(p_recurrence_group_id) = '' then
    raise exception 'recurrence_group_id is required';
  end if;

  -- Find Multi partner's recurrence_group_id before deleting
  if p_patient_id is not null then
    select a2.recurrence_group_id into v_partner_group
      from public.appointments a1
      join public.appointments a2
        on a2.company_id = a1.company_id
       and a2.patient_id = a1.patient_id
       and a2."date"     = a1."date"
       and a2."time"     = a1."time"
       and a2.professional_id <> a1.professional_id
       and a2.recurrence_group_id is not null
       and btrim(a2.recurrence_group_id) <> ''
       and a2.recurrence_group_id <> p_recurrence_group_id
     where a1.company_id = v_company_id
       and a1.recurrence_group_id = p_recurrence_group_id
       and a1.patient_id = p_patient_id
     limit 1;
  end if;

  -- Delete from the selected date onward (preserves past)
  delete from public.appointments
   where company_id = v_company_id
     and recurrence_group_id = p_recurrence_group_id
     and "date" >= p_from_date;
  get diagnostics v_deleted_count = row_count;

  -- Also delete Multi partner's future appointments
  if v_partner_group is not null then
    delete from public.appointments
     where company_id = v_company_id
       and recurrence_group_id = v_partner_group
       and "date" >= p_from_date;
    get diagnostics v_extra = row_count;
    v_deleted_count := v_deleted_count + v_extra;
  end if;

  return jsonb_build_object(
    'ok', true,
    'deletedCount', v_deleted_count,
    'fromDate', p_from_date
  );
end;
$$;

revoke all on function public.delete_recurrence_forward(text, text, text, text, bigint) from public;
grant execute on function public.delete_recurrence_forward(text, text, text, text, bigint) to anon, authenticated;

commit;
