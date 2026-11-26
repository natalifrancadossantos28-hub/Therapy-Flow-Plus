-- =========================================================================
-- 0148_agenda_sem_repetido_multi.sql
--
-- Paciente aparecendo 2 vezes no mesmo dia com o mesmo profissional:
-- sessão comum + Atendimento Multi (ex.: GAEL FERREIRA SANTOS, Amanda,
-- segunda 15:40 sozinho e 16:30 Multi com a Geovana).
--
-- Causa: ao criar a série nova (Multi ou não), `create_appointments` apaga
-- as sessões futuras da série antiga do mesmo profissional, mas não grava o
-- corte em `recurrence_cuts`. A extensão automática via a série antiga
-- "acabando" e recriava as sessões no horário antigo.
--
-- 1. `create_appointments` grava o corte das séries que substitui (mesmas
--    exceções de antes: Oficina, Motorista/transporte, Pilates mãe × criança).
-- 2. Limpeza (de hoje em diante): série comum que cai no mesmo dia de um
--    Atendimento Multi do mesmo paciente com o mesmo profissional foi
--    substituída pelo Multi → corte na primeira data em comum e apaga as
--    sessões "agendado" dela a partir daí. Fora: Multi, Pilates, Oficina,
--    Motorista/transporte.
-- 2b. Duas séries comuns no mesmo dia com o mesmo profissional: fica a
--    criada por último, a antiga é cortada na primeira data em comum.
-- 3. Repete a limpeza da 0147 (mesmo paciente, profissional, dia e horário).
--
-- Rode DEPOIS da 0146 e da 0147. Idempotente.
-- =========================================================================

begin;

-- ── 1. Série nova grava o corte da série substituída ────────────────────
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
      -- Encerra as séries substituídas (corte), senão a extensão automática
      -- recria a série antiga no horário de antes (ex.: Gael / Amanda).
      insert into public.recurrence_cuts (company_id, recurrence_group_id, cut_from)
      select distinct a.company_id, a.recurrence_group_id, p_date
        from public.appointments a
       where a.company_id = v_company_id
         and a.patient_id = p_patient_id
         and a.professional_id = p_professional_id
         and a."date" >= p_date
         and a.recurrence_group_id is not null
         and btrim(a.recurrence_group_id) <> ''
         and lower(coalesce(a.status, 'agendado')) in
             ('agendado', 'agendada', 'scheduled', 'pausado', 'atendimento')
         and coalesce(a.notes, '') not like 'Transporte de %'
         and (coalesce(a.notes, '') like '%[PILATES — Mãe/Responsável]%') = v_new_is_pilates
      on conflict (company_id, recurrence_group_id) do update
        set cut_from = least(public.recurrence_cuts.cut_from, excluded.cut_from);

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

-- ── 2. Série comum substituída pelo Multi (mesmo profissional) ──────────
create temp table _serie_substituida on commit drop as
select a.company_id, a.recurrence_group_id, min(a."date") as cut_from
  from public.appointments a
  join public.professionals pr
    on pr.id = a.professional_id and pr.company_id = a.company_id
 where a."date"::date >= (now() at time zone 'America/Sao_Paulo')::date
   and a.recurrence_group_id is not null
   and btrim(a.recurrence_group_id) <> ''
   and lower(coalesce(a.status, 'agendado')) in ('agendado', 'agendada', 'scheduled')
   and coalesce(a.notes, '') not like 'Atendimento Multi com %'
   and coalesce(a.notes, '') not like '%[PILATES — Mãe/Responsável]%'
   and coalesce(a.notes, '') not like 'Transporte de %'
   and not public._is_transport_specialty(pr.specialty)
   and lower(coalesce(pr.specialty, '')) not like '%oficina%'
   and exists (
     select 1 from public.appointments m
      where m.company_id = a.company_id
        and m.patient_id = a.patient_id
        and m.professional_id = a.professional_id
        and m."date" = a."date"
        and m.id <> a.id
        and coalesce(m.notes, '') like 'Atendimento Multi com %'
        and lower(coalesce(m.status, '')) not in ('desmarcado', 'cancelado')
   )
 group by a.company_id, a.recurrence_group_id;

delete from public.appointments a
 using _serie_substituida s
 where a.company_id = s.company_id
   and a.recurrence_group_id = s.recurrence_group_id
   and a."date" >= s.cut_from
   and lower(coalesce(a.status, 'agendado')) in ('agendado', 'agendada', 'scheduled');

