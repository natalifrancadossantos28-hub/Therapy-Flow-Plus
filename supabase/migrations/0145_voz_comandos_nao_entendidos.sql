-- =============================================================================
-- 0145: Comando de voz por regras — log dos comandos não entendidos
-- =============================================================================
-- Quando o botão "Falar" não entende uma frase, ela fica guardada aqui para a
-- administração ver e acrescentar palavras ao dicionário (voz-dicionario.json).
-- Gravar: qualquer tela da empresa (só precisa do slug). Ler: administração.
-- =============================================================================

begin;

create table if not exists public.voz_comandos_nao_entendidos (
  id bigserial primary key,
  company_id bigint not null references public.ponto_companies(id) on delete cascade,
  professional_id bigint,
  tela text not null default '',
  frase text not null,
  created_at timestamptz not null default now()
);
create index if not exists voz_comandos_nao_entendidos_company_idx
  on public.voz_comandos_nao_entendidos (company_id, created_at desc);
alter table public.voz_comandos_nao_entendidos enable row level security;

create or replace function public.registrar_voz_nao_entendida(
  p_slug text, p_frase text, p_tela text default '', p_professional_id bigint default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
begin
  select id into v_company_id from public.ponto_companies
   where slug = lower(trim(p_slug)) and active = true limit 1;
  if v_company_id is null or nullif(btrim(coalesce(p_frase, '')), '') is null then return; end if;
  insert into public.voz_comandos_nao_entendidos (company_id, professional_id, tela, frase)
  values (v_company_id, p_professional_id, left(coalesce(p_tela, ''), 40), left(btrim(p_frase), 300));
  -- Guarda só os 2000 mais recentes por empresa.
  delete from public.voz_comandos_nao_entendidos
   where company_id = v_company_id
     and id < (select id from public.voz_comandos_nao_entendidos where company_id = v_company_id
                order by id desc offset 1999 limit 1);
end;
$$;

create or replace function public.listar_voz_nao_entendidas(p_slug text, p_password text, p_limite int default 200)
returns table (id bigint, professional_id bigint, tela text, frase text, created_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  return query
    select v.id, v.professional_id, v.tela, v.frase, v.created_at
      from public.voz_comandos_nao_entendidos v
     where v.company_id = v_company_id
     order by v.id desc
     limit greatest(1, least(coalesce(p_limite, 200), 2000));
end;
$$;

revoke all on function public.registrar_voz_nao_entendida(text, text, text, bigint) from public;
revoke all on function public.listar_voz_nao_entendidas(text, text, int) from public;
grant execute on function public.registrar_voz_nao_entendida(text, text, text, bigint) to anon, authenticated;
grant execute on function public.listar_voz_nao_entendidas(text, text, int) to anon, authenticated;

commit;

select 'ok: voz_comandos_nao_entendidos criada' as resultado;
