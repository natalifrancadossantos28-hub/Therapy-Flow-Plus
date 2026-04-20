-- Fase 6 - Portal unificado com 3 cards.
--
-- Expoe RPC publica `list_professionals_public(slug)` para o card Profissional
-- do Portal listar os nomes sem exigir senha da empresa. Retorna APENAS id,
-- nome e especialidade; nunca o PIN, email, telefone ou salario.
--
-- A verificacao do PIN continua usando `verify_professional_pin(slug, id, pin)`
-- que ja existe e tambem nao exige senha (apenas o PIN correto).

create or replace function public.list_professionals_public(
  p_slug text
)
returns table (
  id int,
  name text,
  specialty text
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.name, p.specialty
  from public.professionals p
  join public.companies c on c.id = p.company_id
  where c.slug = lower(p_slug)
  order by p.name asc;
$$;

grant execute on function public.list_professionals_public(text) to anon, authenticated;
