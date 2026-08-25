-- =========================================================================
-- 0088_motorista_fora_das_metricas.sql
--
-- Motorista é função de apoio administrativo: o transporte é agendado só para
-- a Recepção saber quem busca cada criança. Ele NÃO é atendimento clínico.
--
-- Esta migration:
--   1. cria _is_transport_specialty (identifica a especialidade de apoio);
--   2. tira o transporte da contagem de atendimentos realizados (cards
--      "Atendimentos Terapêuticos" — semana/mês/trimestre/semestre/ano);
--   3. tira o motorista da ocupação/capacidade clínica;
--   4. faz create_appointments não aplicar efeitos clínicos quando o
--      profissional é motorista (não tira o paciente da fila, não apaga alta,
--      não muda o status nem o profissional de referência do paciente).
--
-- Idempotente: só create or replace, mantendo assinaturas, colunas e grants.
-- =========================================================================

begin;

create or replace function public._is_transport_specialty(p_specialty text)
returns boolean
language sql
immutable
set search_path = public, extensions, pg_temp
as $$
  select case
    when p_specialty is null then false
    else lower(btrim(p_specialty)) like '%motorista%'
      or lower(btrim(p_specialty)) like '%transporte%'
  end;
$$;

-- Atendimentos REALIZADOS: mesma definição da Visão Mensal (0076), agora sem
-- os registros de transporte.
create or replace function public._count_atendimentos_realizados(
  p_company_id bigint,
  p_from       text,
  p_to         text
)
returns integer
language sql
stable
set search_path = public, extensions, pg_temp
as $$
  select count(*)::int from (
    select distinct a.patient_id, a."date", a."time"
      from public.appointments a
      join public.patients p on p.id = a.patient_id
      left join public.professionals pr on pr.id = a.professional_id
     where a.company_id = p_company_id
       and lower(a.status) in ('atendimento', 'em_atendimento', 'presente', 'alta')
       and a."date" >= p_from
       and a."date" <= p_to
       and (p.tipo_registro is null or p.tipo_registro <> 'Registro Censo Municipal')
       and not public._is_transport_specialty(pr.specialty)
  ) d;
$$;

