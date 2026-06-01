-- =========================================================================
-- 0065_pacientes_fantasmas_cleanup.sql
--
-- Correção: "pacientes fantasmas" — pacientes excluídos/desativados que
-- continuavam aparecendo nas agendas e no Dashboard.
--
-- Causa raiz:
--   1. list_appointments / list_appointments_today usavam LEFT JOIN com
--      patients. Agendamentos órfãos (paciente já não existe) apareciam
--      com nome em branco — os "fantasmas".
--   2. "Dar Alta" faz hard delete do paciente e depende do ON DELETE CASCADE
--      para remover os agendamentos. Se o cascade não estiver íntegro,
--      sobram agendamentos órfãos.
--   3. Pacientes com status terminal (Alta/Óbito/Desistência) que NÃO foram
--      excluídos continuavam com agendamentos visíveis na agenda.
--
-- Esta migração:
--   1. Remove registros órfãos (appointments / waiting_list cujo paciente
--      não existe mais). Seguro: não há paciente vinculado.
--   2. Reafirma o ON DELETE CASCADE em appointments.patient_id e
--      waiting_list.patient_id (idempotente).
--   3. Recria list_appointments e list_appointments_today exigindo paciente
--      válido (INNER JOIN) e expondo patient_status para o frontend poder
--      ocultar pacientes com status terminal das agendas. O histórico de
--      atendimentos realizados continua disponível para o Dashboard.
-- =========================================================================

begin;

-- =========================================================================
-- 1. Limpeza de órfãos (precisa vir ANTES de reafirmar o FK).
-- =========================================================================
delete from public.appointments a
 where not exists (select 1 from public.patients p where p.id = a.patient_id);

delete from public.waiting_list w
 where not exists (select 1 from public.patients p where p.id = w.patient_id);

-- =========================================================================
-- 2. Reafirma ON DELETE CASCADE (idempotente). Garante que futuras altas
--    (hard delete do paciente) apaguem os agendamentos/fila junto.
-- =========================================================================
alter table public.appointments
  drop constraint if exists appointments_patient_id_fkey;
alter table public.appointments
  add constraint appointments_patient_id_fkey
  foreign key (patient_id) references public.patients(id) on delete cascade;

alter table public.waiting_list
  drop constraint if exists waiting_list_patient_id_fkey;
alter table public.waiting_list
  add constraint waiting_list_patient_id_fkey
  foreign key (patient_id) references public.patients(id) on delete cascade;

-- =========================================================================
-- 3a. list_appointments — INNER JOIN patients + patient_status.
--     Mantém colunas de pausa (0064).
-- =========================================================================
drop function if exists public.list_appointments(text, text, text, text, text, bigint, bigint);

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
  patient_status        text,
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
      coalesce(p.status, '')::text      as patient_status,
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
    join public.patients      p  on p.id  = a.patient_id
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

-- =========================================================================
-- 3b. list_appointments_today — INNER JOIN patients + patient_status.
-- =========================================================================
drop function if exists public.list_appointments_today(text, text, bigint);

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
  patient_status        text,
  patient_phone         text,
  patient_absence_count integer,
  professional_name     text,
  professional_specialty text,
  ciclo                 text,
  prontuario            text,
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
      coalesce(p.status, '')::text        as patient_status,
      p.phone::text                       as patient_phone,
      coalesce(s.abs_count, 0)            as patient_absence_count,
      coalesce(pr.name, '')::text         as professional_name,
      coalesce(pr.specialty, '')::text    as professional_specialty,
      public._ciclo(a.frequency, a."date") as ciclo,
      p.prontuario::text                  as prontuario,
      a.created_at, a.updated_at
    from public.appointments a
    join public.patients      p  on p.id  = a.patient_id
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

commit;
