-- =========================================================================
-- 0091: list_first_evaluation_done
-- Pares paciente+especialidade que já passaram pela primeira avaliação, ou
-- seja, que têm pelo menos um atendimento em data anterior a hoje que não foi
-- cancelado nem virou falta. A Recepção usa isso para mostrar "Agendado" só
-- para quem foi puxado agora (primeira avaliação ainda não aconteceu) e
-- "Ativo" para quem já está em acompanhamento.
-- =========================================================================

begin;

create or replace function public.list_first_evaluation_done(
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
  v_today      text;
  v_result     jsonb;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  v_today := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_result
    from (
      select distinct
        a.patient_id,
        p2.specialty
      from public.appointments a
      join public.professionals p2
        on p2.id = a.professional_id
       and p2.company_id = a.company_id
      where a.company_id = v_company_id
        and a."date" < v_today
        and not public._is_transport_specialty(p2.specialty)
        and lower(coalesce(a.status, '')) not in (
          'desmarcado', 'cancelado', 'remarcado', 'remanejado',
          'ausente', 'falta_nao_justificada', 'falta_justificada',
          'justificado', 'abonado'
        )
    ) t;

  return v_result;
end;
$$;

revoke all on function public.list_first_evaluation_done(text, text) from public;
grant execute on function public.list_first_evaluation_done(text, text) to anon, authenticated;

commit;
