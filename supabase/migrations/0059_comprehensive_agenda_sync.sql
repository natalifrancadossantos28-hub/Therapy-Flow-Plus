-- =========================================================================
-- 0059_comprehensive_agenda_sync.sql
--
-- Comprehensive data cleanup: synchronize all agendas with fila de espera.
--
-- Problem: Some patients appear simultaneously in the agenda (with status
-- 'atendimento' or 'agendado') AND in the waiting_list. This happens when:
-- 1. The delete operation succeeded but virtual expansion re-created cards
-- 2. Frontend/backend sync issues left orphan rows
--
-- Strategy:
-- 1. For patients in waiting_list WITH future active appointments:
--    → Remove from waiting_list (the appointment takes priority)
-- 2. For patients with ALL future appointments desmarcado/cancelado
--    who are NOT in waiting_list:
--    → Add them to waiting_list
-- 3. Fix patients.status mismatches
-- 4. Remove duplicate appointment rows (same patient, date, time, professional)
-- =========================================================================

do $$
declare
  v_today text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  v_cleaned integer := 0;
  v_status_fixed integer := 0;
  v_dupes_removed integer := 0;
  rec record;
begin
  -- 1) Remove from waiting_list patients who have active future appointments
  --    (appointment takes priority over fila entry)
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

  raise notice '[0059] Removed % entries from waiting_list (patients with active appointments)', v_cleaned;

  -- 2) Fix patients.status: set to 'Atendimento' if has active future appointments
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
        where wl.patient_id = p.id and wl.company_id = p.company_id
     );
  get diagnostics v_status_fixed = row_count;

  raise notice '[0059] Fixed % patient statuses to Atendimento', v_status_fixed;

  -- 3) Remove duplicate appointment rows (same patient, date, time, professional)
  --    Keep the one with the lowest ID (earliest created)
  for rec in
    select a.id
      from public.appointments a
     where exists (
       select 1 from public.appointments dup
        where dup.company_id = a.company_id
          and dup.patient_id = a.patient_id
          and dup.professional_id = a.professional_id
          and dup."date" = a."date"
          and dup."time" = a."time"
          and dup.id < a.id
     )
     and a."date" >= v_today
  loop
    delete from public.appointments where id = rec.id;
    v_dupes_removed := v_dupes_removed + 1;
  end loop;

  raise notice '[0059] Removed % duplicate appointments', v_dupes_removed;
end;
$$;
