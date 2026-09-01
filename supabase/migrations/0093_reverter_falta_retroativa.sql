-- =========================================================================
-- 0093: reverter_falta
-- Desfaz uma falta (justificada ou não) de qualquer data, ajustando os
-- contadores do paciente. Marca absence_reverted_at para que a falta
-- automática do dia (0092) não volte a marcar o mesmo atendimento.
-- =========================================================================

begin;

alter table public.appointments
  add column if not exists absence_reverted_at timestamptz;

create or replace function public.reverter_falta(
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
  v_company_id bigint;
  v_apt        public.appointments%rowtype;
  v_was_nao_j  boolean;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  select * into v_apt from public.appointments
   where id = p_id and company_id = v_company_id;
  if not found then raise exception 'Appointment % not found', p_id; end if;

  if lower(coalesce(v_apt.status, '')) not in (
    'ausente', 'falta_nao_justificada', 'falta_justificada', 'justificado', 'abonado'
  ) then
    return jsonb_build_object('revertida', false, 'status', v_apt.status);
  end if;

  v_was_nao_j := lower(coalesce(v_apt.status, '')) in ('ausente', 'falta_nao_justificada');

  update public.appointments
     set status              = 'agendado',
         absence_reverted_at = now(),
         updated_at          = now()
   where id = v_apt.id and company_id = v_company_id;

  update public.patients
     set absence_count = greatest(0, coalesce(absence_count, 1) - 1),
         consecutive_unjustified_absences = case
           when v_was_nao_j then greatest(0, coalesce(consecutive_unjustified_absences, 1) - 1)
           else consecutive_unjustified_absences
         end,
         updated_at = now()
   where id = v_apt.patient_id;

  return jsonb_build_object('revertida', true, 'status', 'agendado');
end;
$$;

revoke all on function public.reverter_falta(text, text, bigint) from public;
grant execute on function public.reverter_falta(text, text, bigint) to anon, authenticated;

-- Falta automática não remarca atendimento que a administração já reverteu hoje.
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
       and a.absence_reverted_at is null
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
