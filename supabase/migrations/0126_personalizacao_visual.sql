-- =========================================================================
-- 0126_personalizacao_visual.sql
--
-- Personalização Visual (Configurações → Personalização Visual).
-- Fundo da tela inicial definido pela administração e igual para todos
-- os usuários e dispositivos.
--   * Modo "fixed": uma imagem fica até o admin trocar.
--   * Modo "daily": troca sozinha a cada dia (horário de Brasília), em
--     sequência, aleatória sem repetir até fechar o ciclo, ou por dia
--     da semana. O cálculo é feito aqui no servidor, então funciona sem
--     nenhum admin conectado.
--
-- Referências de imagem: 'builtin:<id>' (imagens que vêm com o app) ou
-- 'custom:<id>' (imagens enviadas pelo admin, guardadas em visual_images).
--
-- Gravação (salvar, enviar, excluir) exige a senha REAL de administrador
-- da empresa ou a senha do Painel Master; o token interno '__noauth__'
-- não é aceito. Leitura do fundo do dia é pública (tela inicial).
--
-- Só cria tabelas/funções novas. Não altera nem apaga dados existentes.
-- =========================================================================

begin;

create table if not exists public.visual_settings (
  company_id bigint      primary key references public.ponto_companies(id) on delete cascade,
  config     jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.visual_settings enable row level security;

create table if not exists public.visual_images (
  id         bigserial   primary key,
  company_id bigint      not null references public.ponto_companies(id) on delete cascade,
  name       text        not null,
  image_data text        not null,
  thumb_data text        not null,
  created_at timestamptz not null default now()
);
create index if not exists visual_images_company_idx on public.visual_images (company_id, created_at);
alter table public.visual_images enable row level security;

-- ── Autorização forte (gravação) ───────────────────────────────────────────
create or replace function public._verify_visual_admin(p_slug text, p_password text)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id   bigint;
  v_hash text;
  v_master text;
begin
  if p_slug is null or p_password is null or btrim(p_password) = '' or p_password = '__noauth__' then
    raise exception 'Senha de administrador incorreta.' using errcode = '28P01';
  end if;

  select id, admin_password_hash into v_id, v_hash
    from public.ponto_companies
   where slug = lower(trim(p_slug)) and active = true
   limit 1;
  if v_id is null then
    raise exception 'Senha de administrador incorreta.' using errcode = '28P01';
  end if;

  if v_hash is not null and v_hash = crypt(p_password, v_hash) then
    return v_id;
  end if;

  if to_regclass('public.ponto_master_config') is not null then
    execute 'select password_hash from public.ponto_master_config where id = 1 limit 1' into v_master;
    if v_master is not null and v_master = crypt(p_password, v_master) then
      return v_id;
    end if;
  end if;

  raise exception 'Senha de administrador incorreta.' using errcode = '28P01';
end;
$$;
revoke all on function public._verify_visual_admin(text, text) from public;

-- ── Normaliza a configuração recebida ──────────────────────────────────────
create or replace function public._visual_clean_config(p_company_id bigint, p_config jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_cfg   jsonb := coalesce(p_config, '{}'::jsonb);
  v_mode  text  := coalesce(v_cfg->>'mode', 'fixed');
  v_order text  := coalesce(v_cfg->>'order', 'seq');
  v_veil  int;
  v_rot   jsonb;
  v_week  jsonb := '{}'::jsonb;
  d       int;
  r       text;
begin
  if v_mode not in ('fixed', 'daily') then v_mode := 'fixed'; end if;
  if v_order not in ('seq', 'random', 'week') then v_order := 'seq'; end if;
  begin
    v_veil := (v_cfg->>'veil')::int;
  exception when others then v_veil := null;
  end;
  v_veil := greatest(20, least(80, coalesce(v_veil, 45)));

  select coalesce(jsonb_agg(x.ref order by x.ord), '[]'::jsonb) into v_rot
    from (
      select distinct on (e.ref) e.ref, e.ord
        from jsonb_array_elements_text(
               case when jsonb_typeof(v_cfg->'rotation') = 'array' then v_cfg->'rotation' else '[]'::jsonb end
             ) with ordinality as e(ref, ord)
       where public._visual_ref_ok(p_company_id, e.ref)
       order by e.ref, e.ord
    ) x;

  for d in 1..7 loop
    r := v_cfg->'week'->>d::text;
    if r is not null and public._visual_ref_ok(p_company_id, r) then
      v_week := v_week || jsonb_build_object(d::text, r);
    end if;
  end loop;

  r := v_cfg->>'fixed';
  if r is null or not public._visual_ref_ok(p_company_id, r) then r := 'builtin:clinica'; end if;

  return jsonb_build_object('mode', v_mode, 'order', v_order, 'veil', v_veil,
                            'fixed', r, 'rotation', v_rot, 'week', v_week);
end;
$$;
revoke all on function public._visual_clean_config(bigint, jsonb) from public;

create or replace function public._visual_ref_ok(p_company_id bigint, p_ref text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_ref ~ '^builtin:[a-z0-9-]{1,40}$' then true
    when p_ref ~ '^custom:[0-9]{1,18}$' then exists (
      select 1 from public.visual_images
       where company_id = p_company_id and id = substring(p_ref from 8)::bigint)
    else false
  end;
$$;
revoke all on function public._visual_ref_ok(bigint, text) from public;

-- ── Qual imagem aparece num dia (função pura sobre a config) ───────────────
create or replace function public._visual_pick(p_config jsonb, p_day date)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_fixed text := coalesce(p_config->>'fixed', 'builtin:clinica');
  v_order text := coalesce(p_config->>'order', 'seq');
  v_idx   int  := p_day - date '1970-01-01';
  v_arr   text[];
  v_n     int;
  v_ref   text;
begin
  if coalesce(p_config->>'mode', 'fixed') <> 'daily' then
    return v_fixed;
  end if;

  if v_order = 'week' then
    v_ref := p_config->'week'->>(extract(isodow from p_day)::int)::text;
    return coalesce(v_ref, v_fixed);
  end if;

  select array_agg(e order by o) into v_arr
    from jsonb_array_elements_text(coalesce(p_config->'rotation', '[]'::jsonb)) with ordinality as t(e, o);
  v_n := coalesce(cardinality(v_arr), 0);
  if v_n = 0 then
    return v_fixed;
  end if;

  if v_order = 'random' then
    -- Embaralha de forma determinística por ciclo: cada imagem aparece uma
    -- vez por ciclo de N dias; no ciclo seguinte a ordem muda.
    select e into v_ref
      from unnest(v_arr) as e
     order by md5((v_idx / v_n)::text || ':' || e), e
    offset (v_idx % v_n) limit 1;
    return v_ref;
  end if;

  return v_arr[(v_idx % v_n) + 1];
end;
$$;

create or replace function public._visual_today()
returns date
language sql
stable
as $$ select (now() at time zone 'America/Sao_Paulo')::date; $$;

create or replace function public._visual_company_config(p_company_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public._visual_clean_config(p_company_id,
           (select config from public.visual_settings where company_id = p_company_id));
$$;
revoke all on function public._visual_company_config(bigint) from public;

-- ── Público: fundo de hoje da tela inicial ─────────────────────────────────
create or replace function public.get_visual_background(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_id  bigint;
  v_cfg jsonb;
  v_day date := public._visual_today();
begin
  select id into v_id from public.ponto_companies
   where slug = lower(trim(p_slug)) and active = true limit 1;
  if v_id is null then
    return jsonb_build_object('ref', 'builtin:clinica', 'veil', 45, 'mode', 'fixed', 'date', v_day);
  end if;
  v_cfg := public._visual_company_config(v_id);
  return jsonb_build_object('ref', public._visual_pick(v_cfg, v_day), 'veil', v_cfg->'veil',
                            'mode', v_cfg->>'mode', 'date', v_day);
end;
$$;
revoke all on function public.get_visual_background(text) from public;
grant  execute on function public.get_visual_background(text) to anon, authenticated;

-- Público: devolve a imagem enviada SOMENTE se ela for o fundo de hoje.
create or replace function public.get_visual_background_image(p_slug text, p_id bigint)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_id bigint;
begin
  select id into v_id from public.ponto_companies
   where slug = lower(trim(p_slug)) and active = true limit 1;
  if v_id is null then return null; end if;
  if public._visual_pick(public._visual_company_config(v_id), public._visual_today()) <> 'custom:' || p_id then
    return null;
  end if;
  return (select image_data from public.visual_images where company_id = v_id and id = p_id);
end;
$$;
revoke all on function public.get_visual_background_image(text, bigint) from public;
grant  execute on function public.get_visual_background_image(text, bigint) to anon, authenticated;

-- ── Admin (leitura) ────────────────────────────────────────────────────────
create or replace function public.get_visual_settings(p_slug text, p_password text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id bigint := public._verify_company_admin(p_slug, p_password);
begin
  return jsonb_build_object(
    'config', public._visual_company_config(v_id),
    'today', public._visual_today(),
    'images', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'thumb', thumb_data, 'createdAt', created_at)
                       order by created_at)
        from public.visual_images where company_id = v_id), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_visual_settings(text, text) from public;
grant  execute on function public.get_visual_settings(text, text) to anon, authenticated;

create or replace function public.get_visual_image(p_slug text, p_password text, p_id bigint)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id bigint := public._verify_company_admin(p_slug, p_password);
begin
  return (select image_data from public.visual_images where company_id = v_id and id = p_id);
end;
$$;
revoke all on function public.get_visual_image(text, text, bigint) from public;
grant  execute on function public.get_visual_image(text, text, bigint) to anon, authenticated;

-- Próximos dias para uma config (ainda não salva) — pré-visualização.
create or replace function public.preview_visual_schedule(p_slug text, p_password text, p_config jsonb, p_days int default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id  bigint := public._verify_company_admin(p_slug, p_password);
  v_cfg jsonb  := public._visual_clean_config(v_id, p_config);
  v_day date   := public._visual_today();
begin
  return (
    select jsonb_agg(jsonb_build_object('date', v_day + g, 'ref', public._visual_pick(v_cfg, v_day + g)) order by g)
      from generate_series(0, greatest(1, least(coalesce(p_days, 10), 31)) - 1) g
  );
end;
$$;
revoke all on function public.preview_visual_schedule(text, text, jsonb, int) from public;
grant  execute on function public.preview_visual_schedule(text, text, jsonb, int) to anon, authenticated;

-- ── Admin (gravação — senha real obrigatória) ──────────────────────────────
create or replace function public.verify_visual_admin(p_slug text, p_admin_password text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform public._verify_visual_admin(p_slug, p_admin_password);
  return true;
end;
$$;
revoke all on function public.verify_visual_admin(text, text) from public;
grant  execute on function public.verify_visual_admin(text, text) to anon, authenticated;

create or replace function public.save_visual_settings(p_slug text, p_admin_password text, p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id  bigint := public._verify_visual_admin(p_slug, p_admin_password);
  v_cfg jsonb  := public._visual_clean_config(v_id, p_config);
begin
  insert into public.visual_settings (company_id, config, updated_at)
  values (v_id, v_cfg, now())
  on conflict (company_id) do update set config = excluded.config, updated_at = now();
  return v_cfg;
end;
$$;
revoke all on function public.save_visual_settings(text, text, jsonb) from public;
grant  execute on function public.save_visual_settings(text, text, jsonb) to anon, authenticated;

create or replace function public.add_visual_image(p_slug text, p_admin_password text, p_name text, p_image text, p_thumb text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id  bigint := public._verify_visual_admin(p_slug, p_admin_password);
  v_row public.visual_images%rowtype;
begin
  if p_image is null or p_image !~ '^data:image/(jpeg|png|webp);base64,' or length(p_image) > 4000000 then
    raise exception 'Imagem inválida ou muito grande.';
  end if;
  if p_thumb is null or p_thumb !~ '^data:image/(jpeg|png|webp);base64,' or length(p_thumb) > 300000 then
    raise exception 'Miniatura inválida.';
  end if;
  if (select count(*) from public.visual_images where company_id = v_id) >= 40 then
    raise exception 'Limite de 40 imagens próprias atingido. Exclua alguma antes.';
  end if;
  insert into public.visual_images (company_id, name, image_data, thumb_data)
  values (v_id, left(coalesce(nullif(btrim(p_name), ''), 'Minha imagem'), 60), p_image, p_thumb)
  returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'name', v_row.name, 'thumb', v_row.thumb_data, 'createdAt', v_row.created_at);
end;
$$;
revoke all on function public.add_visual_image(text, text, text, text, text) from public;
grant  execute on function public.add_visual_image(text, text, text, text, text) to anon, authenticated;

create or replace function public.delete_visual_image(p_slug text, p_admin_password text, p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id bigint := public._verify_visual_admin(p_slug, p_admin_password);
  v_cfg jsonb;
begin
  delete from public.visual_images where company_id = v_id and id = p_id;
  -- Remove referências à imagem excluída (cai no padrão quando necessário).
  v_cfg := public._visual_company_config(v_id);
  update public.visual_settings set config = v_cfg, updated_at = now() where company_id = v_id;
  return v_cfg;
end;
$$;
revoke all on function public.delete_visual_image(text, text, bigint) from public;
grant  execute on function public.delete_visual_image(text, text, bigint) to anon, authenticated;

commit;
