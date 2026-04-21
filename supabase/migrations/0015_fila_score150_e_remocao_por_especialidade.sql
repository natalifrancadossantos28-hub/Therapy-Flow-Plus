-- 0015: Fila de Espera espelhando Perfil Multidisciplinar + remocao seletiva.
--
-- Mudancas:
-- 1. list_waiting_list passa a retornar scoreTotal150 (identico ao Perfil
--    Multidisciplinar) + flags de vulnerabilidade (escolaPublica, trabalhoNaRoca).
--    Formula: round((triagem_score / 360) * 150) + 2 (esc. publica) + 2 (roca).
--    Mantem scoreClinico/scoreSocial para compatibilidade (display antigo).
-- 2. create_appointments remove da fila SO a entrada cuja specialty casa com a
--    especialidade do profissional (ou entrada com specialty null = "qualquer").
--    Antes deletava TODAS as entradas do paciente, escondendo demandas em outras
--    areas.

begin;

-- =========================================================================
-- list_waiting_list: adiciona scoreTotal150 + flags de vulnerabilidade.
-- =========================================================================
create or replace function public.list_waiting_list(
  p_slug            text,
  p_password        text,
  p_professional_id bigint default null
)
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
  select coalesce(jsonb_agg(row order by ord), '[]'::jsonb) into v_result
  from (
    select
      jsonb_build_object(
        'id',                    w.id,
        'companyId',             w.company_id,
        'patientId',             w.patient_id,
        'patientName',           coalesce(p.name, ''),
        'patientPhone',          p.phone,
        'patientProntuario',     p.prontuario,
        'professionalId',        w.professional_id,
        'specialty',             coalesce(w.specialty, pr.specialty),
        'professionalName',      pr.name,
        'professionalSpecialty', pr.specialty,
        'priority',              w.priority,
        'notes',                 w.notes,
        'entryDate',             w.entry_date,
        'createdAt',             w.created_at,
        'updatedAt',             w.updated_at,
        'scoreClinico',          round((coalesce(p.triagem_score, 0)::numeric * 100.0) / 360.0)::int,
        'scoreSocial',           (case when coalesce(p.escola_publica, false)   then 2 else 0 end)
                               + (case when coalesce(p.trabalho_na_roca, false) then 2 else 0 end),
        'triagemScore',          p.triagem_score,
        'escolaPublica',         p.escola_publica,
        'trabalhoNaRoca',        p.trabalho_na_roca,
        'scoreTotal150',         round((coalesce(p.triagem_score, 0)::numeric * 150.0) / 360.0)::int
                               + (case when coalesce(p.escola_publica, false)   then 2 else 0 end)
                               + (case when coalesce(p.trabalho_na_roca, false) then 2 else 0 end)
      ) as row,
      row_number() over (
        order by
          (
            (coalesce(p.triagem_score, 0)::numeric * 100.0) / 360.0
            + (case when coalesce(p.escola_publica, false)   then 2 else 0 end)
            + (case when coalesce(p.trabalho_na_roca, false) then 2 else 0 end)
          ) desc,
          w.entry_date asc,
          w.id asc
      ) as ord
      from public.waiting_list w
      left join public.patients      p  on p.id  = w.patient_id
      left join public.professionals pr on pr.id = w.professional_id
     where w.company_id = v_company_id
       and (p_professional_id is null or w.professional_id = p_professional_id)
       and (p.tipo_registro is null or p.tipo_registro <> 'Registro Censo Municipal')
  ) s;
  return coalesce(v_result, '[]'::jsonb);
end;
$$;

revoke all on function public.list_waiting_list(text, text, bigint) from public;
grant execute on function public.list_waiting_list(text, text, bigint) to anon, authenticated;

-- =========================================================================
-- create_appointments: remove da fila apenas a entrada da especialidade do
-- profissional (ou entrada com specialty NULL = "qualquer especialidade").
-- Preserva as demais demandas multidisciplinares do paciente.
-- =========================================================================
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

  if coalesce(p_from_waiting_list, false) then
    -- Busca a especialidade do profissional que esta atendendo.
    select specialty into v_prof_specialty
      from public.professionals
     where id = p_professional_id and company_id = v_company_id;

    -- Remove SO a(s) entrada(s) da fila que casam com a especialidade do
    -- profissional (ou entradas com specialty NULL = "qualquer especialidade").
    -- Demandas em outras areas (TO, Fono, Psicopedagogia, etc.) permanecem.
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

    -- So marca o paciente como "Atendimento" quando TODAS as filas dele foram
    -- resolvidas (nao ha mais entradas pendentes). Caso contrario, ele ainda
    -- aguarda vaga em alguma especialidade.
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