insert into public.recurrence_cuts (company_id, recurrence_group_id, cut_from)
select company_id, recurrence_group_id, cut_from from _serie_substituida
on conflict (company_id, recurrence_group_id) do update
  set cut_from = least(public.recurrence_cuts.cut_from, excluded.cut_from);

-- ── 2b. Duas séries comuns no mesmo dia com o mesmo profissional ────────
-- Ninguém repete no mesmo dia: fica a série criada por último (mesma regra
-- do `create_appointments`); a mais antiga é cortada na primeira data em
-- comum. Ex.: João Victor / Karla (08:00 e 14:50), David / Claudia (14:50 e
-- 15:40).
create temp table _serie_antiga on commit drop as
select a.company_id, a.recurrence_group_id, min(a."date") as cut_from
  from public.appointments a
  join public.professionals pr
    on pr.id = a.professional_id and pr.company_id = a.company_id
  join public.appointments k
    on k.company_id = a.company_id
   and k.patient_id = a.patient_id
   and k.professional_id = a.professional_id
   and k."date" = a."date"
   and k.recurrence_group_id is not null
   and btrim(k.recurrence_group_id) <> ''
   and k.recurrence_group_id <> a.recurrence_group_id
   and (k.created_at, k.id) > (a.created_at, a.id)
   and lower(coalesce(k.status, 'agendado')) in ('agendado', 'agendada', 'scheduled')
   and coalesce(k.notes, '') not like 'Atendimento Multi com %'
   and coalesce(k.notes, '') not like 'Transporte de %'
   and (coalesce(k.notes, '') like '%[PILATES — Mãe/Responsável]%')
     = (coalesce(a.notes, '') like '%[PILATES — Mãe/Responsável]%')
 where a."date"::date >= (now() at time zone 'America/Sao_Paulo')::date
   and a.recurrence_group_id is not null
   and btrim(a.recurrence_group_id) <> ''
   and lower(coalesce(a.status, 'agendado')) in ('agendado', 'agendada', 'scheduled')
   and coalesce(a.notes, '') not like 'Atendimento Multi com %'
   and coalesce(a.notes, '') not like 'Transporte de %'
   and not public._is_transport_specialty(pr.specialty)
   and lower(coalesce(pr.specialty, '')) not like '%oficina%'
 group by a.company_id, a.recurrence_group_id;

delete from public.appointments a
 using _serie_antiga s
 where a.company_id = s.company_id
   and a.recurrence_group_id = s.recurrence_group_id
   and a."date" >= s.cut_from
   and lower(coalesce(a.status, 'agendado')) in ('agendado', 'agendada', 'scheduled');

insert into public.recurrence_cuts (company_id, recurrence_group_id, cut_from)
select company_id, recurrence_group_id, cut_from from _serie_antiga
on conflict (company_id, recurrence_group_id) do update
  set cut_from = least(public.recurrence_cuts.cut_from, excluded.cut_from);

-- ── 3. Mesmo paciente, profissional, dia e horário (igual à 0147) ───────
create temp table _dup_apagar on commit drop as
with abertas as (
  select a.id, a.company_id, a.recurrence_group_id, a.status,
         row_number() over (
           partition by a.company_id, a.patient_id, a.professional_id, a."date", a."time"
           order by (lower(coalesce(a.status, 'agendado')) in ('agendado', 'agendada', 'scheduled')),
                    (coalesce(a.notes, '') like 'Atendimento Multi com %') desc,
                    a.id
         ) as rn
    from public.appointments a
   where a."date"::date >= (now() at time zone 'America/Sao_Paulo')::date
     and lower(coalesce(a.status, '')) not in ('desmarcado', 'cancelado')
)
select id, company_id, recurrence_group_id
  from abertas
 where rn > 1
   and lower(coalesce(status, 'agendado')) in ('agendado', 'agendada', 'scheduled');

delete from public.appointments a
 using _dup_apagar d
 where a.id = d.id;

insert into public.recurrence_cuts (company_id, recurrence_group_id, cut_from)
select distinct d.company_id, d.recurrence_group_id,
       to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')
  from _dup_apagar d
 where d.recurrence_group_id is not null
   and btrim(d.recurrence_group_id) <> ''
   and not exists (
     select 1 from public.appointments a
      where a.company_id = d.company_id
        and a.recurrence_group_id = d.recurrence_group_id
        and a."date"::date >= (now() at time zone 'America/Sao_Paulo')::date
   )
on conflict (company_id, recurrence_group_id) do nothing;

commit;
