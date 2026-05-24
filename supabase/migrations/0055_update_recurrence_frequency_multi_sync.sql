-- =========================================================================
-- 0055_update_recurrence_frequency_multi_sync.sql
--
-- 1. Atualiza update_recurrence_frequency para sincronizar automaticamente
--    a frequência do parceiro Multi. Quando o profissional A muda de
--    semanal→mensal, o profissional B (mesmo paciente, mesma data/hora)
--    também é atualizado.
--
-- 2. Atualiza update_appointment para incluir frequency na sincronização
--    Multi (antes só sincronizava status, date, time).
-- =========================================================================

begin;

-- ═══════════════════════════════════════════════════════════════════════
-- Fix 1: update_recurrence_frequency — sync Multi partner group
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
  v_extra      integer;
  v_partner_group text;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  if p_recurrence_group_id is null or btrim(p_recurrence_group_id) = '' then
    raise exception 'recurrence_group_id is required';
  end if;

  v_freq := lower(btrim(coalesce(p_frequency, 'semanal')));
  if v_freq not in ('semanal', 'quinzenal', 'mensal') then
    v_freq := 'semanal';
  end if;

  -- Update primary recurrence group
  update public.appointments
     set frequency   = v_freq,
         updated_at  = now()
   where company_id = v_company_id
     and recurrence_group_id = p_recurrence_group_id;

  get diagnostics v_count = row_count;

  -- Find and update Multi partner's recurrence group
  select distinct a2.recurrence_group_id into v_partner_group
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
   limit 1;

  if v_partner_group is not null then
    update public.appointments
       set frequency   = v_freq,
           updated_at  = now()
     where company_id = v_company_id
       and recurrence_group_id = v_partner_group;

    get diagnostics v_extra = row_count;
    v_count := v_count + v_extra;
  end if;

  return jsonb_build_object(
    'ok', true,
    'updatedCount', v_count,
    'frequency', v_freq,
    'partnerGroupSynced', v_partner_group is not null
  );
end;
$$;

revoke all on function public.update_recurrence_frequency(text, text, text, text) from public;
grant execute on function public.update_recurrence_frequency(text, text, text, text) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- Fix 2: update_appointment — add frequency to Multi sync
-- (replaces the version from 0053, same 9-param signature)
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

  -- ── Multi sync: status + date + time + frequency ──
  if p_status is not null or p_date is not null or p_time is not null or v_freq is not null then
    update public.appointments
       set status     = case when p_status is not null then p_status else status end,
           "date"     = case when p_date is not null then p_date else "date" end,
           "time"     = case when p_time is not null then p_time else "time" end,
           frequency  = case when v_freq is not null then v_freq else frequency end,
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

    -- Propagate frequency change to Multi partner's entire recurrence group
    if v_freq is not null and v_multi_synced > 0 then
      update public.appointments future_apt
         set frequency  = v_freq,
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
         and future_apt.recurrence_group_id = partner.recurrence_group_id;
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

commit;
