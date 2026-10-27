-- 0133 — Agenda da Cláudia: agenda executiva separada da agenda dos profissionais,
-- com acesso por PIN (dona da agenda + gestoras autorizadas por ela) e avisos
-- push no celular mesmo com o app fechado (pg_cron a cada minuto + pg_net →
-- /api/agenda/push). Aditiva e idempotente: só cria tabelas/funções novas.
-- A chave secreta dos avisos (VAPID) NÃO fica aqui: é gravada à parte em
-- agenda_exec_config pelo administrador.

create extension if not exists pgcrypto;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create table if not exists public.agenda_exec_usuarios (
  id            bigserial   primary key,
  company_id    bigint      not null references public.ponto_companies(id) on delete cascade,
  dona_id       bigint      references public.agenda_exec_usuarios(id) on delete cascade, -- null = dona da agenda
  nome          text        not null check (length(trim(nome)) between 2 and 60),
  pin_hash      text        not null,
  falhas        int         not null default 0,
  bloqueado_ate timestamptz,
  ativo         boolean     not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists agenda_exec_usuarios_company_idx on public.agenda_exec_usuarios (company_id);

create table if not exists public.agenda_exec_sessoes (
  token_hash text        primary key,
  usuario_id bigint      not null references public.agenda_exec_usuarios(id) on delete cascade,
  criado_em  timestamptz not null default now(),
  usado_em   timestamptz not null default now(),
  expira_em  timestamptz not null default now() + interval '365 days'
);

create table if not exists public.agenda_exec_compromissos (
  id              bigserial   primary key,
  dona_id         bigint      not null references public.agenda_exec_usuarios(id) on delete cascade,
  titulo          text        not null check (length(trim(titulo)) between 1 and 160),
  data            date        not null,
  hora            text        check (hora is null or hora ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  local           text,
  observacao      text,
  categoria       text        not null default 'reuniao'
                  check (categoria in ('reuniao','evento','visita','palestra','urgente','pessoal','outro')),
  avisar_vespera  boolean     not null default true,
  avisar_dia      boolean     not null default true,
  antecedencia_min int        default 60 check (antecedencia_min is null or antecedencia_min between 0 and 1440),
  concluido       boolean     not null default false,
  criado_por      bigint      references public.agenda_exec_usuarios(id) on delete set null,
  atualizado_por  bigint      references public.agenda_exec_usuarios(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists agenda_exec_compromissos_idx on public.agenda_exec_compromissos (dona_id, data);

create table if not exists public.agenda_exec_historico (
  id             bigserial   primary key,
  dona_id        bigint      not null references public.agenda_exec_usuarios(id) on delete cascade,
  compromisso_id bigint,
  usuario_id     bigint      references public.agenda_exec_usuarios(id) on delete set null,
  acao           text        not null,
  titulo         text,
  em             timestamptz not null default now()
);
create index if not exists agenda_exec_historico_idx on public.agenda_exec_historico (dona_id, em desc);

create table if not exists public.agenda_exec_push (
  id          bigserial   primary key,
  usuario_id  bigint      not null references public.agenda_exec_usuarios(id) on delete cascade,
  endpoint    text        not null unique check (endpoint like 'https://%'),
  p256dh      text        not null,
  auth        text        not null,
  aparelho    text,
  created_at  timestamptz not null default now(),
  ultimo_ok   timestamptz,
  ultimo_erro text
);

create table if not exists public.agenda_exec_envios (
  chave text        primary key,
  em    timestamptz not null default now()
);

create table if not exists public.agenda_exec_testes (
  id         bigserial   primary key,
  usuario_id bigint      not null references public.agenda_exec_usuarios(id) on delete cascade,
  enviar_em  timestamptz not null
);

create table if not exists public.agenda_exec_lotes (
  id         bigserial   primary key,
  token_hash text        not null unique,
  itens      jsonb       not null,
  criado_em  timestamptz not null default now(),
  aberto_em  timestamptz,
  fechado_em timestamptz,
  resultado  jsonb
);

create table if not exists public.agenda_exec_config (
  id            int  primary key default 1 check (id = 1),
  vapid_public  text,
  vapid_private text,
  vapid_subject text not null default 'https://nfs-gestao-oficial.vercel.app',
  push_url      text not null default 'https://nfs-gestao-oficial.vercel.app/api/agenda/push'
);
insert into public.agenda_exec_config (id) values (1) on conflict (id) do nothing;

-- Nada destas tabelas é lido direto pelo navegador: só pelas funções abaixo.
alter table public.agenda_exec_usuarios     enable row level security;
alter table public.agenda_exec_sessoes      enable row level security;
alter table public.agenda_exec_compromissos enable row level security;
alter table public.agenda_exec_historico    enable row level security;
alter table public.agenda_exec_push         enable row level security;
alter table public.agenda_exec_envios       enable row level security;
alter table public.agenda_exec_testes       enable row level security;
alter table public.agenda_exec_lotes        enable row level security;
alter table public.agenda_exec_config       enable row level security;

-- ---------------------------------------------------------------- auxiliares
create or replace function public._agx_sessao(p_token text)
returns public.agenda_exec_usuarios
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_u public.agenda_exec_usuarios%rowtype; v_hash text;
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'sessão inválida' using errcode = '28P01';
  end if;
  v_hash := encode(digest(p_token, 'sha256'), 'hex');
  select u.* into v_u
    from public.agenda_exec_sessoes s join public.agenda_exec_usuarios u on u.id = s.usuario_id
   where s.token_hash = v_hash and s.expira_em > now() and u.ativo;
  if not found then
    raise exception 'sessão inválida' using errcode = '28P01';
  end if;
  update public.agenda_exec_sessoes set usado_em = now() where token_hash = v_hash;
  return v_u;
end $$;

create or replace function public._agx_pin_ok(p_pin text)
returns void language plpgsql immutable as $$
begin
  if p_pin is null or p_pin !~ '^\d{4,6}$' then
    raise exception 'O PIN deve ter de 4 a 6 números' using errcode = '22023';
  end if;
end $$;

create or replace function public._agx_json(c public.agenda_exec_compromissos)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', c.id, 'titulo', c.titulo, 'data', to_char(c.data, 'YYYY-MM-DD'), 'hora', c.hora,
    'local', c.local, 'observacao', c.observacao, 'categoria', c.categoria,
    'avisarVespera', c.avisar_vespera, 'avisarDia', c.avisar_dia, 'antecedenciaMin', c.antecedencia_min,
    'concluido', c.concluido, 'createdAt', c.created_at, 'updatedAt', c.updated_at,
    'criadoPor', (select nome from public.agenda_exec_usuarios where id = c.criado_por),
    'atualizadoPor', (select nome from public.agenda_exec_usuarios where id = c.atualizado_por));
$$;

-- ---------------------------------------------------------------- acesso
create or replace function public.agenda_exec_usuarios_listar(p_slug text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'nome', u.nome,
           'papel', case when u.dona_id is null then 'dona' else 'gestora' end,
           'donaNome', coalesce(d.nome, u.nome)) order by u.dona_id nulls first, u.nome), '[]'::jsonb)
    from public.agenda_exec_usuarios u
    join public.ponto_companies pc on pc.id = u.company_id and pc.slug = lower(trim(p_slug))
    left join public.agenda_exec_usuarios d on d.id = u.dona_id
   where u.ativo;
$$;

create or replace function public.agenda_exec_criar_dona(p_slug text, p_password text, p_nome text, p_pin text)
returns bigint language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_company bigint; v_id bigint;
begin
  v_company := public._verify_company_admin(p_slug, p_password);
  perform public._agx_pin_ok(p_pin);
  if exists (select 1 from public.agenda_exec_usuarios where company_id = v_company and dona_id is null and ativo) then
    raise exception 'A agenda já tem dona cadastrada' using errcode = '23505';
  end if;
  insert into public.agenda_exec_usuarios (company_id, nome, pin_hash)
  values (v_company, trim(p_nome), crypt(p_pin, gen_salt('bf'))) returning id into v_id;
  return v_id;
end $$;

create or replace function public.agenda_exec_entrar(p_slug text, p_usuario_id bigint, p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_u public.agenda_exec_usuarios%rowtype; v_token text; v_dona public.agenda_exec_usuarios%rowtype;
begin
  select u.* into v_u from public.agenda_exec_usuarios u
    join public.ponto_companies pc on pc.id = u.company_id and pc.slug = lower(trim(p_slug))
   where u.id = p_usuario_id and u.ativo;
  if not found then return jsonb_build_object('erro', 'usuario'); end if;
  if v_u.bloqueado_ate is not null and v_u.bloqueado_ate > now() then
    return jsonb_build_object('erro', 'bloqueado', 'ate', v_u.bloqueado_ate);
  end if;
  if p_pin is null or v_u.pin_hash <> crypt(p_pin, v_u.pin_hash) then
    update public.agenda_exec_usuarios
       set falhas = case when falhas + 1 >= 5 then 0 else falhas + 1 end,
           bloqueado_ate = case when falhas + 1 >= 5 then now() + interval '15 minutes' else null end
     where id = v_u.id;
    return jsonb_build_object('erro', 'pin');
  end if;
  update public.agenda_exec_usuarios set falhas = 0, bloqueado_ate = null where id = v_u.id;
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.agenda_exec_sessoes (token_hash, usuario_id) values (encode(digest(v_token, 'sha256'), 'hex'), v_u.id);
  select * into v_dona from public.agenda_exec_usuarios where id = coalesce(v_u.dona_id, v_u.id);
  return jsonb_build_object('token', v_token,
    'usuario', jsonb_build_object('id', v_u.id, 'nome', v_u.nome, 'papel', case when v_u.dona_id is null then 'dona' else 'gestora' end),
    'dona', jsonb_build_object('id', v_dona.id, 'nome', v_dona.nome));
end $$;

create or replace function public.agenda_exec_sair(p_token text)
returns void language sql security definer set search_path = public, extensions, pg_temp as $$
  delete from public.agenda_exec_sessoes where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

create or replace function public.agenda_exec_eu(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_u public.agenda_exec_usuarios%rowtype; v_dona public.agenda_exec_usuarios%rowtype;
begin
  v_u := public._agx_sessao(p_token);
  select * into v_dona from public.agenda_exec_usuarios where id = coalesce(v_u.dona_id, v_u.id);
  return jsonb_build_object(
    'usuario', jsonb_build_object('id', v_u.id, 'nome', v_u.nome, 'papel', case when v_u.dona_id is null then 'dona' else 'gestora' end),
    'dona', jsonb_build_object('id', v_dona.id, 'nome', v_dona.nome));
end $$;

create or replace function public.agenda_exec_acessos(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_u public.agenda_exec_usuarios%rowtype;
begin
  v_u := public._agx_sessao(p_token);
  if v_u.dona_id is not null then raise exception 'Só a dona da agenda pode ver os acessos' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'createdAt', created_at) order by nome)
                     from public.agenda_exec_usuarios where dona_id = v_u.id and ativo), '[]'::jsonb);
