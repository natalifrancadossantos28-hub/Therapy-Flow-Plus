-- =============================================================================
-- 0019: Remover paciente da FILA DA ESPECIALIDADE ao agendar — mesmo no modo
-- "Agendamento Direto" do admin (quando fromWaitingList = false).
-- =============================================================================
--
-- Problema (reportado pela Natali):
--   Ao agendar um paciente pelo modo "Direto" (admin busca por nome), o
--   create_appointments NAO apagava a entrada dele na waiting_list, porque
--   a logica de delete estava gated atras de `p_from_waiting_list = true`.
--   Resultado: paciente continuava aparecendo em #1 na fila da especialidade
--   mesmo depois de ja ter horario agendado ali.
--
-- Solucao:
--   O delete por especialidade passa a rodar SEMPRE, independente do flag
--   `p_from_waiting_list`. Demandas em outras especialidades seguem preservadas
--   (mesma logica do 0015: matching por lower(btrim(specialty))).
--
-- Preserva do 0015:
--   * Mesma assinatura (sem DROP, transacao segura).
--   * Mesmo fluxo de recorrencia (52/26/13 ocorrencias, step 7/14/28 dias).
--   * Mesmo tratamento do Censo Municipal (bloqueia agendamento).
--   * Status='Atendimento' so marca quando TODAS as filas do paciente sao
--     zeradas E o agendamento veio da fila (p_from_waiting_list = true). No
--     modo "direto" do admin, status nao muda automaticamente — comportamento
--     existente eh preservado.
-- =============================================================================

begin;

create or replace function public.create_appointments(
  p_slug               text,
  p_password           text,
  p_patient_id         bigint,
  p_professional_id    bigint,
  p_date               text,
  p_time               text,
  p_notes              text    default null,
  p_frequency          text    default 'semanal',
  p_no_recurrence      boolean default false,
  p_from_waiting_list  boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id        bigint;
  v_tipo              text;
  v_group_id          text;
  v_step              integer;
  v_total             integer;
  v_start_date        date := (p_date)::date;
  v_first             public.appointments%rowtype;
  v_count             integer := 0;
  v_frequency         text := coalesce(p_frequency, 'semanal');
  v_prof_specialty    text;
  v_remaining         integer;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  if p_patient_id is null then raise exception 'patient_id is required'; end if;
  if p_professional_id is null then raise exception 'professional_id is required'; end if;

  select tipo_registro into v_tipo from public.patients
   where id = p_patient_id and company_id = v_company_id;
  if not found then raise exception 'Patient not found'; end if;
  if v_tipo = 'Registro Censo Municipal' then
    raise exception 'Registro Censo Municipal: pacientes do Censo Municipal nao podem ser agendados.' using errcode = '22023';
  end if;

  if v_frequency not in ('semanal','quinzenal','mensal') then
    v_frequency := 'semanal';
  end if;

  if coalesce(p_no_recurrence, false) then
    insert into public.appointments (
      company_id, patient_id, professional_id, "date", "time", status, notes,
      recurrence_group_id, frequency
    ) values (
      v_company_id, p_patient_id, p_professional_id, p_date, p_time, 'agendado', p_notes,
      null, v_frequency
    )
    returning * into v_first;
    v_count := 1;
  else
    v_group_id := gen_random_uuid()::text;
    v_step  := case v_frequency when 'quinzenal' then 14 when 'mensal' then 28 else 7 end;
    v_total := case v_frequency when 'quinzenal' then 26 when 'mensal' then 13 else 52 end;

    insert into public.appointments (
      company_id, patient_id, professional_id, "date", "time", status, notes,
      recurrence_group_id, frequency
    )
    select
      v_company_id, p_patient_id, p_professional_id,
      to_char(v_start_date + (i * v_step), 'YYYY-MM-DD'),
      p_time, 'agendado', p_notes, v_group_id, v_frequency
    from generate_series(0, v_total - 1) as i;

    v_count := v_total;

    select * into v_first
      from public.appointments
     where company_id = v_company_id
       and recurrence_group_id = v_group_id
     order by "date", "time"
     limit 1;
  end if;

  -- ===============================================================
  -- SEMPRE: remove da waiting_list a entrada que casa com a
  -- especialidade do profissional agendado (ou entrada "qualquer"
  -- com specialty NULL). Demandas em outras areas permanecem.
  -- Vale pros dois modos:
  --   * Fila (fromWaitingList = true): admin puxou da fila.
  --   * Direto (fromWaitingList = false): admin buscou por nome.
  -- Em ambos os casos o paciente agora tem horario naquela area,
  -- entao ele DEVE sumir daquela fila — senao ficou duplicado
  -- igual a Natali mostrou no print.
  -- ===============================================================
  select specialty into v_prof_specialty
    from public.professionals
   where id = p_professional_id and company_id = v_company_id;

  delete from public.waiting_list
   where company_id = v_company_id
     and patient_id = p_patient_id
     and (
       specialty is null
       or (
         v_prof_specialty is not null
         and lower(btrim(specialty)) = lower(btrim(v_prof_specialty))
       )
     );

  -- ===============================================================
  -- Status='Atendimento' so quando TODAS as filas do paciente sao
  -- zeradas E o agendamento veio da fila. Preservado do 0015.
  -- ===============================================================
  if coalesce(p_from_waiting_list, false) then
    select count(*) into v_remaining
      from public.waiting_list
     where company_id = v_company_id and patient_id = p_patient_id;

    if v_remaining = 0 then
      update public.patients
         set status = 'Atendimento',
             professional_id = p_professional_id
       where id = p_patient_id and company_id = v_company_id;
    end if;
  end if;

  return jsonb_build_object(
    'id',                v_first.id,
    'companyId',         v_first.company_id,
    'patientId',         v_first.patient_id,
    'professionalId',    v_first.professional_id,
    'date',              v_first."date",
    'time',              v_first."time",
    'status',            v_first.status,
    'notes',             v_first.notes,
    'recurrenceGroupId', v_first.recurrence_group_id,
    'frequency',         v_first.frequency,
    'createdAt',         v_first.created_at,
    'updatedAt',         v_first.updated_at,
    'totalCreated',      v_count
  );
end;
$$;

revoke all on function public.create_appointments(text, text, bigint, bigint, text, text, text, text, boolean, boolean) from public;
grant execute on function public.create_appointments(text, text, bigint, bigint, text, text, text, text, boolean, boolean) to anon, authenticated;

commit;
