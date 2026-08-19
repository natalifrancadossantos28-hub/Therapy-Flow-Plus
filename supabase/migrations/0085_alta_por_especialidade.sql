-- =========================================================================
-- 0085_alta_por_especialidade.sql
--
-- BUG: a alta de UMA especialidade virava alta GLOBAL do paciente
-- (patients.status = 'Alta'), e a partir daí ele ficava bloqueado para as
-- demais áreas — a fisioterapeuta não conseguia agendar quem teve alta só
-- da Terapia Ocupacional.
--
-- Agora:
--   * a alta é registrada por especialidade em patient_specialty_discharges;
--   * o status global 'Alta' só é aplicado quando NÃO sobra nenhuma outra
--     especialidade ativa (nem agendamento futuro, nem fila);
--   * agendar ou colocar na fila em outra especialidade REATIVA o paciente
--     (status volta para 'Atendimento'/'Fila de Espera') e apaga a alta
--     daquela área;
--   * Óbito/Desistência continuam sendo encerramento do paciente inteiro.
--
-- Idempotente.
-- =========================================================================

begin;

create table if not exists public.patient_specialty_discharges (
  id              bigserial   primary key,
  company_id      bigint      not null references public.ponto_companies(id) on delete cascade,
  patient_id      bigint      not null references public.patients(id)        on delete cascade,
  specialty       text        not null,
  professional_id bigint,
  tipo            text        not null default 'Alta',
  reason          text,
  discharged_at   timestamptz not null default now()
);

create unique index if not exists patient_specialty_discharges_uniq
  on public.patient_specialty_discharges (company_id, patient_id, lower(btrim(specialty)));

create index if not exists patient_specialty_discharges_patient_idx
  on public.patient_specialty_discharges (company_id, patient_id);

alter table public.patient_specialty_discharges enable row level security;

-- Especialidades ainda ativas: agendamento futuro OU entrada na fila.
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

-- ═══════════════════════════════════════════════════════════════════════
-- Alta (ou saída) de UMA especialidade
-- ═══════════════════════════════════════════════════════════════════════
create or replace function public.discharge_patient_specialty(
  p_slug            text,
  p_password        text,
  p_patient_id      bigint,
  p_specialty       text,
  p_professional_id bigint default null,
  p_tipo            text   default 'Alta',
  p_reason          text   default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_patient    public.patients%rowtype;
  v_spec       text;
  v_today      text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  v_tipo       text := coalesce(nullif(btrim(p_tipo), ''), 'Alta');
  v_restantes  text[];
  v_global     boolean;
  v_novo       text;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  v_spec := nullif(btrim(coalesce(p_specialty, '')), '');

  select * into v_patient from public.patients
   where id = p_patient_id and company_id = v_company_id;
  if not found then raise exception 'patient not found'; end if;

  if v_spec is not null then
    insert into public.patient_specialty_discharges
      (company_id, patient_id, specialty, professional_id, tipo, reason)
    values (v_company_id, p_patient_id, v_spec, p_professional_id, v_tipo, p_reason)
    on conflict (company_id, patient_id, lower(btrim(specialty)))
      do update set professional_id = excluded.professional_id,
                    tipo            = excluded.tipo,
                    reason          = excluded.reason,
                    discharged_at   = now();

    -- Sai da fila e da agenda apenas desta especialidade.
    delete from public.waiting_list w
     where w.company_id = v_company_id
       and w.patient_id = p_patient_id
       and lower(btrim(coalesce(w.specialty, ''))) = lower(v_spec);

    delete from public.appointments a
     using public.professionals pr
     where a.company_id = v_company_id
       and a.patient_id = p_patient_id
       and pr.id = a.professional_id
       and pr.company_id = a.company_id
       and lower(btrim(coalesce(pr.specialty, ''))) = lower(v_spec)
       and a."date" >= v_today;
  end if;

  v_restantes := public._especialidades_ativas(v_company_id, p_patient_id, v_spec);

  -- Óbito/Desistência encerram o paciente inteiro; Alta só se não sobrou nada.
  v_global := v_tipo in ('Óbito', 'Obito', 'Desistência', 'Desistencia')
              or coalesce(array_length(v_restantes, 1), 0) = 0;

  if v_global then
    v_novo := v_tipo;
  elsif exists (
    select 1 from public.waiting_list w
     where w.company_id = v_company_id and w.patient_id = p_patient_id
  ) then
    v_novo := 'Fila de Espera';
  else
    v_novo := 'Atendimento';
  end if;

  update public.patients
     set status = v_novo, updated_at = now()
   where id = p_patient_id and company_id = v_company_id;

  return jsonb_build_object(
    'ok',                 true,
    'patientId',          p_patient_id,
    'specialty',          v_spec,
    'tipo',               v_tipo,
    'statusGlobal',       v_novo,
    'altaGlobalAplicada', v_global,
    'especialidadesAtivas', to_jsonb(v_restantes)
  );
end;
$$;

revoke all on function public.discharge_patient_specialty(text, text, bigint, text, bigint, text, text) from public;
grant execute on function public.discharge_patient_specialty(text, text, bigint, text, bigint, text, text) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- Consulta das altas por especialidade (ficha do paciente)
-- ═══════════════════════════════════════════════════════════════════════
create or replace function public.list_patient_discharges(
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
  v_result     jsonb;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id',               d.id,
             'specialty',        d.specialty,
             'professionalId',   d.professional_id,
             'professionalName', pr.name,
             'tipo',             d.tipo,
             'reason',           d.reason,
             'dischargedAt',     d.discharged_at
           ) order by d.discharged_at desc
         ), '[]'::jsonb)
    into v_result
    from public.patient_specialty_discharges d
    left join public.professionals pr
      on pr.id = d.professional_id and pr.company_id = d.company_id
   where d.company_id = v_company_id
     and d.patient_id = p_id;

  return v_result;
