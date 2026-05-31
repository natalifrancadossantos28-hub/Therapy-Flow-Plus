-- =========================================================================
-- 0063_appointment_pause.sql
--
-- "Pausa Temporária" para agendamentos na agenda.
--
-- Quando um paciente precisa suspender temporariamente os atendimentos
-- (licença, transição de profissional, etc.), o Admin ou profissional pode
-- "pausar" o agendamento sem cancelar ou desmarcar. Mantém o vínculo e
-- permite definir uma data de retorno prevista.
--
-- 1. Adiciona colunas paused / paused_at / paused_reason / paused_return_date
-- 2. Cria RPC set_appointment_paused para pausar/despausar
-- 3. Cria RPC list_paused_overview para dashboard (fila + agenda)
-- 4. Atualiza list_appointments para incluir campos de pausa
-- =========================================================================

begin;

-- ═══════════════════════════════════════════════════════════════════════
-- Step 1: Colunas de pausa em appointments
-- ═══════════════════════════════════════════════════════════════════════

alter table public.appointments
  add column if not exists paused             boolean      not null default false,
  add column if not exists paused_at          timestamptz,
  add column if not exists paused_reason      text,
  add column if not exists paused_return_date text;

-- ═══════════════════════════════════════════════════════════════════════
-- Step 2: RPC set_appointment_paused
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.set_appointment_paused(
  p_slug        text,
  p_password    text,
  p_id          bigint,
  p_paused      boolean,
  p_reason      text default null,
  p_return_date text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_row        public.appointments%rowtype;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  update public.appointments
     set paused             = p_paused,
         paused_at          = case when p_paused then now() else null end,
         paused_reason      = case when p_paused then p_reason else null end,
         paused_return_date = case when p_paused then p_return_date else null end,
         updated_at         = now()
   where id = p_id and company_id = v_company_id
   returning * into v_row;

  if not found then
    raise exception 'Agendamento não encontrado';
  end if;

  return jsonb_build_object(
    'id',              v_row.id,
    'paused',          v_row.paused,
    'pausedAt',        v_row.paused_at,
    'pausedReason',    v_row.paused_reason,
    'pausedReturnDate', v_row.paused_return_date
  );
end;
$$;

revoke all on function public.set_appointment_paused(text, text, bigint, boolean, text, text) from public;
grant execute on function public.set_appointment_paused(text, text, bigint, boolean, text, text) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- Step 3: RPC list_paused_overview (dashboard — fila + agenda)
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.list_paused_overview(
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
  v_today      text;
  v_fila       jsonb;
  v_agenda     jsonb;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  v_today := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');

  -- Fila de espera congelados
  select coalesce(jsonb_agg(row order by w.paused_at desc), '[]'::jsonb) into v_fila
  from (
    select jsonb_build_object(
      'source',         'fila',
      'id',             w.id,
      'patientId',      w.patient_id,
      'patientName',    coalesce(p.name, ''),
      'specialty',      coalesce(w.specialty, pr.specialty, ''),
      'professionalName', coalesce(pr.name, ''),
      'pausedReason',   coalesce(w.paused_reason, 'Busca ativa'),
      'pausedAt',       w.paused_at,
      'pausedReturnDate', null,
      'returnOverdue',  false
    ) as row
    from public.waiting_list w
    left join public.patients      p  on p.id  = w.patient_id
    left join public.professionals pr on pr.id = w.professional_id
    where w.company_id = v_company_id and w.paused = true
  ) sub;

  -- Agenda pausados
  select coalesce(jsonb_agg(row order by a.paused_at desc), '[]'::jsonb) into v_agenda
  from (
    select jsonb_build_object(
      'source',         'agenda',
      'id',             a.id,
      'patientId',      a.patient_id,
      'patientName',    coalesce(p.name, ''),
      'specialty',      coalesce(pr.specialty, ''),
      'professionalName', coalesce(pr.name, ''),
      'pausedReason',   coalesce(a.paused_reason, ''),
      'pausedAt',       a.paused_at,
      'pausedReturnDate', a.paused_return_date,
      'returnOverdue',  case
                           when a.paused_return_date is not null
                                and a.paused_return_date < v_today then true
                           else false
                         end
    ) as row
    from public.appointments a
    left join public.patients      p  on p.id  = a.patient_id
    left join public.professionals pr on pr.id = a.professional_id
    where a.company_id = v_company_id
      and a.paused = true
      and a."date" >= v_today
  ) sub;

  return jsonb_build_object(
    'fila',   v_fila,
    'agenda', v_agenda
  );
end;
$$;

revoke all on function public.list_paused_overview(text, text) from public;
grant execute on function public.list_paused_overview(text, text) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- Step 4: Atualiza list_appointments para incluir campos de pausa
-- ═══════════════════════════════════════════════════════════════════════

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
  prontuario            text,
  created_at            timestamptz,
  updated_at            timestamptz,
  paused                boolean,
  paused_at             timestamptz,
  paused_reason         text,
  paused_return_date    text
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
      p.prontuario::text                as prontuario,
      a.created_at, a.updated_at,
      coalesce(a.paused, false)         as paused,
      a.paused_at                       as paused_at,
      a.paused_reason                   as paused_reason,
      a.paused_return_date              as paused_return_date
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
