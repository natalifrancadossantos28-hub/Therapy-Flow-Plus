-- =============================================================================
-- 0045: Fix contagem de ocupação — abordagem allowlist
-- =============================================================================
--
-- Problema: list_professionals_capacity usava blocklist de status para excluir
--   agendamentos da contagem, mas faltavam 'remanejado' e 'remarcado'.
--   Quando um paciente era remanejado para outro profissional, o appointment
--   antigo (com status 'remanejado') continuava contando para o profissional
--   original, inflando a ocupação.
--
-- Solução: Troca blocklist (NOT IN) por allowlist (IN). Agora só conta
--   appointments com status 'agendado', 'atendimento' ou 'presente'.
--   Qualquer outro status (remanejado, remarcado, desmarcado, falta, etc.)
--   é automaticamente ignorado. Isso é mais seguro porque novos status
--   adicionados no futuro não inflam a contagem acidentalmente.
-- =============================================================================

create or replace function public.list_professionals_capacity(
  p_slug     text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_result     jsonb;
  v_today      text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  with active_counts as (
    select a.professional_id, count(distinct a.patient_id) as patients
      from public.appointments a
     where a.company_id = v_company_id
       and a."date" >= v_today
       and a.status in ('agendado', 'atendimento', 'presente')
     group by a.professional_id
  )
  select coalesce(jsonb_agg(payload order by sort_name asc), '[]'::jsonb)
    into v_result
    from (
      select
        lower(coalesce(p.name, '')) as sort_name,
        jsonb_build_object(
          'id',               p.id,
          'name',             p.name,
          'specialty',        p.specialty,
          'cargaHoraria',     coalesce(p.carga_horaria, '30h'),
          'maxPatients',      case
                                when coalesce(p.carga_horaria, '') ilike '20%' then 25
                                when coalesce(p.carga_horaria, '') ilike '30%' then 35
                                else 35
                              end,
          'currentPatients',  coalesce(ac.patients, 0)::int
        ) as payload
        from public.professionals p
        left join active_counts ac on ac.professional_id = p.id
       where p.company_id = v_company_id
    ) s;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

revoke all on function public.list_professionals_capacity(text, text) from public;
grant execute on function public.list_professionals_capacity(text, text) to anon, authenticated;
