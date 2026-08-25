-- =========================================================================
-- 0089_patients_profissionais_ativos.sql
--
-- Desempenho da tela de Pacientes.
--
-- A listagem precisava apenas dos profissionais ativos de cada paciente
-- (coluna "Profissional" / selo "Multi"), mas buscava isso com
-- list_appointments(dateFrom = hoje) — sem data final. Isso trazia TODOS os
-- agendamentos futuros (dezenas de milhares de linhas, paginadas de 1000 em
-- 1000) e, para cada linha, executava o lateral _absence_stats_by_prof.
--
-- Esta função devolve uma linha por paciente com os nomes já agregados no
-- banco. Motoristas (transporte) não entram, pois não são atendimento clínico.
--
-- Somente leitura. Idempotente.
-- =========================================================================

begin;

-- A janela usada pela tela filtra por data + status.
create index if not exists idx_appointments_company_date_status
  on public.appointments (company_id, "date", status);

create or replace function public.list_patient_active_professionals(
  p_slug      text,
  p_password  text,
  p_date_from text default null,
  p_date_to   text default null
)
returns table (
  patient_id         bigint,
  professional_names text[]
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare v_company_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  return query
    select
      a.patient_id,
      array_agg(distinct coalesce(pr.name, ''))::text[] as professional_names
    from public.appointments a
    join public.professionals pr on pr.id = a.professional_id
    where a.company_id = v_company_id
      and a.status in ('agendado', 'atendimento', 'presente')
      and (p_date_from is null or a."date" >= p_date_from)
      and (p_date_to   is null or a."date" <= p_date_to)
      and coalesce(pr.specialty, '') !~* 'motorista|transporte'
    group by a.patient_id;
end;
$fn$;

revoke all on function public.list_patient_active_professionals(text, text, text, text) from public;
grant execute on function public.list_patient_active_professionals(text, text, text, text) to anon, authenticated;

-- A listagem também é paginada pelo cliente (o PostgREST corta em 1000 linhas),
-- o que exige ordem estável: created_at sozinho empata em cadastros importados.
create or replace function public.list_patients(
  p_slug            text,
  p_password        text,
  p_status          text   default null,
  p_professional_id bigint default null
)
returns setof public.patients
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare v_company_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  return query
    select *
      from public.patients p
     where p.company_id = v_company_id
       and (p_status is null or p.status = p_status)
       and (p_professional_id is null or p.professional_id = p_professional_id)
     order by p.created_at desc, p.id desc;
end;
$fn$;

analyze public.appointments;

commit;
