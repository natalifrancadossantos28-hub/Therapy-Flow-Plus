-- 0103: Recados da Equipe — status de atendimento (pendente / em_andamento / resolvido)
--
-- Além de lido/não lido, cada recado ganha um status de tratamento para a
-- gestão saber o que ainda precisa ser feito. Status inicial: 'pendente'.

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

create or replace function public.set_recado_equipe_status(
  p_slug     text,
  p_password text,
  p_id       bigint,
  p_status   text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_status     text := lower(btrim(coalesce(p_status, '')));
  v_row        public.recados_equipe%rowtype;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  if v_status not in ('pendente', 'em_andamento', 'resolvido') then
    raise exception 'Status inválido: %', p_status;
  end if;

  update public.recados_equipe
     set status      = v_status,
         lido        = case when v_status = 'pendente' then lido else true end,
         resolved_at = case when v_status = 'resolvido' then now() else null end
   where id = p_id and company_id = v_company_id
   returning * into v_row;

  if not found then raise exception 'Recado % não encontrado', p_id; end if;

  return public._recado_to_json(v_row);
end;
$$;

revoke all on function public.set_recado_equipe_status(text, text, bigint, text) from public;
grant  execute on function public.set_recado_equipe_status(text, text, bigint, text) to anon, authenticated;

commit;
