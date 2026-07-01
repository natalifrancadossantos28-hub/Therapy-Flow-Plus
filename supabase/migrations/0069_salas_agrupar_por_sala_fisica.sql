-- =============================================================================
-- 0069: Gestão de Salas — agrupar por SALA FÍSICA (não por profissional)
-- =============================================================================
--
-- Antes, o dashboard exibia um card por linha de `salas` (uma por profissional),
-- gerando duplicidade para salas compartilhadas (ex.: FISIOTERAPIA aparecia 3x,
-- uma para cada fisioterapeuta). Agora a view agrupa por `numero` (a sala física)
-- e consolida o status:
--   * status_atual consolidado por sala:
--       🔴 Vermelho (Ocupada): QUALQUER profissional da sala em atendimento
--          (ou dentro da tolerância de 15 min aguardando o paciente).
--       🟡 Amarelo (Ociosa): ninguém em atendimento, mas há agendamento no
--          horário atual sem paciente presente há mais de 15 min.
--       🟢 Verde (Livre): nenhum profissional da sala com agendamento agora.
--   * profissionais: lista de todos os profissionais associados à sala.
--   * paciente_atual: paciente(s) em atendimento na sala agora.
--   * horario_proximo_agendamento: próximo horário (mínimo) entre os profissionais.
-- =============================================================================

begin;

-- get_status_salas depende da view e muda de assinatura de retorno → drop antes.
drop function if exists public.get_status_salas(text, text);
drop view if exists public.vw_status_salas;

create view public.vw_status_salas as
with agora as (
  select (now() at time zone 'America/Sao_Paulo') as ts
),
-- agendamento "atual" por (empresa, profissional): slot que cobre o horário de
-- agora (início <= agora < início + 50 min), do dia de hoje.
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
-- próximo agendamento de hoje (início >= agora) por (empresa, profissional).
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
-- uma linha por (sala física, profissional) com o status individual do profissional.
sala_prof as (
  select
    s.company_id,
    s.numero,
    s.id                      as sala_id,
    s.professional_id,
    pr.name                   as prof_name,
    ca.id                     as ca_id,
    ca.horario                as ca_horario,
    pat.name                  as paciente,
    px.proximo_horario        as proximo_horario,
    (ca.status in ('presente', 'atendimento', 'em_atendimento')) as em_atendimento,
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
    when bool_or(sp.prof_status = 'Vermelho') then 'Vermelho'
    when bool_or(sp.prof_status = 'Amarelo')  then 'Amarelo'
    else 'Verde'
  end                                                              as status_atual,
  case
    when bool_or(sp.em_atendimento)           then 'Em atendimento'
    when bool_or(sp.prof_status = 'Vermelho') then 'Aguardando paciente'
    when bool_or(sp.prof_status = 'Amarelo')  then 'Ociosa — paciente não chegou'
    else 'Livre para uso'
  end                                                              as detalhe_status,
  string_agg(distinct sp.prof_name, ', ' order by sp.prof_name)
    filter (where sp.prof_name is not null)                        as profissionais,
  count(distinct sp.professional_id)                               as total_profissionais,
  string_agg(distinct sp.prof_name, ', ' order by sp.prof_name)
    filter (where sp.em_atendimento)                              as profissional_em_atendimento,
  string_agg(distinct sp.paciente, ', ' order by sp.paciente)
    filter (where sp.em_atendimento and sp.paciente is not null)  as paciente_atual,
  min(sp.ca_horario) filter (where sp.em_atendimento)             as horario_atual,
  min(sp.proximo_horario)                                         as horario_proximo_agendamento
from sala_prof sp
group by sp.company_id, sp.numero;

create or replace function public.get_status_salas(
  p_slug     text,
  p_password text
)
returns table (
  sala_id                      bigint,
  numero_da_sala               text,
  status_atual                 text,
  detalhe_status               text,
  profissionais                text,
  total_profissionais          bigint,
  profissional_em_atendimento  text,
  paciente_atual               text,
  horario_atual                text,
  horario_proximo_agendamento  text
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  return query
    select
      v.sala_id,
      v.numero_da_sala,
      v.status_atual,
      v.detalhe_status,
      v.profissionais,
      v.total_profissionais,
      v.profissional_em_atendimento,
      v.paciente_atual,
      v.horario_atual,
      v.horario_proximo_agendamento
    from public.vw_status_salas v
    where v.company_id = v_company_id
    order by
      case v.status_atual when 'Amarelo' then 0 when 'Vermelho' then 1 else 2 end,
      v.numero_da_sala asc;
end;
$$;

revoke all on function public.get_status_salas(text, text) from public;
grant execute on function public.get_status_salas(text, text) to anon, authenticated;

commit;