end $$;

create or replace function public.agenda_exec_autorizar(p_token text, p_nome text, p_pin text)
returns bigint language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_u public.agenda_exec_usuarios%rowtype; v_id bigint;
begin
  v_u := public._agx_sessao(p_token);
  if v_u.dona_id is not null then raise exception 'Só a dona da agenda pode autorizar acessos' using errcode = '42501'; end if;
  perform public._agx_pin_ok(p_pin);
  insert into public.agenda_exec_usuarios (company_id, dona_id, nome, pin_hash)
  values (v_u.company_id, v_u.id, trim(p_nome), crypt(p_pin, gen_salt('bf'))) returning id into v_id;
  insert into public.agenda_exec_historico (dona_id, usuario_id, acao, titulo) values (v_u.id, v_u.id, 'autorizou acesso', trim(p_nome));
  return v_id;
end $$;

create or replace function public.agenda_exec_revogar(p_token text, p_usuario_id bigint)
returns void language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_u public.agenda_exec_usuarios%rowtype; v_nome text;
begin
  v_u := public._agx_sessao(p_token);
  if v_u.dona_id is not null then raise exception 'Só a dona da agenda pode remover acessos' using errcode = '42501'; end if;
  delete from public.agenda_exec_usuarios where id = p_usuario_id and dona_id = v_u.id returning nome into v_nome;
  if v_nome is not null then
    insert into public.agenda_exec_historico (dona_id, usuario_id, acao, titulo) values (v_u.id, v_u.id, 'removeu acesso', v_nome);
  end if;
