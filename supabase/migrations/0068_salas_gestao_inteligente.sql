-- =============================================================================
-- 0068: Gestão Inteligente de Salas
-- =============================================================================
--
-- Cria a base para o dashboard de status das salas:
--   * tabela `salas` (número/nome + profissional responsável fixo)
--   * CRUD via RPC (list/upsert/delete) com verificação de admin
--   * VIEW `vw_status_salas` que cruza salas × agendamentos em tempo real
--   * RPC `get_status_salas` que devolve a view filtrada pela empresa
--
-- Regra de status (sessões ~50 min, tolerância de 15 min):
--   🔴 Vermelho (Ocupada): há agendamento no horário atual e o paciente está
--      presente (status presente/atendimento) — OU está dentro da tolerância de
--      15 min aguardando o paciente chegar (sem alarme).
--   🟡 Amarelo (Ociosa): há agendamento no horário atual, paciente NÃO presente
--      e já passou a tolerância de 15 min (sala parada que deveria estar em uso).
--   🟢 Verde (Livre): não há agendamento no horário atual → sala livre pra uso.
-- =============================================================================

begin;

-- ── Tabela de salas ──────────────────────────────────────────────────────────
create table if not exists public.salas (
  id              bigserial   primary key,
  company_id      bigint      not null references public.ponto_companies(id) on delete cascade,
  numero          text        not null,
  professional_id bigint      references public.professionals(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists salas_company_idx on public.salas(company_id);

alter table public.salas enable row level security;

-- ── CRUD: listar ─────────────────────────────────────────────────────────────
create or replace function public.list_salas(
  p_slug     text,
  p_password text
)
returns setof public.salas
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  return query
    select * from public.salas
     where company_id = v_company_id
     order by numero asc, id asc;
end;
$$;

-- ── CRUD: criar/editar ───────────────────────────────────────────────────────
create or replace function public.upsert_sala(
  p_slug            text,
  p_password        text,
  p_id              bigint,
  p_numero          text,
  p_professional_id bigint default null
)
returns public.salas
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_numero     text;
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

  if p_id is null then
    insert into public.salas (company_id, numero, professional_id)
    values (v_company_id, v_numero, p_professional_id)
    returning * into v_row;
  else
    update public.salas
       set numero          = v_numero,
           professional_id = p_professional_id,
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

-- ── CRUD: excluir ────────────────────────────────────────────────────────────
create or replace function public.delete_sala(
  p_slug     text,
  p_password text,
  p_id       bigint
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  delete from public.salas where id = p_id and company_id = v_company_id;
end;
$$;

-- ── VIEW de status em tempo real ─────────────────────────────────────────────
create or replace view public.vw_status_salas as
with agora as (
  select (now() at time zone 'America/Sao_Paulo') as ts
),
-- agendamento "atual" por (empresa, profissional): o slot que cobre o horário
-- de agora (início <= agora < início + 50 min), do dia de hoje.
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
)
select
  s.id                          as sala_id,
  s.company_id                  as company_id,
  s.numero                      as numero_da_sala,
  s.professional_id             as professional_id,
  pr.name                       as profissional_responsavel,
  case
    when ca.id is null then 'Verde'
    when ca.status in ('presente', 'atendimento', 'em_atendimento') then 'Vermelho'
    when extract(epoch from (g.ts - ca.inicio)) / 60 >= 15 then 'Amarelo'
    else 'Vermelho'
  end                           as status_atual,
  case
    when ca.id is null then 'Livre para uso'
    when ca.status in ('presente', 'atendimento', 'em_atendimento') then 'Em atendimento'
    when extract(epoch from (g.ts - ca.inicio)) / 60 >= 15 then 'Ociosa — paciente não chegou'
    else 'Aguardando paciente'
  end                           as detalhe_status,
  pat.name                      as paciente_atual,
  ca.horario                    as horario_atual,
  px.proximo_horario            as horario_proximo_agendamento
from public.salas s
cross join agora g
left join public.professionals pr
       on pr.id = s.professional_id and pr.company_id = s.company_id
left join appt_atual ca
       on ca.company_id = s.company_id and ca.professional_id = s.professional_id
left join prox px
       on px.company_id = s.company_id and px.professional_id = s.professional_id
left join public.patients pat
       on pat.id = ca.patient_id;

-- ── RPC: status filtrado pela empresa ────────────────────────────────────────
create or replace function public.get_status_salas(
  p_slug     text,
  p_password text
)
returns table (
  sala_id                      bigint,
  numero_da_sala               text,
  professional_id              bigint,
  profissional_responsavel     text,
  status_atual                 text,
  detalhe_status               text,
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
      v.professional_id,
      v.profissional_responsavel,
      v.status_atual,
      v.detalhe_status,
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
revoke all on function public.list_salas(text, text)                       from public;
revoke all on function public.upsert_sala(text, text, bigint, text, bigint) from public;
revoke all on function public.delete_sala(text, text, bigint)              from public;
revoke all on function public.get_status_salas(text, text)                 from public;

grant execute on function public.list_salas(text, text)                       to anon, authenticated;
grant execute on function public.upsert_sala(text, text, bigint, text, bigint) to anon, authenticated;
grant execute on function public.delete_sala(text, text, bigint)              to anon, authenticated;
grant execute on function public.get_status_salas(text, text)                 to anon, authenticated;

commit;
