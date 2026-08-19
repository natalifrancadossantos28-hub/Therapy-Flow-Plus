-- =========================================================================
-- 0086_alta_nao_esconde_agenda.sql
--
-- Depois da alta por especialidade (0085) o paciente continuava com o status
-- global 'Alta' quando ainda tinha entrada na fila em outra área. As agendas,
-- a Recepção e o Dashboard escondem quem está com status terminal, então o
-- horário puxado da fila existia no banco mas não aparecia na grade.
--
-- Esta migration:
--   1. corrige o status de quem já ficou preso ('Alta' com agendamento futuro
--      ativo ou entrada na fila) e apaga a alta das áreas onde ele voltou a
--      ter atendimento;
--   2. em create_appointments, agendar quem estava em 'Alta' sempre reativa o
--      paciente (vira 'Atendimento'; 'Fila de Espera' se ainda restar fila).
--
-- Idempotente.
-- =========================================================================

begin;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Backfill — pacientes presos em 'Alta' com atendimento ativo
-- ═══════════════════════════════════════════════════════════════════════
with ativos as (
  select p.id, p.company_id,
         exists (
           select 1 from public.appointments a
            where a.patient_id = p.id
              and a.company_id = p.company_id
              and a."date" >= to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')
              and lower(coalesce(a.status, '')) in ('agendado','atendimento','em_atendimento','em atendimento','presente')
         ) as tem_agenda,
         exists (
           select 1 from public.waiting_list w
            where w.patient_id = p.id and w.company_id = p.company_id
         ) as tem_fila
    from public.patients p
   where p.status = 'Alta'
)
update public.patients p
   set status = case when a.tem_agenda then 'Atendimento' else 'Fila de Espera' end,
       updated_at = now()
  from ativos a
 where p.id = a.id
   and p.company_id = a.company_id
   and (a.tem_agenda or a.tem_fila);

-- A alta deixa de valer nas especialidades em que o paciente voltou a ter
-- agendamento ativo.
delete from public.patient_specialty_discharges d
 where d.tipo = 'Alta'
   and exists (
     select 1
       from public.appointments a
       join public.professionals pr on pr.id = a.professional_id
      where a.patient_id = d.patient_id
        and a.company_id = d.company_id
        and lower(btrim(coalesce(pr.specialty, ''))) = lower(btrim(d.specialty))
        and a."date" >= to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')
        and lower(coalesce(a.status, '')) in ('agendado','atendimento','em_atendimento','em atendimento','presente')
   );

-- ═══════════════════════════════════════════════════════════════════════
-- 2. create_appointments — agendar sempre tira o paciente da 'Alta'
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

  -- Reativação: quem teve alta de uma área volta a ficar ativo ao ser agendado
  -- em outra, mesmo que ainda reste fila em uma terceira especialidade (senão o
  -- status continua 'Alta' e as agendas escondem o horário).
  -- Óbito/Desistência continuam travados.
  update public.patients
     set status = case when v_remaining = 0 then 'Atendimento' else 'Fila de Espera' end,
         professional_id = case when v_remaining = 0 then p_professional_id else professional_id end,
         updated_at = now()
   where id = p_patient_id
     and company_id = v_company_id
     and coalesce(status, '') in ('Fila de Espera', 'Aguardando Triagem', 'Alta', '');

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
