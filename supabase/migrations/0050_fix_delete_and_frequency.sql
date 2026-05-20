-- =========================================================================
-- 0050_fix_delete_and_frequency.sql
--
-- Bug fix #1: "Ghost patient" — delete_appointment_alta only deleted
-- future rows; past rows survived and expandRecurrence recreated virtual
-- projections.  Now deletes ALL rows in the recurrence group.
--
-- Bug fix #2: Frequency update for single appointments (no recurrence
-- group) — update_appointment now accepts p_frequency.
-- =========================================================================

begin;

-- ── Fix 1: delete_appointment_alta — delete entire recurrence group ──
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
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  select * into v_existing from public.appointments
   where id = p_id and company_id = v_company_id;
  if not found then raise exception 'Appointment not found'; end if;

  if v_existing.recurrence_group_id is not null then
    -- Delete ALL appointments in the recurrence group (past + future)
    -- to prevent expandRecurrence from recreating ghosts.
    delete from public.appointments
     where company_id = v_company_id
       and recurrence_group_id = v_existing.recurrence_group_id;
    get diagnostics v_deleted_count = row_count;
  else
    delete from public.appointments
     where id = p_id and company_id = v_company_id;
    v_deleted_count := 1;
  end if;

  return jsonb_build_object('ok', true, 'deletedCount', v_deleted_count);
end;
$$;

-- ── Fix 2: update_appointment — add optional p_frequency parameter ──
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
  v_company_id bigint;
  v_existing   public.appointments%rowtype;
  v_updated    public.appointments%rowtype;
  v_patient    public.patients%rowtype;
  v_is_abs     boolean;
  v_was_abs    boolean;
  v_new_abs    integer;
  v_new_conseq integer;
  v_freq       text;
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
  v_is_abs := coalesce(v_updated.status, '') in ('ausente','falta_nao_justificada');
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
    'trabalhoNaRoca',    coalesce(v_patient.trabalho_na_roca, false)
  );
end;
$$;

commit;
