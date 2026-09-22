-- 0109: excluir recado da equipe
--
-- O profissional pode apagar um recado que ele mesmo enviou enquanto a
-- administração ainda não concluiu (status 'pendente' ou 'em_andamento').
-- Recado já 'resolvido' vira histórico e só a administração remove
-- (p_professional_id nulo = chamada da Administração, sem restrição).

begin;

create or replace function public.delete_recado_equipe(
  p_slug            text,
  p_password        text,
  p_id              bigint,
  p_professional_id bigint default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_row        public.recados_equipe%rowtype;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  select * into v_row
    from public.recados_equipe
   where id = p_id and company_id = v_company_id;

  if not found then raise exception 'Recado % não encontrado', p_id; end if;

  if p_professional_id is not null then
    if v_row.professional_id is distinct from p_professional_id then
      raise exception 'Este recado não pertence ao profissional informado';
    end if;
    if coalesce(v_row.status, 'pendente') = 'resolvido' then
      raise exception 'Recado já resolvido pela administração não pode ser excluído';
    end if;
  end if;

  delete from public.recados_equipe where id = p_id and company_id = v_company_id;
end;
$$;

revoke all on function public.delete_recado_equipe(text, text, bigint, bigint) from public;
grant  execute on function public.delete_recado_equipe(text, text, bigint, bigint) to anon, authenticated;

commit;
