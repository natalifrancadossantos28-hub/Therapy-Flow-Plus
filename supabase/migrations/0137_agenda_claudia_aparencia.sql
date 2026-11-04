-- 0137 — Minha Agenda: aparência personalizada por pessoa (papel de parede,
-- brilho, desfoque, véu, transparência dos cartões). Vale em todos os aparelhos
-- de quem entrou com o PIN. Aditiva e idempotente: só cria tabela/funções novas.

create table if not exists public.agenda_exec_aparencia (
  usuario_id  bigint      primary key references public.agenda_exec_usuarios(id) on delete cascade,
  prefs       jsonb       not null default '{}'::jsonb,
  foto        text        check (foto is null or (foto like 'data:image/%' and length(foto) <= 3000000)),
  updated_at  timestamptz not null default now()
);
alter table public.agenda_exec_aparencia enable row level security;

create or replace function public.agenda_exec_aparencia_ler(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_u public.agenda_exec_usuarios%rowtype; v_a public.agenda_exec_aparencia%rowtype;
begin
  v_u := public._agx_sessao(p_token);
  select * into v_a from public.agenda_exec_aparencia where usuario_id = v_u.id;
  if not found then return null; end if;
  return jsonb_build_object('prefs', v_a.prefs, 'foto', v_a.foto, 'updatedAt', v_a.updated_at);
end $$;

-- p_foto: null = mantém a foto atual; '' = apaga; 'data:image/...' = troca.
create or replace function public.agenda_exec_aparencia_salvar(p_token text, p_prefs jsonb, p_foto text default null)
returns void language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_u public.agenda_exec_usuarios%rowtype;
begin
  v_u := public._agx_sessao(p_token);
  if p_prefs is null or jsonb_typeof(p_prefs) <> 'object' or length(p_prefs::text) > 4000 then
    raise exception 'preferências inválidas';
  end if;
  insert into public.agenda_exec_aparencia (usuario_id, prefs, foto, updated_at)
  values (v_u.id, p_prefs, nullif(p_foto, ''), now())
  on conflict (usuario_id) do update
    set prefs = excluded.prefs,
        foto = case when p_foto is null then public.agenda_exec_aparencia.foto else nullif(p_foto, '') end,
        updated_at = now();
end $$;

revoke all on function public.agenda_exec_aparencia_ler(text) from public;
revoke all on function public.agenda_exec_aparencia_salvar(text, jsonb, text) from public;
grant execute on function public.agenda_exec_aparencia_ler(text) to anon, authenticated;
grant execute on function public.agenda_exec_aparencia_salvar(text, jsonb, text) to anon, authenticated;
