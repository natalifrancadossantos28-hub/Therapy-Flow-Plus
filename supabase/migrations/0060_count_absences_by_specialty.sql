-- =========================================================================
-- 0060: count_absences_by_specialty
-- Returns absence counts grouped by patient_id + specialty for today's
-- appointments, so the reception screen can show per-specialty falta alerts.
-- =========================================================================

begin;

create or replace function public.count_absences_by_specialty(
  p_slug     text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_result     jsonb;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_result
    from (
      select
        a.patient_id,
        p2.specialty,
        count(*) as absence_count
      from public.appointments a
      join public.professionals p2
        on p2.id = a.professional_id
       and p2.company_id = a.company_id
      where a.company_id = v_company_id
        and lower(a.status) in ('ausente', 'falta_nao_justificada')
      group by a.patient_id, p2.specialty
    ) t;

  return v_result;
end;
$$;

revoke all on function public.count_absences_by_specialty(text, text) from public;
grant execute on function public.count_absences_by_specialty(text, text) to anon, authenticated;

commit;
