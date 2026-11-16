-- 0142 — Corrige o erro ao marcar falta/presença em todas as agendas.
--
-- A 0141 recriou o update_appointment a partir da 0102, que chama
-- public._recalc_patient_absences(bigint). Essa função nunca tinha sido
-- criada no banco (a 0102 não foi rodada), então qualquer mudança de status
-- dava "function public._recalc_patient_absences(bigint) does not exist".
--
-- Cria só a função (sem recalcular todos os pacientes de uma vez).

begin;

create or replace function public._recalc_patient_absences(p_patient_id bigint)
returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_total integer;
begin
  select count(*) into v_total
    from public.appointments a
    left join public.professionals p2
      on p2.id = a.professional_id and p2.company_id = a.company_id
   where a.patient_id = p_patient_id
     and lower(coalesce(a.status, '')) in ('ausente', 'falta_nao_justificada')
     and not public._is_transport_specialty(coalesce(p2.specialty, ''));

  update public.patients
     set absence_count = v_total,
         updated_at    = now()
   where id = p_patient_id
     and coalesce(absence_count, -1) <> v_total;

  return v_total;
end;
$$;

revoke all on function public._recalc_patient_absences(bigint) from public;

commit;
