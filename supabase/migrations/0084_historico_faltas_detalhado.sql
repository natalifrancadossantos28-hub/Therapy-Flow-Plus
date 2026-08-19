-- =========================================================================
-- 0084_historico_faltas_detalhado.sql
--
-- O card "Faltas" da ficha do paciente mostrava "N registradas" e logo abaixo
-- "Nenhum histórico de falta": a get_patient_absences (0007) sempre devolvia
-- 'absences' => '[]'. Agora ela devolve o histórico real, com data, horário,
-- especialidade e profissional de cada falta, mais o resumo por especialidade
-- (ex.: 2 em Fisioterapia, 1 em Fonoaudiologia).
--
-- Somente leitura: não altera agendamentos nem contadores.
-- =========================================================================

begin;

create or replace function public.get_patient_absences(
  p_slug     text,
  p_password text,
  p_id       bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id  bigint;
  v_patient     public.patients%rowtype;
  v_absences    jsonb;
  v_by_spec     jsonb;
  v_total       int;
  v_nao_just    int;
  v_just        int;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  select * into v_patient from public.patients
   where id = p_id and company_id = v_company_id;
  if not found then raise exception 'patient not found'; end if;

  with faltas as (
    select
      a.id,
      a."date"  as data,
      a."time"  as hora,
      lower(a.status) as status,
      lower(a.status) = 'falta_justificada' as justificada,
      coalesce(nullif(btrim(pr.specialty), ''), 'Sem especialidade') as specialty,
      coalesce(nullif(btrim(pr.name), ''), 'Sem profissional')       as professional_name,
      pr.id as professional_id
    from public.appointments a
    left join public.professionals pr
      on pr.id = a.professional_id
     and pr.company_id = a.company_id
   where a.company_id = v_company_id
     and a.patient_id = p_id
     and lower(a.status) in ('ausente', 'falta', 'falta_nao_justificada', 'falta_justificada')
  )
  select
    coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id',               f.id,
                 'date',             f.data,
                 'time',             f.hora,
                 'status',           f.status,
                 'justificada',      f.justificada,
                 'specialty',        f.specialty,
                 'professionalId',   f.professional_id,
                 'professionalName', f.professional_name
               )
               order by f.data desc, f.hora desc
             )
        from faltas f
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'specialty',            s.specialty,
                 'total',                s.total,
                 'naoJustificadas',      s.nao_just,
                 'justificadas',         s.just,
                 'professionals',        s.profs
               )
               order by s.nao_just desc, s.total desc, s.specialty asc
             )
        from (
          select
            f.specialty,
            count(*)::int                                      as total,
            count(*) filter (where not f.justificada)::int      as nao_just,
            count(*) filter (where f.justificada)::int          as just,
            (select jsonb_agg(distinct f2.professional_name)
               from faltas f2 where f2.specialty = f.specialty) as profs
          from faltas f
          group by f.specialty
        ) s
    ), '[]'::jsonb),
    (select count(*)::int from faltas),
    (select count(*)::int from faltas where not justificada),
    (select count(*)::int from faltas where justificada)
  into v_absences, v_by_spec, v_total, v_nao_just, v_just;

  return jsonb_build_object(
    'patientId',            v_patient.id,
    'patientName',          v_patient.name,
    'absenceCount',         v_patient.absence_count,
    'hasWarning',           coalesce(v_patient.absence_count, 0) >= 3,
    'totalRegistros',       v_total,
    'naoJustificadas',      v_nao_just,
    'justificadas',         v_just,
    'porEspecialidade',     v_by_spec,
    'absences',             v_absences
  );
end;
$$;

revoke all on function public.get_patient_absences(text, text, bigint) from public;
grant execute on function public.get_patient_absences(text, text, bigint) to anon, authenticated;

commit;
