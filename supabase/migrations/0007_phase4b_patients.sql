-- Phase 4B - Arco-iris pacientes + fila de espera + auto-link Triagem -> Fila
--
-- Creates patients and waiting_list tables, their CRUD RPCs, and a helper
-- RPC (autolink_triagem) that replays the auto-link logic the old Express
-- backend did on POST /triagens (match patient by cpf/name, update scores,
-- bump status, insert waiting_list rows per scored specialty).
--
-- Security model (same as Phase 2/3/4A):
--   * Every admin RPC requires slug + password, bcrypt verified by
--     public._verify_company_admin (migration 0002).
--   * RLS is enabled on every table with no policy, so anon/authenticated
--     roles cannot touch rows directly - every request MUST go through an
--     RPC.

create extension if not exists pgcrypto with schema extensions;

-- =========================================================================
-- Tables
-- =========================================================================

create table if not exists public.patients (
  id                                 bigserial   primary key,
  company_id                         bigint      not null references public.ponto_companies(id) on delete cascade,
  prontuario                         text,
  name                               text        not null,
  date_of_birth                      text,
  cpf                                text,
  cns                                text,
  phone                              text,
  email                              text,
  address                            text,
  guardian_name                      text,
  guardian_phone                     text,
  mother_name                        text,
  diagnosis                          text,
  notes                              text,
  professional_id                    bigint      references public.professionals(id) on delete set null,
  status                             text        not null default 'Aguardando Triagem',
  entry_date                         text,
  absence_count                      integer     not null default 0,
  consecutive_unjustified_absences   integer     not null default 0,
  triagem_score                      integer,
  score_psicologia                   integer,
  score_psicomotricidade             integer,
  score_fisioterapia                 integer,
  score_psicopedagogia               integer,
  score_ed_fisica                    integer,
  score_fonoaudiologia               integer,
  score_to                           integer,
  score_nutricionista                integer,
  escola_publica                     boolean,
  trabalho_na_roca                   boolean,
  tipo_registro                      text,
  local_atendimento                  text,
  created_at                         timestamptz not null default now(),
  updated_at                         timestamptz not null default now()
);

create index if not exists patients_company_idx   on public.patients(company_id);
create index if not exists patients_status_idx    on public.patients(company_id, status);
create index if not exists patients_prof_idx      on public.patients(professional_id);
create unique index if not exists patients_company_prontuario_key
  on public.patients(company_id, prontuario) where prontuario is not null;

