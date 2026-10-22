-- "Desconectar todos os computadores": cada empresa tem um número de sessão.
-- O login guarda esse número; quando ele muda, todo computador logado com o
-- número antigo é desconectado (Gestão e Triagem).

begin;

alter table public.ponto_companies
  add column if not exists session_epoch integer not null default 1;

create or replace function public.get_session_epoch(p_slug text)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select c.session_epoch from public.ponto_companies c
      where c.slug = lower(trim(p_slug)) and c.active = true limit 1),
    1);
$$;
revoke all on function public.get_session_epoch(text) from public;
grant execute on function public.get_session_epoch(text) to anon, authenticated;

create or replace function public.logout_all_devices(p_slug text, p_password text)
returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_epoch      integer;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  update public.ponto_companies
     set session_epoch = session_epoch + 1
   where id = v_company_id
  returning session_epoch into v_epoch;
  return v_epoch;
end;
$$;
revoke all on function public.logout_all_devices(text, text) from public;
grant execute on function public.logout_all_devices(text, text) to anon, authenticated;

-- Derruba agora todo mundo que já estava logado.
update public.ponto_companies set session_epoch = session_epoch + 1;

notify pgrst, 'reload schema';

commit;
