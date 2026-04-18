-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 1 — Auth / Companies
--
-- Goal: replace the Express /api/ponto/auth/* endpoints with a pure Supabase
-- backend. The frontend calls `supabase.rpc('authenticate_company', …)` and
-- `supabase.rpc('authenticate_master', …)` instead of the Express routes.
--
-- Design notes:
-- * Passwords are stored as bcrypt hashes (pgcrypto `crypt()` with bf salt).
--   Plain-text storage would still be reachable by any service_role user and
--   was the single biggest footgun in the old Express implementation.
-- * RLS is ON and **DENY by default** on ponto_companies. No frontend role can
--   SELECT/UPDATE rows directly. All access goes through SECURITY DEFINER RPCs,
--   which expose only a "safe" view (no password column) to the caller.
-- * Master password lives in a single-row `ponto_master_config` table, also
--   bcrypt-hashed. A SECURITY DEFINER RPC verifies it. No env var needed.
-- ─────────────────────────────────────────────────────────────────────────────

-- Supabase installs extensions in the "extensions" schema by default. We
-- include it in every SECURITY DEFINER function's search_path below so that
-- crypt() / gen_salt() resolve regardless of which schema pgcrypto lives in.
create extension if not exists pgcrypto with schema extensions;

-- ─── Tables ──────────────────────────────────────────────────────────────────
create table if not exists public.ponto_companies (
  id                     bigserial primary key,
  name                   text        not null,
  slug                   text        not null unique,
  admin_password_hash    text        not null,                    -- bcrypt
  tolerance_minutes      integer     not null default 10,
  overtime_block_enabled boolean     not null default true,
  default_break_minutes  integer     not null default 60,
  module_ponto           boolean     not null default true,
  module_triagem         boolean     not null default false,
  module_arco_iris       boolean     not null default false,
  active                 boolean     not null default true,
  logo_url               text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists ponto_companies_slug_idx   on public.ponto_companies (slug);
create index if not exists ponto_companies_active_idx on public.ponto_companies (active);

create table if not exists public.ponto_master_config (
  id               int  primary key default 1,
  password_hash    text not null,
  updated_at       timestamptz not null default now(),
  constraint ponto_master_config_single_row check (id = 1)
);

-- ─── Updated_at trigger ──────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists ponto_companies_set_updated_at on public.ponto_companies;
create trigger ponto_companies_set_updated_at
  before update on public.ponto_companies
  for each row execute function public.set_updated_at();

-- ─── Safe public shape (no password hash) ────────────────────────────────────
create or replace view public.ponto_companies_safe as
  select id, name, slug,
         tolerance_minutes, overtime_block_enabled, default_break_minutes,
         module_ponto, module_triagem, module_arco_iris,
         active, logo_url, created_at, updated_at
    from public.ponto_companies;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.ponto_companies       enable row level security;
alter table public.ponto_master_config   enable row level security;

-- No policies = deny all for non-privileged roles. The RPCs below are
-- SECURITY DEFINER and bypass RLS safely.

-- ─── RPC: authenticate_company ───────────────────────────────────────────────
-- Returns the safe company row when slug + password match and company is
-- active. Returns NULL otherwise. Frontend treats a null/empty result as
-- "wrong credentials". Never reveals whether the slug exists.
create or replace function public.authenticate_company(
  p_slug     text,
  p_password text
)
returns public.ponto_companies_safe
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_row public.ponto_companies%rowtype;
  v_safe public.ponto_companies_safe%rowtype;
begin
  if p_slug is null or p_password is null then
    return null;
  end if;

  select * into v_row
    from public.ponto_companies
   where slug = lower(trim(p_slug))
     and active = true
   limit 1;

  if not found then
    return null;
  end if;

  -- bcrypt check; crypt() returns the same hash when the password matches.
  if v_row.admin_password_hash <> crypt(p_password, v_row.admin_password_hash) then
    return null;
  end if;

  select v_row.id, v_row.name, v_row.slug,
         v_row.tolerance_minutes, v_row.overtime_block_enabled, v_row.default_break_minutes,
         v_row.module_ponto, v_row.module_triagem, v_row.module_arco_iris,
         v_row.active, v_row.logo_url, v_row.created_at, v_row.updated_at
    into v_safe;

  return v_safe;
end;
$$;

revoke all on function public.authenticate_company(text, text) from public;
grant execute on function public.authenticate_company(text, text) to anon, authenticated;

-- ─── RPC: authenticate_master ────────────────────────────────────────────────
-- Returns true if password matches the single master hash. Returns false
-- otherwise. No information leak.
create or replace function public.authenticate_master(
  p_password text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_hash text;
begin
  if p_password is null then
    return false;
  end if;

  select password_hash into v_hash
    from public.ponto_master_config
   where id = 1
   limit 1;

  if v_hash is null then
    return false;
  end if;

  return v_hash = crypt(p_password, v_hash);
end;
$$;

revoke all on function public.authenticate_master(text) from public;
grant execute on function public.authenticate_master(text) to anon, authenticated;

-- ─── Seed: allow admin to set the master password via RPC (one-time only) ────
-- Service-role users can call `set_master_password(new_pw)` from the SQL
-- Editor / dashboard to create or rotate it. Anon/authenticated roles cannot.
create or replace function public.set_master_password(p_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if p_password is null or length(p_password) < 6 then
    raise exception 'master password must be at least 6 characters';
  end if;

  insert into public.ponto_master_config (id, password_hash, updated_at)
       values (1, crypt(p_password, gen_salt('bf', 10)), now())
  on conflict (id) do update
    set password_hash = excluded.password_hash,
        updated_at    = excluded.updated_at;
end;
$$;

revoke all on function public.set_master_password(text) from public;
-- Only service_role can call this. (Supabase runs SQL Editor as postgres, so
-- the dashboard works fine; anon/authenticated cannot escalate.)
grant execute on function public.set_master_password(text) to service_role;

-- ─── Seed: helper to create / update a company from the dashboard ────────────
create or replace function public.upsert_company(
  p_slug            text,
  p_name            text,
  p_admin_password  text,
  p_module_ponto    boolean default true,
  p_module_triagem  boolean default false,
  p_module_arco_iris boolean default false,
  p_active          boolean default true
)
returns public.ponto_companies_safe
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id bigint;
  v_safe public.ponto_companies_safe%rowtype;
begin
  if p_slug is null or p_name is null or p_admin_password is null then
    raise exception 'slug, name and password are required';
  end if;

  insert into public.ponto_companies (
    slug, name, admin_password_hash,
    module_ponto, module_triagem, module_arco_iris, active
  ) values (
    lower(trim(p_slug)), p_name, crypt(p_admin_password, gen_salt('bf', 10)),
    p_module_ponto, p_module_triagem, p_module_arco_iris, p_active
  )
  on conflict (slug) do update
     set name                = excluded.name,
         admin_password_hash = excluded.admin_password_hash,
         module_ponto        = excluded.module_ponto,
         module_triagem      = excluded.module_triagem,
         module_arco_iris    = excluded.module_arco_iris,
         active              = excluded.active
  returning id into v_id;

  select id, name, slug,
         tolerance_minutes, overtime_block_enabled, default_break_minutes,
         module_ponto, module_triagem, module_arco_iris,
         active, logo_url, created_at, updated_at
    into v_safe
    from public.ponto_companies
   where id = v_id;

  return v_safe;
end;
$$;

revoke all on function public.upsert_company(text, text, text, boolean, boolean, boolean, boolean) from public;
grant execute on function public.upsert_company(text, text, text, boolean, boolean, boolean, boolean) to service_role;
