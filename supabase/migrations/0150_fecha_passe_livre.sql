-- 0150_fecha_passe_livre.sql
-- Rodar DEPOIS que o site novo (login com token) estiver no ar e as senhas
-- tiverem sido definidas com set_portal_password (ver 0149).
--
-- (1) _verify_company_admin deixa de aceitar '__noauth__'.
-- (2) Pacientes, agenda, fila e notificações deixam de ser legíveis sem
--     login (o tempo real passa a usar realtime_sinais).
-- (3) Minhas Ausências passa a aceitar só o token (PIN direto desliga).
-- (4) Derruba as sessões antigas (todo mundo entra de novo com senha).

begin;

create or replace function public._verify_company_admin(p_slug text, p_password text)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_row public.ponto_companies%rowtype;
begin
  if p_slug is null or p_password is null or p_password = '' or p_password = '__noauth__' then
    raise exception 'invalid credentials' using errcode = '28P01';
  end if;

  select * into v_row from public.ponto_companies
   where slug = lower(trim(p_slug)) and active = true limit 1;
  if not found then
    raise exception 'invalid credentials' using errcode = '28P01';
  end if;

  if p_password like 'tk\_%' then
    perform 1 from public.company_sessions s
     where s.token = p_password
       and s.company_id = v_row.id
       and s.expires_at > now()
       and s.epoch = v_row.session_epoch;
    if found then
      return v_row.id;
    end if;
  end if;

  if v_row.admin_password_hash <> crypt(p_password, v_row.admin_password_hash) then
    raise exception 'invalid credentials' using errcode = '28P01';
  end if;
  return v_row.id;
end;
$$;

drop policy if exists appointments_read_all  on public.appointments;
drop policy if exists patients_read_all      on public.patients;
drop policy if exists waiting_list_read_all  on public.waiting_list;
drop policy if exists notificacoes_read_all  on public.notificacoes_recepcao;

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array['appointments', 'waiting_list', 'patients', 'notificacoes_recepcao'] loop
    if exists (select 1 from pg_publication_tables
                where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;

update public.ponto_companies set session_epoch = session_epoch + 1, passe_livre = false;
delete from public.company_sessions;

notify pgrst, 'reload schema';

commit;
