-- =========================================================================
-- 0057_fix_fila_espera_sync.sql
--
-- Fix: Fila de Espera ↔ Agenda synchronization
--
-- Bug: When admin deletes an appointment (patient goes to fila) and then
-- re-creates an appointment for the same patient, the patient stays stuck
-- in the fila de espera. Two issues:
--
-- 1. create_appointments (0019) removes from waiting_list by specialty,
--    but only sets patients.status='Atendimento' when fromWaitingList=true.
--    In "Agendamento Direto" mode, status stays as "Fila de Espera".
--    FIX: ALWAYS update status to 'Atendimento' when creating appointments.
--
-- 2. update_appointment (0055) lost the 0017 logic that returns patient
--    to fila when appointment is marked as 'desmarcado'.
--    FIX: Restore the desmarcado→fila logic.
--
-- 3. Data fix: clean up patients stuck in fila who already have active
--    appointments.
-- =========================================================================

begin;

-- ═══════════════════════════════════════════════════════════════════════
-- Fix 1: create_appointments — ALWAYS sync patients.status
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.create_appointments(
  p_slug               text,
  p_password           text,
  p_patient_id         bigint,
  p_professional_id    bigint,
  p_date               text,
  p_time               text,
  p_notes              text    default null,
  p_frequency          text    default 'semanal',
  p_no_recurrence      boolean default false,
  p_from_waiting_list  boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id        bigint;
  v_tipo              text;
  v_group_id          text;
  v_step              integer;
  v_total             integer;
  v_start_date        date := (p_date)::date;
  v_first             public.appointments%rowtype;
  v_count             integer := 0;
  v_frequency         text := coalesce(p_frequency, 'semanal');
  v_prof_specialty    text;
  v_remaining         integer;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  if p_patient_id is null then raise exception 'patient_id is required'; end if;
  if p_professional_id is null then raise exception 'professional_id is required'; end if;

  select tipo_registro into v_tipo from public.patients
   where id = p_patient_id and company_id = v_company_id;
  if not found then raise exception 'Patient not found'; end if;
  if v_tipo = 'Registro Censo Municipal' then
    raise exception 'Registro Censo Municipal: pacientes do Censo Municipal nao podem ser agendados.' using errcode = '22023';
  end if;

  if v_frequency not in ('semanal','quinzenal','mensal') then
    v_frequency := 'semanal';
  end if;

  if coalesce(p_no_recurrence, false) then
    insert into public.appointments (
      company_id, patient_id, professional_id, "date", "time", status, notes,
      recurrence_group_id, frequency
    ) values (
      v_company_id, p_patient_id, p_professional_id, p_date, p_time, 'agendado', p_notes,
      null, v_frequency
    )
    returning * into v_first;
    v_count := 1;
  else
    v_group_id := gen_random_uuid()::text;
    v_step  := case v_frequency when 'quinzenal' then 14 when 'mensal' then 28 else 7 end;
    v_total := case v_frequency when 'quinzenal' then 26 when 'mensal' then 13 else 52 end;

    insert into public.appointments (
      company_id, patient_id, professional_id, "date", "time", status, notes,
      recurrence_group_id, frequency
    )
    select
      v_company_id, p_patient_id, p_professional_id,
      to_char(v_start_date + (i * v_step), 'YYYY-MM-DD'),
      p_time, 'agendado', p_notes, v_group_id, v_frequency
    from generate_series(0, v_total - 1) as i;

    v_count := v_total;

    select * into v_first
      from public.appointments
     where company_id = v_company_id
       and recurrence_group_id = v_group_id
     order by "date", "time"
     limit 1;
  end if;

  -- ===============================================================
  -- SEMPRE: remove da waiting_list a entrada que casa com a
  -- especialidade do profissional agendado.
  -- ===============================================================
  select specialty into v_prof_specialty
    from public.professionals
   where id = p_professional_id and company_id = v_company_id;

  delete from public.waiting_list
   where company_id = v_company_id
     and patient_id = p_patient_id
     and (
       specialty is null
       or (
         v_prof_specialty is not null
         and lower(btrim(specialty)) = lower(btrim(v_prof_specialty))
       )
     );

  -- ===============================================================
  -- SEMPRE: atualiza status do paciente para 'Atendimento' quando
  -- não há mais entradas na fila. Removido o gate
  -- p_from_waiting_list — se o paciente está sendo agendado
  -- (independente de como), ele DEVE sair do status Fila de Espera.
  -- ===============================================================
  select count(*) into v_remaining
    from public.waiting_list
   where company_id = v_company_id and patient_id = p_patient_id;

  if v_remaining = 0 then
    update public.patients
       set status = 'Atendimento',
           professional_id = p_professional_id,
           updated_at = now()
     where id = p_patient_id
       and company_id = v_company_id
       and coalesce(status, '') in ('Fila de Espera', 'Aguardando Triagem', '');
  end if;

  return jsonb_build_object(
    'id',                v_first.id,
    'companyId',         v_first.company_id,
    'patientId',         v_first.patient_id,
    'professionalId',    v_first.professional_id,
    'date',              v_first."date",
    'time',              v_first."time",
    'status',            v_first.status,
    'notes',             v_first.notes,
    'recurrenceGroupId', v_first.recurrence_group_id,
    'frequency',         v_first.frequency,
    'createdAt',         v_first.created_at,
    'updatedAt',         v_first.updated_at,
    'totalCreated',      v_count
  );
end;
$$;

revoke all on function public.create_appointments(text, text, bigint, bigint, text, text, text, text, boolean, boolean) from public;
grant execute on function public.create_appointments(text, text, bigint, bigint, text, text, text, text, boolean, boolean) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- Fix 2: update_appointment — restore 0017 desmarcado→fila logic
-- (was lost when 0050/0051/0053/0055 rewrote the function)
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
  v_company_id         bigint;
  v_today              text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  v_existing           public.appointments%rowtype;
  v_updated            public.appointments%rowtype;
  v_patient            public.patients%rowtype;
  v_is_abs             boolean;
  v_was_abs            boolean;
  v_new_abs            integer;
  v_new_conseq         integer;
  v_freq               text;
  v_propagated         integer := 0;
  v_multi_synced       integer := 0;
  v_specialty          text;
  v_active_same_spec   integer := 0;
  v_existing_queue     integer := 0;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  select * into v_existing from public.appointments
   where id = p_id and company_id = v_company_id;
  if not found then raise exception 'Appointment % not found', p_id; end if;

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

  -- ── Absence tracking ──
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

  -- ═══════════════════════════════════════════════════════════════════
  -- RESTORED from 0017: desmarcar devolve paciente à fila da
  -- especialidade se não tiver outro horário ativo na mesma área.
  -- ═══════════════════════════════════════════════════════════════════
  if p_status = 'desmarcado' and v_existing.status is distinct from 'desmarcado' then
    select specialty into v_specialty
      from public.professionals
     where id = v_updated.professional_id and company_id = v_company_id;

    if v_specialty is not null and btrim(v_specialty) <> '' then
      select count(*) into v_active_same_spec
        from public.appointments a
        join public.professionals p2 on p2.id = a.professional_id
       where a.company_id = v_company_id
         and a.patient_id = v_updated.patient_id
         and a.id <> v_updated.id
         and a.status in ('agendado','atendimento','em_atendimento')
         and a."date" >= v_today
         and lower(btrim(coalesce(p2.specialty, ''))) = lower(btrim(v_specialty));

      if v_active_same_spec = 0 then
        select count(*) into v_existing_queue
          from public.waiting_list
         where company_id = v_company_id
           and patient_id = v_updated.patient_id
           and lower(btrim(coalesce(specialty, ''))) = lower(btrim(v_specialty));

        if v_existing_queue = 0 then
          insert into public.waiting_list (
            company_id, patient_id, professional_id, specialty, priority, entry_date, notes
          ) values (
            v_company_id,
            v_updated.patient_id,
            v_updated.professional_id,
            v_specialty,
            'media',
            v_today,
            'Re-adicionado após desmarcar horário #' || v_updated.id
          );
        end if;
      end if;
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
    'trabalhoNaRoca',    coalesce(v_patient.trabalho_na_roca, false),
    'propagatedCount',   v_propagated,
    'multiSyncedCount',  v_multi_synced
  );