-- Ocupação/capacidade: motorista não tem vaga clínica.
create or replace function public.list_professionals_capacity(
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
  v_result     jsonb;
  v_today      text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  with active_counts as (
    select a.professional_id, count(distinct a.patient_id) as patients
      from public.appointments a
     where a.company_id = v_company_id
       and a."date" >= v_today
       and a.status in ('agendado', 'atendimento', 'presente')
     group by a.professional_id
  )
  select coalesce(jsonb_agg(payload order by sort_name asc), '[]'::jsonb)
    into v_result
    from (
      select
        lower(coalesce(p.name, '')) as sort_name,
        jsonb_build_object(
          'id',               p.id,
          'name',             p.name,
          'specialty',        p.specialty,
          'cargaHoraria',     coalesce(p.carga_horaria, '30h'),
          'maxPatients',      case
                                when coalesce(p.carga_horaria, '') ilike '20%' then 25
                                when coalesce(p.carga_horaria, '') ilike '30%' then 35
                                else 35
                              end,
          'currentPatients',  coalesce(ac.patients, 0)::int
        ) as payload
        from public.professionals p
        left join active_counts ac on ac.professional_id = p.id
       where p.company_id = v_company_id
         and not public._is_transport_specialty(p.specialty)
    ) s;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

revoke all on function public.list_professionals_capacity(text, text) from public;
grant execute on function public.list_professionals_capacity(text, text) to anon, authenticated;

-- create_appointments: agendar transporte não mexe na vida clínica do paciente.
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
  v_status            text;
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

  select tipo_registro, status into v_tipo, v_status from public.patients
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

  select specialty into v_prof_specialty
    from public.professionals
   where id = p_professional_id and company_id = v_company_id;

  -- Transporte (motorista): registro administrativo. Não tira o paciente da
  -- fila, não apaga alta e não muda status/profissional de referência.
  if not public._is_transport_specialty(v_prof_specialty) then
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

    -- Agendou nesta especialidade: a alta dela deixa de valer.
    if v_prof_specialty is not null then
      delete from public.patient_specialty_discharges d
       where d.company_id = v_company_id
         and d.patient_id = p_patient_id
         and lower(btrim(d.specialty)) = lower(btrim(v_prof_specialty));
    end if;

    select count(*) into v_remaining
      from public.waiting_list
     where company_id = v_company_id and patient_id = p_patient_id;

    -- Reativação: quem teve alta de uma área volta a ficar ativo ao ser agendado
    -- em outra, mesmo que ainda reste fila em uma terceira especialidade.
    -- Óbito/Desistência continuam travados.
    update public.patients
       set status = case when v_remaining = 0 then 'Atendimento' else 'Fila de Espera' end,
           professional_id = case when v_remaining = 0 then p_professional_id else professional_id end,
           updated_at = now()
     where id = p_patient_id
       and company_id = v_company_id
       and coalesce(status, '') in ('Fila de Espera', 'Aguardando Triagem', 'Alta', '');
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

-- 5. Triggers de sincronização de status: transporte não muda o status do
-- paciente nem define o motorista como profissional de referência.
create or replace function public._tg_appointments_sync_patient_status()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_specialty text;
begin
  if new.patient_id is null then
    return new;
  end if;

  select specialty into v_specialty
    from public.professionals
   where id = new.professional_id and company_id = new.company_id;

  if public._is_transport_specialty(v_specialty) then
    return new;
  end if;

  begin
    update public.patients
       set status          = 'Atendimento',
           professional_id = coalesce(new.professional_id, professional_id),
           updated_at      = now()
     where id = new.patient_id
       and company_id = new.company_id
       and coalesce(status, '') in ('Aguardando Triagem', 'Fila de Espera');
  exception when others then
    raise warning 'sync_patient_status falhou para appointment %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

create or replace function public._tg_appointments_after_delete_sync_status()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_has_active boolean;
  v_specialty  text;
  v_today      text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
begin
  select specialty into v_specialty
    from public.professionals
   where id = old.professional_id and company_id = old.company_id;

  if public._is_transport_specialty(v_specialty) then
    return old;
  end if;

  select exists(
    select 1
      from public.appointments a
      join public.professionals pr
        on pr.id = a.professional_id
       and pr.company_id = a.company_id
     where a.patient_id = old.patient_id
       and a.company_id = old.company_id
       and a."date" >= v_today
       and not public._is_transport_specialty(pr.specialty)
       and a.status not in (
             'desmarcado','cancelado','alta',
             'falta','falta_justificada','falta_nao_justificada','ausente'
           )
  ) into v_has_active;

  if not v_has_active then
    update public.patients
       set status     = 'Fila de Espera',
           updated_at = now()
     where id = old.patient_id
       and company_id = old.company_id
       and coalesce(status, '') = 'Atendimento';
  end if;

  return old;
end;
$$;

-- 6. Especialidades ativas e faltas por especialidade ignoram o transporte.
create or replace function public._especialidades_ativas(
  p_company_id bigint,
  p_patient_id bigint,
  p_exceto     text default null
)
returns text[]
language sql
stable
as $$
  with hoje as (select to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as d),
  ativas as (
    select distinct lower(btrim(coalesce(pr.specialty, ''))) as spec
      from public.appointments a
      join public.professionals pr on pr.id = a.professional_id and pr.company_id = a.company_id
     where a.company_id = p_company_id
       and a.patient_id = p_patient_id
       and a."date" >= (select d from hoje)
       and not public._is_transport_specialty(pr.specialty)
       and lower(coalesce(a.status, 'agendado')) not in (
         'desmarcado','cancelado','alta','falta','falta_justificada',
         'falta_nao_justificada','ausente','desistência','desistencia','óbito'
       )
    union
    select distinct lower(btrim(coalesce(w.specialty, ''))) as spec
      from public.waiting_list w
     where w.company_id = p_company_id
       and w.patient_id = p_patient_id
  )
  select coalesce(array_agg(spec), '{}')
    from ativas
   where spec <> ''
     and (p_exceto is null or spec <> lower(btrim(p_exceto)));
$$;

create or replace function public.count_absences_by_specialty(p_slug text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_result     jsonb;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_result
    from (
      select
        a.patient_id,
        p2.specialty,
        count(*) as absence_count
      from public.appointments a
      join public.professionals p2
        on p2.id = a.professional_id
       and p2.company_id = a.company_id
      where a.company_id = v_company_id
        and not public._is_transport_specialty(p2.specialty)
        and lower(a.status) in ('ausente', 'falta_nao_justificada')
      group by a.patient_id, p2.specialty
    ) t;

  return v_result;
end;
$$;

revoke all on function public.count_absences_by_specialty(text, text) from public;
grant execute on function public.count_absences_by_specialty(text, text) to anon, authenticated;

commit;
