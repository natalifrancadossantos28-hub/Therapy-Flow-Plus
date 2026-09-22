-- =============================================================================
-- 0110: Gestão de Salas — sala física única + vários períodos por dia + status
--       ligado ao check-in
-- =============================================================================
--
-- Antes: cada linha de `salas` era (sala × profissional) com UM único intervalo
-- (dias_semana[] + hora_inicio/hora_fim). Para uma sala compartilhada era
-- preciso cadastrar a sala repetida, e um profissional não podia ter 2 períodos
-- no mesmo dia (08–12 e 14–16).
--
-- Agora:
--   * `salas`           = sala física, única por empresa (numero + especialidade).
--   * `sala_horarios`   = vínculo sala × profissional × dia da semana × período,
--                         quantas linhas forem necessárias por dia.
--   * Status da sala (vw_status_salas) passa a seguir o fluxo do agendamento:
--       Verde    = LIVRE               (nenhum atendimento agora)
--       Amarelo  = AGUARDANDO PACIENTE (há agendamento agora, sem check-in)
--       Azul     = PACIENTE CHEGOU     (check-in 'presente', aguardando início)
--       Vermelho = EM ATENDIMENTO      (profissional iniciou: 'atendimento'/'em_atendimento')
--     Um agendamento sozinho NÃO deixa a sala "ocupada".
--   * Conflito: a mesma sala não pode ter 2 profissionais no mesmo dia/horário,
--     e o mesmo profissional não pode estar em 2 salas ao mesmo tempo.
--
-- Migração de dados (sem perda):
--   * Cada linha antiga (sala × prof × dias × horário) vira N linhas em
--     `sala_horarios` (uma por dia). Sem dias = seg–sáb; sem horário = 07:00–19:00.
--   * Linhas duplicadas da mesma sala (mesmo `numero`) são unificadas na de menor id.
--   * As colunas antigas de `salas` permanecem (zeradas) por compatibilidade.
-- =============================================================================

begin;

-- ── Sala física ──────────────────────────────────────────────────────────────
alter table public.salas add column if not exists especialidade text;

create table if not exists public.sala_horarios (
  id              bigserial   primary key,
  company_id      bigint      not null references public.ponto_companies(id) on delete cascade,
  sala_id         bigint      not null references public.salas(id) on delete cascade,
  professional_id bigint      not null references public.professionals(id) on delete cascade,
  dia_semana      smallint    not null check (dia_semana between 1 and 7),
  hora_inicio     time        not null,
  hora_fim        time        not null,
  created_at      timestamptz not null default now(),
  check (hora_fim > hora_inicio)
);

create index if not exists sala_horarios_company_idx on public.sala_horarios(company_id);
create index if not exists sala_horarios_sala_idx    on public.sala_horarios(sala_id);
create index if not exists sala_horarios_prof_idx    on public.sala_horarios(professional_id, dia_semana);

alter table public.sala_horarios enable row level security;

-- ── Migração dos dados antigos ───────────────────────────────────────────────
do $mig$
declare
  r record;
  v_canon bigint;
  v_dias  smallint[];
begin
  if not exists (select 1 from public.sala_horarios) then
    for r in
      select s.*
        from public.salas s
       where s.professional_id is not null
    loop
      -- sala física canônica = menor id com o mesmo nome na empresa
      select min(id) into v_canon
        from public.salas
       where company_id = r.company_id
         and lower(btrim(numero)) = lower(btrim(r.numero));

      v_dias := coalesce(nullif(r.dias_semana, '{}'), array[1,2,3,4,5,6]::smallint[]);

      insert into public.sala_horarios (company_id, sala_id, professional_id, dia_semana, hora_inicio, hora_fim)
      select r.company_id, v_canon, r.professional_id, d,
             coalesce(r.hora_inicio, time '07:00'),
             case
               when r.hora_fim is null then time '19:00'
               when r.hora_fim <= coalesce(r.hora_inicio, time '07:00') then coalesce(r.hora_inicio, time '07:00') + interval '1 hour'
               else r.hora_fim
             end
        from unnest(v_dias) as d
       where not exists (
         select 1 from public.sala_horarios h
          where h.sala_id = v_canon and h.professional_id = r.professional_id and h.dia_semana = d
       );
    end loop;
  end if;

  -- remove salas duplicadas (mesmo nome), mantendo a de menor id
  delete from public.salas s
   using public.salas k
   where k.company_id = s.company_id
     and lower(btrim(k.numero)) = lower(btrim(s.numero))
     and k.id < s.id;

  update public.salas
     set professional_id = null, dias_semana = null, hora_inicio = null, hora_fim = null
   where professional_id is not null or dias_semana is not null or hora_inicio is not null;
