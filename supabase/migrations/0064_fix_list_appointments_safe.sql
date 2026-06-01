-- 0064: Restaura list_appointments para funcionar com OU sem colunas de pausa.
-- Resolve agenda vazia quando as colunas paused/paused_at/paused_reason/paused_return_date
-- não existem na tabela appointments.

-- Passo 1: Adiciona colunas de pausa SE não existirem (idempotente)
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_reason text,
  ADD COLUMN IF NOT EXISTS paused_return_date text;

-- Passo 2: Drop da função antiga (obrigatório se a assinatura de retorno mudou)
DROP FUNCTION IF EXISTS public.list_appointments(text, text, text, text, text, bigint, bigint);

-- Passo 3: Recria com colunas de pausa incluídas
CREATE OR REPLACE FUNCTION public.list_appointments(
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
