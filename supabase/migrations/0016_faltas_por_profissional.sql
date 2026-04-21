-- =============================================================================
-- 0016: Contagem de faltas isolada por (paciente, profissional)
-- =============================================================================
-- Problema: patients.absence_count e patients.consecutive_unjustified_absences
-- eram incrementados globalmente por paciente, de modo que uma falta com a
-- Psicologia também sinalizava alerta na Fonoaudiologia.
--
-- Correção:
--   1. Novo helper _absence_stats_by_prof calcula estatísticas por (paciente,
--      profissional) lendo da tabela appointments (fonte da verdade).
--   2. update_appointment passa a retornar consecutiveUnjustifiedAbsences
--      calculado para o PAR (paciente, profissional do appointment).
--      Também retorna absenceCountByProf e o nome/especialidade do profissional
--      para a UI montar o aviso "3 faltas com [Nome] ([Especialidade])".
--      Mantém o patient.absence_count global como total histórico
--      (usado no Perfil do Paciente).
--   3. list_appointments_today e list_appointments passam a expor
--      consecutive_unjustified_absences por profissional — o que alimenta o
--      botão de ação imediata (alerta só dispara na coluna do profissional
--      correto).
--
-- Sem breaking changes: todas as chaves JSON antigas continuam presentes.
-- =============================================================================

begin;

-- =========================================================================
-- helper: calcula (abs_count, consecutive_unjustified) para UM par
-- (paciente, profissional) lendo da tabela appointments.
-- =========================================================================
create or replace function public._absence_stats_by_prof(
  p_company_id      bigint,
  p_patient_id      bigint,
  p_professional_id bigint
)
returns table (
  abs_count         integer,
  consecutive_abs   integer
)
language plpgsql
stable
as $$
declare
  v_today text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
begin
  return query
  with rows as (
    select
      a.status,
      row_number() over (order by a.date desc, a.time desc, a.id desc) as rn,
      case when a.status not in ('ausente','falta_nao_justificada') then 1 else 0 end as is_break
    from public.appointments a
    where a.company_id      = p_company_id
      and a.patient_id      = p_patient_id
      and a.professional_id = p_professional_id
      and a.date <= v_today
  ),
  first_break as (
    select coalesce(min(rn), 2147483647) as rn from rows where is_break = 1
  )
  select
    (select count(*)::int from rows
      where status in ('ausente','falta_justificada','falta_nao_justificada')
    ) as abs_count,
    (select count(*)::int from rows, first_break
      where rows.rn < first_break.rn
        and rows.status in ('ausente','falta_nao_justificada')
    ) as consecutive_abs;
end;
$$;

revoke all on function public._absence_stats_by_prof(bigint, bigint, bigint) from public;

-- =========================================================================
-- update_appointment: devolve consecutiveUnjustifiedAbsences POR PROFISSIONAL
-- =========================================================================
create or replace function public.update_appointment(
  p_slug           text,
  p_password       text,
  p_id             bigint,
  p_status         text default null,
  p_rescheduled_to text default null,
  p_notes          text default null,
  p_date           text default null,
  p_time           text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id     bigint;
  v_existing       public.appointments%rowtype;
  v_updated        public.appointments%rowtype;
  v_patient        public.patients%rowtype;
  v_prof_name      text;
  v_prof_specialty text;
  v_was_abs        boolean;
  v_is_abs         boolean;
  v_new_abs        integer;
  v_new_conseq     integer;
  v_stats_conseq   integer := 0;
  v_stats_count    integer := 0;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  select * into v_existing
    from public.appointments
   where id = p_id and company_id = v_company_id;
  if not found then raise exception 'Appointment not found'; end if;

  update public.appointments set
    status         = coalesce(p_status,         status),
    rescheduled_to = coalesce(p_rescheduled_to, rescheduled_to),
    notes          = coalesce(p_notes,          notes),
    "date"         = coalesce(p_date,           "date"),
    "time"         = coalesce(p_time,           "time"),
    updated_at     = now()
  where id = p_id and company_id = v_company_id
  returning * into v_updated;

  v_was_abs := v_existing.status in ('ausente','falta_justificada','falta_nao_justificada');
  v_is_abs  := coalesce(p_status, v_existing.status) in ('ausente','falta_justificada','falta_nao_justificada');

  select * into v_patient from public.patients
   where id = v_existing.patient_id and company_id = v_company_id;

  -- Mantém o contador global do paciente só para o "total de faltas" no
  -- Perfil do Paciente. A lógica de alerta consecutivo passa a vir do
  -- contador POR profissional (abaixo).
  if v_patient.id is not null then
    if p_status is not null and v_is_abs and not v_was_abs then
      v_new_abs    := coalesce(v_patient.absence_count, 0) + 1;
      v_new_conseq := coalesce(v_patient.consecutive_unjustified_absences, 0);
      if p_status in ('ausente','falta_nao_justificada') then
        v_new_conseq := v_new_conseq + 1;
      elsif p_status = 'falta_justificada' then
        v_new_conseq := 0;
      end if;
      update public.patients
         set absence_count = v_new_abs,
             consecutive_unjustified_absences = v_new_conseq,
             updated_at = now()
       where id = v_patient.id
       returning * into v_patient;

    elsif v_was_abs and p_status is not null and not v_is_abs then
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

  -- Per-professional stats (fonte da verdade: tabela appointments)
  select abs_count, consecutive_abs
    into v_stats_count, v_stats_conseq
    from public._absence_stats_by_prof(v_company_id, v_updated.patient_id, v_updated.professional_id);

  select name, specialty into v_prof_name, v_prof_specialty
    from public.professionals
   where id = v_updated.professional_id and company_id = v_company_id;

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
    -- >>> agora por PROFISSIONAL (antes era global do paciente)
    'consecutiveUnjustifiedAbsences', coalesce(v_stats_conseq, 0),
    'absenceCountByProf',             coalesce(v_stats_count, 0),
    'professionalName',               coalesce(v_prof_name, ''),
    'professionalSpecialty',          coalesce(v_prof_specialty, ''),
    -- totais globais (só pra UI do Perfil do Paciente)
    'patientAbsenceCountTotal',       coalesce(v_patient.absence_count, 0),
    'escolaPublica',                  coalesce(v_patient.escola_publica, false),
    'trabalhoNaRoca',                 coalesce(v_patient.trabalho_na_roca, false)
  );
