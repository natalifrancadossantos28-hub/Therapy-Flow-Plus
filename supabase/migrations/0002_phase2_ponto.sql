-- Phase 2 - Ponto: employees + records
-- Adds the two operational tables for the ponto (time-clock) module plus the
-- SECURITY DEFINER RPCs the front-end calls via PostgREST.
-- Security model (matches Phase 1):
--   * Admin operations (CRUD employees, list records, summary) require the
--     caller to pass the company slug + the admin password. The RPC verifies
--     the password with bcrypt before doing any work.
--   * Kiosk operations (register_punch, get_employee_by_cpf) take only the
--     slug: the kiosk device is physically trusted, as in the previous
--     Express version.
-- RLS is enabled on every table without any policy, which blocks direct
-- access from the anon / authenticated roles - every read/write MUST go
-- through the RPCs below.

-- Phase 1 already installed pgcrypto in the "extensions" schema; this is a
-- safety net if this migration is ever run on a fresh project.
create extension if not exists pgcrypto with schema extensions;

-- --- Tables -----------------------------------------------------------------
create table if not exists public.ponto_employees (
  id              bigserial primary key,
  company_id      bigint      not null references public.ponto_companies(id) on delete cascade,
  name            text        not null,
  cpf             text        not null,
  role            text        not null,
  photo           text,
  weekly_hours    integer     not null default 44,
  active          boolean     not null default true,
  entry_time      text,
  exit_time       text,
  break_minutes   integer     not null default 60,
  schedule        jsonb,          -- {mon:{in,out,dayOff}, tue:{...}, ...}
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (company_id, cpf)
);

create index if not exists ponto_employees_company_idx on public.ponto_employees (company_id);
create index if not exists ponto_employees_cpf_idx     on public.ponto_employees (cpf);

drop trigger if exists ponto_employees_set_updated_at on public.ponto_employees;
create trigger ponto_employees_set_updated_at
  before update on public.ponto_employees
  for each row execute function public.set_updated_at();

create table if not exists public.ponto_records (
  id            bigserial   primary key,
  employee_id   bigint      not null references public.ponto_employees(id) on delete cascade,
  company_id    bigint      not null references public.ponto_companies(id) on delete cascade,
  type          text        not null,
  punched_at    timestamptz not null default now(),
  "date"        date        not null default (now() at time zone 'UTC')::date,
  created_at    timestamptz not null default now()
);

create index if not exists ponto_records_employee_date_idx on public.ponto_records (employee_id, "date");
create index if not exists ponto_records_company_date_idx  on public.ponto_records (company_id, "date");
create index if not exists ponto_records_punched_idx       on public.ponto_records (punched_at desc);

-- --- RLS: enabled, no policy → must use the RPCs below ----------------------
alter table public.ponto_employees enable row level security;
alter table public.ponto_records   enable row level security;

-- --- Private helper: verify admin credentials, return company id ------------
create or replace function public._verify_company_admin(p_slug text, p_password text)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_row public.ponto_companies%rowtype;
begin
  if p_slug is null or p_password is null then
    raise exception 'invalid credentials' using errcode = '28P01';
  end if;

  select * into v_row
    from public.ponto_companies
   where slug = lower(trim(p_slug)) and active = true
   limit 1;

  if not found or v_row.admin_password_hash <> crypt(p_password, v_row.admin_password_hash) then
    raise exception 'invalid credentials' using errcode = '28P01';
  end if;

  return v_row.id;
end;
$$;

revoke all on function public._verify_company_admin(text, text) from public;
-- only other SECURITY DEFINER functions (in same schema) can call this

-- --- Private helper: resolve active company id from slug (kiosk flows) ------
create or replace function public._active_company_id(p_slug text)
returns bigint
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  select id
    from public.ponto_companies
   where slug = lower(trim(p_slug)) and active = true
   limit 1;
$$;

revoke all on function public._active_company_id(text) from public;

