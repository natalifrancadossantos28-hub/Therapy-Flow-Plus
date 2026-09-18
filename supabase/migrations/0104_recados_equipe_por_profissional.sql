-- 0104: Recados da Equipe — o profissional acompanha o status dos próprios recados
--
-- A administração já altera o status em "Recados da Equipe" (0103). Aqui só
-- entra a leitura pelo lado do profissional: lista apenas os recados enviados
-- por ele, com o status atual (pendente / em_andamento / resolvido).
--
-- As colunas de status são recriadas de forma idempotente para o caso de a
-- 0103 ainda não ter sido aplicada.

begin;

alter table public.recados_equipe
  add column if not exists status      text        not null default 'pendente',
  add column if not exists resolved_at timestamptz;

alter table public.recados_equipe
  drop constraint if exists recados_equipe_status_chk;
alter table public.recados_equipe
  add constraint recados_equipe_status_chk
  check (status in ('pendente', 'em_andamento', 'resolvido'));

create or replace function public._recado_to_json(r public.recados_equipe)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'id',               r.id,
    'professionalId',   r.professional_id,
    'professionalName', r.professional_name,
    'specialty',        r.specialty,
    'mensagem',         r.mensagem,
    'lido',             r.lido,
    'status',           coalesce(r.status, 'pendente'),
    'resolvedAt',       r.resolved_at,
    'createdAt',        r.created_at
  );
$$;

create index if not exists recados_equipe_professional_idx
  on public.recados_equipe (company_id, professional_id, created_at desc);

create or replace function public.list_recados_equipe_por_profissional(
  p_slug            text,
  p_password        text,
  p_professional_id bigint,
  p_limit           int default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_result     jsonb;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  if p_professional_id is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(t.j order by t.created_at desc, t.id desc), '[]'::jsonb)
    into v_result
    from (
      select public._recado_to_json(r) as j, r.created_at, r.id
        from public.recados_equipe r
       where r.company_id = v_company_id
         and r.professional_id = p_professional_id
       order by r.created_at desc, r.id desc
       limit greatest(coalesce(p_limit, 20), 1)
    ) t;

  return v_result;
end;
$$;

revoke all on function public.list_recados_equipe_por_profissional(text, text, bigint, int) from public;
grant  execute on function public.list_recados_equipe_por_profissional(text, text, bigint, int) to anon, authenticated;

commit;
