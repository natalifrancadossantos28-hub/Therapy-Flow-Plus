-- =========================================================================
-- 0049_materialize_virtual_appointment.sql
--
-- Cria RPC para materializar agendamentos "virtuais" (projecoes da
-- recorrencia que ainda nao existem no banco).
-- Quando o usuario tenta mudar status de um agendamento projetado
-- (id negativo no frontend), o sistema primeiro cria a linha real
-- preservando recurrence_group_id e frequency, e depois segue com
-- a acao normalmente.
-- =========================================================================

begin;

create or replace function public.materialize_virtual_appointment(
  p_slug                text,
  p_password            text,
  p_patient_id          bigint,
  p_professional_id     bigint,
  p_date                text,
  p_time                text,
  p_recurrence_group_id text default null,
  p_frequency           text default 'semanal',
  p_notes               text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_freq       text;
  v_created    public.appointments%rowtype;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  if p_patient_id is null then raise exception 'patient_id is required'; end if;
  if p_professional_id is null then raise exception 'professional_id is required'; end if;

  v_freq := lower(btrim(coalesce(p_frequency, 'semanal')));
  if v_freq not in ('semanal', 'quinzenal', 'mensal') then
    v_freq := 'semanal';
  end if;

  -- Evita duplicata: se ja existe um appointment real neste slot, retorna-o
  select * into v_created
    from public.appointments
   where company_id = v_company_id
     and patient_id = p_patient_id
     and professional_id = p_professional_id
     and "date" = p_date
     and "time" = p_time
   limit 1;

  if found then
    return jsonb_build_object(
      'id',                v_created.id,
      'companyId',         v_created.company_id,
      'patientId',         v_created.patient_id,
      'professionalId',    v_created.professional_id,
      'date',              v_created."date",
      'time',              v_created."time",
      'status',            v_created.status,
      'recurrenceGroupId', v_created.recurrence_group_id,
      'frequency',         v_created.frequency,
      'alreadyExisted',    true
    );
  end if;

  insert into public.appointments (
    company_id, patient_id, professional_id, "date", "time", status,
    recurrence_group_id, frequency, notes
  ) values (
    v_company_id, p_patient_id, p_professional_id, p_date, p_time, 'agendado',
    p_recurrence_group_id, v_freq, p_notes
  )
  returning * into v_created;

  return jsonb_build_object(
    'id',                v_created.id,
    'companyId',         v_created.company_id,
    'patientId',         v_created.patient_id,
    'professionalId',    v_created.professional_id,
    'date',              v_created."date",
    'time',              v_created."time",
    'status',            v_created.status,
    'recurrenceGroupId', v_created.recurrence_group_id,
    'frequency',         v_created.frequency,
    'alreadyExisted',    false
  );
end;
$$;

revoke all on function public.materialize_virtual_appointment(text, text, bigint, bigint, text, text, text, text, text) from public;
grant execute on function public.materialize_virtual_appointment(text, text, bigint, bigint, text, text, text, text, text) to anon, authenticated;

commit;