-- --- Composite return types -------------------------------------------------
drop type if exists public.ponto_employee_row cascade;
create type public.ponto_employee_row as (
  id              bigint,
  company_id      bigint,
  name            text,
  cpf             text,
  role            text,
  photo           text,
  weekly_hours    integer,
  active          boolean,
  entry_time      text,
  exit_time       text,
  break_minutes   integer,
  schedule        jsonb,
  created_at      timestamptz,
  updated_at      timestamptz
);

drop type if exists public.ponto_record_row cascade;
create type public.ponto_record_row as (
  id             bigint,
  employee_id    bigint,
  company_id     bigint,
  employee_name  text,
  employee_photo text,
  role           text,
  type           text,
  punched_at     timestamptz,
  "date"         date,
  created_at     timestamptz
);

drop type if exists public.ponto_kiosk_employee cascade;
create type public.ponto_kiosk_employee as (
  id         bigint,
  company_id bigint,
  name       text,
  photo      text,
  role       text
);

drop type if exists public.ponto_punch_result cascade;
create type public.ponto_punch_result as (
  id                bigint,
  employee_id       bigint,
  company_id        bigint,
  type              text,
  punched_at        timestamptz,
  "date"            date,
  created_at        timestamptz,
  employee_name     text,
  employee_photo    text,
  punch_index       integer,
  punch_type_label  text
);

-- --- RPC: list_employees (admin) --------------------------------------------
create or replace function public.list_employees(p_slug text, p_password text)
returns setof public.ponto_employee_row
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_cid bigint;
begin
  v_cid := public._verify_company_admin(p_slug, p_password);
  return query
    select id, company_id, name, cpf, role, photo, weekly_hours, active,
           entry_time, exit_time, break_minutes, schedule, created_at, updated_at
      from public.ponto_employees
     where company_id = v_cid
     order by name;
end;
$$;

revoke all on function public.list_employees(text, text) from public;
grant execute on function public.list_employees(text, text) to anon, authenticated;

-- --- RPC: get_employee (admin) ----------------------------------------------
create or replace function public.get_employee(
  p_slug     text,
  p_password text,
  p_id       bigint
)
returns public.ponto_employee_row
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_cid bigint;
  v_row public.ponto_employee_row;
begin
  v_cid := public._verify_company_admin(p_slug, p_password);
  select id, company_id, name, cpf, role, photo, weekly_hours, active,
         entry_time, exit_time, break_minutes, schedule, created_at, updated_at
    into v_row
    from public.ponto_employees
   where id = p_id and company_id = v_cid
   limit 1;
  return v_row;  -- all-NULL row if not found
end;
$$;

revoke all on function public.get_employee(text, text, bigint) from public;
grant execute on function public.get_employee(text, text, bigint) to anon, authenticated;

-- --- RPC: upsert_employee (admin) ------------------------------------------
-- If p_id is null → insert; otherwise → update. Returns the resulting row.
create or replace function public.upsert_employee(
  p_slug          text,
  p_password      text,
  p_id            bigint default null,
  p_name          text   default null,
  p_cpf           text   default null,
  p_role          text   default null,
  p_photo         text   default null,
  p_weekly_hours  integer default null,
  p_active        boolean default null,
  p_entry_time    text   default null,
  p_exit_time     text   default null,
  p_break_minutes integer default null,
  p_schedule      jsonb  default null
)
returns public.ponto_employee_row
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_cid       bigint;
  v_clean_cpf text;
  v_id        bigint;
  v_row       public.ponto_employee_row;