create table if not exists public.waiting_list (
  id                bigserial   primary key,
  company_id        bigint      not null references public.ponto_companies(id) on delete cascade,
  patient_id        bigint      not null references public.patients(id) on delete cascade,
  professional_id   bigint      references public.professionals(id) on delete set null,
  specialty         text,
  priority          text        not null default 'media',
  notes             text,
  entry_date        text        not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists waiting_list_company_idx on public.waiting_list(company_id);
create index if not exists waiting_list_patient_idx on public.waiting_list(patient_id);

alter table public.patients     enable row level security;
alter table public.waiting_list enable row level security;

-- updated_at trigger is defined in 0006. Just reuse it.
drop trigger if exists trg_patients_touch     on public.patients;
drop trigger if exists trg_waiting_list_touch on public.waiting_list;

create trigger trg_patients_touch
  before update on public.patients
  for each row execute function public._tg_touch_updated_at();

create trigger trg_waiting_list_touch
  before update on public.waiting_list
  for each row execute function public._tg_touch_updated_at();

-- =========================================================================
-- Helpers
-- =========================================================================

-- Priority calculation (matches Express calcPriority in patients.ts/triagens.ts)
create or replace function public._calc_priority(
  p_triagem_score      integer,
  p_escola_publica     boolean,
  p_trabalho_na_roca   boolean,
  p_sem_terapia        boolean
)
returns text
language plpgsql
immutable
as $$
declare
  v_base_idx integer;
  v_vuln     integer;
  v_idx      integer;
  v_levels   text[] := array['baixo','leve','moderado','elevado'];
begin
  if p_triagem_score is null then return 'baixo'; end if;
  v_base_idx := case
    when p_triagem_score >= 270 then 3
    when p_triagem_score >= 180 then 2
    when p_triagem_score >= 90  then 1
    else 0 end;
  v_vuln := (case when p_escola_publica   then 1 else 0 end)
          + (case when p_trabalho_na_roca then 1 else 0 end)
          + (case when p_sem_terapia      then 1 else 0 end);
  v_idx := least(3, v_base_idx + v_vuln);
  return v_levels[v_idx + 1];
end;
$$;

-- =========================================================================
-- Patients RPCs
-- =========================================================================

create or replace function public.list_patients(
  p_slug            text,
  p_password        text,
  p_status          text   default null,
  p_professional_id bigint default null
)
returns setof public.patients
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_company_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  return query
    select *
      from public.patients p
     where p.company_id = v_company_id
       and (p_status is null or p.status = p_status)
       and (p_professional_id is null or p.professional_id = p_professional_id)
     order by p.created_at desc;
end;
$$;

create or replace function public.get_patient(
  p_slug     text,
  p_password text,
  p_id       bigint
)
returns public.patients
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_row        public.patients%rowtype;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  select * into v_row
    from public.patients
   where id = p_id and company_id = v_company_id
   limit 1;
  if not found then return null; end if;
  return v_row;
end;
$$;

create or replace function public.next_prontuario(
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
  v_max        integer := 399;
  v_candidate  integer;
  v_ultimo     text;
  r            record;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  for r in
    select prontuario from public.patients
     where company_id = v_company_id and prontuario is not null
  loop
    v_candidate := nullif(regexp_replace(r.prontuario, '[^0-9]', '', 'g'), '')::integer;
    if v_candidate is not null and v_candidate >= 400 and v_candidate > v_max then
      v_max := v_candidate;
    end if;
  end loop;
  v_ultimo := case when v_max > 399 then v_max::text else null end;
  return jsonb_build_object(
    'nextProntuario', (v_max + 1)::text,
    'ultimo', v_ultimo
  );
end;
$$;

create or replace function public.check_prontuario(
  p_slug       text,
  p_password   text,
  p_prontuario text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_row        record;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  select id, name into v_row
    from public.patients
   where company_id = v_company_id
     and prontuario = p_prontuario
   limit 1;
  if v_row.id is null then
    return jsonb_build_object('existe', false);
  end if;
  return jsonb_build_object(
    'existe', true,
    'paciente', jsonb_build_object('id', v_row.id, 'name', v_row.name)
  );
end;
$$;

create or replace function public.upsert_patient(
  p_slug     text,
  p_password text,
  p_id       bigint,
  p_payload  jsonb
)
returns public.patients
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_row        public.patients%rowtype;
  v_name       text;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  v_name := nullif(btrim(coalesce(p_payload->>'name', '')), '');
  if v_name is null then
    raise exception 'name is required';
  end if;

  if p_id is null then
    insert into public.patients (
      company_id, prontuario, name, date_of_birth, cpf, cns,
      phone, email, address,
      guardian_name, guardian_phone, mother_name,
      diagnosis, notes, professional_id,
      status, entry_date, absence_count,
      triagem_score,
      score_psicologia, score_psicomotricidade, score_fisioterapia,
      score_psicopedagogia, score_ed_fisica, score_fonoaudiologia,
      score_to, score_nutricionista,
      escola_publica, trabalho_na_roca,
      tipo_registro, local_atendimento
    ) values (
      v_company_id,
      nullif(btrim(coalesce(p_payload->>'prontuario', '')), ''),
      v_name,
      nullif(btrim(coalesce(p_payload->>'dateOfBirth', '')), ''),
      nullif(btrim(coalesce(p_payload->>'cpf', '')), ''),
      nullif(btrim(coalesce(p_payload->>'cns', '')), ''),
      nullif(btrim(coalesce(p_payload->>'phone', '')), ''),
      nullif(btrim(coalesce(p_payload->>'email', '')), ''),
      nullif(btrim(coalesce(p_payload->>'address', '')), ''),
      nullif(btrim(coalesce(p_payload->>'guardianName', '')), ''),
      nullif(btrim(coalesce(p_payload->>'guardianPhone', '')), ''),
      nullif(btrim(coalesce(p_payload->>'motherName', '')), ''),
      nullif(btrim(coalesce(p_payload->>'diagnosis', '')), ''),
      nullif(btrim(coalesce(p_payload->>'notes', '')), ''),
      case when p_payload ? 'professionalId' and p_payload->>'professionalId' is not null
            and btrim(p_payload->>'professionalId') <> ''
           then (p_payload->>'professionalId')::bigint end,
      coalesce(nullif(btrim(coalesce(p_payload->>'status', '')), ''), 'Aguardando Triagem'),
      coalesce(nullif(btrim(coalesce(p_payload->>'entryDate', '')), ''),
               to_char(now() at time zone 'UTC', 'YYYY-MM-DD')),
      0,
      case when p_payload ? 'triagemScore' and p_payload->>'triagemScore' is not null
           then (p_payload->>'triagemScore')::integer end,
      case when p_payload ? 'scorePsicologia'       then (p_payload->>'scorePsicologia')::integer       end,
      case when p_payload ? 'scorePsicomotricidade' then (p_payload->>'scorePsicomotricidade')::integer end,
      case when p_payload ? 'scoreFisioterapia'     then (p_payload->>'scoreFisioterapia')::integer     end,
      case when p_payload ? 'scorePsicopedagogia'   then (p_payload->>'scorePsicopedagogia')::integer   end,
      case when p_payload ? 'scoreEdFisica'         then (p_payload->>'scoreEdFisica')::integer         end,
      case when p_payload ? 'scoreFonoaudiologia'   then (p_payload->>'scoreFonoaudiologia')::integer   end,
      case when p_payload ? 'scoreTO'               then (p_payload->>'scoreTO')::integer               end,
      case when p_payload ? 'scoreNutricionista'    then (p_payload->>'scoreNutricionista')::integer    end,
      case when p_payload ? 'escolaPublica'   then (p_payload->>'escolaPublica')::boolean   end,
      case when p_payload ? 'trabalhoNaRoca'  then (p_payload->>'trabalhoNaRoca')::boolean  end,
      coalesce(nullif(btrim(coalesce(p_payload->>'tipoRegistro', '')), ''), 'Paciente da Unidade'),
      nullif(btrim(coalesce(p_payload->>'localAtendimento', '')), '')
    )
    returning * into v_row;
  else
    update public.patients set
      prontuario        = case when p_payload ? 'prontuario'
                               then nullif(btrim(coalesce(p_payload->>'prontuario', '')), '')
                               else prontuario end,
      name              = v_name,
      date_of_birth     = case when p_payload ? 'dateOfBirth'
                               then nullif(btrim(coalesce(p_payload->>'dateOfBirth', '')), '')
                               else date_of_birth end,
      cpf               = case when p_payload ? 'cpf' then nullif(btrim(coalesce(p_payload->>'cpf', '')), '')             else cpf end,
      cns               = case when p_payload ? 'cns' then nullif(btrim(coalesce(p_payload->>'cns', '')), '')             else cns end,
      phone             = case when p_payload ? 'phone' then nullif(btrim(coalesce(p_payload->>'phone', '')), '')         else phone end,
      email             = case when p_payload ? 'email' then nullif(btrim(coalesce(p_payload->>'email', '')), '')         else email end,
      address           = case when p_payload ? 'address' then nullif(btrim(coalesce(p_payload->>'address', '')), '')     else address end,
      guardian_name     = case when p_payload ? 'guardianName'  then nullif(btrim(coalesce(p_payload->>'guardianName', '')), '')  else guardian_name end,
      guardian_phone    = case when p_payload ? 'guardianPhone' then nullif(btrim(coalesce(p_payload->>'guardianPhone', '')), '') else guardian_phone end,
      mother_name       = case when p_payload ? 'motherName'    then nullif(btrim(coalesce(p_payload->>'motherName', '')), '')    else mother_name end,
      diagnosis         = case when p_payload ? 'diagnosis'     then nullif(btrim(coalesce(p_payload->>'diagnosis', '')), '')     else diagnosis end,
      notes             = case when p_payload ? 'notes'         then nullif(btrim(coalesce(p_payload->>'notes', '')), '')         else notes end,
      professional_id   = case when p_payload ? 'professionalId'
                               then case when p_payload->>'professionalId' is null or btrim(p_payload->>'professionalId') = ''
                                         then null
                                         else (p_payload->>'professionalId')::bigint end
                               else professional_id end,
      status            = case when p_payload ? 'status' and btrim(coalesce(p_payload->>'status','')) <> ''
                               then p_payload->>'status' else status end,
      entry_date        = case when p_payload ? 'entryDate' and btrim(coalesce(p_payload->>'entryDate','')) <> ''
                               then p_payload->>'entryDate' else entry_date end,
      triagem_score     = case when p_payload ? 'triagemScore'
                               then case when p_payload->>'triagemScore' is null then null
                                         else (p_payload->>'triagemScore')::integer end
                               else triagem_score end,
      score_psicologia        = case when p_payload ? 'scorePsicologia'       then (p_payload->>'scorePsicologia')::integer       else score_psicologia end,
      score_psicomotricidade  = case when p_payload ? 'scorePsicomotricidade' then (p_payload->>'scorePsicomotricidade')::integer else score_psicomotricidade end,
      score_fisioterapia      = case when p_payload ? 'scoreFisioterapia'     then (p_payload->>'scoreFisioterapia')::integer     else score_fisioterapia end,
      score_psicopedagogia    = case when p_payload ? 'scorePsicopedagogia'   then (p_payload->>'scorePsicopedagogia')::integer   else score_psicopedagogia end,
      score_ed_fisica         = case when p_payload ? 'scoreEdFisica'         then (p_payload->>'scoreEdFisica')::integer         else score_ed_fisica end,
      score_fonoaudiologia    = case when p_payload ? 'scoreFonoaudiologia'   then (p_payload->>'scoreFonoaudiologia')::integer   else score_fonoaudiologia end,
      score_to                = case when p_payload ? 'scoreTO'               then (p_payload->>'scoreTO')::integer               else score_to end,
      score_nutricionista     = case when p_payload ? 'scoreNutricionista'    then (p_payload->>'scoreNutricionista')::integer    else score_nutricionista end,
      escola_publica    = case when p_payload ? 'escolaPublica'   then (p_payload->>'escolaPublica')::boolean   else escola_publica end,
      trabalho_na_roca  = case when p_payload ? 'trabalhoNaRoca'  then (p_payload->>'trabalhoNaRoca')::boolean  else trabalho_na_roca end,
      tipo_registro     = case when p_payload ? 'tipoRegistro'    and btrim(coalesce(p_payload->>'tipoRegistro','')) <> ''
                               then p_payload->>'tipoRegistro' else tipo_registro end,
      local_atendimento = case when p_payload ? 'localAtendimento'
                               then nullif(btrim(coalesce(p_payload->>'localAtendimento', '')), '')
                               else local_atendimento end
    where id = p_id and company_id = v_company_id
    returning * into v_row;
    if not found then raise exception 'patient not found'; end if;
  end if;

  return v_row;
end;
$$;

create or replace function public.delete_patient(
  p_slug     text,
  p_password text,
  p_id       bigint
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_company_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  delete from public.patients
   where id = p_id and company_id = v_company_id;
end;
$$;

-- Adds a patient to the waiting_list for a specific specialty (or general).
-- Returns a jsonb with the new entry + calculated priority.
create or replace function public.add_patient_to_waiting_list(
  p_slug       text,
  p_password   text,
  p_patient_id bigint,
  p_specialty  text,
  p_notes      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id  bigint;
  v_patient     public.patients%rowtype;
  v_existing_id bigint;
  v_sem_terapia boolean;
  v_priority    text;
  v_today       text;
  v_entry       public.waiting_list%rowtype;
  v_specialty   text;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  v_specialty := nullif(btrim(coalesce(p_specialty, '')), '');

  select * into v_patient from public.patients
   where id = p_patient_id and company_id = v_company_id;
  if not found then raise exception 'patient not found'; end if;

  if coalesce(v_patient.tipo_registro, '') = 'Registro Censo Municipal' then
    raise exception 'Pacientes do Censo Municipal nao podem ser adicionados a fila.';
  end if;

  if v_patient.triagem_score is null then
    raise exception 'O paciente precisa ter triagem registrada antes de entrar na fila.';
  end if;

  if v_specialty is null then
    select id into v_existing_id from public.waiting_list
     where patient_id = p_patient_id and company_id = v_company_id and specialty is null
     limit 1;
  else
    select id into v_existing_id from public.waiting_list
     where patient_id = p_patient_id and company_id = v_company_id and specialty = v_specialty
     limit 1;
  end if;

  if v_existing_id is not null then
    raise exception 'Ja na fila: este paciente ja esta na fila%',
      case when v_specialty is null then '.' else ' para ' || v_specialty || '.' end;
  end if;

  v_sem_terapia := coalesce(v_patient.local_atendimento, '') in ('Sem Atendimento', 'Nenhum');
  v_priority := public._calc_priority(
    v_patient.triagem_score,
    coalesce(v_patient.escola_publica, false),
    coalesce(v_patient.trabalho_na_roca, false),
    v_sem_terapia
  );
  v_today := to_char(now() at time zone 'UTC', 'YYYY-MM-DD');

  insert into public.waiting_list (
    company_id, patient_id, professional_id, specialty, priority, notes, entry_date
  ) values (
    v_company_id, p_patient_id, null, v_specialty, v_priority, p_notes, v_today
  )
  returning * into v_entry;

  update public.patients
     set status = 'Fila de Espera'
   where id = p_patient_id and company_id = v_company_id;

  return jsonb_build_object(
    'id',               v_entry.id,
    'companyId',        v_entry.company_id,
    'patientId',        v_entry.patient_id,
    'professionalId',   v_entry.professional_id,
    'specialty',        v_entry.specialty,
    'priority',         v_entry.priority,
    'notes',            v_entry.notes,
    'entryDate',        v_entry.entry_date,
    'createdAt',        v_entry.created_at,
    'updatedAt',        v_entry.updated_at,
    'patientName',      v_patient.name,
    'calculatedFrom',   jsonb_build_object(
                          'triagemScore',  v_patient.triagem_score,
                          'escolaPublica', v_patient.escola_publica,
                          'trabalhoNaRoca', v_patient.trabalho_na_roca
                        )
  );
end;
$$;

-- Returns a summary suitable for the "absences" card in patient-detail.
-- Fase 4C will plug in real appointment rows. For now we return only the
-- absence_count column + an empty list so the UI keeps working.
create or replace function public.get_patient_absences(
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
  v_patient    public.patients%rowtype;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  select * into v_patient from public.patients
   where id = p_id and company_id = v_company_id;
  if not found then raise exception 'patient not found'; end if;
  return jsonb_build_object(
    'patientId',     v_patient.id,
    'patientName',   v_patient.name,
    'absenceCount',  v_patient.absence_count,
    'hasWarning',    v_patient.absence_count >= 3,
    'absences',      '[]'::jsonb
  );
end;
$$;

-- Returns patient + professional + (stubbed) appointment counters so the
-- arco-iris PDF can be generated without hitting appointments (Fase 4C).
create or replace function public.get_patient_pdf(
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
  v_company_id   bigint;
  v_patient      public.patients%rowtype;
  v_professional public.professionals%rowtype;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  select * into v_patient from public.patients
   where id = p_id and company_id = v_company_id;
  if not found then raise exception 'patient not found'; end if;

  if v_patient.professional_id is not null then
    select * into v_professional from public.professionals
     where id = v_patient.professional_id and company_id = v_company_id;
  end if;

  return jsonb_build_object(
    'patient',              to_jsonb(v_patient),
    'professional',         case when v_professional.id is null then null else to_jsonb(v_professional) end,
    'absenceCount',         v_patient.absence_count,
    'totalAppointments',    0,
    'lastAppointmentDate',  null
  );
end;
$$;

-- =========================================================================
-- Waiting list RPCs
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
  select coalesce(jsonb_agg(row), '[]'::jsonb) into v_result
  from (
    select jsonb_build_object(
      'id',                   w.id,
      'companyId',            w.company_id,
      'patientId',            w.patient_id,
      'patientName',          coalesce(p.name, ''),
      'patientPhone',         p.phone,
      'patientProntuario',    p.prontuario,
      'professionalId',       w.professional_id,
      'specialty',            coalesce(w.specialty, pr.specialty),
      'professionalName',     pr.name,
      'professionalSpecialty', pr.specialty,
      'priority',             w.priority,
      'notes',                w.notes,
      'entryDate',            w.entry_date,
      'createdAt',            w.created_at,
      'updatedAt',            w.updated_at
    ) as row
      from public.waiting_list w
      left join public.patients      p  on p.id  = w.patient_id
      left join public.professionals pr on pr.id = w.professional_id
     where w.company_id = v_company_id
       and (p_professional_id is null or w.professional_id = p_professional_id)
       and (p.tipo_registro is null or p.tipo_registro <> 'Registro Censo Municipal')
     order by
       case w.priority
         when 'elevado' then 1 when 'alta' then 1
         when 'moderado' then 2 when 'media' then 2
         when 'leve' then 3
         when 'baixo' then 4 when 'baixa' then 4
         else 5
       end,
       w.entry_date asc
  ) s;
  return v_result;
end;
$$;

create or replace function public.upsert_waiting_list(
  p_slug     text,
  p_password text,
  p_id       bigint,
  p_payload  jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_row        public.waiting_list%rowtype;
  v_patient    public.patients%rowtype;
  v_patient_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  if p_id is null then
    v_patient_id := (p_payload->>'patientId')::bigint;
    select * into v_patient from public.patients
     where id = v_patient_id and company_id = v_company_id;
    if not found then raise exception 'paciente nao encontrado'; end if;

    if coalesce(v_patient.tipo_registro, '') = 'Registro Censo Municipal' then
      raise exception 'Pacientes do Censo Municipal nao podem ser adicionados a fila.';
    end if;
    if v_patient.triagem_score is null then
      raise exception 'O paciente precisa ter triagem registrada antes de entrar na fila.';
    end if;

    insert into public.waiting_list (
      company_id, patient_id, professional_id,
      specialty, priority, notes, entry_date
    ) values (
      v_company_id,
      v_patient_id,
      case when p_payload ? 'professionalId' and p_payload->>'professionalId' is not null
            and btrim(p_payload->>'professionalId') <> ''
           then (p_payload->>'professionalId')::bigint end,
      nullif(btrim(coalesce(p_payload->>'specialty', '')), ''),
      coalesce(nullif(btrim(coalesce(p_payload->>'priority', '')), ''), 'media'),
      nullif(btrim(coalesce(p_payload->>'notes', '')), ''),
      coalesce(nullif(btrim(coalesce(p_payload->>'entryDate', '')), ''),
               to_char(now() at time zone 'UTC', 'YYYY-MM-DD'))
    )
    returning * into v_row;
  else
    update public.waiting_list set
      specialty = case when p_payload ? 'specialty' then nullif(btrim(coalesce(p_payload->>'specialty', '')), '') else specialty end,
      priority  = case when p_payload ? 'priority'  and btrim(coalesce(p_payload->>'priority','')) <> ''
                       then p_payload->>'priority' else priority end,
      notes     = case when p_payload ? 'notes'     then nullif(btrim(coalesce(p_payload->>'notes', '')), '')     else notes end
    where id = p_id and company_id = v_company_id
    returning * into v_row;
    if not found then raise exception 'entry nao encontrada'; end if;
    select * into v_patient from public.patients where id = v_row.patient_id;
  end if;

  return jsonb_build_object(
    'id',               v_row.id,
    'companyId',        v_row.company_id,
    'patientId',        v_row.patient_id,
    'patientName',      coalesce(v_patient.name, ''),
    'patientPhone',     v_patient.phone,
    'professionalId',   v_row.professional_id,
    'specialty',        v_row.specialty,
    'priority',         v_row.priority,
    'notes',            v_row.notes,
    'entryDate',        v_row.entry_date,
    'createdAt',        v_row.created_at,
    'updatedAt',        v_row.updated_at
  );
end;
$$;

create or replace function public.delete_waiting_list(
  p_slug     text,
  p_password text,
  p_id       bigint
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_company_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  delete from public.waiting_list
   where id = p_id and company_id = v_company_id;
end;
$$;

-- =========================================================================
-- Triagem auto-link (Phase 4B reimplements the "paciente adicionado a fila"
-- flow that was removed in Phase 3). The Triagem frontend calls this RPC
-- right after upsert_triagem succeeds.
-- =========================================================================

create or replace function public.autolink_triagem(
  p_slug        text,
  p_password    text,
  p_triagem_id  bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id        bigint;
  v_triagem           public.triagens%rowtype;
  v_respostas         jsonb;
  v_respostas_count   integer := 0;
  v_triagem_score     integer := 0;
  v_area_scores       jsonb   := '{}'::jsonb;
  v_patient           public.patients%rowtype;
  v_cpf_clean         text;
  v_escola_publica    boolean;
  v_trabalho_na_roca  boolean;
  v_sem_terapia       boolean;
  v_priority          text;
  v_today             text;
  v_scored_specs      text[] := array[]::text[];
  v_new_specs         text[] := array[]::text[];
  v_existing_specs    text[] := array[]::text[];
  v_skipped_specs     text[] := array[]::text[];
  v_resolved_tipo     text;
  v_update_fields     jsonb := '{}'::jsonb;
  r                   record;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  select * into v_triagem from public.triagens
   where id = p_triagem_id and company_id = v_company_id;
  if not found then raise exception 'triagem nao encontrada'; end if;

  -- Parse respostas (stored as text JSON in triagens.respostas)
  if v_triagem.respostas is null or btrim(v_triagem.respostas) = '' then
    return jsonb_build_object('linkedOnly', false, 'addedToQueue', false, 'reason', 'no_respostas');
  end if;

  begin
    v_respostas := v_triagem.respostas::jsonb;
  exception when others then
    return jsonb_build_object('linkedOnly', false, 'addedToQueue', false, 'reason', 'invalid_respostas');
  end;

  if jsonb_typeof(v_respostas) <> 'array' then
    return jsonb_build_object('linkedOnly', false, 'addedToQueue', false, 'reason', 'respostas_not_array');
  end if;

  v_respostas_count := jsonb_array_length(v_respostas);
  if v_respostas_count < 120 then
    return jsonb_build_object('linkedOnly', false, 'addedToQueue', false, 'reason', 'respostas_too_short');
  end if;

  -- Sum total + per-area scores (8 areas of 15 questions each)
  v_triagem_score := 0;
  declare
    i int := 0;
    v_sums int[] := array[0,0,0,0,0,0,0,0];
  begin
    for r in select (value::int) as val, ord from jsonb_array_elements_text(v_respostas) with ordinality as t(value, ord)
    loop
      exit when r.ord > 120;
      i := (r.ord - 1) / 15;
      v_sums[i + 1] := v_sums[i + 1] + r.val;
      v_triagem_score := v_triagem_score + r.val;
    end loop;

    v_area_scores := jsonb_build_object(
      'score_psicologia',       v_sums[1],
      'score_psicomotricidade', v_sums[2],
      'score_fisioterapia',     v_sums[3],
      'score_to',               v_sums[4],
      'score_fonoaudiologia',   v_sums[5],
      'score_nutricionista',    v_sums[6],
      'score_psicopedagogia',   v_sums[7],
      'score_ed_fisica',        v_sums[8]
    );

    if v_sums[1] > 0 then v_scored_specs := v_scored_specs || 'Psicologia'; end if;
    if v_sums[2] > 0 then v_scored_specs := v_scored_specs || 'Psicomotricidade'; end if;
    if v_sums[3] > 0 then v_scored_specs := v_scored_specs || 'Fisioterapia'; end if;
    if v_sums[4] > 0 then v_scored_specs := v_scored_specs || 'Terapia Ocupacional'; end if;
    if v_sums[5] > 0 then v_scored_specs := v_scored_specs || 'Fonoaudiologia'; end if;
    if v_sums[6] > 0 then v_scored_specs := v_scored_specs || 'Nutrição'; end if;
    if v_sums[7] > 0 then v_scored_specs := v_scored_specs || 'Psicopedagogia'; end if;
    if v_sums[8] > 0 then v_scored_specs := v_scored_specs || 'Educação Física'; end if;
  end;

  v_escola_publica   := coalesce(v_triagem.tipo_escola,   '') in ('Municipal', 'Estadual');
  v_trabalho_na_roca := coalesce(v_triagem.trabalho_pais, '') in ('Informal/Roça', 'Desempregado');

  -- Find matching patient by CPF (digits only) first, then by trimmed lowercase name
  v_cpf_clean := nullif(regexp_replace(coalesce(v_triagem.cpf, ''), '[^0-9]', '', 'g'), '');
  if v_cpf_clean is not null and length(v_cpf_clean) >= 11 then
    select * into v_patient from public.patients
     where company_id = v_company_id
       and regexp_replace(coalesce(cpf, ''), '[^0-9]', '', 'g') = v_cpf_clean
     limit 1;
  end if;

  if v_patient.id is null and v_triagem.nome is not null then
    select * into v_patient from public.patients
     where company_id = v_company_id
       and lower(btrim(name)) = lower(btrim(v_triagem.nome))
     limit 1;
  end if;

  if v_patient.id is null then
    return jsonb_build_object('linkedOnly', false, 'addedToQueue', false, 'reason', 'no_matching_patient');
  end if;

  -- Update patient scores + flags (+ tipo_registro / local_atendimento when patient had none)
  update public.patients set
    triagem_score          = v_triagem_score,
    score_psicologia       = (v_area_scores->>'score_psicologia')::int,
    score_psicomotricidade = (v_area_scores->>'score_psicomotricidade')::int,
    score_fisioterapia     = (v_area_scores->>'score_fisioterapia')::int,
    score_to               = (v_area_scores->>'score_to')::int,
    score_fonoaudiologia   = (v_area_scores->>'score_fonoaudiologia')::int,
    score_nutricionista    = (v_area_scores->>'score_nutricionista')::int,
    score_psicopedagogia   = (v_area_scores->>'score_psicopedagogia')::int,
    score_ed_fisica        = (v_area_scores->>'score_ed_fisica')::int,
    escola_publica         = v_escola_publica,
    trabalho_na_roca       = v_trabalho_na_roca,
    tipo_registro          = case
                               when tipo_registro is not null and btrim(tipo_registro) <> '' then tipo_registro
                               when v_triagem.tipo_registro is not null and btrim(v_triagem.tipo_registro) <> '' then v_triagem.tipo_registro
                               else tipo_registro end,
    local_atendimento      = case
                               when local_atendimento is not null and btrim(local_atendimento) <> '' then local_atendimento
                               else v_triagem.local_atendimento end
  where id = v_patient.id and company_id = v_company_id
  returning * into v_patient;

  v_resolved_tipo := v_patient.tipo_registro;

  if v_resolved_tipo = 'Registro Censo Municipal' then
    return jsonb_build_object(
      'linkedOnly',   true,
      'addedToQueue', false,
      'scoresUpdated', true,
      'censoMunicipal', true,
      'patientId',    v_patient.id,
      'patientName',  v_patient.name
    );
  end if;

  if v_patient.status in ('Alta', 'Óbito', 'Desistência') then
    return jsonb_build_object(
      'linkedOnly', true, 'addedToQueue', false, 'scoresUpdated', true,
      'patientId', v_patient.id, 'patientName', v_patient.name,
      'reason', 'blocked_status'
    );
  end if;

  if array_length(v_scored_specs, 1) is null then
    return jsonb_build_object(
      'linkedOnly', true, 'addedToQueue', false, 'scoresUpdated', true,
      'patientId', v_patient.id, 'patientName', v_patient.name,
      'reason', 'no_scored_specialties'
    );
  end if;

  -- Dedup against existing waiting_list entries
  select coalesce(array_agg(coalesce(specialty, '')), array[]::text[]) into v_existing_specs
    from public.waiting_list
   where patient_id = v_patient.id and company_id = v_company_id;

  select coalesce(array_agg(s), array[]::text[]) into v_new_specs
    from unnest(v_scored_specs) s
   where not (s = any(v_existing_specs));

  select coalesce(array_agg(s), array[]::text[]) into v_skipped_specs
    from unnest(v_scored_specs) s
   where s = any(v_existing_specs);

  if array_length(v_new_specs, 1) is null then
    return jsonb_build_object(
      'linkedOnly',     true,
      'addedToQueue',   false,
      'scoresUpdated',  true,
      'patientId',      v_patient.id,
      'patientName',    v_patient.name,
      'specialties',    to_jsonb(v_scored_specs),
      'alreadyQueued',  to_jsonb(v_skipped_specs),
      'reason',         'all_already_queued'
    );
  end if;

  v_sem_terapia := coalesce(v_patient.local_atendimento, '') in ('Sem Atendimento', 'Nenhum');
  v_priority := public._calc_priority(
    v_triagem_score, v_escola_publica, v_trabalho_na_roca, v_sem_terapia
  );
  v_today := to_char(now() at time zone 'UTC', 'YYYY-MM-DD');

  insert into public.waiting_list (company_id, patient_id, specialty, priority, notes, entry_date)
  select v_company_id, v_patient.id, s, v_priority, null, v_today
    from unnest(v_new_specs) s;

  update public.patients set status = 'Fila de Espera'
   where id = v_patient.id and company_id = v_company_id;

  return jsonb_build_object(
    'linkedOnly',     false,
    'addedToQueue',   true,
    'scoresUpdated',  true,
    'patientId',      v_patient.id,
    'patientName',    v_patient.name,
    'priority',       v_priority,
    'specialties',    to_jsonb(v_new_specs),
    'alreadyQueued',  to_jsonb(v_skipped_specs),
    'triagemScore',   v_triagem_score
  );
end;
$$;

-- =========================================================================
-- Grants
-- =========================================================================

revoke all on function public.list_patients(text, text, text, bigint)                from public;
grant execute on function public.list_patients(text, text, text, bigint)             to anon, authenticated;

revoke all on function public.get_patient(text, text, bigint)                        from public;
grant execute on function public.get_patient(text, text, bigint)                     to anon, authenticated;

revoke all on function public.next_prontuario(text, text)                            from public;
grant execute on function public.next_prontuario(text, text)                         to anon, authenticated;

revoke all on function public.check_prontuario(text, text, text)                     from public;
grant execute on function public.check_prontuario(text, text, text)                  to anon, authenticated;

revoke all on function public.upsert_patient(text, text, bigint, jsonb)              from public;
grant execute on function public.upsert_patient(text, text, bigint, jsonb)           to anon, authenticated;

revoke all on function public.delete_patient(text, text, bigint)                     from public;
grant execute on function public.delete_patient(text, text, bigint)                  to anon, authenticated;

revoke all on function public.add_patient_to_waiting_list(text, text, bigint, text, text) from public;
grant execute on function public.add_patient_to_waiting_list(text, text, bigint, text, text) to anon, authenticated;

revoke all on function public.get_patient_absences(text, text, bigint)               from public;
grant execute on function public.get_patient_absences(text, text, bigint)            to anon, authenticated;

revoke all on function public.get_patient_pdf(text, text, bigint)                    from public;
grant execute on function public.get_patient_pdf(text, text, bigint)                 to anon, authenticated;

revoke all on function public.list_waiting_list(text, text, bigint)                  from public;
grant execute on function public.list_waiting_list(text, text, bigint)               to anon, authenticated;

revoke all on function public.upsert_waiting_list(text, text, bigint, jsonb)         from public;
grant execute on function public.upsert_waiting_list(text, text, bigint, jsonb)      to anon, authenticated;

revoke all on function public.delete_waiting_list(text, text, bigint)                from public;
grant execute on function public.delete_waiting_list(text, text, bigint)             to anon, authenticated;

revoke all on function public.autolink_triagem(text, text, bigint)                   from public;
grant execute on function public.autolink_triagem(text, text, bigint)                to anon, authenticated;
