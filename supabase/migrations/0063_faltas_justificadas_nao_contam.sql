-- =========================================================================
-- 0063_faltas_justificadas_nao_contam.sql
--
-- Correção crítica: "Falta Justificada" (abonada) NÃO pode contar no limite
-- de faltas do paciente. Antes, a contagem de faltas tratava
-- 'falta_justificada' igual a 'falta_nao_justificada', inflando o histórico
-- e gerando risco de alta indevida por excesso de faltas (ex.: pacientes em
-- afastamento, que recebem várias faltas justificadas de uma vez).
--
-- Regra de ouro: apenas faltas NÃO justificadas contam, ou seja, status
-- 'ausente' e 'falta_nao_justificada'. 'falta_justificada' é abonada.
--
-- 1. Corrige _absence_stats_by_prof: abs_count passa a excluir
--    'falta_justificada' (esse contador alimenta o patient_absence_count da
--    recepção, que dispara o modal de alta em >= 3 faltas). Como é calculado
--    on-the-fly, a correção é automaticamente retroativa para esse alerta.
-- 2. Correção retroativa dos contadores globais em patients:
--    absence_count e consecutive_unjustified_absences são recalculados
--    considerando apenas faltas não justificadas.
--
-- Observação: update_appointment já foi corrigido em 0057 para não
-- incrementar o contador global em faltas justificadas. Esta migração
-- corrige o contador POR profissional e regulariza o histórico existente.
-- =========================================================================

begin;

-- =========================================================================
-- 1. helper: (abs_count, consecutive_abs) para UM par (paciente, profissional)
--    abs_count agora ignora faltas justificadas (abonadas).
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

  -- Apenas faltas NÃO justificadas contam no total.
  select count(*)::int into v_total
    from public.appointments
   where company_id      = p_company_id
     and patient_id      = p_patient_id
     and professional_id = p_professional_id
     and status in ('ausente','falta_nao_justificada');

  -- Sequência de faltas não justificadas a partir do agendamento mais recente.
  -- Uma falta justificada (abonada) encerra a sequência — comportamento
  -- conservador: nunca penaliza o paciente por uma falta abonada.
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
    else
      -- justificada (abonada), presença ou qualquer outro status encerra a sequência
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
-- 2. Correção retroativa dos contadores globais em patients.
-- =========================================================================

-- 2a. absence_count = nº de faltas NÃO justificadas do paciente.
with stats as (
  select p.id as patient_id,
         count(a.id) filter (
           where a.status in ('ausente','falta_nao_justificada')
         )::int as abs_count
    from public.patients p
    left join public.appointments a
      on a.patient_id = p.id
     and a.company_id = p.company_id
   group by p.id
)
update public.patients p
   set absence_count = coalesce(s.abs_count, 0),
       updated_at    = now()
  from stats s
 where s.patient_id = p.id
   and p.absence_count is distinct from coalesce(s.abs_count, 0);

-- 2b. consecutive_unjustified_absences = sequência final de faltas não
--     justificadas (do agendamento mais recente para trás, considerando
--     apenas datas <= hoje). Uma falta justificada (abonada), presença ou
--     qualquer outro status encerra a sequência.
with ordered as (
  select a.patient_id,
         a.status,
         row_number() over (
           partition by a.patient_id
           order by a."date" desc, a."time" desc, a.id desc
         ) as rn
    from public.appointments a
    join public.patients p
      on p.id = a.patient_id
     and p.company_id = a.company_id
   where a."date" <= to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')
),
first_break as (
  -- primeiro status (mais recente) que NÃO é falta não justificada
  -- (justificada, presença, etc.) — encerra a sequência
  select patient_id, min(rn) as brk
    from ordered
   where status not in ('ausente','falta_nao_justificada')
   group by patient_id
),
consec as (
  select o.patient_id,
         coalesce(min(fb.brk) - 1, count(*))::int as cnt
    from ordered o
    left join first_break fb on fb.patient_id = o.patient_id
   group by o.patient_id
)
update public.patients p
   set consecutive_unjustified_absences = coalesce(c.cnt, 0),
       updated_at = now()
  from consec c
 where c.patient_id = p.id
   and p.consecutive_unjustified_absences is distinct from coalesce(c.cnt, 0);

-- Pacientes sem agendamentos passados: zera a sequência por segurança.
update public.patients p
   set consecutive_unjustified_absences = 0,
       updated_at = now()
 where p.consecutive_unjustified_absences <> 0
   and not exists (
     select 1 from public.appointments a
      where a.patient_id = p.id
        and a.company_id = p.company_id
        and a."date" <= to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')
   );

commit;
