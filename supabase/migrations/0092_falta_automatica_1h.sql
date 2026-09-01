-- =========================================================================
-- 0092: auto_marcar_faltas
-- Marca falta sem justificativa nos atendimentos de hoje que passaram de
-- 1 hora do horário agendado e continuam sem marcação da recepção.
-- Presença, faltas já registradas, justificadas, remarcados, desmarcados e
-- transporte não são tocados.
-- =========================================================================

begin;

create or replace function public.auto_marcar_faltas(
  p_slug        text,
  p_password    text,
  p_tolerancia  int default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_now        timestamp;
  v_today      text;
  v_marcadas   int;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  v_now := (now() at time zone 'America/Sao_Paulo');
  v_today := to_char(v_now, 'YYYY-MM-DD');

  if exists (select 1 from public.feriados f
              where f.company_id = v_company_id and f.data = v_today::date) then
    return jsonb_build_object('marcadas', 0);
  end if;

  with alvo as (
    select a.id
      from public.appointments a
      join public.professionals p2
        on p2.id = a.professional_id
       and p2.company_id = a.company_id
      join public.patients pa
        on pa.id = a.patient_id
     where a.company_id = v_company_id
       and a."date" = v_today
       and not public._is_transport_specialty(p2.specialty)
       and (pa.tipo_registro is null or pa.tipo_registro <> 'Registro Censo Municipal')
       and lower(coalesce(pa.status, '')) not in ('óbito', 'obito', 'desistência', 'desistencia')
       and lower(coalesce(a.status, '')) in ('', 'agendado', 'ativo', 'atendimento', 'em_atendimento')
       and (a."date" || ' ' || a."time")::timestamp + make_interval(mins => p_tolerancia) <= v_now
       and not exists (
         select 1 from public.ausencias_profissional au
          where au.company_id = v_company_id
            and au.professional_id = a.professional_id
            and v_today::date between au.data_inicio and au.data_fim
       )
  )
  update public.appointments a
     set status = 'falta_nao_justificada',
         updated_at = now()
    from alvo
   where a.id = alvo.id;

  get diagnostics v_marcadas = row_count;

  return jsonb_build_object('marcadas', v_marcadas);
end;
$$;

revoke all on function public.auto_marcar_faltas(text, text, int) from public;
grant execute on function public.auto_marcar_faltas(text, text, int) to anon, authenticated;

commit;
