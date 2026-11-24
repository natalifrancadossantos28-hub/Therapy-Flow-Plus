-- 0145 — Retorno da Busca Ativa em "Meus recados e o andamento"
--
-- Quando a equipe atualiza um caso da Fila de Busca Ativa (status, observação
-- ou "Finalizar e tirar da lista"), o profissional que encaminhou vê um card
-- com o andamento no seu perfil. É um card por caso, sempre com a última
-- atualização. O profissional pode apagar o card da lista dele (o caso continua
-- guardado para a gestão); se a equipe atualizar de novo, o card volta.
-- Também deixa o profissional apagar da lista dele os recados já resolvidos
-- (antes só dava para apagar os não resolvidos); a administração continua
-- vendo o histórico.

begin;

alter table public.busca_ativa_casos add column if not exists oculto_prof_at timestamptz;
alter table public.recados_equipe    add column if not exists oculto_prof_at timestamptz;

create or replace function public.update_busca_ativa_caso(
  p_slug text, p_password text, p_id bigint, p_status text, p_obs text default null, p_saida text default null
) returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_company_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  if p_status not in ('pendente','em_andamento','resolvido','nao_resolvido','finalizado') then
    raise exception 'Status de busca ativa inválido: %', p_status;
  end if;
  update public.busca_ativa_casos
     set status = p_status,
         obs = nullif(btrim(coalesce(p_obs, '')), ''),
         updated_at = now(),
         oculto_prof_at = null,
         finalizado_at = case when p_status = 'finalizado' then coalesce(finalizado_at, now()) end,
         saida = case when p_status = 'finalizado' then coalesce(nullif(btrim(coalesce(p_saida, '')), ''), 'Busca ativa finalizada') end
   where id = p_id and company_id = v_company_id;
  if not found then raise exception 'Caso de busca ativa não encontrado'; end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.update_busca_ativa_caso(text, text, bigint, text, text, text) from public;
grant execute on function public.update_busca_ativa_caso(text, text, bigint, text, text, text) to anon, authenticated;

-- Só aparece depois que a equipe mexeu no caso (status, observação ou
-- qualquer atualização, inclusive "Reabrir busca").
create or replace function public.list_busca_ativa_retornos_profissional(
  p_slug text, p_password text, p_professional_id bigint, p_limit int default 30
) returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_company_id bigint; v_out jsonb;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  if p_professional_id is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(t.j order by t.updated_at desc, t.id desc), '[]'::jsonb)
    into v_out
    from (
      select jsonb_build_object(
               'id', c.id, 'patientId', c.patient_id, 'patientName', coalesce(p.name, ''),
               'prontuario', p.prontuario, 'specialty', c.specialty, 'motivo', c.motivo,
               'status', c.status, 'obs', c.obs, 'saida', c.saida,
               'createdAt', c.created_at, 'updatedAt', c.updated_at, 'finalizadoAt', c.finalizado_at
             ) as j, c.updated_at, c.id
        from public.busca_ativa_casos c
        left join public.patients p on p.id = c.patient_id
       where c.company_id = v_company_id
         and c.professional_id = p_professional_id
         and c.oculto_prof_at is null
         and (c.status <> 'pendente' or c.obs is not null or c.updated_at > c.created_at)
       order by c.updated_at desc, c.id desc
       limit greatest(coalesce(p_limit, 30), 1)
    ) t;
  return v_out;
end $$;
revoke all on function public.list_busca_ativa_retornos_profissional(text, text, bigint, int) from public;
grant execute on function public.list_busca_ativa_retornos_profissional(text, text, bigint, int) to anon, authenticated;

create or replace function public.ocultar_busca_ativa_retorno(
  p_slug text, p_password text, p_id bigint, p_professional_id bigint
) returns void language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_company_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  update public.busca_ativa_casos
     set oculto_prof_at = now()
   where id = p_id and company_id = v_company_id and professional_id = p_professional_id;
  if not found then raise exception 'Retorno de busca ativa não encontrado'; end if;
end $$;
revoke all on function public.ocultar_busca_ativa_retorno(text, text, bigint, bigint) from public;
grant execute on function public.ocultar_busca_ativa_retorno(text, text, bigint, bigint) to anon, authenticated;

-- Só tira da lista do profissional; nunca apaga. Se a administração já
-- reabriu o recado, recusa (o portal recarrega a lista).
create or replace function public.ocultar_recado_equipe(
  p_slug text, p_password text, p_id bigint, p_professional_id bigint
) returns void language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_company_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  update public.recados_equipe
     set oculto_prof_at = now()
   where id = p_id and company_id = v_company_id
     and professional_id = p_professional_id
     and coalesce(status, 'pendente') = 'resolvido';
  if not found then raise exception 'Este recado não está mais resolvido. Atualize a lista.'; end if;
end $$;
revoke all on function public.ocultar_recado_equipe(text, text, bigint, bigint) from public;
grant execute on function public.ocultar_recado_equipe(text, text, bigint, bigint) to anon, authenticated;

-- Recado resolvido: o profissional tira da lista dele; a administração mantém.
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
      update public.recados_equipe set oculto_prof_at = now()
       where id = p_id and company_id = v_company_id;
      return;
    end if;
  end if;

  delete from public.recados_equipe where id = p_id and company_id = v_company_id;
end;
$$;

revoke all on function public.delete_recado_equipe(text, text, bigint, bigint) from public;
grant  execute on function public.delete_recado_equipe(text, text, bigint, bigint) to anon, authenticated;

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
         and r.oculto_prof_at is null
       order by r.created_at desc, r.id desc
       limit greatest(coalesce(p_limit, 20), 1)
    ) t;

  return v_result;
end;
$$;

revoke all on function public.list_recados_equipe_por_profissional(text, text, bigint, int) from public;
grant  execute on function public.list_recados_equipe_por_profissional(text, text, bigint, int) to anon, authenticated;

commit;
