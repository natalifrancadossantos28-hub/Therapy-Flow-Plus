-- =============================================================================
-- 0043: Fix "Excluir Agendamento" — ocupação + status do paciente
-- =============================================================================
--
-- Bug 1: list_professionals_capacity contava agendamentos históricos (passados),
--   inflando o número de ocupação (ex: Elisa 34/35 mesmo após excluir pacientes).
--   Agora conta apenas appointments com date >= hoje.
--   Também corrige a lista de status excluídos para incluir
--   falta_justificada e falta_nao_justificada.
--
-- Bug 2: Ao excluir um agendamento, o status do paciente continuava "Atendimento"
--   mesmo sem ter mais agenda. Agora um trigger AFTER DELETE verifica se o paciente
--   ainda tem appointments ativas. Se não tiver, volta para "Fila de Espera".
-- =============================================================================

begin;

-- ═══════════════════════════════════════════════════════════════════
-- Fix 1: list_professionals_capacity — somente appointments futuras
-- ═══════════════════════════════════════════════════════════════════

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
       and a.status not in (
             'desmarcado','cancelado','alta',
             'falta','falta_justificada','falta_nao_justificada','ausente'
           )
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

-- ═══════════════════════════════════════════════════════════════════
-- Fix 2: Trigger AFTER DELETE — reseta status do paciente para
-- "Fila de Espera" quando não sobram appointments ativas.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public._tg_appointments_after_delete_sync_status()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_has_active boolean;
  v_today      text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
begin
  select exists(
    select 1 from public.appointments a
     where a.patient_id = old.patient_id
       and a.company_id = old.company_id
       and a."date" >= v_today
       and a.status not in (
             'desmarcado','cancelado','alta',
             'falta','falta_justificada','falta_nao_justificada','ausente'
           )
  ) into v_has_active;

  if not v_has_active then
    update public.patients
       set status     = 'Fila de Espera',
           updated_at = now()
     where id = old.patient_id
       and company_id = old.company_id
       and coalesce(status, '') = 'Atendimento';
  end if;

  return old;
end;
$$;

drop trigger if exists tg_appointments_after_delete_sync_status on public.appointments;
create trigger tg_appointments_after_delete_sync_status
  after delete on public.appointments
  for each row
  execute function public._tg_appointments_after_delete_sync_status();

commit;
