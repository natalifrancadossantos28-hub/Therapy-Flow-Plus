-- 0139 — Minha Agenda: o painel de avisos mostra cada aparelho da dona e se o último aviso chegou.
-- Só leitura: não muda nenhum dado.
create or replace function public.agenda_exec_push_status(p_token text, p_endpoint text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_u public.agenda_exec_usuarios%rowtype;
begin
  v_u := public._agx_sessao(p_token);
  return jsonb_build_object(
    'configurado', exists (select 1 from public.agenda_exec_config where id = 1 and vapid_private is not null),
    'aparelhos', (select count(*) from public.agenda_exec_push where usuario_id = coalesce(v_u.dona_id, v_u.id)),
    'esteAparelho', (select jsonb_build_object('ultimoOk', ultimo_ok, 'ultimoErro', ultimo_erro)
                       from public.agenda_exec_push where endpoint = p_endpoint and usuario_id = v_u.id),
    'lista', coalesce((select jsonb_agg(jsonb_build_object(
                 'aparelho', coalesce(p.aparelho, 'Aparelho'), 'desde', p.created_at,
                 'ultimoOk', p.ultimo_ok, 'ultimoErro', p.ultimo_erro, 'esteAparelho', p.endpoint = p_endpoint)
                 order by p.created_at)
               from public.agenda_exec_push p where p.usuario_id = coalesce(v_u.dona_id, v_u.id)), '[]'::jsonb));
end $$;
revoke all on function public.agenda_exec_push_status(text, text) from public;
grant execute on function public.agenda_exec_push_status(text, text) to anon, authenticated;
