-- =============================================================================
-- 0143: "Minhas Ausências" — o profissional cadastra as próprias ausências
-- =============================================================================
-- Usa a MESMA tabela `ausencias_profissional` da tela "Feriados & Ausências":
-- tudo que o profissional registra aparece para a administração e bloqueia a
-- agenda dele pelo mesmo caminho de hoje.
--
-- Permissão: as RPCs do profissional exigem o PIN dele e só enxergam/alteram
-- as linhas com o próprio professional_id. A administração continua com as
-- RPCs antigas (list/add/delete) e ganha `update_ausencia` para editar.
-- =============================================================================

begin;

alter table public.ausencias_profissional
  add column if not exists criado_por text not null default 'admin',
  add column if not exists updated_at timestamptz;

-- Valida slug + PIN e devolve o company_id (erro se inválido).
create or replace function public._verify_professional_pin_company(
  p_slug text, p_professional_id bigint, p_pin text
)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
begin
  select c.id into v_company_id
    from public.ponto_companies c
    join public.professionals p on p.company_id = c.id
   where c.slug = lower(trim(p_slug))
     and p.id = p_professional_id
     and p.pin is not null
     and p.pin = p_pin
   limit 1;
  if v_company_id is null then
    raise exception 'PIN inválido.' using errcode = '28P01';
  end if;
  return v_company_id;
end;
$$;

create or replace function public._check_periodo_ausencia(p_ini text, p_fim text, out v_ini date, out v_fim date)
language plpgsql
stable
as $$
begin
  v_ini := nullif(btrim(coalesce(p_ini, '')), '')::date;
  v_fim := nullif(btrim(coalesce(p_fim, '')), '')::date;
  if v_ini is null then
    raise exception 'Data inicial é obrigatória.';
  end if;
  if v_fim is null then v_fim := v_ini; end if;
  if v_fim < v_ini then
    raise exception 'A data final não pode ser anterior à inicial.';
  end if;
end;
$$;

-- ── Profissional: listar as próprias ─────────────────────────────────────────
create or replace function public.list_minhas_ausencias(
  p_slug text, p_professional_id bigint, p_pin text
)
returns setof public.ausencias_profissional
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
begin
  v_company_id := public._verify_professional_pin_company(p_slug, p_professional_id, p_pin);
  return query
    select * from public.ausencias_profissional
     where company_id = v_company_id and professional_id = p_professional_id
     order by data_inicio desc, id desc;
end;
$$;

-- ── Profissional: registrar ──────────────────────────────────────────────────
create or replace function public.add_minha_ausencia(
  p_slug text, p_professional_id bigint, p_pin text,
  p_data_inicio text, p_data_fim text, p_motivo text default ''
)
returns public.ausencias_profissional
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_p record;
  v_row public.ausencias_profissional%rowtype;
begin
  v_company_id := public._verify_professional_pin_company(p_slug, p_professional_id, p_pin);
  select * into v_p from public._check_periodo_ausencia(p_data_inicio, p_data_fim);
  insert into public.ausencias_profissional
    (company_id, professional_id, data_inicio, data_fim, motivo, criado_por)
  values
    (v_company_id, p_professional_id, v_p.v_ini, v_p.v_fim, btrim(coalesce(p_motivo, '')), 'profissional')
  returning * into v_row;
  return v_row;
end;
$$;

-- ── Profissional: editar a própria ───────────────────────────────────────────
create or replace function public.update_minha_ausencia(
  p_slug text, p_professional_id bigint, p_pin text, p_id bigint,
  p_data_inicio text, p_data_fim text, p_motivo text default ''
)
returns public.ausencias_profissional
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_p record;
  v_row public.ausencias_profissional%rowtype;
begin
  v_company_id := public._verify_professional_pin_company(p_slug, p_professional_id, p_pin);
  select * into v_p from public._check_periodo_ausencia(p_data_inicio, p_data_fim);
  update public.ausencias_profissional
     set data_inicio = v_p.v_ini, data_fim = v_p.v_fim,
         motivo = btrim(coalesce(p_motivo, '')), updated_at = now()
   where id = p_id and company_id = v_company_id and professional_id = p_professional_id
  returning * into v_row;
  if not found then
    raise exception 'Ausência não encontrada.';
  end if;
  return v_row;
end;
$$;

-- ── Profissional: cancelar a própria ─────────────────────────────────────────
create or replace function public.delete_minha_ausencia(
  p_slug text, p_professional_id bigint, p_pin text, p_id bigint
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
begin
  v_company_id := public._verify_professional_pin_company(p_slug, p_professional_id, p_pin);
  delete from public.ausencias_profissional
   where id = p_id and company_id = v_company_id and professional_id = p_professional_id;
  if not found then
    raise exception 'Ausência não encontrada.';
  end if;
end;
$$;

-- ── Administração: editar qualquer ausência ──────────────────────────────────
create or replace function public.update_ausencia(
  p_slug text, p_password text, p_id bigint,
  p_data_inicio text, p_data_fim text, p_motivo text default ''
)
returns public.ausencias_profissional
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_p record;
  v_row public.ausencias_profissional%rowtype;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  select * into v_p from public._check_periodo_ausencia(p_data_inicio, p_data_fim);
  update public.ausencias_profissional
     set data_inicio = v_p.v_ini, data_fim = v_p.v_fim,
         motivo = btrim(coalesce(p_motivo, '')), updated_at = now()
   where id = p_id and company_id = v_company_id
  returning * into v_row;
  if not found then
    raise exception 'Ausência não encontrada.';
  end if;
  return v_row;
end;
$$;

revoke all on function public._verify_professional_pin_company(text, bigint, text) from public, anon, authenticated;
revoke all on function public._check_periodo_ausencia(text, text) from public, anon, authenticated;
revoke all on function public.list_minhas_ausencias(text, bigint, text) from public;
revoke all on function public.add_minha_ausencia(text, bigint, text, text, text, text) from public;
revoke all on function public.update_minha_ausencia(text, bigint, text, bigint, text, text, text) from public;
revoke all on function public.delete_minha_ausencia(text, bigint, text, bigint) from public;
revoke all on function public.update_ausencia(text, text, bigint, text, text, text) from public;

grant execute on function public.list_minhas_ausencias(text, bigint, text) to anon, authenticated;
grant execute on function public.add_minha_ausencia(text, bigint, text, text, text, text) to anon, authenticated;
grant execute on function public.update_minha_ausencia(text, bigint, text, bigint, text, text, text) to anon, authenticated;
grant execute on function public.delete_minha_ausencia(text, bigint, text, bigint) to anon, authenticated;
grant execute on function public.update_ausencia(text, text, bigint, text, text, text) to anon, authenticated;

commit;