end $$;

create or replace function public.agenda_exec_trocar_pin(p_token text, p_pin_atual text, p_pin_novo text)
returns void language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_u public.agenda_exec_usuarios%rowtype;
begin
  v_u := public._agx_sessao(p_token);
  if v_u.pin_hash <> crypt(coalesce(p_pin_atual, ''), v_u.pin_hash) then
    raise exception 'PIN atual incorreto' using errcode = '28P01';
  end if;
  perform public._agx_pin_ok(p_pin_novo);
  update public.agenda_exec_usuarios set pin_hash = crypt(p_pin_novo, gen_salt('bf')) where id = v_u.id;
end $$;

-- ---------------------------------------------------------------- compromissos
create or replace function public.agenda_exec_listar(p_token text, p_de date, p_ate date)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_u public.agenda_exec_usuarios%rowtype;
begin
  v_u := public._agx_sessao(p_token);
  return coalesce((select jsonb_agg(public._agx_json(c) order by c.data, c.hora nulls first, c.id)
                     from public.agenda_exec_compromissos c
                    where c.dona_id = coalesce(v_u.dona_id, v_u.id) and c.data between p_de and p_ate), '[]'::jsonb);
end $$;

create or replace function public.agenda_exec_salvar(
  p_token text, p_id bigint, p_titulo text, p_data date, p_hora text, p_local text, p_observacao text,
  p_categoria text, p_avisar_vespera boolean, p_avisar_dia boolean, p_antecedencia_min int)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_u public.agenda_exec_usuarios%rowtype; v_dona bigint; v_c public.agenda_exec_compromissos%rowtype;
