-- =============================================================================
-- 0067: Transferir Agenda — reatribui os agendamentos de um profissional para
--       outro sem perder os horários/pacientes.
-- =============================================================================
--
-- Contexto: quando um profissional sai e outro assume os pacientes, antes era
-- preciso excluir o profissional antigo (o que apagava em cascata todos os
-- appointments dele, por causa do FK on delete cascade) e remontar a grade.
--
-- Esta função reatribui o professional_id dos appointments de origem -> destino,
-- mantendo data/hora/paciente/recorrência intactos. O nome do profissional na
-- agenda vem por JOIN com professionals (não é denormalizado), então atualizar
-- o professional_id já reflete o novo responsável em toda a UI.
--
-- p_only_future = true  -> move só os agendamentos de hoje em diante (preserva
--                          o histórico no nome do profissional antigo).
-- p_only_future = false -> move tudo (passado + futuro).
-- =============================================================================

begin;

create or replace function public.transfer_appointments(
  p_slug                  text,
  p_password              text,
  p_from_professional_id  bigint,
  p_to_professional_id    bigint,
  p_only_future           boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id  bigint;
  v_today       text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  v_from_exists boolean;
  v_to_exists   boolean;
  v_count       int;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  if p_from_professional_id is null or p_to_professional_id is null then
    raise exception 'Profissional de origem e destino são obrigatórios.';
  end if;
  if p_from_professional_id = p_to_professional_id then
    raise exception 'Profissional de origem e destino não podem ser o mesmo.';
  end if;

  select exists(
    select 1 from public.professionals
     where id = p_from_professional_id and company_id = v_company_id
  ) into v_from_exists;
  select exists(
    select 1 from public.professionals
     where id = p_to_professional_id and company_id = v_company_id
  ) into v_to_exists;

  if not v_from_exists then raise exception 'Profissional de origem não encontrado.'; end if;
  if not v_to_exists   then raise exception 'Profissional de destino não encontrado.'; end if;

  update public.appointments
     set professional_id = p_to_professional_id,
         updated_at      = now()
   where company_id      = v_company_id
     and professional_id = p_from_professional_id
     and (not p_only_future or "date" >= v_today);

  get diagnostics v_count = row_count;

  return jsonb_build_object('movedCount', v_count);
end;
$$;

revoke all on function public.transfer_appointments(text, text, bigint, bigint, boolean) from public;
grant execute on function public.transfer_appointments(text, text, bigint, bigint, boolean) to anon, authenticated;

commit;
