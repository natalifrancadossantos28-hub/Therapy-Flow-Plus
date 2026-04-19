-- Phase 4C - Arco-iris agenda: appointments + notificacoes_recepcao
--
-- Creates the appointments and notificacoes_recepcao tables plus the RPCs
-- that replace the old Express endpoints /api/appointments/* and /api/notificacoes/*.
-- Replays all business rules that lived in the Express backend:
--   * Recurrence expansion (semanal = 52 ocorrencias, quinzenal = 26, mensal = 13).
--   * A/B cycle derivation (ISO week parity) for quinzenal.
--   * Censo Municipal patients blocked from the agenda.
--   * Absence counters on patients (absence_count, consecutive_unjustified_absences).
--   * Alta from an appointment deletes future occurrences in the same group.
--
-- Security model (same as Phase 2..4B):
--   * Every RPC requires slug + password, bcrypt verified by public._verify_company_admin.
--   * RLS is enabled with no policies - anon/authenticated can only hit the RPCs.

create extension if not exists pgcrypto with schema extensions;

-- =========================================================================
-- Tables
-- =========================================================================

create table if not exists public.appointments (
  id                   bigserial   primary key,
  company_id           bigint      not null references public.ponto_companies(id) on delete cascade,
  patient_id           bigint      not null references public.patients(id)        on delete cascade,
  professional_id      bigint      not null references public.professionals(id)   on delete cascade,
  "date"               text        not null,
  "time"               text        not null,
  status               text        not null default 'agendado',
  notes                text,
  rescheduled_to       text,
  recurrence_group_id  text,
  frequency            text        not null default 'semanal',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists appointments_company_idx       on public.appointments(company_id);
create index if not exists appointments_date_idx          on public.appointments(company_id, "date");
create index if not exists appointments_prof_date_idx     on public.appointments(company_id, professional_id, "date");
create index if not exists appointments_patient_idx       on public.appointments(company_id, patient_id);
create index if not exists appointments_group_idx         on public.appointments(recurrence_group_id);

alter table public.appointments enable row level security;

create table if not exists public.notificacoes_recepcao (
  id                  bigserial   primary key,
  company_id          bigint      not null references public.ponto_companies(id) on delete cascade,
  appointment_id      bigint      references public.appointments(id)              on delete set null,
  patient_name        text        not null,
  professional_name   text        not null,
  acao                text        not null,
  data_consulta       text        not null default '',
  hora_consulta       text        not null default '',
  lido                boolean     not null default false,
  created_at          timestamptz not null default now()
);

create index if not exists notificacoes_company_idx on public.notificacoes_recepcao(company_id);
create index if not exists notificacoes_lido_idx    on public.notificacoes_recepcao(company_id, lido);

alter table public.notificacoes_recepcao enable row level security;

-- =========================================================================
-- Helpers
-- =========================================================================

-- ISO week number (mirrors appointments.ts isoWeekNumber in TS)
create or replace function public._iso_week(p_date text)
returns integer
language sql
immutable
as $$
  select extract(week from (p_date)::date)::integer
$$;

-- A/B cycle derivation: quinzenal -> 'A' if week odd, 'B' if even; mensal -> 'M'; else null
create or replace function public._ciclo(p_frequency text, p_date text)
returns text
language sql
immutable
as $$
  select case
    when p_frequency = 'quinzenal' then case when public._iso_week(p_date) % 2 = 1 then 'A' else 'B' end
    when p_frequency = 'mensal'    then 'M'
    else null
  end
$$;

-- =========================================================================
-- Appointments RPCs
-- =========================================================================

-- list_appointments_today: used by agenda.tsx, dashboard.tsx, reception.tsx
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
      coalesce(p.absence_count, 0)        as patient_absence_count,
      coalesce(pr.name, '')::text         as professional_name,
      coalesce(pr.specialty, '')::text    as professional_specialty,
      public._ciclo(a.frequency, a.date)  as ciclo,
      a.created_at, a.updated_at
    from public.appointments a
    left join public.patients      p  on p.id  = a.patient_id
    left join public.professionals pr on pr.id = a.professional_id
    where a.company_id = v_company_id
      and a.date = v_today
      and (p_professional_id is null or a.professional_id = p_professional_id)
      and (p.tipo_registro is null or p.tipo_registro <> 'Registro Censo Municipal')
    order by a.time;
end;
$$;

-- list_appointments: generic filter used by agenda-profissionais.tsx, reports
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
as $$
declare v_company_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  return query
    select
      a.id, a.patient_id, a.professional_id, a.date, a.time, a.status, a.notes,
      a.rescheduled_to, a.recurrence_group_id, a.frequency, a.company_id,
      coalesce(p.name, '')::text        as patient_name,
      p.guardian_name::text             as guardian_name,
      p.guardian_phone::text            as guardian_phone,
      coalesce(pr.name, '')::text       as professional_name,
      coalesce(p.escola_publica, false) as escola_publica,
      coalesce(p.trabalho_na_roca, false) as trabalho_na_roca,
      coalesce(p.consecutive_unjustified_absences, 0) as consecutive_unjustified_absences,
      a.created_at, a.updated_at
    from public.appointments a
    left join public.patients      p  on p.id  = a.patient_id
    left join public.professionals pr on pr.id = a.professional_id
    where a.company_id = v_company_id
      and (p_date            is null or a.date            = p_date)
      and (p_date_from       is null or a.date           >= p_date_from)
      and (p_date_to         is null or a.date           <= p_date_to)
      and (p_professional_id is null or a.professional_id = p_professional_id)
      and (p_patient_id      is null or a.patient_id      = p_patient_id)
      and (p.tipo_registro is null or p.tipo_registro <> 'Registro Censo Municipal');
end;
$$;

-- get_next_appointment: used by patient-detail.tsx, professional-detail.tsx
create or replace function public.get_next_appointment(
  p_slug            text,
  p_password        text,
  p_patient_id      bigint default null,
  p_professional_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_today      text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  v_row        record;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  select
    a.id, a.date, a.time, a.frequency, a.patient_id, a.professional_id,
    coalesce(p.name, '')  as patient_name,
    coalesce(pr.name, '') as professional_name
  into v_row
  from public.appointments a
  left join public.patients      p  on p.id  = a.patient_id
  left join public.professionals pr on pr.id = a.professional_id
  where a.company_id = v_company_id
    and a.date >= v_today
    and a.status = 'agendado'
    and (p_patient_id      is null or a.patient_id      = p_patient_id)
    and (p_professional_id is null or a.professional_id = p_professional_id)
  order by a.date, a.time
  limit 1;

  if v_row.id is null then return null; end if;

  return jsonb_build_object(
    'id',                v_row.id,
    'date',              v_row.date,
    'time',              v_row.time,
    'frequency',         v_row.frequency,
    'patientId',         v_row.patient_id,
    'professionalId',    v_row.professional_id,
    'patientName',       v_row.patient_name,
    'professionalName',  v_row.professional_name,
    'ciclo',             public._ciclo(v_row.frequency, v_row.date)
  );
end;
$$;

-- get_appointments_stats: counts atendimento status within timeframes (dashboard, lucratividade)
create or replace function public.get_appointments_stats(
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
  v_today      date := (now() at time zone 'America/Sao_Paulo')::date;
  v_week_start text  := to_char(v_today - ((extract(isodow from v_today)::int - 1)), 'YYYY-MM-DD');
  v_month_start text := to_char(date_trunc('month', v_today),                              'YYYY-MM-DD');
  v_trim_start  text := to_char(date_trunc('month', v_today) - interval '2 months',        'YYYY-MM-DD');
  v_sem_start   text := to_char(date_trunc('month', v_today) - interval '5 months',        'YYYY-MM-DD');
  v_year_start  text := to_char(date_trunc('year',  v_today),                              'YYYY-MM-DD');
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  return jsonb_build_object(
    'semanal',    (select count(*) from public.appointments where company_id = v_company_id and status = 'atendimento' and "date" >= v_week_start),
    'mensal',     (select count(*) from public.appointments where company_id = v_company_id and status = 'atendimento' and "date" >= v_month_start),
    'trimestral', (select count(*) from public.appointments where company_id = v_company_id and status = 'atendimento' and "date" >= v_trim_start),
    'semestral',  (select count(*) from public.appointments where company_id = v_company_id and status = 'atendimento' and "date" >= v_sem_start),
    'anual',      (select count(*) from public.appointments where company_id = v_company_id and status = 'atendimento' and "date" >= v_year_start)
  );
end;
$$;

-- create_appointments: one-shot or recurring insertion. Mirrors POST /appointments.
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

  if coalesce(p_from_waiting_list, false) then
    update public.patients
       set status = 'Atendimento',
           professional_id = p_professional_id
     where id = p_patient_id and company_id = v_company_id;

    delete from public.waiting_list
     where company_id = v_company_id and patient_id = p_patient_id;
  end if;

  return jsonb_build_object(
    'id',                v_first.id,
    'companyId',         v_first.company_id,
    'patientId',         v_first.patient_id,
    'professionalId',    v_first.professional_id,
    'date',              v_first.date,
    'time',              v_first.time,
    'status',            v_first.status,
    'notes',             v_first.notes,
    'recurrenceGroupId', v_first.recurrence_group_id,
    'frequency',         v_first.frequency,
    'totalCreated',      v_count
  );
end;
$$;

-- update_appointment: status/date/time/notes updates with absence-counter logic.
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
  v_company_id bigint;
  v_existing   public.appointments%rowtype;
  v_updated    public.appointments%rowtype;
  v_patient    public.patients%rowtype;
  v_was_abs    boolean;
  v_is_abs     boolean;
  v_new_abs    integer;
  v_new_conseq integer;
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

-- delete_appointment_alta: marks alta for current + deletes future occurrences in the group.
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
    delete from public.appointments
     where company_id = v_company_id
       and recurrence_group_id = v_existing.recurrence_group_id
       and "date" >= v_existing."date";
    get diagnostics v_deleted_count = row_count;
  else
    delete from public.appointments
     where id = p_id and company_id = v_company_id;
    v_deleted_count := 1;
  end if;

  return jsonb_build_object('ok', true, 'deletedCount', v_deleted_count);
end;
$$;

-- delete_appointment: removes a single appointment.
create or replace function public.delete_appointment(
  p_slug     text,
  p_password text,
  p_id       bigint
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_company_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  delete from public.appointments
   where id = p_id and company_id = v_company_id;
end;
$$;

-- =========================================================================
-- Notificacoes Recepcao RPCs
-- =========================================================================

create or replace function public.list_notificacoes(
  p_slug     text,
  p_password text
)
returns setof public.notificacoes_recepcao
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_company_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  return query
    select *
      from public.notificacoes_recepcao
     where company_id = v_company_id
     order by created_at desc
     limit 100;
end;
$$;

create or replace function public.create_notificacao(
  p_slug              text,
  p_password          text,
  p_appointment_id    bigint default null,
  p_patient_name      text   default null,
  p_professional_name text   default null,
  p_acao              text   default null,
  p_data_consulta     text   default '',
  p_hora_consulta     text   default ''
)
returns public.notificacoes_recepcao
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_row        public.notificacoes_recepcao%rowtype;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  if nullif(btrim(coalesce(p_patient_name, '')), '') is null then
    raise exception 'patient_name is required';
  end if;
  if nullif(btrim(coalesce(p_acao, '')), '') is null then
    raise exception 'acao is required';
  end if;

  insert into public.notificacoes_recepcao (
    company_id, appointment_id, patient_name, professional_name, acao,
    data_consulta, hora_consulta
  ) values (
    v_company_id, p_appointment_id, p_patient_name,
    coalesce(nullif(btrim(p_professional_name), ''), '—'),
    p_acao, coalesce(p_data_consulta, ''), coalesce(p_hora_consulta, '')
  ) returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.mark_notificacao_lido(
  p_slug     text,
  p_password text,
  p_id       bigint
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_company_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  update public.notificacoes_recepcao
     set lido = true
   where id = p_id and company_id = v_company_id;
end;
$$;

create or replace function public.mark_all_notificacoes_lido(
  p_slug     text,
  p_password text
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_company_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  update public.notificacoes_recepcao
     set lido = true
   where company_id = v_company_id and lido = false;
end;
$$;

-- =========================================================================
-- Grants
-- =========================================================================

revoke all on function public.list_appointments_today(text, text, bigint) from public;
grant  execute on function public.list_appointments_today(text, text, bigint) to anon, authenticated;

revoke all on function public.list_appointments(text, text, text, text, text, bigint, bigint) from public;
grant  execute on function public.list_appointments(text, text, text, text, text, bigint, bigint) to anon, authenticated;

revoke all on function public.get_next_appointment(text, text, bigint, bigint) from public;
grant  execute on function public.get_next_appointment(text, text, bigint, bigint) to anon, authenticated;

revoke all on function public.get_appointments_stats(text, text) from public;
grant  execute on function public.get_appointments_stats(text, text) to anon, authenticated;

revoke all on function public.create_appointments(text, text, bigint, bigint, text, text, text, text, boolean, boolean) from public;
grant  execute on function public.create_appointments(text, text, bigint, bigint, text, text, text, text, boolean, boolean) to anon, authenticated;

revoke all on function public.update_appointment(text, text, bigint, text, text, text, text, text) from public;
grant  execute on function public.update_appointment(text, text, bigint, text, text, text, text, text) to anon, authenticated;

revoke all on function public.delete_appointment_alta(text, text, bigint) from public;
grant  execute on function public.delete_appointment_alta(text, text, bigint) to anon, authenticated;

revoke all on function public.delete_appointment(text, text, bigint) from public;
grant  execute on function public.delete_appointment(text, text, bigint) to anon, authenticated;

revoke all on function public.list_notificacoes(text, text) from public;
grant  execute on function public.list_notificacoes(text, text) to anon, authenticated;

revoke all on function public.create_notificacao(text, text, bigint, text, text, text, text, text) from public;
grant  execute on function public.create_notificacao(text, text, bigint, text, text, text, text, text) to anon, authenticated;

revoke all on function public.mark_notificacao_lido(text, text, bigint) from public;
grant  execute on function public.mark_notificacao_lido(text, text, bigint) to anon, authenticated;

revoke all on function public.mark_all_notificacoes_lido(text, text) from public;
grant  execute on function public.mark_all_notificacoes_lido(text, text) to anon, authenticated;