begin
  v_u := public._agx_sessao(p_token);
  v_dona := coalesce(v_u.dona_id, v_u.id);
  if p_id is null then
    insert into public.agenda_exec_compromissos (dona_id, titulo, data, hora, local, observacao, categoria,
      avisar_vespera, avisar_dia, antecedencia_min, criado_por, atualizado_por)
    values (v_dona, trim(p_titulo), p_data, nullif(trim(p_hora), ''), nullif(trim(p_local), ''), nullif(trim(p_observacao), ''),
      coalesce(p_categoria, 'reuniao'), coalesce(p_avisar_vespera, true), coalesce(p_avisar_dia, true), p_antecedencia_min, v_u.id, v_u.id)
    returning * into v_c;
  else
    update public.agenda_exec_compromissos set titulo = trim(p_titulo), data = p_data, hora = nullif(trim(p_hora), ''),
      local = nullif(trim(p_local), ''), observacao = nullif(trim(p_observacao), ''), categoria = coalesce(p_categoria, 'reuniao'),
      avisar_vespera = coalesce(p_avisar_vespera, true), avisar_dia = coalesce(p_avisar_dia, true),
      antecedencia_min = p_antecedencia_min, atualizado_por = v_u.id, updated_at = now()
     where id = p_id and dona_id = v_dona returning * into v_c;
    if not found then raise exception 'Compromisso não encontrado' using errcode = 'P0002'; end if;
  end if;
  insert into public.agenda_exec_historico (dona_id, compromisso_id, usuario_id, acao, titulo)
  values (v_dona, v_c.id, v_u.id, case when p_id is null then 'criou' else 'alterou' end, v_c.titulo);
  return public._agx_json(v_c);
end $$;

create or replace function public.agenda_exec_concluir(p_token text, p_id bigint, p_concluido boolean)
returns void language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_u public.agenda_exec_usuarios%rowtype; v_titulo text;
begin
  v_u := public._agx_sessao(p_token);
  update public.agenda_exec_compromissos set concluido = p_concluido, atualizado_por = v_u.id, updated_at = now()
   where id = p_id and dona_id = coalesce(v_u.dona_id, v_u.id) returning titulo into v_titulo;
  if v_titulo is not null then
    insert into public.agenda_exec_historico (dona_id, compromisso_id, usuario_id, acao, titulo)
    values (coalesce(v_u.dona_id, v_u.id), p_id, v_u.id, case when p_concluido then 'concluiu' else 'reabriu' end, v_titulo);
  end if;
end $$;

create or replace function public.agenda_exec_excluir(p_token text, p_id bigint)
returns void language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_u public.agenda_exec_usuarios%rowtype; v_titulo text;
begin
  v_u := public._agx_sessao(p_token);
  delete from public.agenda_exec_compromissos where id = p_id and dona_id = coalesce(v_u.dona_id, v_u.id) returning titulo into v_titulo;
  if v_titulo is not null then
    insert into public.agenda_exec_historico (dona_id, compromisso_id, usuario_id, acao, titulo)
    values (coalesce(v_u.dona_id, v_u.id), p_id, v_u.id, 'excluiu', v_titulo);
  end if;
end $$;

