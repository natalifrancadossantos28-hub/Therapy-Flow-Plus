-- Phase 4A - Arco-iris cadastros: professionals, contractors, colaboradores
--
-- Creates the three cadastro tables plus SECURITY DEFINER RPCs so the
-- arco-iris frontend can run CRUD from the browser via PostgREST.
--
-- Security model (matches Phase 2/3):
--   * Company admin operations require slug + password (bcrypt verified by
--     public._verify_company_admin from migration 0002).
--   * RLS is enabled on every table with no policy, so anon/authenticated
--     roles cannot touch rows directly - every request MUST go through an
--     RPC.

create extension if not exists pgcrypto with schema extensions;

-- --- Tables ----------------------------------------------------------------
create table if not exists public.professionals (
  id              bigserial   primary key,
  company_id      bigint      not null references public.ponto_companies(id) on delete cascade,
  name            text        not null,
  specialty       text,
  email           text,
  phone           text,
  pin             text,
  carga_horaria   text        not null default '30h',
  tipo_contrato   text        not null default 'Contratado',
  salario         numeric,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists professionals_company_idx
  on public.professionals(company_id);

create table if not exists public.contractors (
  id                     bigserial   primary key,
  company_id             bigint      not null references public.ponto_companies(id) on delete cascade,
  name                   text        not null,
  valor_por_atendimento  numeric     not null default 30,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists contractors_company_idx
  on public.contractors(company_id);

create table if not exists public.colaboradores (
  id          bigserial   primary key,
  company_id  bigint      not null references public.ponto_companies(id) on delete cascade,
  name        text        not null,
  cargo       text        not null default 'ADM',
  salario     numeric     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists colaboradores_company_idx
  on public.colaboradores(company_id);

alter table public.professionals  enable row level security;
alter table public.contractors    enable row level security;
alter table public.colaboradores  enable row level security;

-- --- updated_at trigger (reused if already exists) -----------------------
create or replace function public._tg_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_professionals_touch  on public.professionals;
drop trigger if exists trg_contractors_touch    on public.contractors;
drop trigger if exists trg_colaboradores_touch  on public.colaboradores;

create trigger trg_professionals_touch
  before update on public.professionals
  for each row execute function public._tg_touch_updated_at();

create trigger trg_contractors_touch
  before update on public.contractors
  for each row execute function public._tg_touch_updated_at();

create trigger trg_colaboradores_touch
  before update on public.colaboradores
  for each row execute function public._tg_touch_updated_at();

-- =========================================================================
-- Professionals RPCs
-- =========================================================================

create or replace function public.list_professionals(
  p_slug     text,
  p_password text
)
returns setof public.professionals
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  return query
    select *
      from public.professionals p
     where p.company_id = v_company_id
     order by p.name asc;
end;
$$;

create or replace function public.get_professional(
  p_slug     text,
  p_password text,
  p_id       bigint
)
returns public.professionals
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_row        public.professionals%rowtype;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  select * into v_row
    from public.professionals
   where id = p_id and company_id = v_company_id
   limit 1;
  if not found then
    return null;
  end if;
  return v_row;
end;
$$;

create or replace function public.upsert_professional(
  p_slug     text,
  p_password text,
  p_id       bigint,
  p_payload  jsonb
)
returns public.professionals
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_row        public.professionals%rowtype;
  v_name       text;
  v_pin        text;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  v_name := nullif(btrim(coalesce(p_payload->>'name', '')), '');
  if v_name is null then
    raise exception 'name is required';
  end if;

  -- Normalise PIN: null, empty, or exactly 4 digits
  if p_payload ? 'pin' then
    if p_payload->>'pin' is null or btrim(p_payload->>'pin') = '' then
      v_pin := null;
    else
      v_pin := btrim(p_payload->>'pin');
      if v_pin !~ '^[0-9]{4}$' then
        raise exception 'PIN inválido - deve conter exatamente 4 dígitos numéricos';
      end if;
    end if;
  end if;

  if p_id is null then
    insert into public.professionals (
      company_id, name, specialty, email, phone, pin,
      carga_horaria, tipo_contrato, salario
    ) values (
      v_company_id,
      v_name,
      nullif(btrim(coalesce(p_payload->>'specialty', '')), ''),
      nullif(btrim(coalesce(p_payload->>'email', '')), ''),
      nullif(btrim(coalesce(p_payload->>'phone', '')), ''),
      v_pin,
      coalesce(nullif(btrim(coalesce(p_payload->>'cargaHoraria', '')), ''), '30h'),
      coalesce(nullif(btrim(coalesce(p_payload->>'tipoContrato', '')), ''), 'Contratado'),
      case when p_payload ? 'salario' and p_payload->>'salario' is not null
                and btrim(p_payload->>'salario') <> ''
           then (p_payload->>'salario')::numeric
           else null end
    )
    returning * into v_row;
  else
    update public.professionals set
      name          = v_name,
      specialty     = nullif(btrim(coalesce(p_payload->>'specialty', '')), ''),
      email         = nullif(btrim(coalesce(p_payload->>'email', '')), ''),
      phone         = nullif(btrim(coalesce(p_payload->>'phone', '')), ''),
      pin           = case when p_payload ? 'pin' then v_pin else pin end,
      carga_horaria = case when p_payload ? 'cargaHoraria'
                           then coalesce(nullif(btrim(coalesce(p_payload->>'cargaHoraria', '')), ''), '30h')
                           else carga_horaria end,
      tipo_contrato = case when p_payload ? 'tipoContrato'
                           then coalesce(nullif(btrim(coalesce(p_payload->>'tipoContrato', '')), ''), 'Contratado')
                           else tipo_contrato end,
      salario       = case when p_payload ? 'salario'
                           then case when p_payload->>'salario' is null
                                        or btrim(p_payload->>'salario') = ''
                                     then null
                                     else (p_payload->>'salario')::numeric end
                           else salario end
    where id = p_id and company_id = v_company_id
    returning * into v_row;

    if not found then
      raise exception 'professional not found';
    end if;
  end if;

  return v_row;
end;
$$;

create or replace function public.delete_professional(
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
  delete from public.professionals
   where id = p_id and company_id = v_company_id;
end;
$$;

-- PIN verification (used by agenda-profissionais flow): takes the slug plus
-- the professional id and PIN, returns the matching row or NULL if wrong.
-- Does NOT require the company admin password because the professional
-- wing is accessed from a public URL; brute force is mitigated by the PIN
-- being scoped to a single professional id under a single company slug.
create or replace function public.verify_professional_pin(
  p_slug            text,
  p_professional_id bigint,
  p_pin             text
)
returns public.professionals
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_row        public.professionals%rowtype;
begin
  select id into v_company_id
    from public.ponto_companies
   where slug = p_slug
   limit 1;
  if v_company_id is null then
    return null;
  end if;

  select * into v_row
    from public.professionals
   where id = p_professional_id
     and company_id = v_company_id
     and pin is not null
     and pin = p_pin
   limit 1;

  if not found then
    return null;
  end if;
  return v_row;
end;
$$;

-- =========================================================================
-- Contractors RPCs
-- =========================================================================

create or replace function public.list_contractors(
  p_slug     text,
  p_password text
)
returns setof public.contractors
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  return query
    select *
      from public.contractors c
     where c.company_id = v_company_id
     order by c.name asc;
end;
$$;

create or replace function public.upsert_contractor(
  p_slug     text,
  p_password text,
  p_id       bigint,
  p_payload  jsonb
)
returns public.contractors
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_row        public.contractors%rowtype;
  v_name       text;
  v_valor      numeric;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  v_name := nullif(btrim(coalesce(p_payload->>'name', '')), '');
  if v_name is null then
    raise exception 'name is required';
  end if;

  v_valor := case when p_payload ? 'valorPorAtendimento'
                       and p_payload->>'valorPorAtendimento' is not null
                       and btrim(p_payload->>'valorPorAtendimento') <> ''
                  then (p_payload->>'valorPorAtendimento')::numeric
                  else 30 end;
  if v_valor is null or v_valor <= 0 then
    v_valor := 30;
  end if;

  if p_id is null then
    insert into public.contractors (company_id, name, valor_por_atendimento)
    values (v_company_id, v_name, v_valor)
    returning * into v_row;
  else
    update public.contractors set
      name                  = v_name,
      valor_por_atendimento = v_valor
    where id = p_id and company_id = v_company_id
    returning * into v_row;

    if not found then
      raise exception 'contractor not found';
    end if;
  end if;

  return v_row;
end;
$$;

create or replace function public.delete_contractor(
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
  delete from public.contractors
   where id = p_id and company_id = v_company_id;
end;
$$;

-- =========================================================================
-- Colaboradores RPCs
-- =========================================================================

create or replace function public.list_colaboradores(
  p_slug     text,
  p_password text
)
returns setof public.colaboradores
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  return query
    select *
      from public.colaboradores c
     where c.company_id = v_company_id
     order by c.name asc;
end;
$$;

create or replace function public.upsert_colaborador(
  p_slug     text,
  p_password text,
  p_id       bigint,
  p_payload  jsonb
)
returns public.colaboradores
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_row        public.colaboradores%rowtype;
  v_name       text;
  v_cargo      text;
  v_salario    numeric;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  v_name := nullif(btrim(coalesce(p_payload->>'name', '')), '');
  if v_name is null then
    raise exception 'name is required';
  end if;

  v_cargo   := coalesce(nullif(btrim(coalesce(p_payload->>'cargo', '')), ''), 'ADM');
  v_salario := case when p_payload ? 'salario'
                         and p_payload->>'salario' is not null
                         and btrim(p_payload->>'salario') <> ''
                    then (p_payload->>'salario')::numeric
                    else 0 end;

  if p_id is null then
    insert into public.colaboradores (company_id, name, cargo, salario)
    values (v_company_id, v_name, v_cargo, v_salario)
    returning * into v_row;
  else
    update public.colaboradores set
      name    = v_name,
      cargo   = v_cargo,
      salario = v_salario
    where id = p_id and company_id = v_company_id
    returning * into v_row;

    if not found then
      raise exception 'colaborador not found';
    end if;
  end if;

  return v_row;
end;
$$;

create or replace function public.delete_colaborador(
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
  delete from public.colaboradores
   where id = p_id and company_id = v_company_id;
end;
$$;

-- =========================================================================
-- Grants
-- =========================================================================

revoke all on function public.list_professionals(text, text)                         from public;
grant execute on function public.list_professionals(text, text)                      to anon, authenticated;

revoke all on function public.get_professional(text, text, bigint)                   from public;
grant execute on function public.get_professional(text, text, bigint)                to anon, authenticated;

revoke all on function public.upsert_professional(text, text, bigint, jsonb)         from public;
grant execute on function public.upsert_professional(text, text, bigint, jsonb)      to anon, authenticated;

revoke all on function public.delete_professional(text, text, bigint)                from public;
grant execute on function public.delete_professional(text, text, bigint)             to anon, authenticated;

revoke all on function public.verify_professional_pin(text, bigint, text)            from public;
grant execute on function public.verify_professional_pin(text, bigint, text)         to anon, authenticated;

revoke all on function public.list_contractors(text, text)                           from public;
grant execute on function public.list_contractors(text, text)                        to anon, authenticated;

revoke all on function public.upsert_contractor(text, text, bigint, jsonb)           from public;
grant execute on function public.upsert_contractor(text, text, bigint, jsonb)        to anon, authenticated;

revoke all on function public.delete_contractor(text, text, bigint)                  from public;
grant execute on function public.delete_contractor(text, text, bigint)               to anon, authenticated;

revoke all on function public.list_colaboradores(text, text)                         from public;
grant execute on function public.list_colaboradores(text, text)                      to anon, authenticated;

revoke all on function public.upsert_colaborador(text, text, bigint, jsonb)          from public;
grant execute on function public.upsert_colaborador(text, text, bigint, jsonb)       to anon, authenticated;

revoke all on function public.delete_colaborador(text, text, bigint)                 from public;
grant execute on function public.delete_colaborador(text, text, bigint)              to anon, authenticated;
