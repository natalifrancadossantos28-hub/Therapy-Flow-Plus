-- 0134 — Agenda da Cláudia: registro de "aviso visto" (botão "Ok, vi" no Android;
-- toque no aviso no iPhone). Aditiva: cria agenda_exec_avisos e recria só
-- _agx_enviar e _agx_json (mesma assinatura). Requer a 0133.

create table if not exists public.agenda_exec_avisos (
  ack        text        primary key,
  dona_id    bigint      not null references public.agenda_exec_usuarios(id) on delete cascade,
  tag        text,
  titulo     text,
  enviado_em timestamptz not null default now(),
  visto_em   timestamptz
);
create index if not exists agenda_exec_avisos_idx on public.agenda_exec_avisos (dona_id, enviado_em desc);
create index if not exists agenda_exec_avisos_tag_idx on public.agenda_exec_avisos (tag);
alter table public.agenda_exec_avisos enable row level security;

create or replace function public._agx_enviar(p_itens jsonb)
returns int language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_cfg public.agenda_exec_config%rowtype; v_envios jsonb; v_token text; v_itens jsonb := '[]'::jsonb; v_ack text; r record;
begin
  select * into v_cfg from public.agenda_exec_config where id = 1;
  if v_cfg.vapid_private is null then return -1; end if;
  for r in select value as i from jsonb_array_elements(p_itens) loop
    if exists (select 1 from public.agenda_exec_push p where p.usuario_id = (r.i->>'dona')::bigint) then
      v_ack := encode(gen_random_bytes(16), 'hex');
      insert into public.agenda_exec_avisos (ack, dona_id, tag, titulo) values (v_ack, (r.i->>'dona')::bigint, r.i->>'tag', r.i->>'title');
      v_itens := v_itens || jsonb_build_array(r.i || jsonb_build_object('ack', v_ack));
    end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('subId', p.id,
           'sub', jsonb_build_object('endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth),
           'payload', i - 'dona')), '[]'::jsonb)
    into v_envios
    from jsonb_array_elements(v_itens) i
    join public.agenda_exec_push p on p.usuario_id = (i->>'dona')::bigint;
  if jsonb_array_length(v_envios) = 0 then return 0; end if;
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.agenda_exec_lotes (token_hash, itens) values (encode(digest(v_token, 'sha256'), 'hex'), v_envios);
  perform net.http_post(url := v_cfg.push_url, body := jsonb_build_object('token', v_token),
    headers := jsonb_build_object('Content-Type', 'application/json'), timeout_milliseconds := 20000);
  return jsonb_array_length(v_envios);
end $$;

create or replace function public._agx_json(c public.agenda_exec_compromissos)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', c.id, 'titulo', c.titulo, 'data', to_char(c.data, 'YYYY-MM-DD'), 'hora', c.hora,
    'local', c.local, 'observacao', c.observacao, 'categoria', c.categoria,
    'avisarVespera', c.avisar_vespera, 'avisarDia', c.avisar_dia, 'antecedenciaMin', c.antecedencia_min,
    'concluido', c.concluido, 'createdAt', c.created_at, 'updatedAt', c.updated_at,
    'criadoPor', (select nome from public.agenda_exec_usuarios where id = c.criado_por),
    'atualizadoPor', (select nome from public.agenda_exec_usuarios where id = c.atualizado_por),
    'avisoVistoEm', (select max(visto_em) from public.agenda_exec_avisos where tag = 'c' || c.id and dona_id = c.dona_id));
$$;

-- Chamado pelo service worker (via /api/agenda/visto) com o código aleatório do aviso.
create or replace function public.agenda_exec_visto(p_ack text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.agenda_exec_avisos set visto_em = coalesce(visto_em, now()) where ack = p_ack;
  return found;
end $$;

revoke all on function public.agenda_exec_visto(text) from public;
grant execute on function public.agenda_exec_visto(text) to anon, authenticated;
revoke all on function public._agx_enviar(jsonb) from public, anon, authenticated;
revoke all on function public._agx_json(public.agenda_exec_compromissos) from public, anon, authenticated;