create or replace function public.agenda_exec_historico_listar(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_u public.agenda_exec_usuarios%rowtype;
begin
  v_u := public._agx_sessao(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('acao', h.acao, 'titulo', h.titulo, 'em', h.em, 'por', u.nome) order by h.em desc)
                     from (select * from public.agenda_exec_historico where dona_id = coalesce(v_u.dona_id, v_u.id)
                            order by em desc limit 60) h
                     left join public.agenda_exec_usuarios u on u.id = h.usuario_id), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------- avisos push
create or replace function public.agenda_exec_push_chave()
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select vapid_public from public.agenda_exec_config where id = 1 and vapid_private is not null;
$$;

create or replace function public.agenda_exec_push_registrar(p_token text, p_endpoint text, p_p256dh text, p_auth text, p_aparelho text)
returns void language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_u public.agenda_exec_usuarios%rowtype;
begin
  v_u := public._agx_sessao(p_token);
  if v_u.dona_id is not null then
    raise exception 'Os avisos vão só para os aparelhos da dona da agenda' using errcode = '42501';
  end if;
  insert into public.agenda_exec_push (usuario_id, endpoint, p256dh, auth, aparelho)
  values (v_u.id, p_endpoint, p_p256dh, p_auth, left(p_aparelho, 120))
  on conflict (endpoint) do update set usuario_id = excluded.usuario_id, p256dh = excluded.p256dh,
    auth = excluded.auth, aparelho = excluded.aparelho, ultimo_erro = null;
end $$;

create or replace function public.agenda_exec_push_remover(p_token text, p_endpoint text)
returns void language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_u public.agenda_exec_usuarios%rowtype;
begin
  v_u := public._agx_sessao(p_token);
  delete from public.agenda_exec_push where usuario_id = v_u.id and endpoint = p_endpoint;
end $$;

