-- =========================================================================
-- 0061_fila_espera_dedup_sync.sql
--
-- 1. Remove duplicate entries (same patient + same specialty) keeping
--    only the oldest entry per patient+specialty pair.
-- 2. Remove from waiting_list all patients who already have active
--    future appointments in the SAME specialty.
-- 3. Add unique constraint to prevent future duplicates.
-- 4. Create RPC sync_waiting_list_with_agenda for on-demand cleanup.
-- =========================================================================

begin;

-- ═══════════════════════════════════════════════════════════════════════
-- Step 1: Remove duplicate entries (same patient + same specialty)
-- Keep the one with the lowest id (oldest entry).
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  v_deleted integer := 0;
begin
  delete from public.waiting_list
   where id not in (
     select min(id)
       from public.waiting_list
      group by company_id, patient_id, coalesce(specialty, '__NULL__')
   );
  get diagnostics v_deleted = row_count;
  raise notice '[0061] Removed % duplicate waiting_list entries', v_deleted;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- Step 2: Remove entries where patient has active appointments
-- in the same specialty (date >= today, not cancelled/absent/etc.)
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  v_today   text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  v_cleaned integer := 0;
begin
  delete from public.waiting_list wl
   where exists (
     select 1 from public.appointments a
       join public.professionals p on p.id = a.professional_id
                                   and p.company_id = a.company_id
      where a.company_id = wl.company_id
        and a.patient_id = wl.patient_id
        and a."date" >= v_today
        and lower(coalesce(a.status, 'agendado')) not in (
          'desmarcado','cancelado','alta','falta','falta_justificada',
          'falta_nao_justificada','ausente','desistência','desistencia','óbito'
        )
        and (
          wl.specialty is null
          or lower(btrim(coalesce(p.specialty, ''))) = lower(btrim(coalesce(wl.specialty, '')))
        )
   );
  get diagnostics v_cleaned = row_count;
  raise notice '[0061] Removed % waiting_list entries (patient has active appointments)', v_cleaned;
end;

$$;

-- Fix patients.status stuck as 'Fila de Espera' when they have active appointments
do $$
declare
  v_today text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  v_fixed integer := 0;
begin
  update public.patients p
     set status = 'Atendimento', updated_at = now()
   where coalesce(p.status, '') in ('Fila de Espera', 'Aguardando Triagem', '')
     and exists (
       select 1 from public.appointments a
        where a.patient_id = p.id
          and a.company_id = p.company_id
          and a."date" >= v_today
          and lower(coalesce(a.status, 'agendado')) not in (
            'desmarcado','cancelado','alta','falta','falta_justificada',
            'falta_nao_justificada','ausente','desistência','desistencia','óbito'
          )
     )
     and not exists (
       select 1 from public.waiting_list wl
        where wl.patient_id = p.id and wl.company_id = p.company_id
     );
  get diagnostics v_fixed = row_count;
  raise notice '[0061] Fixed % patient statuses to Atendimento', v_fixed;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- Step 3: Unique constraint to prevent future duplicates
-- (patient + specialty per company)
-- ═══════════════════════════════════════════════════════════════════════

create unique index if not exists idx_waiting_list_no_dup
  on public.waiting_list (company_id, patient_id, coalesce(specialty, '__NULL__'));

-- ═══════════════════════════════════════════════════════════════════════
-- Step 4: RPC for on-demand sync (called from frontend on page load)
-- Returns how many entries were cleaned.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.sync_waiting_list_with_agenda(
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
  v_today      text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  v_cleaned    integer := 0;
  v_deduped    integer := 0;
  v_status_fix integer := 0;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  -- 1. Remove duplicates (keep oldest)
  delete from public.waiting_list
   where company_id = v_company_id
     and id not in (
       select min(id)
         from public.waiting_list
        where company_id = v_company_id
        group by patient_id, coalesce(specialty, '__NULL__')
     );
  get diagnostics v_deduped = row_count;

  -- 2. Remove entries where patient has active appointment in same specialty
  delete from public.waiting_list wl
   where wl.company_id = v_company_id
     and exists (
       select 1 from public.appointments a
         join public.professionals p on p.id = a.professional_id
                                     and p.company_id = a.company_id
        where a.company_id = v_company_id
          and a.patient_id = wl.patient_id
          and a."date" >= v_today
          and lower(coalesce(a.status, 'agendado')) not in (
            'desmarcado','cancelado','alta','falta','falta_justificada',
            'falta_nao_justificada','ausente','desistência','desistencia','óbito'
          )
          and (
            wl.specialty is null
            or lower(btrim(coalesce(p.specialty, ''))) = lower(btrim(coalesce(wl.specialty, '')))
          )
     );
  get diagnostics v_cleaned = row_count;

  -- 3. Fix patients.status
  update public.patients pt
     set status = 'Atendimento', updated_at = now()
   where pt.company_id = v_company_id
     and coalesce(pt.status, '') in ('Fila de Espera', 'Aguardando Triagem', '')
     and exists (
       select 1 from public.appointments a
        where a.patient_id = pt.id
          and a.company_id = v_company_id
          and a."date" >= v_today
          and lower(coalesce(a.status, 'agendado')) not in (
            'desmarcado','cancelado','alta','falta','falta_justificada',
            'falta_nao_justificada','ausente','desistência','desistencia','óbito'
          )
     )
     and not exists (
       select 1 from public.waiting_list wl
        where wl.patient_id = pt.id and wl.company_id = v_company_id
     );
  get diagnostics v_status_fix = row_count;

  return jsonb_build_object(
    'ok', true,
    'duplicatesRemoved', v_deduped,
    'syncedRemoved', v_cleaned,
    'statusFixed', v_status_fix
  );
end;
$$;

revoke all on function public.sync_waiting_list_with_agenda(text, text) from public;
grant execute on function public.sync_waiting_list_with_agenda(text, text) to anon, authenticated;

commit;
