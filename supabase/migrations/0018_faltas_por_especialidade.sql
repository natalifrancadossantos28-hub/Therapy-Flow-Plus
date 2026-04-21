-- =============================================================================
-- 0018: Contagem de faltas POR (paciente, profissional)
-- =============================================================================
--
-- Substitui o comportamento global do 0008 (que contava faltas no paciente
-- inteiro) pela contagem isolada por PROFISSIONAL — equivale a isolar por
-- ESPECIALIDADE para o alerta clínico (cada profissional tem uma só área).
--
-- IMPORTANTE: NENHUMA função muda de RETURNS TABLE. Isso significa:
--   * Sem DROP FUNCTION necessário.
--   * Se qualquer CREATE OR REPLACE falhar, o BEGIN/COMMIT inteiro rola
--     de volta e as funções antigas continuam no ar.
--
-- As colunas `patient_absence_count` (list_appointments_today) e
-- `consecutive_unjustified_absences` (list_appointments) PASSAM A SIGNIFICAR
-- valores POR profissional, calculados on-the-fly via helper. O nome das
-- colunas fica igual ao 0008.
--
-- Também preserva tudo do 0017 (desmarcar devolve paciente à fila).
-- =============================================================================

begin;

-- =========================================================================
-- helper: (abs_count, consecutive_abs) para UM par (paciente, profissional)
-- Usa FOR loop em vez de CTE com palavra "rows" para evitar qualquer
-- ambiguidade de parser.
-- =========================================================================
create or replace function public._absence_stats_by_prof(
  p_company_id      bigint,
  p_patient_id      bigint,
  p_professional_id bigint
)
returns table (
  abs_count       integer,
  consecutive_abs integer
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_today   text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  v_total   integer := 0;
  v_consec  integer := 0;
  r         record;
begin
  if p_patient_id is null or p_professional_id is null then
    abs_count := 0;
    consecutive_abs := 0;
    return next;
    return;
  end if;

  select count(*)::int into v_total
    from public.appointments
   where company_id      = p_company_id
     and patient_id      = p_patient_id
     and professional_id = p_professional_id
     and status in ('ausente','falta_justificada','falta_nao_justificada');

  for r in
    select status
      from public.appointments
     where company_id      = p_company_id
       and patient_id      = p_patient_id
       and professional_id = p_professional_id
       and "date"         <= v_today
     order by "date" desc, "time" desc, id desc
  loop
    if r.status in ('ausente','falta_nao_justificada') then
      v_consec := v_consec + 1;
    elsif r.status = 'falta_justificada' then
      exit;
    else
      exit;
    end if;
  end loop;

  abs_count := coalesce(v_total, 0);
  consecutive_abs := coalesce(v_consec, 0);
  return next;
end;
$fn$;

revoke all on function public._absence_stats_by_prof(bigint, bigint, bigint) from public;

-- =========================================================================
-- update_appointment: MESMA assinatura do 0008/0017. Agora retorna
-- consecutiveUnjustifiedAbsences POR profissional + professionalName e
-- professionalSpecialty pro frontend montar os avisos.
-- Preserva efeito colateral de devolver paciente à fila (0017).
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
as $fn$
declare
  v_company_id         bigint;
  v_today              text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  v_existing           public.appointments%rowtype;
  v_updated            public.appointments%rowtype;
  v_patient            public.patients%rowtype;
  v_was_abs            boolean;
  v_is_abs             boolean;
  v_new_abs            integer;
  v_new_conseq         integer;
  v_specialty          text;
  v_prof_name          text;
  v_active_same_spec   integer := 0;
  v_existing_queue     integer := 0;
  v_stats_total        integer := 0;
  v_stats_consec       integer := 0;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  select * into v_existing from public.appointments
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

  -- ===============================================================
  -- Contador global em patients (preservado para não quebrar telas
  -- que ainda leem patient.absence_count). O contador "efetivo" pro
  -- alerta de alta é calculado por profissional abaixo.
  -- ===============================================================
  v_was_abs := v_existing.status in ('ausente','falta_justificada','falta_nao_justificada');
  v_is_abs  := coalesce(p_status, v_existing.status) in ('ausente','falta_justificada','falta_nao_justificada');

  select * into v_patient from public.patients
   where id = v_existing.patient_id and company_id = v_company_id;

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

  -- ===============================================================
  -- Preservado do 0017: desmarcar devolve paciente à fila da
  -- especialidade se não tiver outro horário ativo na mesma área.
  -- ===============================================================
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
         and a.status in ('agendado','em_atendimento')
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
            v_company_id, v_updated.patient_id, v_updated.professional_id,
            v_specialty, 'media', v_today,
            'Re-adicionado automaticamente após desmarcar horário #' || v_updated.id
          );
        end if;
      end if;
    end if;
  end if;

  -- ===============================================================
  -- Dados POR profissional pro alerta preventivo / modal de alta.
  -- ===============================================================
  select name, specialty into v_prof_name, v_specialty
    from public.professionals
   where id = v_updated.professional_id and company_id = v_company_id;

  select abs_count, consecutive_abs
    into v_stats_total, v_stats_consec
    from public._absence_stats_by_prof(v_company_id, v_updated.patient_id, v_updated.professional_id);

  return jsonb_build_object(
    'id',                v_updated.id,
    'companyId',         v_updated.company_id,
    'patientId',         v_updated.patient_id,
    'professionalId',    v_updated.professional_id,
    'date',              v_updated."date",
    'time',              v_updated."time",
    'status',            v_updated.status,
    'notes',             v_updated.notes,
    'rescheduledTo',     v_updated.rescheduled_to,
    'recurrenceGroupId', v_updated.recurrence_group_id,
    'frequency',         v_updated.frequency,
    -- POR profissional (chave pro alerta):
    'consecutiveUnjustifiedAbsences', coalesce(v_stats_consec, 0),
    'absenceCountByProf',             coalesce(v_stats_total, 0),
    'professionalName',               coalesce(v_prof_name, ''),
    'professionalSpecialty',          coalesce(v_specialty, ''),
    -- Contador global do paciente (mantido por compatibilidade):
    'patientAbsenceCountTotal',       coalesce(v_patient.absence_count, 0),
    'escolaPublica',                  coalesce(v_patient.escola_publica, false),
    'trabalhoNaRoca',                 coalesce(v_patient.trabalho_na_roca, false)
  );
