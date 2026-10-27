-- 0130 — Agenda Administrativa: compromissos e reuniões da Administração, com
-- aviso dentro do sistema antes do horário. Aditiva e idempotente: só cria a
-- tabela admin_compromissos e as funções abaixo; não altera nenhum dado existente.

create table if not exists public.admin_compromissos (
  id               bigserial   primary key,
  company_id       bigint      not null references public.ponto_companies(id) on delete cascade,
  titulo           text        not null,
  data             date        not null,
  hora             text        not null check (hora ~ '^\d{2}:\d{2}$'),
  local            text,
  observacao       text,
  antecedencia_min int         not null default 30 check (antecedencia_min between 0 and 10080),
  concluido        boolean     not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists admin_compromissos_idx on public.admin_compromissos (company_id, data, hora);

create or replace function public._adm_comp_json(c public.admin_compromissos)
returns jsonb language sql immutable as $$
  select jsonb_build_object('id', c.id, 'titulo', c.titulo, 'data', to_char(c.data, 'YYYY-MM-DD'), 'hora', c.hora,
    'local', c.local, 'observacao', c.observacao, 'antecedenciaMin', c.antecedencia_min,
    'concluido', c.concluido, 'createdAt', c.created_at);
$$;

create or replace function public.list_admin_compromissos(p_slug text, p_password text, p_from date default null, p_to date default null)
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_company_id bigint; v_result jsonb;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  select coalesce(jsonb_agg(public._adm_comp_json(c) order by c.data, c.hora), '[]'::jsonb) into v_result
    from public.admin_compromissos c
   where c.company_id = v_company_id
     and (p_from is null or c.data >= p_from)
     and (p_to is null or c.data <= p_to);
  return v_result;
end;
$$;
revoke all on function public.list_admin_compromissos(text, text, date, date) from public;
grant execute on function public.list_admin_compromissos(text, text, date, date) to anon, authenticated;

create or replace function public.save_admin_compromisso(
  p_slug text, p_password text, p_id bigint, p_titulo text, p_data date, p_hora text,
  p_local text default null, p_observacao text default null, p_antecedencia_min int default 30
)
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_company_id bigint; v_row public.admin_compromissos%rowtype;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  if nullif(btrim(coalesce(p_titulo, '')), '') is null then raise exception 'informe o título'; end if;
  if p_data is null or p_hora is null or p_hora !~ '^\d{2}:\d{2}$' then raise exception 'data ou hora inválida'; end if;
  if p_id is null then
    insert into public.admin_compromissos (company_id, titulo, data, hora, local, observacao, antecedencia_min)
    values (v_company_id, btrim(p_titulo), p_data, p_hora, nullif(btrim(coalesce(p_local, '')), ''),
            nullif(btrim(coalesce(p_observacao, '')), ''), coalesce(p_antecedencia_min, 30))
    returning * into v_row;
  else
    update public.admin_compromissos set titulo = btrim(p_titulo), data = p_data, hora = p_hora,
      local = nullif(btrim(coalesce(p_local, '')), ''), observacao = nullif(btrim(coalesce(p_observacao, '')), ''),
      antecedencia_min = coalesce(p_antecedencia_min, 30), updated_at = now()
     where id = p_id and company_id = v_company_id
    returning * into v_row;
    if not found then raise exception 'compromisso não encontrado'; end if;
  end if;
  return public._adm_comp_json(v_row);
end;
$$;
revoke all on function public.save_admin_compromisso(text, text, bigint, text, date, text, text, text, int) from public;
grant execute on function public.save_admin_compromisso(text, text, bigint, text, date, text, text, text, int) to anon, authenticated;

create or replace function public.set_admin_compromisso_concluido(p_slug text, p_password text, p_id bigint, p_concluido boolean)
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_company_id bigint; v_row public.admin_compromissos%rowtype;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  update public.admin_compromissos set concluido = coalesce(p_concluido, true), updated_at = now()
   where id = p_id and company_id = v_company_id returning * into v_row;
  if not found then raise exception 'compromisso não encontrado'; end if;
  return public._adm_comp_json(v_row);
end;
$$;
revoke all on function public.set_admin_compromisso_concluido(text, text, bigint, boolean) from public;
grant execute on function public.set_admin_compromisso_concluido(text, text, bigint, boolean) to anon, authenticated;

create or replace function public.delete_admin_compromisso(p_slug text, p_password text, p_id bigint)
returns boolean language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_company_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  delete from public.admin_compromissos where id = p_id and company_id = v_company_id;
  return found;
end;
$$;
revoke all on function public.delete_admin_compromisso(text, text, bigint) from public;
grant execute on function public.delete_admin_compromisso(text, text, bigint) to anon, authenticated;