end;
$$;

revoke all on function public.list_patient_discharges(text, text, bigint) from public;
grant execute on function public.list_patient_discharges(text, text, bigint) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- Reativação automática: agendar em outra especialidade tira o 'Alta'
-- ═══════════════════════════════════════════════════════════════════════
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

  if v_remaining = 0 then
    update public.patients
       set status = 'Atendimento',
           professional_id = p_professional_id,
           updated_at = now()
     where id = p_patient_id
       and company_id = v_company_id
       -- 'Alta' entra aqui: quem teve alta de uma área volta a ficar ativo
       -- ao ser agendado em outra. Óbito/Desistência continuam travados.
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

-- ═══════════════════════════════════════════════════════════════════════
-- Entrar na fila de outra especialidade também reativa o paciente
-- ═══════════════════════════════════════════════════════════════════════
create or replace function public._fila_reativa_apos_alta()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if new.specialty is not null and btrim(new.specialty) <> '' then
    delete from public.patient_specialty_discharges d
     where d.company_id = new.company_id
       and d.patient_id = new.patient_id
       and lower(btrim(d.specialty)) = lower(btrim(new.specialty));
  end if;

  update public.patients
     set status = 'Fila de Espera', updated_at = now()
   where id = new.patient_id
     and company_id = new.company_id
     and coalesce(status, '') = 'Alta';

  return new;
end;
$$;

drop trigger if exists trg_fila_reativa_apos_alta on public.waiting_list;

create trigger trg_fila_reativa_apos_alta
  after insert on public.waiting_list
  for each row execute function public._fila_reativa_apos_alta();

-- ═══════════════════════════════════════════════════════════════════════
-- Triagem: paciente com alta de uma área volta a entrar na fila
--
-- _autolink_triagem_internal descarta quem está com status 'Alta'. A versão
-- em produção depende de qual migration foi aplicada por último (0047/0081),
-- então o bloqueio é removido reescrevendo apenas essa condição na definição
-- atual da função. Idempotente: na segunda execução o trecho já não existe.
-- ═══════════════════════════════════════════════════════════════════════
do $do$
declare
  v_src text;
  v_de  text := 'v_patient.status in (''Alta'', ''Óbito'', ''Desistência'')';
  v_para text := 'v_patient.status in (''Óbito'', ''Desistência'')';
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = '_autolink_triagem_internal'
   limit 1;

  if v_src is not null and position(v_de in v_src) > 0 then
    execute replace(v_src, v_de, v_para);
  end if;
end
$do$;

commit;
