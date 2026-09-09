-- =========================================================================
-- 0096: falta automática em 24h + remoção das faltas das últimas 2 semanas
--
-- 1. Limpeza: toda falta (justificada ou não) registrada nos últimos 14 dias
--    volta para 'agendado', com absence_reverted_at marcado para que a falta
--    automática não a lance de novo. Os contadores do paciente são ajustados
--    na mesma medida (mesma regra do reverter_falta).
--
-- 2. auto_marcar_faltas passa a esperar 24h (1440 min) após o horário do
--    atendimento. Como o prazo agora atravessa o dia, a função considera os
--    atendimentos dos últimos 3 dias (não só o de hoje), respeitando feriado e
--    ausência do profissional na data de cada atendimento.
-- =========================================================================

begin;

-- ── 1. Remoção das faltas das últimas 2 semanas ─────────────────────────
with revertidas as (
  update public.appointments a
     set status              = 'agendado',
         absence_reverted_at = now(),
         updated_at          = now()
   where lower(coalesce(a.status, '')) in (
           'ausente', 'falta', 'falta_nao_justificada', 'falta_justificada', 'justificado', 'abonado'
         )
     and a."date" >= to_char((now() at time zone 'America/Sao_Paulo') - interval '14 days', 'YYYY-MM-DD')
     and a."date" <= to_char((now() at time zone 'America/Sao_Paulo'), 'YYYY-MM-DD')
  returning a.patient_id,
            (lower(coalesce(a.status, '')) in ('ausente', 'falta', 'falta_nao_justificada')) as nao_justificada
),
por_paciente as (
  select patient_id,
         count(*)::int                                   as total,
         count(*) filter (where nao_justificada)::int    as nao_just
    from revertidas
   group by patient_id
)
update public.patients p
   set absence_count = greatest(0, coalesce(p.absence_count, 0) - pp.total),
       consecutive_unjustified_absences = case
         when pp.nao_just > 0
           then greatest(0, coalesce(p.consecutive_unjustified_absences, 0) - pp.nao_just)
         else p.consecutive_unjustified_absences
       end,
       updated_at = now()
  from por_paciente pp
 where p.id = pp.patient_id;

-- ── 2. Falta automática: 24 horas ───────────────────────────────────────
create or replace function public.auto_marcar_faltas(
  p_slug        text,
  p_password    text,
  p_tolerancia  int default 1440
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_now        timestamp;
  v_from       text;
  v_today      text;
  v_marcadas   int;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  v_now := (now() at time zone 'America/Sao_Paulo');
  v_today := to_char(v_now, 'YYYY-MM-DD');
  v_from  := to_char(v_now - interval '3 days', 'YYYY-MM-DD');

  with alvo as (
    select a.id
      from public.appointments a
      join public.professionals p2
        on p2.id = a.professional_id
       and p2.company_id = a.company_id
      join public.patients pa
        on pa.id = a.patient_id
     where a.company_id = v_company_id
       and a."date" between v_from and v_today
       and not public._is_transport_specialty(p2.specialty)
       and (pa.tipo_registro is null or pa.tipo_registro <> 'Registro Censo Municipal')
       and lower(coalesce(pa.status, '')) not in ('óbito', 'obito', 'desistência', 'desistencia')
       and lower(coalesce(a.status, '')) in ('', 'agendado', 'ativo', 'atendimento', 'em_atendimento')
       and (a."date" || ' ' || a."time")::timestamp + make_interval(mins => p_tolerancia) <= v_now
       and a.absence_reverted_at is null
       and not exists (
         select 1 from public.feriados f
          where f.company_id = v_company_id
            and f.data = a."date"::date
       )
       and not exists (
         select 1 from public.ausencias_profissional au
          where au.company_id = v_company_id
            and au.professional_id = a.professional_id
            and a."date"::date between au.data_inicio and au.data_fim
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