begin
  v_cid := public._verify_company_admin(p_slug, p_password);

  if p_cpf is not null then
    v_clean_cpf := regexp_replace(p_cpf, '[^0-9]', '', 'g');
  end if;

  if p_id is null then
    -- INSERT path
    if p_name is null or v_clean_cpf is null or p_role is null then
      raise exception 'name, cpf and role are required on create';
    end if;

    insert into public.ponto_employees (
      company_id, name, cpf, role, photo, weekly_hours, active,
      entry_time, exit_time, break_minutes, schedule
    ) values (
      v_cid, p_name, v_clean_cpf, p_role, p_photo,
      coalesce(p_weekly_hours, 44),
      coalesce(p_active, true),
      nullif(p_entry_time, ''),
      nullif(p_exit_time, ''),
      coalesce(p_break_minutes, 60),
      p_schedule
    )
    returning id into v_id;
  else
    -- UPDATE path (company scope enforced)
    update public.ponto_employees set
      name          = coalesce(p_name,          name),
      cpf           = coalesce(v_clean_cpf,     cpf),
      role          = coalesce(p_role,          role),
      photo         = case when p_photo is not null then p_photo else photo end,
      weekly_hours  = coalesce(p_weekly_hours,  weekly_hours),
      active        = coalesce(p_active,        active),
      entry_time    = case when p_entry_time is not null then nullif(p_entry_time, '') else entry_time end,
      exit_time     = case when p_exit_time  is not null then nullif(p_exit_time,  '') else exit_time end,
      break_minutes = coalesce(p_break_minutes, break_minutes),
      schedule      = case when p_schedule is not null then p_schedule else schedule end
      where id = p_id and company_id = v_cid
      returning id into v_id;

    if v_id is null then
      raise exception 'employee not found' using errcode = 'P0002';
    end if;
  end if;

  select id, company_id, name, cpf, role, photo, weekly_hours, active,
         entry_time, exit_time, break_minutes, schedule, created_at, updated_at
    into v_row from public.ponto_employees where id = v_id;

  return v_row;
end;
$$;

revoke all on function public.upsert_employee(text, text, bigint, text, text, text, text, integer, boolean, text, text, integer, jsonb) from public;
grant execute on function public.upsert_employee(text, text, bigint, text, text, text, text, integer, boolean, text, text, integer, jsonb) to anon, authenticated;