end;
$$;

revoke all on function public.update_appointment(text, text, bigint, text, text, text, text, text, text) from public;
grant execute on function public.update_appointment(text, text, bigint, text, text, text, text, text, text) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- Data fix: remove from waiting_list patients who already have active
-- future appointments. Also fix patients.status for those stuck as
-- "Fila de Espera" despite having active appointments.
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  v_today    text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  v_cleaned  integer := 0;
  v_status_fixed integer := 0;
  rec        record;
begin
  -- Remove waiting_list entries for patients who have active appointments
  -- in the same specialty
  for rec in
    select wl.id as wl_id, wl.patient_id, wl.company_id, wl.specialty
      from public.waiting_list wl
     where exists (
       select 1
         from public.appointments a
         join public.professionals p on p.id = a.professional_id
        where a.company_id = wl.company_id
          and a.patient_id = wl.patient_id
          and a."date" >= v_today
          and a.status not in ('desmarcado','cancelado','alta',
                               'falta','falta_justificada','falta_nao_justificada','ausente')
          and (
            wl.specialty is null
            or lower(btrim(coalesce(p.specialty, ''))) = lower(btrim(coalesce(wl.specialty, '')))
          )
     )
  loop
    delete from public.waiting_list where id = rec.wl_id;
    v_cleaned := v_cleaned + 1;
    raise notice 'Removed waiting_list id=% (patient=%, specialty=%)',
      rec.wl_id, rec.patient_id, rec.specialty;
  end loop;

  raise notice 'Cleaned % waiting_list entries for patients with active appointments', v_cleaned;

  -- Fix patients.status: if patient has active future appointments
  -- but status is still "Fila de Espera", update to "Atendimento"
  update public.patients p
     set status     = 'Atendimento',
         updated_at = now()
   where coalesce(p.status, '') = 'Fila de Espera'
     and exists (
       select 1 from public.appointments a
        where a.patient_id = p.id
          and a.company_id = p.company_id
          and a."date" >= v_today
          and a.status not in ('desmarcado','cancelado','alta',
                               'falta','falta_justificada','falta_nao_justificada','ausente')
     )
     and not exists (
       select 1 from public.waiting_list wl
        where wl.patient_id = p.id
          and wl.company_id = p.company_id
     );
  get diagnostics v_status_fixed = row_count;

  raise notice 'Fixed % patients stuck in Fila de Espera with active appointments', v_status_fixed;
end;
$$;

commit;