create or replace function public.agenda_exec_push_status(p_token text, p_endpoint text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_u public.agenda_exec_usuarios%rowtype;
begin
  v_u := public._agx_sessao(p_token);
  return jsonb_build_object(
    'configurado', exists (select 1 from public.agenda_exec_config where id = 1 and vapid_private is not null),
    'aparelhos', (select count(*) from public.agenda_exec_push where usuario_id = coalesce(v_u.dona_id, v_u.id)),
    'esteAparelho', (select jsonb_build_object('ultimoOk', ultimo_ok, 'ultimoErro', ultimo_erro)
                       from public.agenda_exec_push where endpoint = p_endpoint and usuario_id = v_u.id));
end $$;

-- Monta o lote (um item por aparelho) e chama /api/agenda/push com um token de uso único.
create or replace function public._agx_enviar(p_itens jsonb)
returns int language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_cfg public.agenda_exec_config%rowtype; v_envios jsonb; v_token text;
begin
  select * into v_cfg from public.agenda_exec_config where id = 1;
  if v_cfg.vapid_private is null then return -1; end if;
  select coalesce(jsonb_agg(jsonb_build_object('subId', p.id,
           'sub', jsonb_build_object('endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth),
           'payload', i - 'dona')), '[]'::jsonb)
    into v_envios
    from jsonb_array_elements(p_itens) i
    join public.agenda_exec_push p on p.usuario_id = (i->>'dona')::bigint;
  if jsonb_array_length(v_envios) = 0 then return 0; end if;
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.agenda_exec_lotes (token_hash, itens) values (encode(digest(v_token, 'sha256'), 'hex'), v_envios);
  perform net.http_post(url := v_cfg.push_url, body := jsonb_build_object('token', v_token),
    headers := jsonb_build_object('Content-Type', 'application/json'), timeout_milliseconds := 20000);
  return jsonb_array_length(v_envios);
end $$;

create or replace function public._agx_hora(p_hora text)
returns text language sql immutable as $$
  select case when p_hora is null then 'Dia todo' when right(p_hora, 2) = '00' then left(p_hora, 2) || 'h' else replace(p_hora, ':', 'h') end;
$$;

create or replace function public._agx_falta(p_min int)
returns text language sql immutable as $$
  select case when p_min < 60 then p_min || ' min'
              when p_min % 60 = 0 then (p_min / 60) || (case when p_min = 60 then ' hora' else ' horas' end)
              else (p_min / 60) || 'h' || lpad((p_min % 60)::text, 2, '0') end;
$$;

-- Roda a cada minuto (pg_cron). Avisos: X min antes; resumo às 7h do dia; resumo às 18h da véspera.
create or replace function public.agenda_exec_disparar()
returns int language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_agora timestamp := (now() at time zone 'America/Sao_Paulo');
  v_hoje  date := (now() at time zone 'America/Sao_Paulo')::date;
  v_itens jsonb := '[]'::jsonb;
  v_min   int;
  r       record;
begin
  -- Sem a chave dos avisos, não marca nada como enviado (para não perder lembretes).
  if not exists (select 1 from public.agenda_exec_config where id = 1 and vapid_private is not null) then
    return -1;
  end if;
  delete from public.agenda_exec_lotes where criado_em < now() - interval '7 days';
  delete from public.agenda_exec_envios where em < now() - interval '60 days';

  for r in
    select c.*, (c.data + c.hora::time) as inicio
      from public.agenda_exec_compromissos c
     where not c.concluido and c.hora is not null and c.antecedencia_min is not null
       and c.data between v_hoje - 1 and v_hoje + 2
       and (c.data + c.hora::time) - make_interval(mins => c.antecedencia_min) <= v_agora
       and (c.data + c.hora::time) + interval '5 minutes' > v_agora
       and exists (select 1 from public.agenda_exec_push p where p.usuario_id = c.dona_id)
  loop
    insert into public.agenda_exec_envios (chave) values (format('a:%s:%s:%s:%s', r.id, r.data, r.hora, r.antecedencia_min))
    on conflict do nothing;
    if found then
      v_min := greatest(0, ceil(extract(epoch from (r.inicio - v_agora)) / 60)::int);
      v_itens := v_itens || jsonb_build_array(jsonb_build_object('dona', r.dona_id, 'tag', 'c' || r.id, 'url', '/agenda-claudia',
        'title', case when v_min <= 1 then 'Agora: ' || r.titulo else 'Daqui a ' || public._agx_falta(v_min) || ': ' || r.titulo end,
        'body', 'Às ' || public._agx_hora(r.hora) || coalesce(' · ' || r.local, '')));
    end if;
  end loop;

  if v_agora::time >= time '07:00' and v_agora::time < time '12:00' then
    for r in
      select c.dona_id, count(*) as n,
             string_agg(public._agx_hora(c.hora) || ' ' || c.titulo, ' · ' order by c.hora nulls first) as lista
        from public.agenda_exec_compromissos c
       where c.data = v_hoje and not c.concluido and c.avisar_dia
         and (c.hora is null or c.hora::time > v_agora::time)
         and exists (select 1 from public.agenda_exec_push p where p.usuario_id = c.dona_id)
       group by c.dona_id
    loop
      insert into public.agenda_exec_envios (chave) values (format('d:%s:%s', r.dona_id, v_hoje)) on conflict do nothing;
      if found then
        v_itens := v_itens || jsonb_build_array(jsonb_build_object('dona', r.dona_id, 'tag', 'dia', 'url', '/agenda-claudia',
          'title', 'Bom dia! Hoje você tem ' || r.n || case when r.n = 1 then ' compromisso' else ' compromissos' end,
          'body', r.lista));
      end if;
    end loop;
  end if;

  if v_agora::time >= time '18:00' and v_agora::time < time '22:00' then
    for r in
      select c.dona_id, count(*) as n,
             string_agg(public._agx_hora(c.hora) || ' ' || c.titulo, ' · ' order by c.hora nulls first) as lista
        from public.agenda_exec_compromissos c
       where c.data = v_hoje + 1 and not c.concluido and c.avisar_vespera
         and exists (select 1 from public.agenda_exec_push p where p.usuario_id = c.dona_id)
       group by c.dona_id
    loop
      insert into public.agenda_exec_envios (chave) values (format('v:%s:%s', r.dona_id, v_hoje + 1)) on conflict do nothing;
      if found then
        v_itens := v_itens || jsonb_build_array(jsonb_build_object('dona', r.dona_id, 'tag', 'vespera', 'url', '/agenda-claudia',
          'title', 'Amanhã você tem ' || r.n || case when r.n = 1 then ' compromisso' else ' compromissos' end,
          'body', r.lista));
      end if;
    end loop;
  end if;

  for r in delete from public.agenda_exec_testes where enviar_em <= now() returning usuario_id loop
    v_itens := v_itens || jsonb_build_array(jsonb_build_object('dona', r.usuario_id, 'tag', 'teste', 'url', '/agenda-claudia',
      'title', 'Teste do NFs: os avisos estão funcionando', 'body', 'Este celular vai receber os lembretes da sua agenda.'));
  end loop;

  if jsonb_array_length(v_itens) = 0 then return 0; end if;
  return public._agx_enviar(v_itens);
end $$;

create or replace function public.agenda_exec_push_testar(p_token text, p_atraso_seg int default 0)
returns int language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_u public.agenda_exec_usuarios%rowtype;
begin
  v_u := public._agx_sessao(p_token);
  if v_u.dona_id is not null then raise exception 'Os avisos vão só para os aparelhos da dona da agenda' using errcode = '42501'; end if;
  if coalesce(p_atraso_seg, 0) > 0 then
    insert into public.agenda_exec_testes (usuario_id, enviar_em) values (v_u.id, now() + make_interval(secs => least(p_atraso_seg, 600)));
    return 0;
  end if;
  return public._agx_enviar(jsonb_build_array(jsonb_build_object('dona', v_u.id, 'tag', 'teste', 'url', '/agenda-claudia',
    'title', 'Teste do NFs: os avisos estão funcionando', 'body', 'Este celular vai receber os lembretes da sua agenda.')));
end $$;

-- Usados só por /api/agenda/push, com o token de uso único do lote.
create or replace function public.agenda_exec_lote_abrir(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_itens jsonb; v_cfg public.agenda_exec_config%rowtype;
begin
  update public.agenda_exec_lotes set aberto_em = now()
   where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
     and aberto_em is null and criado_em > now() - interval '10 minutes'
  returning itens into v_itens;
  if v_itens is null then return null; end if;
  select * into v_cfg from public.agenda_exec_config where id = 1;
  return jsonb_build_object('envios', v_itens,
    'vapid', jsonb_build_object('publicKey', v_cfg.vapid_public, 'privateKey', v_cfg.vapid_private, 'subject', v_cfg.vapid_subject));
end $$;

create or replace function public.agenda_exec_lote_fechar(p_token text, p_resultados jsonb)
returns void language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_id bigint; r jsonb;
begin
  update public.agenda_exec_lotes set fechado_em = now(), resultado = p_resultados
   where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') and aberto_em is not null and fechado_em is null
  returning id into v_id;
  if v_id is null then return; end if;
  for r in select * from jsonb_array_elements(coalesce(p_resultados, '[]'::jsonb)) loop
    if (r->>'status')::int in (404, 410) then
      delete from public.agenda_exec_push where id = (r->>'subId')::bigint;
    elsif (r->>'status')::int between 200 and 299 then
      update public.agenda_exec_push set ultimo_ok = now(), ultimo_erro = null where id = (r->>'subId')::bigint;
    else
      update public.agenda_exec_push set ultimo_erro = left((r->>'status') || ' ' || coalesce(r->>'erro', ''), 200)
       where id = (r->>'subId')::bigint;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- permissões
do $$
declare f text;
begin
  foreach f in array array[
    'agenda_exec_usuarios_listar(text)', 'agenda_exec_criar_dona(text,text,text,text)', 'agenda_exec_entrar(text,bigint,text)',
    'agenda_exec_sair(text)', 'agenda_exec_eu(text)', 'agenda_exec_acessos(text)', 'agenda_exec_autorizar(text,text,text)',
    'agenda_exec_revogar(text,bigint)', 'agenda_exec_trocar_pin(text,text,text)', 'agenda_exec_listar(text,date,date)',
    'agenda_exec_salvar(text,bigint,text,date,text,text,text,text,boolean,boolean,int)', 'agenda_exec_concluir(text,bigint,boolean)',
    'agenda_exec_excluir(text,bigint)', 'agenda_exec_historico_listar(text)', 'agenda_exec_push_chave()',
    'agenda_exec_push_registrar(text,text,text,text,text)', 'agenda_exec_push_remover(text,text)', 'agenda_exec_push_status(text,text)',
    'agenda_exec_push_testar(text,int)', 'agenda_exec_lote_abrir(text)', 'agenda_exec_lote_fechar(text,jsonb)']
  loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
  foreach f in array array['_agx_sessao(text)', '_agx_json(public.agenda_exec_compromissos)', '_agx_enviar(jsonb)', 'agenda_exec_disparar()']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

-- Confere os avisos a cada minuto.
select cron.schedule('agenda-exec-avisos', '* * * * *', $$select public.agenda_exec_disparar()$$);
