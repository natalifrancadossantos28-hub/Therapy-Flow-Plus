-- 0149_login_com_token.sql
-- Senha conferida no banco (antes era só no navegador) e login com token.
-- Pode rodar ANTES do merge: o sistema antigo continua funcionando.
--
-- (1) Senhas do portal (Administração / Recepção) guardadas com bcrypt.
-- (2) company_login / professional_login conferem senha/PIN e devolvem um
--     token de sessão (7 dias; cai com "Desconectar todos os computadores").
--     10 erros do mesmo IP em 15 minutos bloqueiam esse IP por 15 minutos
--     (200 de vários IPs bloqueiam o alvo). Vale também para o PIN.
-- (3) _verify_company_admin aceita o token. O passe livre '__noauth__'
--     continua até a 0150 (rodar depois que o site novo estiver no ar).
-- (4) realtime_sinais: aviso "algo mudou" sem dados de paciente, para o
--     tempo real funcionar sem deixar as tabelas abertas.
--
-- Depois de rodar, defina as senhas (troque o texto entre aspas):
--   select public.set_portal_password('clinica-nfs', 'admin',     'SENHA DA ADMINISTRACAO');
--   select public.set_portal_password('clinica-nfs', 'reception', 'SENHA DA RECEPCAO');

begin;

-- (1) Tabelas privadas ---------------------------------------------------------
-- Passe livre antigo: fica ligado até a 0150 (que desliga e não volta, mesmo
-- se esta migration for rodada de novo).
alter table public.ponto_companies
  add column if not exists passe_livre boolean not null default true;

create table if not exists public.company_portal_passwords (
  company_id    bigint      not null references public.ponto_companies(id) on delete cascade,
  scope         text        not null check (scope in ('admin', 'reception')),
  password_hash text        not null,
  updated_at    timestamptz not null default now(),
  primary key (company_id, scope)
);

create table if not exists public.company_sessions (
  token           text        primary key,
  company_id      bigint      not null references public.ponto_companies(id) on delete cascade,
  scope           text        not null check (scope in ('admin', 'reception', 'professional')),
  professional_id bigint,
  epoch           integer     not null,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null
);
create index if not exists company_sessions_expires_idx on public.company_sessions (expires_at);

create table if not exists public.login_falhas (
  id         bigserial   primary key,
  company_id bigint      not null,
  alvo       text        not null,
  created_at timestamptz not null default now()
);
alter table public.login_falhas add column if not exists ip text;
create index if not exists login_falhas_alvo_idx on public.login_falhas (company_id, alvo, created_at);

alter table public.company_portal_passwords enable row level security;
alter table public.company_sessions         enable row level security;
alter table public.login_falhas             enable row level security;
revoke all on public.company_portal_passwords from anon, authenticated;
revoke all on public.company_sessions         from anon, authenticated;
revoke all on public.login_falhas             from anon, authenticated;

-- Mesma normalização do portal: ignora maiúsculas, espaços e caracteres invisíveis.
create or replace function public._norm_senha(p text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(normalize(coalesce(p, ''), NFKC),
                              '[[:space:]\u200b-\u200f\u2028\u2029\ufeff]', '', 'g'));
$$;

