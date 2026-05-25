-- =========================================================================
-- 0058_fila_cleanup_rerun.sql
--
-- Re-run data cleanup: remove from waiting_list all patients who already
-- have active/future appointments. Fix patients.status from
-- 'Fila de Espera' to 'Atendimento' for patients with active schedules.
--
-- This is a re-run of the 0057 Part 3 cleanup to catch any patients
-- that were re-added to the fila between the 0057 execution and now.
-- =========================================================================

do $$
declare
  v_today text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  v_cleaned integer := 0;
  v_status_fixed integer := 0;
  rec record;
begin
  -- 1) Remove from waiting_list patients who have active future appointments
  for rec in
    select wl.id as wl_id, wl.patient_id, wl.company_id, wl.specialty
      from public.waiting_list wl
     where exists (
       select 1 from public.appointments a
         join public.professionals p on p.id = a.professional_id
        where a.company_id = wl.company_id
          and a.patient_id = wl.patient_id
          and a."date" >= v_today
          and a.status not in (
            'desmarcado','cancelado','alta','falta','falta_justificada',
            'falta_nao_justificada','ausente','desistência','desistencia','óbito'
          )
          and (
            wl.specialty is null
            or lower(btrim(coalesce(p.specialty, ''))) = lower(btrim(coalesce(wl.specialty, '')))
          )
     )
  loop
    delete from public.waiting_list where id = rec.wl_id;
    v_cleaned := v_cleaned + 1;
  end loop;

  raise notice '[0058] Removed % patients from waiting_list (already have active appointments)', v_cleaned;

  -- 2) Fix patients.status: 'Fila de Espera' → 'Atendimento' for patients
  --    who have active appointments and no remaining fila entries
  update public.patients p
     set status = 'Atendimento', updated_at = now()
   where coalesce(p.status, '') in ('Fila de Espera', 'Aguardando Triagem', '')
     and exists (
       select 1 from public.appointments a
        where a.patient_id = p.id
          and a.company_id = p.company_id
          and a."date" >= v_today
          and a.status not in (
            'desmarcado','cancelado','alta','falta','falta_justificada',
            'falta_nao_justificada','ausente','desistência','desistencia','óbito'
          )
     )
     and not exists (
       select 1 from public.waiting_list wl
        where wl.patient_id = p.id
          and wl.company_id = p.company_id
     );
  get diagnostics v_status_fixed = row_count;

  raise notice '[0058] Fixed % patient statuses to Atendimento', v_status_fixed;
end;
$$;