end
$mig$;

create unique index if not exists salas_company_numero_uidx
  on public.salas (company_id, lower(btrim(numero)));

-- ── CRUD da sala física ──────────────────────────────────────────────────────
drop function if exists public.upsert_sala(text, text, bigint, text, bigint);
drop function if exists public.upsert_sala(text, text, bigint, text, bigint, int[], text, text);

create or replace function public.upsert_sala(
  p_slug          text,
  p_password      text,
  p_id            bigint,
  p_numero        text,
  p_especialidade text default null
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

  if exists (
    select 1 from public.salas
     where company_id = v_company_id
       and lower(btrim(numero)) = lower(v_numero)
       and (p_id is null or id <> p_id)
  ) then
    raise exception 'Já existe uma sala com o nome "%".', v_numero;
  end if;

  if p_id is null then
    insert into public.salas (company_id, numero, especialidade)
    values (v_company_id, v_numero, nullif(btrim(coalesce(p_especialidade, '')), ''))
    returning * into v_row;
  else
    update public.salas
       set numero        = v_numero,
           especialidade = nullif(btrim(coalesce(p_especialidade, '')), ''),
           updated_at    = now()
     where id = p_id and company_id = v_company_id
    returning * into v_row;
    if not found then
      raise exception 'Sala não encontrada.';
    end if;
  end if;

  return v_row;
end;
$$;

-- ── Períodos de uso (sala × profissional × dia × horário) ────────────────────
create or replace function public.list_sala_horarios(
  p_slug     text,
  p_password text
)
returns setof public.sala_horarios
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  return query
    select * from public.sala_horarios
     where company_id = v_company_id
     order by sala_id, professional_id, dia_semana, hora_inicio;
end;
$$;

create or replace function public.add_sala_horario(
  p_slug            text,
  p_password        text,
  p_sala_id         bigint,
  p_professional_id bigint,
  p_dia_semana      int,
  p_hora_inicio     text,
  p_hora_fim        text
)
returns public.sala_horarios
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_inicio     time;
  v_fim        time;
  v_sala       public.salas%rowtype;
  v_conf       record;
  v_row        public.sala_horarios%rowtype;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  select * into v_sala from public.salas where id = p_sala_id and company_id = v_company_id;
  if not found then
    raise exception 'Sala não encontrada.';
  end if;
  if not exists (select 1 from public.professionals where id = p_professional_id and company_id = v_company_id) then
    raise exception 'Profissional não encontrado.';
  end if;
  if p_dia_semana is null or p_dia_semana not between 1 and 7 then
    raise exception 'Dia da semana inválido.';
  end if;

  v_inicio := nullif(btrim(coalesce(p_hora_inicio, '')), '')::time;
  v_fim    := nullif(btrim(coalesce(p_hora_fim,    '')), '')::time;
  if v_inicio is null or v_fim is null then
    raise exception 'Informe o horário de início e de fim.';
  end if;
  if v_fim <= v_inicio then
    raise exception 'O horário de fim deve ser depois do início.';
  end if;

  -- conflito: outro profissional na MESMA sala, mesmo dia, horário sobreposto
  select pr.name, h.hora_inicio, h.hora_fim
    into v_conf
    from public.sala_horarios h
    join public.professionals pr on pr.id = h.professional_id
   where h.sala_id = p_sala_id
     and h.dia_semana = p_dia_semana
     and h.professional_id <> p_professional_id
     and h.hora_inicio < v_fim
     and h.hora_fim    > v_inicio
   limit 1;
  if found then
    raise exception 'Conflito de sala: a % já está reservada para % das % às %.',
      v_sala.numero, v_conf.name, to_char(v_conf.hora_inicio, 'HH24:MI'), to_char(v_conf.hora_fim, 'HH24:MI');
  end if;

  -- conflito: o MESMO profissional em OUTRA sala no mesmo horário
  select s.numero, h.hora_inicio, h.hora_fim
    into v_conf
    from public.sala_horarios h
    join public.salas s on s.id = h.sala_id
   where h.professional_id = p_professional_id
     and h.dia_semana = p_dia_semana
     and h.sala_id <> p_sala_id
     and h.hora_inicio < v_fim
     and h.hora_fim    > v_inicio
   limit 1;
  if found then
    raise exception 'Conflito: este profissional já está na % das % às % neste dia.',
      v_conf.numero, to_char(v_conf.hora_inicio, 'HH24:MI'), to_char(v_conf.hora_fim, 'HH24:MI');
  end if;

  -- mesmo profissional, mesma sala, período sobreposto → funde os períodos
  select min(h.hora_inicio), max(h.hora_fim)
    into v_conf
    from public.sala_horarios h
   where h.sala_id = p_sala_id
     and h.dia_semana = p_dia_semana
     and h.professional_id = p_professional_id
     and h.hora_inicio <= v_fim
     and h.hora_fim    >= v_inicio;
  if v_conf.min is not null then
    v_inicio := least(v_inicio, v_conf.min);
    v_fim    := greatest(v_fim, v_conf.max);
    delete from public.sala_horarios h
     where h.sala_id = p_sala_id
       and h.dia_semana = p_dia_semana
       and h.professional_id = p_professional_id
       and h.hora_inicio <= v_fim
       and h.hora_fim    >= v_inicio;
  end if;

  insert into public.sala_horarios (company_id, sala_id, professional_id, dia_semana, hora_inicio, hora_fim)
  values (v_company_id, p_sala_id, p_professional_id, p_dia_semana, v_inicio, v_fim)
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.delete_sala_horario(
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
  delete from public.sala_horarios where id = p_id and company_id = v_company_id;
end;
$$;

-- ── VIEW de status em tempo real (fluxo do check-in) ─────────────────────────
drop function if exists public.get_status_salas(text, text);
drop view if exists public.vw_status_salas;

create or replace view public.vw_status_salas as
with agora as (
  select
    (now() at time zone 'America/Sao_Paulo')                          as ts,
    extract(isodow from (now() at time zone 'America/Sao_Paulo'))::int as dow
),
-- profissionais que estão na sala AGORA (período configurado contém a hora atual)
prof_agora as (
  select h.company_id, h.sala_id, h.professional_id, h.hora_inicio, h.hora_fim
    from public.sala_horarios h
   cross join agora g
   where h.dia_semana = g.dow
     and g.ts::time >= h.hora_inicio
     and g.ts::time <  h.hora_fim
),
-- profissionais que usam a sala HOJE (qualquer período do dia)
prof_hoje as (
  select distinct h.company_id, h.sala_id, h.professional_id
    from public.sala_horarios h
   cross join agora g
   where h.dia_semana = g.dow
),
-- agendamento em curso de cada profissional (janela de 50 min)
appt_atual as (
  select distinct on (a.company_id, a.professional_id)
    a.company_id,
    a.professional_id,
    a.id,
    a."time"     as horario,
    lower(coalesce(a.status, '')) as status,
    a.patient_id,
    a.updated_at,
    (a."date" || ' ' || a."time")::timestamp as inicio
  from public.appointments a
  cross join agora g
  where a."date" = to_char(g.ts, 'YYYY-MM-DD')
    and (a."date" || ' ' || a."time")::timestamp <= g.ts
    and g.ts < (a."date" || ' ' || a."time")::timestamp + interval '50 minutes'
    and lower(coalesce(a.status, '')) not in ('cancelado', 'desmarcado', 'remanejado', 'remarcado', 'falta_justificada', 'falta_nao_justificada')
  order by a.company_id, a.professional_id, inicio desc
),
-- próximo agendamento de hoje (ainda não iniciado) por profissional
prox as (
  select distinct on (a.company_id, a.professional_id)
    a.company_id,
    a.professional_id,
    a."time" as proximo_horario,
    pat.name as proximo_paciente
  from public.appointments a
  cross join agora g
  left join public.patients pat on pat.id = a.patient_id
  where a."date" = to_char(g.ts, 'YYYY-MM-DD')
    and (a."date" || ' ' || a."time")::timestamp > g.ts
    and lower(coalesce(a.status, '')) not in ('cancelado', 'desmarcado', 'remanejado', 'remarcado', 'falta_justificada', 'falta_nao_justificada')
  order by a.company_id, a.professional_id, (a."date" || ' ' || a."time")::timestamp asc
),
sala_prof as (
  select
    s.company_id,
    s.id                      as sala_id,
    s.numero,
    s.especialidade,
    ph.professional_id,
    pr.name                   as prof_name,
    (pa.professional_id is not null) as presente_agora,
    ca.id                     as ca_id,
    ca.horario                as ca_horario,
    ca.status                 as ca_status,
    ca.updated_at             as ca_updated_at,
    pat.name                  as paciente,
    px.proximo_horario,
    px.proximo_paciente,
    pr.name || coalesce(
      ' (' || to_char(pa.hora_inicio, 'HH24:MI') || '–' || to_char(pa.hora_fim, 'HH24:MI') || ')',
      ''
    )                         as prof_label,
    case
      when ca.id is null then 0
      when ca.status in ('atendimento', 'em_atendimento') then 3   -- em atendimento
      when ca.status = 'presente'                         then 2   -- paciente chegou
      else 1                                                       -- aguardando paciente
    end                       as nivel
  from public.salas s
  join prof_hoje ph on ph.sala_id = s.id
  left join prof_agora pa on pa.sala_id = s.id and pa.professional_id = ph.professional_id
  left join public.professionals pr on pr.id = ph.professional_id
  left join appt_atual ca
         on ca.company_id = s.company_id and ca.professional_id = ph.professional_id
        and pa.professional_id is not null          -- só conta o atendimento se o prof está na sala agora
  left join prox px
         on px.company_id = s.company_id and px.professional_id = ph.professional_id
  left join public.patients pat on pat.id = ca.patient_id
),
agg as (
  select
    sp.company_id,
    sp.sala_id,
    sp.numero,
    sp.especialidade,
    max(sp.nivel)                                                    as nivel,
    string_agg(distinct sp.prof_label, ', ' order by sp.prof_label)
      filter (where sp.presente_agora and sp.prof_name is not null)  as profissionais,
    count(distinct sp.professional_id)
      filter (where sp.presente_agora)                               as total_profissionais,
    string_agg(distinct sp.prof_name, ', ' order by sp.prof_name)
      filter (where sp.nivel > 0)                                    as profissional_atual,
    string_agg(distinct sp.paciente, ', ' order by sp.paciente)
      filter (where sp.nivel > 0 and sp.paciente is not null)        as paciente_atual,
    min(sp.ca_horario)     filter (where sp.nivel > 0)               as horario_atual,
    min(sp.ca_updated_at)  filter (where sp.nivel >= 2)              as checkin_em,
    min(sp.proximo_horario)                                          as horario_proximo_agendamento,
    (array_agg(sp.proximo_paciente order by sp.proximo_horario) filter (where sp.proximo_horario is not null))[1]
                                                                     as proximo_paciente
  from sala_prof sp
  group by sp.company_id, sp.sala_id, sp.numero, sp.especialidade
)
select
  s.company_id,
  s.id                          as sala_id,
  s.numero                      as numero_da_sala,
  s.especialidade,
  case coalesce(a.nivel, 0)
    when 3 then 'Vermelho'
    when 2 then 'Azul'
    when 1 then 'Amarelo'
    else 'Verde'
  end                           as status_atual,
  case coalesce(a.nivel, 0)
    when 3 then 'Em atendimento'
    when 2 then 'Paciente chegou'
    when 1 then 'Aguardando paciente'
    else 'Livre'
  end                           as detalhe_status,
  a.profissionais,
  coalesce(a.total_profissionais, 0)                    as total_profissionais,
  a.profissional_atual                                  as profissional_em_atendimento,
  a.paciente_atual,
  a.horario_atual,
  case when a.checkin_em is not null
       then to_char(a.checkin_em at time zone 'America/Sao_Paulo', 'HH24:MI') end as checkin_horario,
  a.horario_proximo_agendamento,
  a.proximo_paciente
from public.salas s
left join agg a on a.sala_id = s.id;

create or replace function public.get_status_salas(
  p_slug     text,
  p_password text
)
returns table (
  sala_id                      bigint,
  numero_da_sala               text,
  especialidade                text,
  status_atual                 text,
  detalhe_status               text,
  profissionais                text,
  total_profissionais          bigint,
  profissional_em_atendimento  text,
  paciente_atual               text,
  horario_atual                text,
  checkin_horario              text,
  horario_proximo_agendamento  text,
  proximo_paciente             text
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
      v.especialidade,
      v.status_atual,
      v.detalhe_status,
      v.profissionais,
      v.total_profissionais,
      v.profissional_em_atendimento,
      v.paciente_atual,
      v.horario_atual,
      v.checkin_horario,
      v.horario_proximo_agendamento,
      v.proximo_paciente
    from public.vw_status_salas v
    where v.company_id = v_company_id
    order by v.numero_da_sala asc;
end;
$$;

-- ── Permissões ───────────────────────────────────────────────────────────────
revoke all on function public.upsert_sala(text, text, bigint, text, text)                          from public;
revoke all on function public.list_sala_horarios(text, text)                                       from public;
revoke all on function public.add_sala_horario(text, text, bigint, bigint, int, text, text)        from public;
revoke all on function public.delete_sala_horario(text, text, bigint)                              from public;
revoke all on function public.get_status_salas(text, text)                                         from public;

grant execute on function public.upsert_sala(text, text, bigint, text, text)                       to anon, authenticated;
grant execute on function public.list_sala_horarios(text, text)                                    to anon, authenticated;
grant execute on function public.add_sala_horario(text, text, bigint, bigint, int, text, text)     to anon, authenticated;
grant execute on function public.delete_sala_horario(text, text, bigint)                           to anon, authenticated;
grant execute on function public.get_status_salas(text, text)                                      to anon, authenticated;

commit;
