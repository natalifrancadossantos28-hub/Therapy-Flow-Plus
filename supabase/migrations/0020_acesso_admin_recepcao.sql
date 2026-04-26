-- 0020_acesso_admin_recepcao.sql
-- (1) Libera todos os modulos para a empresa clinica-nfs
-- (2) Adiciona RPC public.lookup_company_by_slug(slug) usado pelos cards
--     Administracao e Recepcao no portal (login sem senha).
-- (3) Atualiza public._verify_company_admin para aceitar o token especial
--     '__noauth__' como bypass (somente para escopos Admin/Recepcao apos o
--     lookup_company_by_slug). Profissionais continuam protegidos pelo PIN
--     individual e por verify_professional_pin (RPC separada).

begin;

-- (1) Libera modulos da clinica-nfs ------------------------------------------
update public.ponto_companies
   set module_ponto      = true,
       module_triagem    = true,
       module_arco_iris  = true,
       active            = true,
       updated_at        = now()
 where slug = 'clinica-nfs';

-- (2) Lookup por slug --------------------------------------------------------
create or replace function public.lookup_company_by_slug(p_slug text)
returns public.ponto_companies_safe
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_row  public.ponto_companies%rowtype;
  v_safe public.ponto_companies_safe%rowtype;
begin
  if p_slug is null then return null; end if;

  select * into v_row
    from public.ponto_companies
   where slug = lower(trim(p_slug))
     and active = true
   limit 1;

  if not found then return null; end if;

  select v_row.id, v_row.name, v_row.slug,
         v_row.tolerance_minutes, v_row.overtime_block_enabled, v_row.default_break_minutes,
         v_row.module_ponto, v_row.module_triagem, v_row.module_arco_iris,
         v_row.active, v_row.logo_url, v_row.created_at, v_row.updated_at
    into v_safe;

  return v_safe;
end;
$$;

revoke all on function public.lookup_company_by_slug(text) from public;
grant execute on function public.lookup_company_by_slug(text) to anon, authenticated;

-- (3) _verify_company_admin: aceita '__noauth__' como bypass ------------------
create or replace function public._verify_company_admin(p_slug text, p_password text)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_row public.ponto_companies%rowtype;
begin
  if p_slug is null then
    raise exception 'invalid credentials' using errcode = '28P01';
  end if;

  select * into v_row
    from public.ponto_companies
   where slug = lower(trim(p_slug)) and active = true
   limit 1;

  if not found then
    raise exception 'invalid credentials' using errcode = '28P01';
  end if;

  -- Bypass de senha para escopos Admin/Recepcao (login apenas por slug).
  if p_password = '__noauth__' then
    return v_row.id;
  end if;

  if p_password is null
     or v_row.admin_password_hash <> crypt(p_password, v_row.admin_password_hash) then
    raise exception 'invalid credentials' using errcode = '28P01';
  end if;

  return v_row.id;
end;
$$;

commit;
