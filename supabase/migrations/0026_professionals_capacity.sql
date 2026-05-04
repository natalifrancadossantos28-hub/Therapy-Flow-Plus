-- 0026_professionals_capacity.sql
-- Indicador de capacidade dos profissionais no dashboard do Admin.
--
-- A coluna professionals.carga_horaria ja existe (text, ex '20h' / '30h').
-- Este migration so adiciona a RPC list_professionals_capacity que devolve,
-- por profissional da empresa, quantos pacientes UNICOS tem agendamento
-- ativo e qual a capacidade maxima conforme a carga horaria.
--
-- Regras de negocio:
--   * Capacidade: 30h => 35, 20h => 25, default => 35.
--   * Paciente "ativo" = ao menos 1 appointment do profissional com status
--     diferente de 'desmarcado', 'cancelado', 'alta' e 'falta'.
--   * Conta pacientes UNICOS (distinct patient_id), nao agendamentos.

begin;

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
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  with active_counts as (
    select a.professional_id, count(distinct a.patient_id) as patients
      from public.appointments a
     where a.company_id = v_company_id
       and a.status not in ('desmarcado','cancelado','alta','falta')
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

commit;