end;
$$;

revoke all on function public.update_appointment(text, text, bigint, text, text, text, text, text) from public;
grant execute on function public.update_appointment(text, text, bigint, text, text, text, text, text) to anon, authenticated;

-- =========================================================================
-- list_appointments_today: patient_absence_count agora é POR profissional
-- =========================================================================
create or replace function public.list_appointments_today(
  p_slug            text,
  p_password        text,
  p_professional_id bigint default null
)
returns table (
  id                    bigint,
  patient_id            bigint,
  professional_id       bigint,
  "date"                text,
  "time"                text,
  status                text,
  notes                 text,
  rescheduled_to        text,
  recurrence_group_id   text,
  frequency             text,
  patient_name          text,
  patient_phone         text,
  patient_absence_count integer,
  professional_name     text,
  professional_specialty text,
  ciclo                 text,
  created_at            timestamptz,
  updated_at            timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_today      text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  return query
    select
      a.id, a.patient_id, a.professional_id, a.date, a.time, a.status, a.notes,
      a.rescheduled_to, a.recurrence_group_id, a.frequency,
      coalesce(p.name, '')::text          as patient_name,
      p.phone::text                       as patient_phone,
      coalesce(s.abs_count, 0)            as patient_absence_count,
      coalesce(pr.name, '')::text         as professional_name,
      coalesce(pr.specialty, '')::text    as professional_specialty,
      public._ciclo(a.frequency, a.date)  as ciclo,
      a.created_at, a.updated_at
    from public.appointments a
    left join public.patients      p  on p.id  = a.patient_id
    left join public.professionals pr on pr.id = a.professional_id
    left join lateral public._absence_stats_by_prof(v_company_id, a.patient_id, a.professional_id) s on true
    where a.company_id = v_company_id
      and a.date = v_today
      and (p_professional_id is null or a.professional_id = p_professional_id)
      and (p.tipo_registro is null or p.tipo_registro <> 'Registro Censo Municipal')
    order by a.time;
end;
$$;

revoke all on function public.list_appointments_today(text, text, bigint) from public;
grant execute on function public.list_appointments_today(text, text, bigint) to anon, authenticated;

-- =========================================================================
-- list_appointments: consecutive_unjustified_absences agora é POR profissional
-- =========================================================================
create or replace function public.list_appointments(
  p_slug            text,
  p_password        text,
  p_date            text   default null,
  p_date_from       text   default null,
  p_date_to         text   default null,
  p_professional_id bigint default null,
  p_patient_id      bigint default null
)
returns table (
  id                    bigint,
  patient_id            bigint,
  professional_id       bigint,
  "date"                text,
  "time"                text,
  status                text,
  notes                 text,
  rescheduled_to        text,
  recurrence_group_id   text,
  frequency             text,
  company_id            bigint,
  patient_name          text,
  guardian_name         text,
  guardian_phone        text,
  professional_name     text,
  professional_specialty text,
  escola_publica        boolean,
  trabalho_na_roca      boolean,
  consecutive_unjustified_absences integer,
  created_at            timestamptz,
  updated_at            timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_company_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  return query
    select
      a.id, a.patient_id, a.professional_id, a.date, a.time, a.status, a.notes,
      a.rescheduled_to, a.recurrence_group_id, a.frequency, a.company_id,
      coalesce(p.name, '')::text           as patient_name,
      p.guardian_name::text                as guardian_name,
      p.guardian_phone::text               as guardian_phone,
      coalesce(pr.name, '')::text          as professional_name,
      coalesce(pr.specialty, '')::text     as professional_specialty,
      coalesce(p.escola_publica, false)    as escola_publica,
      coalesce(p.trabalho_na_roca, false)  as trabalho_na_roca,
      coalesce(s.consecutive_abs, 0)       as consecutive_unjustified_absences,
      a.created_at, a.updated_at
    from public.appointments a
    left join public.patients      p  on p.id  = a.patient_id
    left join public.professionals pr on pr.id = a.professional_id
    left join lateral public._absence_stats_by_prof(v_company_id, a.patient_id, a.professional_id) s on true
    where a.company_id = v_company_id
      and (p_date            is null or a.date            = p_date)
      and (p_date_from       is null or a.date           >= p_date_from)
      and (p_date_to         is null or a.date           <= p_date_to)
      and (p_professional_id is null or a.professional_id = p_professional_id)
      and (p_patient_id      is null or a.patient_id      = p_patient_id)
      and (p.tipo_registro is null or p.tipo_registro <> 'Registro Censo Municipal');
end;
$$;

revoke all on function public.list_appointments(text, text, text, text, text, bigint, bigint) from public;
grant execute on function public.list_appointments(text, text, text, text, text, bigint, bigint) to anon, authenticated;

commit;
