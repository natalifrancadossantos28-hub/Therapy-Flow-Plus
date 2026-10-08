-- 0116 — Agenda sem duplicidade de série no mesmo profissional
--
-- Causa: pela Busca Direta (admin) era possível criar uma NOVA série
-- semanal para um paciente que já tinha série ativa (ou pausada) com o MESMO
-- profissional. A série antiga ficava na agenda e o paciente aparecia duas
-- vezes (mesmo horário ou dois horários na mesma agenda).
--
-- Regra: ao criar uma série recorrente, as outras séries do mesmo paciente
-- com o mesmo profissional são encerradas a partir da data da nova série
-- (histórico passado preservado). Exceções:
--   • Oficina / Educação Física (Oficina): pode ter mais de um dia por semana;
--   • Pilates mãe/responsável × criança na agenda mista do Leonardo;
--   • Motorista / transporte.
-- Também limpa de uma vez as duplicidades já existentes (mesmo paciente,
-- mesmo profissional, mesma data e hora, séries diferentes): fica a série
-- mais recente.

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
  v_replaced          integer := 0;
  v_new_is_pilates    boolean := coalesce(p_notes, '') like '%[PILATES — Mãe/Responsável]%';
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

  select specialty into v_prof_specialty
    from public.professionals
   where id = p_professional_id and company_id = v_company_id;

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
    -- Série nova substitui as séries antigas do mesmo paciente com este
    -- profissional (daqui pra frente), exceto Oficina/Pilates/Motorista.
    if lower(coalesce(v_prof_specialty, '')) not like '%oficina%'
       and lower(coalesce(v_prof_specialty, '')) not like '%motorista%'
       and lower(coalesce(v_prof_specialty, '')) not like '%transporte%'
       and coalesce(p_notes, '') not like 'Transporte de %'
    then
      delete from public.appointments a
       where a.company_id = v_company_id
         and a.patient_id = p_patient_id
         and a.professional_id = p_professional_id
         and a."date" >= p_date
         and a.recurrence_group_id is not null
         and lower(coalesce(a.status, 'agendado')) in
             ('agendado', 'agendada', 'scheduled', 'pausado', 'atendimento')
         and coalesce(a.notes, '') not like 'Transporte de %'
         and (coalesce(a.notes, '') like '%[PILATES — Mãe/Responsável]%') = v_new_is_pilates;
      get diagnostics v_replaced = row_count;
    end if;

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

  if coalesce(p_from_waiting_list, false) then
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
    'totalCreated',      v_count,
    'replacedCount',     v_replaced
  );
end;
$$;

revoke all on function public.create_appointments(text, text, bigint, bigint, text, text, text, text, boolean, boolean) from public;
grant execute on function public.create_appointments(text, text, bigint, bigint, text, text, text, text, boolean, boolean) to anon, authenticated;

-- Limpeza única: mesmo paciente + mesmo profissional + mesma data/hora em
-- séries diferentes → mantém a série criada por último, apaga a antiga de
-- hoje em diante.
with hoje as (
  select to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as d
),
dup as (
  select a.id
    from public.appointments a
    join public.appointments k
      on k.company_id = a.company_id
     and k.patient_id = a.patient_id
     and k.professional_id = a.professional_id
     and k."date" = a."date"
     and k."time" = a."time"
     and k.recurrence_group_id is not null
     and a.recurrence_group_id is not null
     and k.recurrence_group_id <> a.recurrence_group_id
     and (k.created_at, k.id) > (a.created_at, a.id)
    cross join hoje
   where a."date" >= hoje.d
     and lower(coalesce(a.status, 'agendado')) in ('agendado', 'agendada', 'scheduled', 'pausado', 'atendimento')
     and lower(coalesce(k.status, 'agendado')) in ('agendado', 'agendada', 'scheduled', 'pausado', 'atendimento')
     and (coalesce(a.notes, '') like '%[PILATES — Mãe/Responsável]%')
       = (coalesce(k.notes, '') like '%[PILATES — Mãe/Responsável]%')
)
delete from public.appointments x
 where x.id in (select id from dup);

commit;
