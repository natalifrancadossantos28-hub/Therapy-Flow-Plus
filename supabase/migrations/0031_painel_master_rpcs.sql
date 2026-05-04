-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0031 — Painel Master RPCs (SaaS multi-empresa)
--
-- Exposes RPCs for the master admin to:
--   1. List all companies with stats (patients, professionals, appointments)
--   2. Create / update companies
--   3. Toggle company active status
--   4. Get aggregated cross-company dashboard stats
--
-- All RPCs verify the master password before executing.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Helper: verify master password, raise if invalid ───────────────────────
create or replace function public._verify_master(p_master_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_hash text;
begin
  if p_master_password is null then
    raise exception 'Senha master obrigatória.';
  end if;

  select password_hash into v_hash
    from public.ponto_master_config
   where id = 1
   limit 1;

  if v_hash is null then
    raise exception 'Senha master não configurada. Execute set_master_password() primeiro.';
  end if;

  if v_hash <> crypt(p_master_password, v_hash) then
    raise exception 'Senha master incorreta.';
  end if;
end;
$$;

-- ── RPC: master_list_companies ─────────────────────────────────────────────
-- Returns all companies with patient/professional/appointment counts.
create or replace function public.master_list_companies(p_master_password text)
returns table(
  id             bigint,
  name           text,
  slug           text,
  active         boolean,
  module_ponto   boolean,
  module_triagem boolean,
  module_arco_iris boolean,
  logo_url       text,
  tolerance_minutes integer,
  created_at     timestamptz,
  updated_at     timestamptz,
  total_patients    bigint,
  total_professionals bigint,
  total_appointments  bigint,
  total_waiting_list  bigint
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform public._verify_master(p_master_password);

  return query
    select
      c.id, c.name, c.slug, c.active,
      c.module_ponto, c.module_triagem, c.module_arco_iris,
      c.logo_url, c.tolerance_minutes,
      c.created_at, c.updated_at,
      coalesce(ps.cnt, 0)  as total_patients,
      coalesce(pr.cnt, 0)  as total_professionals,
      coalesce(ap.cnt, 0)  as total_appointments,
      coalesce(wl.cnt, 0)  as total_waiting_list
    from public.ponto_companies c
    left join lateral (select count(*)::bigint as cnt from public.patients    p where p.company_id = c.id) ps on true
    left join lateral (select count(*)::bigint as cnt from public.professionals p where p.company_id = c.id) pr on true
    left join lateral (select count(*)::bigint as cnt from public.appointments  a where a.company_id = c.id) ap on true
    left join lateral (select count(*)::bigint as cnt from public.waiting_list  w where w.company_id = c.id) wl on true
    order by c.name;
end;
$$;

revoke all on function public.master_list_companies(text) from public;
grant execute on function public.master_list_companies(text) to anon, authenticated;

-- ── RPC: master_upsert_company ─────────────────────────────────────────────
-- Create or update a company. Master password required.
create or replace function public.master_upsert_company(
  p_master_password  text,
  p_slug             text,
  p_name             text,
  p_admin_password   text     default null,
  p_module_ponto     boolean  default true,
  p_module_triagem   boolean  default false,
  p_module_arco_iris boolean  default false,
  p_active           boolean  default true,
  p_logo_url         text     default null,
  p_tolerance_minutes integer default 10
)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id bigint;
  v_existing bigint;
begin
  perform public._verify_master(p_master_password);

  if p_slug is null or p_name is null then
    raise exception 'Slug e nome são obrigatórios.';
  end if;

  -- Check if company exists
  select id into v_existing
    from public.ponto_companies
   where slug = lower(trim(p_slug));

  if v_existing is not null then
    -- Update existing
    update public.ponto_companies
       set name              = p_name,
           module_ponto      = p_module_ponto,
           module_triagem    = p_module_triagem,
           module_arco_iris  = p_module_arco_iris,
           active            = p_active,
           logo_url          = p_logo_url,
           tolerance_minutes = p_tolerance_minutes,
           admin_password_hash = case
             when p_admin_password is not null and p_admin_password <> ''
             then crypt(p_admin_password, gen_salt('bf', 10))
             else admin_password_hash
           end
     where id = v_existing
    returning id into v_id;
  else
    -- Insert new
    if p_admin_password is null or p_admin_password = '' then
      raise exception 'Senha de admin obrigatória para nova empresa.';
    end if;

    insert into public.ponto_companies (
      slug, name, admin_password_hash,
      module_ponto, module_triagem, module_arco_iris,
      active, logo_url, tolerance_minutes
    ) values (
      lower(trim(p_slug)), p_name, crypt(p_admin_password, gen_salt('bf', 10)),
      p_module_ponto, p_module_triagem, p_module_arco_iris,
      p_active, p_logo_url, p_tolerance_minutes
    )
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.master_upsert_company(text,text,text,text,boolean,boolean,boolean,boolean,text,integer) from public;
grant execute on function public.master_upsert_company(text,text,text,text,boolean,boolean,boolean,boolean,text,integer) to anon, authenticated;

-- ── RPC: master_toggle_company ─────────────────────────────────────────────
-- Activate or deactivate a company.
create or replace function public.master_toggle_company(
  p_master_password text,
  p_company_id      bigint,
  p_active          boolean
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform public._verify_master(p_master_password);

  update public.ponto_companies
     set active = p_active
   where id = p_company_id;

  if not found then
    raise exception 'Empresa não encontrada.';
  end if;
end;
$$;

revoke all on function public.master_toggle_company(text, bigint, boolean) from public;
grant execute on function public.master_toggle_company(text, bigint, boolean) to anon, authenticated;

-- ── RPC: master_delete_company ─────────────────────────────────────────────
-- Permanently delete a company and ALL its data (cascade).
create or replace function public.master_delete_company(
  p_master_password text,
  p_company_id      bigint
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform public._verify_master(p_master_password);

  delete from public.ponto_companies where id = p_company_id;

  if not found then
    raise exception 'Empresa não encontrada.';
  end if;
end;
$$;

revoke all on function public.master_delete_company(text, bigint) from public;
grant execute on function public.master_delete_company(text, bigint) to anon, authenticated;

-- ── RPC: master_dashboard_stats ────────────────────────────────────────────
-- Returns aggregated cross-company stats for the master dashboard.
create or replace function public.master_dashboard_stats(p_master_password text)
returns table(
  total_companies          bigint,
  active_companies         bigint,
  inactive_companies       bigint,
  total_patients           bigint,
  total_professionals      bigint,
  total_appointments       bigint,
  total_waiting_list       bigint,
  appointments_today       bigint,
  companies_with_arco_iris bigint,
  companies_with_triagem   bigint,
  companies_with_ponto     bigint
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform public._verify_master(p_master_password);

  return query
    select
      (select count(*) from public.ponto_companies)::bigint                              as total_companies,
      (select count(*) from public.ponto_companies where active = true)::bigint          as active_companies,
      (select count(*) from public.ponto_companies where active = false)::bigint         as inactive_companies,
      (select count(*) from public.patients)::bigint                                     as total_patients,
      (select count(*) from public.professionals)::bigint                                as total_professionals,
      (select count(*) from public.appointments)::bigint                                 as total_appointments,
      (select count(*) from public.waiting_list)::bigint                                 as total_waiting_list,
      (select count(*) from public.appointments where date = current_date)::bigint       as appointments_today,
      (select count(*) from public.ponto_companies where module_arco_iris = true)::bigint as companies_with_arco_iris,
      (select count(*) from public.ponto_companies where module_triagem = true)::bigint  as companies_with_triagem,
      (select count(*) from public.ponto_companies where module_ponto = true)::bigint    as companies_with_ponto;
end;
$$;

revoke all on function public.master_dashboard_stats(text) from public;
grant execute on function public.master_dashboard_stats(text) to anon, authenticated;
