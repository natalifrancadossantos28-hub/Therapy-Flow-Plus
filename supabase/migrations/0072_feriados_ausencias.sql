-- =============================================================================
-- 0072: Feriados (clínica) + Ausências de profissional (férias/folga/falta)
-- =============================================================================
--
-- Problema:
--   Em feriado, ponto facultativo, férias ou falta do profissional, não havia
--   como "parar" a agenda daquele dia — os pacientes continuavam aparecendo na
--   Recepção e na Agenda como se o atendimento fosse acontecer.
--
-- Solução (dados; a exibição/ocultação é feita no front):
--   * `feriados`               — datas em que a clínica inteira não atende.
--   * `ausencias_profissional` — período (data_inicio..data_fim) em que UM
--                                profissional não atende (férias/folga/falta).
--   O front usa essas tabelas para esconder/`não contar` os atendimentos das
--   datas afetadas (Recepção, Agenda, Portal, Dashboard) — sem apagar as
--   recorrências, então o atendimento volta normal depois do período.
--
--   CRUD via RPC com verificação de admin (mesmo padrão de salas).
-- =============================================================================

begin;

-- ── Tabelas ──────────────────────────────────────────────────────────────────
create table if not exists public.feriados (
  id          bigserial   primary key,
  company_id  bigint      not null references public.ponto_companies(id) on delete cascade,
  data        date        not null,
  descricao   text        not null default '',
  created_at  timestamptz not null default now(),
  unique (company_id, data)
);
create index if not exists feriados_company_data_idx on public.feriados(company_id, data);
alter table public.feriados enable row level security;

create table if not exists public.ausencias_profissional (
  id              bigserial   primary key,
  company_id      bigint      not null references public.ponto_companies(id) on delete cascade,
  professional_id bigint      not null references public.professionals(id)   on delete cascade,
  data_inicio     date        not null,
  data_fim        date        not null,
  motivo          text        not null default '',
  created_at      timestamptz not null default now()
);
create index if not exists ausencias_company_idx on public.ausencias_profissional(company_id);
create index if not exists ausencias_prof_idx    on public.ausencias_profissional(professional_id);
alter table public.ausencias_profissional enable row level security;

-- ── Feriados: listar ─────────────────────────────────────────────────────────
create or replace function public.list_feriados(
  p_slug     text,
  p_password text
)
returns setof public.feriados
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  return query
    select * from public.feriados
     where company_id = v_company_id
     order by data asc;
end;
$$;

-- ── Feriados: criar/atualizar (por data) ─────────────────────────────────────
create or replace function public.upsert_feriado(
  p_slug      text,
  p_password  text,
  p_data      text,
  p_descricao text default ''
)
returns public.feriados
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_data       date;
  v_row        public.feriados%rowtype;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  v_data := nullif(btrim(coalesce(p_data, '')), '')::date;
  if v_data is null then
    raise exception 'Data do feriado é obrigatória.';
  end if;

  insert into public.feriados (company_id, data, descricao)
  values (v_company_id, v_data, btrim(coalesce(p_descricao, '')))
  on conflict (company_id, data)
    do update set descricao = excluded.descricao
  returning * into v_row;

  return v_row;
end;
$$;

-- ── Feriados: excluir ────────────────────────────────────────────────────────
create or replace function public.delete_feriado(
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
  delete from public.feriados
   where id = p_id and company_id = v_company_id;
end;
$$;

-- ── Ausências: listar ────────────────────────────────────────────────────────
create or replace function public.list_ausencias(
  p_slug     text,
  p_password text
)
returns setof public.ausencias_profissional
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  return query
    select * from public.ausencias_profissional
     where company_id = v_company_id
     order by data_inicio desc, id desc;
end;
$$;

-- ── Ausências: criar ─────────────────────────────────────────────────────────
create or replace function public.add_ausencia(
  p_slug            text,
  p_password        text,
  p_professional_id bigint,
  p_data_inicio     text,
  p_data_fim        text,
  p_motivo          text default ''
)
returns public.ausencias_profissional
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_ini        date;
  v_fim        date;
  v_row        public.ausencias_profissional%rowtype;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  if not exists (
    select 1 from public.professionals
     where id = p_professional_id and company_id = v_company_id
  ) then
    raise exception 'Profissional não encontrado.';
  end if;

  v_ini := nullif(btrim(coalesce(p_data_inicio, '')), '')::date;
  v_fim := nullif(btrim(coalesce(p_data_fim,    '')), '')::date;
  if v_ini is null then
    raise exception 'Data inicial é obrigatória.';
  end if;
  if v_fim is null then v_fim := v_ini; end if;
  if v_fim < v_ini then
    raise exception 'A data final não pode ser anterior à inicial.';
  end if;

  insert into public.ausencias_profissional
    (company_id, professional_id, data_inicio, data_fim, motivo)
  values
    (v_company_id, p_professional_id, v_ini, v_fim, btrim(coalesce(p_motivo, '')))
  returning * into v_row;

  return v_row;
end;
$$;

-- ── Ausências: excluir ───────────────────────────────────────────────────────
create or replace function public.delete_ausencia(
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
  delete from public.ausencias_profissional
   where id = p_id and company_id = v_company_id;
end;
$$;

-- ── Permissões ───────────────────────────────────────────────────────────────
revoke all on function public.list_feriados(text, text)                       from public;
revoke all on function public.upsert_feriado(text, text, text, text)          from public;
revoke all on function public.delete_feriado(text, text, bigint)              from public;
revoke all on function public.list_ausencias(text, text)                      from public;
revoke all on function public.add_ausencia(text, text, bigint, text, text, text) from public;
revoke all on function public.delete_ausencia(text, text, bigint)             from public;

grant execute on function public.list_feriados(text, text)                       to anon, authenticated;
grant execute on function public.upsert_feriado(text, text, text, text)          to anon, authenticated;
grant execute on function public.delete_feriado(text, text, bigint)              to anon, authenticated;
grant execute on function public.list_ausencias(text, text)                      to anon, authenticated;
grant execute on function public.add_ausencia(text, text, bigint, text, text, text) to anon, authenticated;
grant execute on function public.delete_ausencia(text, text, bigint)             to anon, authenticated;

commit;
