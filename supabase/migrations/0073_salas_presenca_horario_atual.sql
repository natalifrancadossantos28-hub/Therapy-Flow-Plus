-- =============================================================================
-- 0073: Gestão de Salas — presença por HORÁRIO ATUAL (não só pelo dia)
-- =============================================================================
--
-- A migração 0070 já filtrava os profissionais de uma sala pelo DIA da semana.
-- Este ajuste atende ao pedido: "o profissional não pode aparecer vinculado a
-- uma sala se não estiver presente nela naquele momento".
--
-- Agora um profissional só CONTA/aparece numa sala quando:
--   * está em atendimento agora (segurança: nunca esconder quem está atendendo), OU
--   * o dia de hoje bate com dias_semana (ou não há dias configurados), E
--     o horário atual (fuso America/Sao_Paulo) está dentro de hora_inicio–hora_fim
--     (ou não há faixa de horário configurada).
--
-- Ou seja: fora da faixa de horário do profissional, ele some do card da sala,
-- porque não está presente naquele momento.
--
-- Apenas a view muda; a função get_status_salas continua lendo dela.
-- =============================================================================

begin;

create or replace view public.vw_status_salas as
with agora as (
  select
    (now() at time zone 'America/Sao_Paulo')                          as ts,
    extract(isodow from (now() at time zone 'America/Sao_Paulo'))::int as dow
),
appt_atual as (
  select distinct on (a.company_id, a.professional_id)
    a.company_id,
    a.professional_id,
    a.id,
    a."time"     as horario,
    a.status,
    a.patient_id,
    (a."date" || ' ' || a."time")::timestamp as inicio
  from public.appointments a
  cross join agora g
  where a."date" = to_char(g.ts, 'YYYY-MM-DD')
    and (a."date" || ' ' || a."time")::timestamp <= g.ts
    and g.ts < (a."date" || ' ' || a."time")::timestamp + interval '50 minutes'
    and a.status not in ('cancelado', 'desmarcado', 'falta_justificada', 'falta_nao_justificada')
  order by a.company_id, a.professional_id, inicio desc
),
prox as (
  select distinct on (a.company_id, a.professional_id)
    a.company_id,
    a.professional_id,
    a."time" as proximo_horario
  from public.appointments a
  cross join agora g
  where a."date" = to_char(g.ts, 'YYYY-MM-DD')
    and (a."date" || ' ' || a."time")::timestamp >= g.ts
    and a.status not in ('cancelado', 'desmarcado', 'falta_justificada', 'falta_nao_justificada')
  order by a.company_id, a.professional_id, (a."date" || ' ' || a."time")::timestamp asc
),
sala_prof as (
  select
    s.company_id,
    s.numero,
    s.id                      as sala_id,
    s.professional_id,
    pr.name                   as prof_name,
    s.hora_inicio,
    s.hora_fim,
    ca.id                     as ca_id,
    ca.horario                as ca_horario,
    pat.name                  as paciente,
    px.proximo_horario        as proximo_horario,
    (ca.status in ('presente', 'atendimento', 'em_atendimento')) as em_atendimento,
    -- Conta na sala AGORA: em atendimento (sempre), OU o dia bate (ou sem dias)
    -- E o horário atual está dentro da faixa configurada (ou sem faixa).
    (
      ca.status in ('presente', 'atendimento', 'em_atendimento')
      or (
        (
          s.dias_semana is null
          or array_length(s.dias_semana, 1) is null
          or g.dow = any(s.dias_semana)
        )
        and (
          s.hora_inicio is null
          or s.hora_fim is null
          or g.ts::time between s.hora_inicio and s.hora_fim
        )
      )
    )                         as conta_hoje,
    -- nome + faixa de horário (quando configurada) para exibição.
    pr.name || coalesce(
      ' (' || to_char(s.hora_inicio, 'HH24:MI') || '–' || to_char(s.hora_fim, 'HH24:MI') || ')',
      ''
    )                         as prof_label,
    case
      when ca.id is null then 'Verde'
      when ca.status in ('presente', 'atendimento', 'em_atendimento') then 'Vermelho'
      when extract(epoch from (g.ts - ca.inicio)) / 60 >= 15 then 'Amarelo'
      else 'Vermelho'
    end                       as prof_status
  from public.salas s
  cross join agora g
  left join public.professionals pr
         on pr.id = s.professional_id and pr.company_id = s.company_id
  left join appt_atual ca
         on ca.company_id = s.company_id and ca.professional_id = s.professional_id
  left join prox px
         on px.company_id = s.company_id and px.professional_id = s.professional_id
  left join public.patients pat
         on pat.id = ca.patient_id
)
select
  sp.company_id                                                    as company_id,
  min(sp.sala_id)                                                  as sala_id,
  sp.numero                                                        as numero_da_sala,
  case
    when bool_or(sp.prof_status = 'Vermelho' and sp.conta_hoje) then 'Vermelho'
    when bool_or(sp.prof_status = 'Amarelo'  and sp.conta_hoje) then 'Amarelo'
    else 'Verde'
  end                                                              as status_atual,
  case
    when bool_or(sp.em_atendimento)                             then 'Em atendimento'
    when bool_or(sp.prof_status = 'Vermelho' and sp.conta_hoje) then 'Aguardando paciente'
    when bool_or(sp.prof_status = 'Amarelo'  and sp.conta_hoje) then 'Ociosa — paciente não chegou'
    else 'Livre para uso'
  end                                                              as detalhe_status,
  string_agg(distinct sp.prof_label, ', ' order by sp.prof_label)
    filter (where sp.conta_hoje and sp.prof_name is not null)      as profissionais,
  count(distinct sp.professional_id)
    filter (where sp.conta_hoje and sp.professional_id is not null) as total_profissionais,
  string_agg(distinct sp.prof_name, ', ' order by sp.prof_name)
    filter (where sp.em_atendimento)                              as profissional_em_atendimento,
  string_agg(distinct sp.paciente, ', ' order by sp.paciente)
    filter (where sp.em_atendimento and sp.paciente is not null)  as paciente_atual,
  min(sp.ca_horario) filter (where sp.em_atendimento)             as horario_atual,
  min(sp.proximo_horario) filter (where sp.conta_hoje)            as horario_proximo_agendamento
from sala_prof sp
group by sp.company_id, sp.numero;

commit;