-- --- RPC: delete_employee (admin) -------------------------------------------
create or replace function public.delete_employee(
  p_slug     text,
  p_password text,
  p_id       bigint
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_cid bigint;
begin
  v_cid := public._verify_company_admin(p_slug, p_password);
  delete from public.ponto_employees
   where id = p_id and company_id = v_cid;
  -- cascade removes records
end;
$$;

revoke all on function public.delete_employee(text, text, bigint) from public;
grant execute on function public.delete_employee(text, text, bigint) to anon, authenticated;

-- --- RPC: list_records (admin) ----------------------------------------------
create or replace function public.list_records(
  p_slug        text,
  p_password    text,
  p_employee_id bigint default null,
  p_date        date   default null
)
returns setof public.ponto_record_row
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_cid bigint;
begin
  v_cid := public._verify_company_admin(p_slug, p_password);
  return query
    select r.id, r.employee_id, r.company_id,
           e.name, e.photo, e.role,
           r.type, r.punched_at, r."date", r.created_at
      from public.ponto_records r
      join public.ponto_employees e on e.id = r.employee_id
     where r.company_id = v_cid
       and (p_employee_id is null or r.employee_id = p_employee_id)
       and (p_date        is null or r."date" = p_date)
     order by r.punched_at desc;
end;
$$;

revoke all on function public.list_records(text, text, bigint, date) from public;
grant execute on function public.list_records(text, text, bigint, date) to anon, authenticated;

-- --- RPC: records_summary (admin) -------------------------------------------
-- Returns one row per employee with nested records + total hours string.
create or replace function public.records_summary(
  p_slug        text,
  p_password    text,
  p_date        date,
  p_employee_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_cid    bigint;
  v_result jsonb;
begin
  v_cid := public._verify_company_admin(p_slug, p_password);

  with recs as (
    select r.id, r.employee_id, e.name as employee_name, e.photo as employee_photo,
           e.role, r.type, r.punched_at, r."date"
      from public.ponto_records r
      join public.ponto_employees e on e.id = r.employee_id
     where r.company_id = v_cid
       and r."date" = coalesce(p_date, (now() at time zone 'UTC')::date)
       and (p_employee_id is null or r.employee_id = p_employee_id)
  ),
  by_emp as (
    select employee_id,
           min(employee_name)  as employee_name,
           min(employee_photo) as employee_photo,
           min(role)           as role,
           min("date")         as "date",
           jsonb_agg(
             jsonb_build_object(
               'id',          id,
               'employeeId',  employee_id,
               'type',        type,
               'punchedAt',   punched_at,
               'date',        "date"
             ) order by punched_at
           ) as records,
           -- 4-punch model: ENTRADA_DIARIA -> SAIDA_ALMOCO, RETORNO_ALMOCO -> SAIDA_FINAL
           coalesce(extract(epoch from (
             max(punched_at) filter (where type = 'SAIDA_ALMOCO')
             - max(punched_at) filter (where type = 'ENTRADA_DIARIA')
           )), 0)
           +
           coalesce(extract(epoch from (
             max(punched_at) filter (where type = 'SAIDA_FINAL')
             - max(punched_at) filter (where type = 'RETORNO_ALMOCO')
           )), 0) as seconds_worked
      from recs
      group by employee_id
  )
  select jsonb_agg(
           jsonb_build_object(
             'employeeId',    employee_id,
             'employeeName',  employee_name,
             'employeePhoto', employee_photo,
             'role',          role,
             'date',          "date",
             'records',       records,
             'totalHours',    case
               when seconds_worked > 0 then
                 to_char(make_interval(secs => seconds_worked), 'HH24:MI')
               else null
             end
           ) order by employee_name
         )
    into v_result
    from by_emp;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

revoke all on function public.records_summary(text, text, date, bigint) from public;
grant execute on function public.records_summary(text, text, date, bigint) to anon, authenticated;

-- --- Private helper: verify master password --------------------------------
create or replace function public._verify_master(p_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_hash text;
begin
  if p_password is null then
    raise exception 'invalid credentials' using errcode = '28P01';
  end if;
  select password_hash into v_hash from public.ponto_master_config where id = 1 limit 1;
  if v_hash is null or v_hash <> crypt(p_password, v_hash) then
    raise exception 'invalid credentials' using errcode = '28P01';
  end if;
end;
$$;

revoke all on function public._verify_master(text) from public;

-- --- RPC: update_company_settings (company admin) --------------------------
create or replace function public.update_company_settings(
  p_slug                    text,
  p_password                text,
  p_name                    text    default null,
  p_tolerance_minutes       integer default null,
  p_overtime_block_enabled  boolean default null,
  p_default_break_minutes   integer default null,
  p_logo_url                text    default null,
  p_new_admin_password      text    default null
)
returns public.ponto_companies_safe
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_cid  bigint;
  v_safe public.ponto_companies_safe%rowtype;
begin
  v_cid := public._verify_company_admin(p_slug, p_password);

  update public.ponto_companies set
    name                   = coalesce(p_name,                   name),
    tolerance_minutes      = coalesce(p_tolerance_minutes,      tolerance_minutes),
    overtime_block_enabled = coalesce(p_overtime_block_enabled, overtime_block_enabled),
    default_break_minutes  = coalesce(p_default_break_minutes,  default_break_minutes),
    logo_url               = case when p_logo_url is not null then nullif(p_logo_url, '') else logo_url end,
    admin_password_hash    = case
                               when p_new_admin_password is not null and length(p_new_admin_password) >= 6
                               then crypt(p_new_admin_password, gen_salt('bf', 10))
                               else admin_password_hash
                             end
  where id = v_cid;

  select id, name, slug,
         tolerance_minutes, overtime_block_enabled, default_break_minutes,
         module_ponto, module_triagem, module_arco_iris,
         active, logo_url, created_at, updated_at
    into v_safe from public.ponto_companies where id = v_cid;
  return v_safe;
end;
$$;

revoke all on function public.update_company_settings(text, text, text, integer, boolean, integer, text, text) from public;
grant execute on function public.update_company_settings(text, text, text, integer, boolean, integer, text, text) to anon, authenticated;

-- --- RPC: master_list_companies ---------------------------------------------
drop type if exists public.ponto_master_company_row cascade;
create type public.ponto_master_company_row as (
  id                      bigint,
  name                    text,
  slug                    text,
  active                  boolean,
  tolerance_minutes       integer,
  overtime_block_enabled  boolean,
  default_break_minutes   integer,
  module_ponto            boolean,
  module_triagem          boolean,
  module_arco_iris        boolean,
  logo_url                text,
  employee_count          bigint,
  created_at              timestamptz
);

create or replace function public.master_list_companies(p_master_password text)
returns setof public.ponto_master_company_row
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform public._verify_master(p_master_password);
  return query
    select c.id, c.name, c.slug, c.active,
           c.tolerance_minutes, c.overtime_block_enabled, c.default_break_minutes,
           c.module_ponto, c.module_triagem, c.module_arco_iris,
           c.logo_url,
           (select count(*) from public.ponto_employees e where e.company_id = c.id) as employee_count,
           c.created_at
      from public.ponto_companies c
      order by c.created_at desc;
end;
$$;

revoke all on function public.master_list_companies(text) from public;
grant execute on function public.master_list_companies(text) to anon, authenticated;

-- --- RPC: master_upsert_company ---------------------------------------------
create or replace function public.master_upsert_company(
  p_master_password        text,
  p_id                     bigint  default null,
  p_slug                   text    default null,
  p_name                   text    default null,
  p_admin_password         text    default null,
  p_tolerance_minutes      integer default null,
  p_overtime_block_enabled boolean default null,
  p_default_break_minutes  integer default null,
  p_module_ponto           boolean default null,
  p_module_triagem         boolean default null,
  p_module_arco_iris       boolean default null,
  p_logo_url               text    default null,
  p_active                 boolean default null
)
returns public.ponto_companies_safe
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id   bigint;
  v_safe public.ponto_companies_safe%rowtype;
begin
  perform public._verify_master(p_master_password);

  if p_id is null then
    -- INSERT
    if p_slug is null or p_name is null or p_admin_password is null then
      raise exception 'slug, name and admin_password are required on create';
    end if;
    insert into public.ponto_companies (
      slug, name, admin_password_hash,
      tolerance_minutes, overtime_block_enabled, default_break_minutes,
      module_ponto, module_triagem, module_arco_iris,
      logo_url, active
    ) values (
      lower(trim(p_slug)), p_name, crypt(p_admin_password, gen_salt('bf', 10)),
      coalesce(p_tolerance_minutes, 10),
      coalesce(p_overtime_block_enabled, true),
      coalesce(p_default_break_minutes, 60),
      coalesce(p_module_ponto, true),
      coalesce(p_module_triagem, false),
      coalesce(p_module_arco_iris, false),
      nullif(p_logo_url, ''),
      coalesce(p_active, true)
    )
    returning id into v_id;
  else
    update public.ponto_companies set
      slug                   = coalesce(lower(trim(p_slug)), slug),
      name                   = coalesce(p_name, name),
      admin_password_hash    = case
                                 when p_admin_password is not null and length(p_admin_password) >= 6
                                 then crypt(p_admin_password, gen_salt('bf', 10))
                                 else admin_password_hash
                               end,
      tolerance_minutes      = coalesce(p_tolerance_minutes,      tolerance_minutes),
      overtime_block_enabled = coalesce(p_overtime_block_enabled, overtime_block_enabled),
      default_break_minutes  = coalesce(p_default_break_minutes,  default_break_minutes),
      module_ponto           = coalesce(p_module_ponto,    module_ponto),
      module_triagem         = coalesce(p_module_triagem,  module_triagem),
      module_arco_iris       = coalesce(p_module_arco_iris, module_arco_iris),
      logo_url               = case when p_logo_url is not null then nullif(p_logo_url, '') else logo_url end,
      active                 = coalesce(p_active, active)
    where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'company not found' using errcode = 'P0002'; end if;
  end if;

  select id, name, slug,
         tolerance_minutes, overtime_block_enabled, default_break_minutes,
         module_ponto, module_triagem, module_arco_iris,
         active, logo_url, created_at, updated_at
    into v_safe from public.ponto_companies where id = v_id;
  return v_safe;
end;
$$;

revoke all on function public.master_upsert_company(text, bigint, text, text, text, integer, boolean, integer, boolean, boolean, boolean, text, boolean) from public;
grant execute on function public.master_upsert_company(text, bigint, text, text, text, integer, boolean, integer, boolean, boolean, boolean, text, boolean) to anon, authenticated;

-- --- RPC: master_delete_company ---------------------------------------------
create or replace function public.master_delete_company(p_master_password text, p_id bigint)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform public._verify_master(p_master_password);
  delete from public.ponto_companies where id = p_id;
end;
$$;

revoke all on function public.master_delete_company(text, bigint) from public;
grant execute on function public.master_delete_company(text, bigint) to anon, authenticated;

-- --- RPC: lookup_company (public, kiosk-only resolves slug → id/name) -----
drop type if exists public.ponto_company_lookup cascade;
create type public.ponto_company_lookup as (
  id bigint,
  name text,
  module_ponto boolean,
  module_triagem boolean,
  module_arco_iris boolean
);

create or replace function public.lookup_company(p_slug text)
returns public.ponto_company_lookup
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_row public.ponto_company_lookup;
begin
  select id, name, module_ponto, module_triagem, module_arco_iris
    into v_row
    from public.ponto_companies
   where slug = lower(trim(p_slug)) and active = true
   limit 1;
  return v_row;
end;
$$;

revoke all on function public.lookup_company(text) from public;
grant execute on function public.lookup_company(text) to anon, authenticated;

-- --- RPC: get_employee_by_cpf (kiosk) --------------------------------------
create or replace function public.get_employee_by_cpf(p_slug text, p_cpf text)
returns public.ponto_kiosk_employee
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_cid  bigint;
  v_cpf  text;
  v_row  public.ponto_kiosk_employee;
begin
  v_cid := public._active_company_id(p_slug);
  if v_cid is null or p_cpf is null then return null; end if;
  v_cpf := regexp_replace(p_cpf, '[^0-9]', '', 'g');

  select id, company_id, name, photo, role
    into v_row
    from public.ponto_employees
   where company_id = v_cid and cpf = v_cpf and active = true
   limit 1;

  return v_row;  -- all-NULL if not found
end;
$$;

revoke all on function public.get_employee_by_cpf(text, text) from public;
grant execute on function public.get_employee_by_cpf(text, text) to anon, authenticated;

-- --- RPC: register_punch (kiosk) --------------------------------------------
-- Auto-determines next punch type; validates schedule (tolerance, overtime
-- block, 4-punch limit, 1-min duplicate lock). Raises on invalid state.
create or replace function public.register_punch(p_slug text, p_employee_id bigint)
returns public.ponto_punch_result
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_cid              bigint;
  v_emp              public.ponto_employees%rowtype;
  v_company          public.ponto_companies%rowtype;
  v_today            date := (now() at time zone 'UTC')::date;
  v_count            integer;
  v_last_ts          timestamptz;
  v_next_type        text;
  v_weekday          integer := extract(dow from (now() at time zone 'UTC'))::int;
  v_weekday_keys     text[] := array['sun','mon','tue','wed','thu','fri','sat'];
  v_today_key        text;
  v_in_mins          integer;
  v_out_mins         integer;
  v_now_mins         integer;
  v_tolerance        integer;
  v_overtime_block   boolean;
  v_today_in         text;
  v_today_out        text;
  v_day_off          boolean;
  v_record_id        bigint;
  v_result           public.ponto_punch_result;
begin
  v_cid := public._active_company_id(p_slug);
  if v_cid is null then
    raise exception 'company not found' using errcode = 'P0002';
  end if;

  select * into v_emp
    from public.ponto_employees
   where id = p_employee_id and company_id = v_cid and active = true
   limit 1;

  if not found then
    raise exception 'Funcionário não encontrado' using errcode = 'P0002';
  end if;

  select * into v_company from public.ponto_companies where id = v_cid;
  v_tolerance      := coalesce(v_company.tolerance_minutes, 10);
  v_overtime_block := coalesce(v_company.overtime_block_enabled, true);

  -- Count today's punches & last timestamp
  select count(*), max(punched_at) into v_count, v_last_ts
    from public.ponto_records
   where employee_id = v_emp.id and "date" = v_today;

  if v_count >= 4 then
    raise exception 'Você já completou todas as 4 batidas de hoje. Até amanhã!';
  end if;

  if v_last_ts is not null and extract(epoch from (now() - v_last_ts)) < 60 then
    raise exception 'Aguarde % segundo(s) antes de registrar novamente.',
      ceil(60 - extract(epoch from (now() - v_last_ts)));
  end if;

  -- next type from sequence
  v_next_type := (array['ENTRADA_DIARIA','SAIDA_ALMOCO','RETORNO_ALMOCO','SAIDA_FINAL'])[v_count + 1];

  -- Resolve today's schedule: prefer per-day JSON, fall back to entry/exit cols
  v_today_key := v_weekday_keys[v_weekday + 1];
  if v_emp.schedule is not null
     and v_emp.schedule ? v_today_key then
    v_today_in  := v_emp.schedule -> v_today_key ->> 'in';
    v_today_out := v_emp.schedule -> v_today_key ->> 'out';
    v_day_off   := coalesce((v_emp.schedule -> v_today_key ->> 'dayOff')::boolean, false);
    if v_day_off or v_today_in is null or v_today_out is null then
      v_today_in := null; v_today_out := null;
    end if;
  end if;
  if v_today_in is null and v_emp.entry_time is not null and v_emp.exit_time is not null then
    v_today_in  := v_emp.entry_time;
    v_today_out := v_emp.exit_time;
  end if;

  v_now_mins := extract(hour from now())::int * 60 + extract(minute from now())::int;

  if v_today_in is not null then
    v_in_mins  := split_part(v_today_in, ':', 1)::int * 60 + split_part(v_today_in, ':', 2)::int;
    v_out_mins := split_part(v_today_out, ':', 1)::int * 60 + split_part(v_today_out, ':', 2)::int;

    if v_next_type = 'ENTRADA_DIARIA' and v_now_mins < v_in_mins - v_tolerance then
      raise exception
        'Entrada muito cedo! Liberada a partir das %:% (entrada de hoje: %).',
        lpad(((v_in_mins - v_tolerance) / 60)::text, 2, '0'),
        lpad(((v_in_mins - v_tolerance) % 60)::text, 2, '0'),
        v_today_in;
    end if;

    if v_next_type = 'SAIDA_FINAL' and v_overtime_block
       and v_now_mins > v_out_mins + v_tolerance then
      raise exception
        'Saída fora do horário! Saída prevista para hoje: %. Procure a administração para registrar hora extra.',
        v_today_out;
    end if;
  end if;

  insert into public.ponto_records (employee_id, company_id, type, punched_at, "date")
       values (v_emp.id, v_cid, v_next_type, now(), v_today)
  returning id into v_record_id;

  select r.id, r.employee_id, r.company_id, r.type, r.punched_at, r."date", r.created_at,
         v_emp.name, v_emp.photo, v_count + 1,
         case v_next_type
           when 'ENTRADA_DIARIA' then 'entrada diária'
           when 'SAIDA_ALMOCO'   then 'saída para almoço'
           when 'RETORNO_ALMOCO' then 'retorno do almoço'
           when 'SAIDA_FINAL'    then 'saída final'
           else v_next_type
         end
    into v_result
    from public.ponto_records r
   where r.id = v_record_id;

  return v_result;
end;
$$;

revoke all on function public.register_punch(text, bigint) from public;
grant execute on function public.register_punch(text, bigint) to anon, authenticated;
