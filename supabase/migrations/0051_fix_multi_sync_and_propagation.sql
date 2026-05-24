-- =========================================================================
-- 0051_fix_multi_sync_and_propagation.sql
--
-- Fixes:
-- 1. DROP the old 8-param update_appointment overload (from 0036) that
--    conflicts with the 9-param version (from 0050). The ambiguity
--    causes PostgREST "could not choose a candidate function" errors,
--    which surface as "Falha inesperada" in the frontend.
--
-- 2. RESTORE the recurrence propagation logic (lost when 0050 rewrote
--    update_appointment without the propagation block from 0036).
--    When a session is marked "atendimento", future "agendado" sessions
--    in the same recurrence group inherit the status automatically.
--
-- 3. ADD Multi-appointment bidirectional sync. When any status change
--    is applied to an Atendimento Multi appointment, the partner
--    appointment (same patient + date + time, different professional)
--    is updated in lockstep. For "atendimento" status, the partner's
--    future recurrence is also propagated.
--
-- 4. PROPAGATE Multi notes across the entire recurrence group so that
--    every week shows the "Atendimento Multi com ..." label (not just
--    the first week where Multi was configured).
--
-- 5. FIX delete_appointment_alta to also remove Multi partner
--    recurrence groups when giving a patient Alta.
-- =========================================================================

begin;

-- ── Step 1: Drop the stale 8-param overload from migration 0036 ──
-- The 9-param version (from 0050) is the one the frontend calls.
-- Having both causes PostgREST ambiguous function resolution errors.
drop function if exists public.update_appointment(text, text, bigint, text, text, text, text, text);

-- ── Step 2: Recreate the 9-param version with all fixes ──
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

  -- ── Update the target appointment ──
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

  -- ── Absence tracking (from 0050) ──
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

  -- ═══════════════════════════════════════════════════════════════════
  -- RESTORED from 0036: Recurrence propagation.
  -- When status changes to "atendimento", propagate to future
  -- "agendado" appointments in the same recurrence group.
  -- ═══════════════════════════════════════════════════════════════════
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

  -- ═══════════════════════════════════════════════════════════════════
  -- NEW: Multi-appointment bidirectional sync.
  -- Multi = same patient + date + time, different professional.
  -- When any status changes, the partner appointment on the same date
  -- receives the same status. For "atendimento", the partner's future
  -- recurrence is also propagated.
  -- ═══════════════════════════════════════════════════════════════════
  if p_status is not null then
    update public.appointments
       set status     = p_status,
           updated_at = now()
     where company_id = v_company_id
       and patient_id = v_updated.patient_id
       and "date"     = v_updated."date"
       and "time"     = v_updated."time"
       and id        <> v_updated.id
       and professional_id <> v_updated.professional_id;
    get diagnostics v_multi_synced = row_count;

    -- Propagate "atendimento" to the partner's future recurrence too
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

  -- ═══════════════════════════════════════════════════════════════════
  -- NEW: Multi notes propagation.
  -- When notes are set to "Atendimento Multi com ...", propagate to
  -- all future appointments in the same recurrence group so the Multi
  -- label shows on every week (not just the week where it was set).
  -- ═══════════════════════════════════════════════════════════════════
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
-- Fix delete_appointment_alta: also remove Multi partner recurrence
-- groups. When giving Alta to a Multi patient, both the original
-- recurrence group AND the partner's recurrence group must be deleted.
-- ═══════════════════════════════════════════════════════════════════════
create or replace function public.delete_appointment_alta(
  p_slug     text,
  p_password text,
  p_id       bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id    bigint;
  v_existing      public.appointments%rowtype;
  v_deleted_count integer := 0;
  v_partner_group text;
  v_extra         integer := 0;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  select * into v_existing from public.appointments
   where id = p_id and company_id = v_company_id;
  if not found then raise exception 'Appointment not found'; end if;

  -- Find Multi partner's recurrence_group_id (if any) before deleting
  select a.recurrence_group_id into v_partner_group
    from public.appointments a
   where a.company_id = v_company_id
     and a.patient_id = v_existing.patient_id
     and a."date"     = v_existing."date"
     and a."time"     = v_existing."time"
     and a.id        <> v_existing.id
     and a.professional_id <> v_existing.professional_id
     and a.recurrence_group_id is not null
     and btrim(a.recurrence_group_id) <> ''
   limit 1;

  if v_existing.recurrence_group_id is not null then
    delete from public.appointments
     where company_id = v_company_id
       and recurrence_group_id = v_existing.recurrence_group_id;
    get diagnostics v_deleted_count = row_count;
  else
    delete from public.appointments
     where id = p_id and company_id = v_company_id;
    v_deleted_count := 1;
  end if;

  -- Also delete Multi partner's recurrence group
  if v_partner_group is not null
     and v_partner_group is distinct from v_existing.recurrence_group_id then
    delete from public.appointments
     where company_id = v_company_id
       and recurrence_group_id = v_partner_group;
    get diagnostics v_extra = row_count;
    v_deleted_count := v_deleted_count + v_extra;
  end if;

  return jsonb_build_object('ok', true, 'deletedCount', v_deleted_count);
end;
$$;

revoke all on function public.delete_appointment_alta(text, text, bigint) from public;
grant execute on function public.delete_appointment_alta(text, text, bigint) to anon, authenticated;

commit;
