-- =============================================================================
-- 0070: Gestão de Salas — dias da semana + horário por profissional
-- =============================================================================
--
-- Cada linha de `salas` representa (sala física × profissional). Agora cada
-- vínculo pode ter:
--   * dias_semana: dias em que o profissional usa a sala (ISO: 1=Seg … 7=Dom)
--   * hora_inicio / hora_fim: faixa de horário de uso naquela sala
--
-- Regra de exibição no dashboard (vw_status_salas):
--   * "Hoje" = dia da semana atual (fuso America/Sao_Paulo).
--   * Um profissional CONTA na sala hoje quando:
--       - não tem dias_semana configurado (usa todo dia — compatível com o legado), OU
--       - o dia de hoje está em dias_semana, OU
--       - está em atendimento agora (segurança: nunca esconder quem está atendendo).
--   * A lista de profissionais e o total passam a refletir só quem conta hoje,
--     com o horário ao lado do nome (ex.: "TAINÁ (07:00–12:00)").
-- =============================================================================

begin;

-- ── Novas colunas ────────────────────────────────────────────────────────────
alter table public.salas add column if not exists dias_semana smallint[];
alter table public.salas add column if not exists hora_inicio time;
alter table public.salas add column if not exists hora_fim    time;

-- ── CRUD: criar/editar (nova assinatura com dias/horário) ────────────────────
drop function if exists public.upsert_sala(text, text, bigint, text, bigint);

create or replace function public.upsert_sala(
  p_slug            text,
  p_password        text,
  p_id              bigint,
  p_numero          text,
  p_professional_id bigint  default null,
  p_dias            int[]   default null,
  p_hora_inicio     text    default null,
  p_hora_fim        text    default null
)
returns public.salas
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_numero     text;
  v_dias       smallint[];
  v_inicio     time;
  v_fim        time;
  v_row        public.salas%rowtype;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  v_numero := btrim(coalesce(p_numero, ''));
  if v_numero = '' then
    raise exception 'O número/nome da sala é obrigatório.';
  end if;

  -- profissional (se informado) precisa ser da mesma empresa
  if p_professional_id is not null then
    if not exists (
      select 1 from public.professionals
       where id = p_professional_id and company_id = v_company_id
    ) then
      raise exception 'Profissional não encontrado.';
    end if;
  end if;

  -- normaliza dias (remove nulos/duplicados; mantém só 1..7) e horários
  if p_dias is not null then
    select array_agg(distinct d order by d)
      into v_dias
      from unnest(p_dias) as d
     where d between 1 and 7;
  end if;
  v_inicio := nullif(btrim(coalesce(p_hora_inicio, '')), '')::time;
  v_fim    := nullif(btrim(coalesce(p_hora_fim,    '')), '')::time;

  if p_id is null then
    insert into public.salas (company_id, numero, professional_id, dias_semana, hora_inicio, hora_fim)
    values (v_company_id, v_numero, p_professional_id, v_dias, v_inicio, v_fim)
    returning * into v_row;
  else
    update public.salas
       set numero          = v_numero,
           professional_id = p_professional_id,
           dias_semana     = v_dias,
           hora_inicio     = v_inicio,
           hora_fim        = v_fim,
           updated_at      = now()
     where id = p_id and company_id = v_company_id
    returning * into v_row;
    if not found then
      raise exception 'Sala não encontrada.';
    end if;
  end if;

  return v_row;
end;
$$;

-- ── VIEW de status: filtra por dia + mostra horário no nome ──────────────────
drop function if exists public.get_status_salas(text, text);
drop view if exists public.vw_status_salas;

create view public.vw_status_salas as
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
    -- conta na sala hoje: sem dias configurados (todo dia), ou hoje está nos dias,
    -- ou está em atendimento agora (nunca esconder quem atende).
    (
      s.dias_semana is null
      or array_length(s.dias_semana, 1) is null
      or g.dow = any(s.dias_semana)
      or ca.status in ('presente', 'atendimento', 'em_atendimento')
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

-- ── Permissões ───────────────────────────────────────────────────────────────
revoke all on function public.upsert_sala(text, text, bigint, text, bigint, int[], text, text) from public;
revoke all on function public.get_status_salas(text, text)                                      from public;

grant execute on function public.upsert_sala(text, text, bigint, text, bigint, int[], text, text) to anon, authenticated;
grant execute on function public.get_status_salas(text, text)                                      to anon, authenticated;

commit;