end;
$fn$;

revoke all on function public.update_appointment(text, text, bigint, text, text, text, text, text) from public;
grant execute on function public.update_appointment(text, text, bigint, text, text, text, text, text) to anon, authenticated;

-- =========================================================================
-- list_appointments_today: MESMA assinatura do 0008. A coluna
-- `patient_absence_count` passa a ser contagem POR profissional.
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
as $fn$
declare
  v_company_id bigint;
  v_today      text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  return query
    select
      a.id, a.patient_id, a.professional_id, a."date", a."time", a.status, a.notes,
      a.rescheduled_to, a.recurrence_group_id, a.frequency,
      coalesce(p.name, '')::text          as patient_name,
      p.phone::text                       as patient_phone,
      coalesce(s.abs_count, 0)            as patient_absence_count,
      coalesce(pr.name, '')::text         as professional_name,
      coalesce(pr.specialty, '')::text    as professional_specialty,
      public._ciclo(a.frequency, a."date") as ciclo,
      a.created_at, a.updated_at
    from public.appointments a
    left join public.patients      p  on p.id  = a.patient_id
    left join public.professionals pr on pr.id = a.professional_id
    left join lateral public._absence_stats_by_prof(v_company_id, a.patient_id, a.professional_id) s on true
    where a.company_id = v_company_id
      and a."date" = v_today
      and (p_professional_id is null or a.professional_id = p_professional_id)
      and (p.tipo_registro is null or p.tipo_registro <> 'Registro Censo Municipal')
    order by a."time";
end;
$fn$;

revoke all on function public.list_appointments_today(text, text, bigint) from public;
grant execute on function public.list_appointments_today(text, text, bigint) to anon, authenticated;

-- =========================================================================
-- list_appointments: MESMA assinatura do 0008. A coluna
-- `consecutive_unjustified_absences` passa a ser contagem POR profissional.
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
  escola_publica        boolean,
  trabalho_na_roca      boolean,
  consecutive_unjustified_absences integer,
  created_at            timestamptz,
  updated_at            timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare v_company_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  return query
    select
      a.id, a.patient_id, a.professional_id, a."date", a."time", a.status, a.notes,
      a.rescheduled_to, a.recurrence_group_id, a.frequency, a.company_id,
      coalesce(p.name, '')::text        as patient_name,
      p.guardian_name::text             as guardian_name,
      p.guardian_phone::text            as guardian_phone,
      coalesce(pr.name, '')::text       as professional_name,
      coalesce(p.escola_publica, false) as escola_publica,
      coalesce(p.trabalho_na_roca, false) as trabalho_na_roca,
      coalesce(s.consecutive_abs, 0)    as consecutive_unjustified_absences,
      a.created_at, a.updated_at
    from public.appointments a
    left join public.patients      p  on p.id  = a.patient_id
    left join public.professionals pr on pr.id = a.professional_id
    left join lateral public._absence_stats_by_prof(a.company_id, a.patient_id, a.professional_id) s on true
    where a.company_id = v_company_id
      and (p_date            is null or a."date"         = p_date)
      and (p_date_from       is null or a."date"        >= p_date_from)
      and (p_date_to         is null or a."date"        <= p_date_to)
      and (p_professional_id is null or a.professional_id = p_professional_id)
      and (p_patient_id      is null or a.patient_id      = p_patient_id)
      and (p.tipo_registro is null or p.tipo_registro <> 'Registro Censo Municipal');
end;
$fn$;

revoke all on function public.list_appointments(text, text, text, text, text, bigint, bigint) from public;
grant execute on function public.list_appointments(text, text, text, text, text, bigint, bigint) to anon, authenticated;

commit;