-- Só pelo SQL Editor (não é liberada para o site).
create or replace function public.set_portal_password(p_slug text, p_scope text, p_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
begin
  if p_scope not in ('admin', 'reception') then
    raise exception 'Use admin ou reception.';
  end if;
  if length(public._norm_senha(p_password)) < 6 then
    raise exception 'A senha precisa ter pelo menos 6 caracteres.';
  end if;
  select id into v_company_id from public.ponto_companies where slug = lower(trim(p_slug));
  if v_company_id is null then
    raise exception 'Empresa não encontrada.';
  end if;
  insert into public.company_portal_passwords (company_id, scope, password_hash)
  values (v_company_id, p_scope, crypt(public._norm_senha(p_password), gen_salt('bf')))
  on conflict (company_id, scope) do update
    set password_hash = excluded.password_hash, updated_at = now();
end;
$$;
revoke all on function public.set_portal_password(text, text, text) from public, anon, authenticated;

-- (2) Login ------------------------------------------------------------------------
-- IP de quem chamou (o Supabase repassa os headers da requisição).
create or replace function public._req_ip()
returns text
language sql
stable
as $$
  select coalesce(nullif(trim(split_part(coalesce(
    nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ''), ',', 1)), ''), '?');
$$;

-- 10 erros do mesmo IP bloqueiam esse IP; 200 erros de vários IPs bloqueiam o alvo.
-- Assim um visitante errando a senha não trava a clínica inteira.
create or replace function public._login_bloqueado(p_company_id bigint, p_alvo text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (select count(*) from public.login_falhas
           where company_id = p_company_id and alvo = p_alvo and ip = public._req_ip()
             and created_at > now() - interval '15 minutes') >= 10
      or (select count(*) from public.login_falhas
           where company_id = p_company_id and alvo = p_alvo
             and created_at > now() - interval '15 minutes') >= 200;
$$;
revoke all on function public._login_bloqueado(bigint, text) from public, anon, authenticated;

create or replace function public._criar_sessao(
  p_company_id bigint, p_scope text, p_professional_id bigint, p_epoch integer)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_token text := 'tk_' || encode(gen_random_bytes(24), 'hex');
begin
  delete from public.company_sessions where expires_at < now();
  delete from public.login_falhas where created_at < now() - interval '1 day';
  insert into public.company_sessions (token, company_id, scope, professional_id, epoch, expires_at)
  values (v_token, p_company_id, p_scope, p_professional_id, p_epoch, now() + interval '7 days');
  return v_token;
end;
$$;
revoke all on function public._criar_sessao(bigint, text, bigint, integer) from public, anon, authenticated;

create or replace function public.company_login(p_slug text, p_password text, p_scope text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_row public.ponto_companies%rowtype;
  v_pw  text := public._norm_senha(p_password);
  v_ok  boolean;
begin
  if p_scope not in ('admin', 'reception') then
    return jsonb_build_object('ok', false, 'error', 'Acesso inválido.');
  end if;
  select * into v_row from public.ponto_companies
   where slug = lower(trim(coalesce(p_slug, ''))) and active = true limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Empresa não encontrada.');
  end if;
  if public._login_bloqueado(v_row.id, p_scope) then
    return jsonb_build_object('ok', false, 'error', 'Muitas tentativas erradas. Espere 15 minutos.');
  end if;

  -- Recepção também entra com a senha da Administração.
  select exists (
    select 1 from public.company_portal_passwords pp
     where pp.company_id = v_row.id
       and (pp.scope = p_scope or (p_scope = 'reception' and pp.scope = 'admin'))
       and pp.password_hash = crypt(v_pw, pp.password_hash)
  ) into v_ok;

  if not v_ok or v_pw = '' then
    insert into public.login_falhas (company_id, alvo, ip) values (v_row.id, p_scope, public._req_ip());
    return jsonb_build_object('ok', false, 'error', 'Senha incorreta.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'token', public._criar_sessao(v_row.id, p_scope, null, v_row.session_epoch),
    'epoch', v_row.session_epoch,
    'company', jsonb_build_object(
      'id', v_row.id, 'name', v_row.name, 'slug', v_row.slug,
      'module_arco_iris', v_row.module_arco_iris,
      'module_triagem', v_row.module_triagem,
      'module_ponto', v_row.module_ponto));
end;
$$;
revoke all on function public.company_login(text, text, text) from public;
grant execute on function public.company_login(text, text, text) to anon, authenticated;

create or replace function public.professional_login(p_slug text, p_professional_id bigint, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_row  public.ponto_companies%rowtype;
  v_prof public.professionals%rowtype;
  v_alvo text := 'prof:' || coalesce(p_professional_id::text, '');
begin
  select * into v_row from public.ponto_companies
   where slug = lower(trim(coalesce(p_slug, ''))) and active = true limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Empresa não encontrada.');
  end if;
  if public._login_bloqueado(v_row.id, v_alvo) then
    return jsonb_build_object('ok', false, 'error', 'Muitas tentativas erradas. Espere 15 minutos.');
  end if;

  select * into v_prof from public.professionals
   where id = p_professional_id and company_id = v_row.id
     and pin is not null and pin <> '' and pin = p_pin
   limit 1;
  if not found then
    insert into public.login_falhas (company_id, alvo, ip) values (v_row.id, v_alvo, public._req_ip());
    return jsonb_build_object('ok', false, 'error', 'PIN incorreto.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'token', public._criar_sessao(v_row.id, 'professional', v_prof.id, v_row.session_epoch),
    'epoch', v_row.session_epoch,
    'company', jsonb_build_object(
      'id', v_row.id, 'name', v_row.name, 'slug', v_row.slug,
      'module_arco_iris', v_row.module_arco_iris,
      'module_triagem', v_row.module_triagem,
      'module_ponto', v_row.module_ponto),
    'professional', jsonb_build_object(
      'id', v_prof.id, 'name', v_prof.name, 'specialty', v_prof.specialty));
end;
$$;
revoke all on function public.professional_login(text, bigint, text) from public;
grant execute on function public.professional_login(text, bigint, text) to anon, authenticated;

create or replace function public.company_logout(p_token text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.company_sessions where token = p_token;
$$;
revoke all on function public.company_logout(text) from public;
grant execute on function public.company_logout(text) to anon, authenticated;

-- (3) Verificação usada por todas as RPCs ---------------------------------------
create or replace function public._verify_company_admin(p_slug text, p_password text)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_row public.ponto_companies%rowtype;
begin
  if p_slug is null or p_password is null or p_password = '' then
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

  -- Temporário: a 0150 desliga este passe livre.
  if p_password = '__noauth__' and v_row.passe_livre then
    return v_row.id;
  end if;

  if v_row.admin_password_hash <> crypt(p_password, v_row.admin_password_hash) then
    raise exception 'invalid credentials' using errcode = '28P01';
  end if;
  return v_row.id;
end;
$$;

-- "Desconectar todos": derruba todo mundo, menos quem clicou.
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
  if exists (select 1 from public.company_sessions
              where token = p_password and scope = 'professional') then
    raise exception 'Só a Administração ou a Recepção podem desconectar todos.' using errcode = '42501';
  end if;
  update public.ponto_companies
     set session_epoch = session_epoch + 1
   where id = v_company_id
  returning session_epoch into v_epoch;
  update public.company_sessions set epoch = v_epoch
   where token = p_password and company_id = v_company_id;
  delete from public.company_sessions where company_id = v_company_id and epoch <> v_epoch;
  return v_epoch;
end;
$$;
revoke all on function public.logout_all_devices(text, text) from public;
grant execute on function public.logout_all_devices(text, text) to anon, authenticated;

-- Sessão ainda vale? (o site usa para voltar ao login quando o token vence)
create or replace function public.session_company_id(p_token text, p_company_id bigint default null)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_token = '__noauth__' then
      (select c.id from public.ponto_companies c
        where c.id = p_company_id and c.active and c.passe_livre)
    else
      (select s.company_id from public.company_sessions s
         join public.ponto_companies c on c.id = s.company_id
        where s.token = p_token and s.expires_at > now()
          and s.epoch = c.session_epoch and c.active)
  end;
$$;
revoke all on function public.session_company_id(text, bigint) from public;
grant execute on function public.session_company_id(text, bigint) to anon, authenticated;

-- PIN do profissional (tela do PIN da agenda): mesmo limite de tentativas.
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
  v_alvo       text := 'prof:' || coalesce(p_professional_id::text, '');
begin
  select id into v_company_id from public.ponto_companies
   where slug = lower(trim(coalesce(p_slug, ''))) limit 1;
  if v_company_id is null or public._login_bloqueado(v_company_id, v_alvo) then
    return null;
  end if;
  select * into v_row from public.professionals
   where id = p_professional_id and company_id = v_company_id
     and pin is not null and pin <> '' and pin = p_pin
   limit 1;
  if not found then
    insert into public.login_falhas (company_id, alvo, ip) values (v_company_id, v_alvo, public._req_ip());
    return null;
  end if;
  return v_row;
end;
$$;

-- Minhas Ausências: aceita o token do profissional. PIN direto só enquanto
-- houver passe livre (até a 0150), e respeitando o limite de tentativas.
create or replace function public._verify_professional_pin_company(
  p_slug text, p_professional_id bigint, p_pin text
)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_row public.ponto_companies%rowtype;
begin
  select * into v_row from public.ponto_companies
   where slug = lower(trim(coalesce(p_slug, ''))) and active = true limit 1;
  if not found then
    raise exception 'PIN inválido.' using errcode = '28P01';
  end if;

  if p_pin like 'tk\_%' then
    perform 1 from public.company_sessions s
     where s.token = p_pin and s.company_id = v_row.id
       and s.professional_id = p_professional_id
       and s.expires_at > now() and s.epoch = v_row.session_epoch;
    if found then
      return v_row.id;
    end if;
    raise exception 'PIN inválido.' using errcode = '28P01';
  end if;

  if not v_row.passe_livre
     or public._login_bloqueado(v_row.id, 'prof:' || coalesce(p_professional_id::text, '')) then
    raise exception 'PIN inválido.' using errcode = '28P01';
  end if;
  perform 1 from public.professionals p
   where p.id = p_professional_id and p.company_id = v_row.id
     and p.pin is not null and p.pin <> '' and p.pin = p_pin;
  if not found then
    raise exception 'PIN inválido.' using errcode = '28P01';
  end if;
  return v_row.id;
end;
$$;
revoke all on function public._verify_professional_pin_company(text, bigint, text) from public, anon, authenticated;

-- (4) Tempo real sem dados de paciente ------------------------------------------
create table if not exists public.realtime_sinais (
  id              bigserial   primary key,
  company_id      bigint,
  tabela          text        not null,
  professional_id bigint,
  operacao        text,
  created_at      timestamptz not null default now()
);
alter table public.realtime_sinais add column if not exists operacao text;
create index if not exists realtime_sinais_created_idx on public.realtime_sinais (created_at);
alter table public.realtime_sinais enable row level security;
revoke all on public.realtime_sinais from anon, authenticated;
grant select on public.realtime_sinais to anon, authenticated;
drop policy if exists realtime_sinais_read on public.realtime_sinais;
create policy realtime_sinais_read on public.realtime_sinais
  for select to anon, authenticated using (true);

create or replace function public._sinal_realtime()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.realtime_sinais (company_id, tabela, professional_id, operacao)
    select distinct (to_jsonb(t) ->> 'company_id')::bigint, tg_table_name,
                    (to_jsonb(t) ->> 'professional_id')::bigint, tg_op
      from novas t;
  elsif tg_op = 'UPDATE' then
    insert into public.realtime_sinais (company_id, tabela, professional_id, operacao)
    select distinct (to_jsonb(t) ->> 'company_id')::bigint, tg_table_name,
                    (to_jsonb(t) ->> 'professional_id')::bigint, tg_op
      from (select * from novas union all select * from antigas) t;
  else
    insert into public.realtime_sinais (company_id, tabela, professional_id, operacao)
    select distinct (to_jsonb(t) ->> 'company_id')::bigint, tg_table_name,
                    (to_jsonb(t) ->> 'professional_id')::bigint, tg_op
      from antigas t;
  end if;
  if random() < 0.02 then
    delete from public.realtime_sinais
     where id in (select id from public.realtime_sinais
                   where created_at < now() - interval '1 hour'
                   limit 5000 for update skip locked);
  end if;
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['appointments', 'waiting_list', 'patients', 'notificacoes_recepcao'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_sinal_ins', t);
    execute format('drop trigger if exists %I on public.%I', t || '_sinal_upd', t);
    execute format('drop trigger if exists %I on public.%I', t || '_sinal_del', t);
    execute format('create trigger %I after insert on public.%I referencing new table as novas
                    for each statement execute function public._sinal_realtime()', t || '_sinal_ins', t);
    execute format('create trigger %I after update on public.%I referencing old table as antigas new table as novas
                    for each statement execute function public._sinal_realtime()', t || '_sinal_upd', t);
    execute format('create trigger %I after delete on public.%I referencing old table as antigas
                    for each statement execute function public._sinal_realtime()', t || '_sinal_del', t);
  end loop;
end $$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public'
                        and tablename = 'realtime_sinais') then
    alter publication supabase_realtime add table public.realtime_sinais;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
