-- 0090: presença é só o check-in da recepção
--
-- Problema: ao marcar "Em Sessão" (status 'atendimento'), o update_appointment
-- herdava esse status para TODAS as ocorrências futuras da recorrência (e das
-- parceiras Multi). Resultado: pacientes que nem chegaram apareciam como
-- "Em Sessão" na Recepção e inflavam o contador de Presentes.
--
-- Correção:
--   1. update_appointment deixa de propagar 'atendimento' para o futuro
--      (a propagação de data/hora/frequência e a sincronia Multi continuam);
--   2. limpeza: agendamentos de hoje em diante que estão em 'atendimento'
--      por herança voltam para 'agendado'. Presenças reais ('presente'),
--      faltas e cancelamentos não são tocados.

begin;

update public.appointments
   set status     = 'agendado',
       updated_at = now()
 where lower(coalesce(status, '')) in ('atendimento', 'em_atendimento')
   and "date" >= to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');

create or replace function public.update_appointment(
  p_slug           text,
  p_password       text,
  p_id             bigint,
  p_status         text     default null,
  p_rescheduled_to text     default null,
  p_notes          text     default null,
  p_date           text     default null,
  p_time           text     default null,
  p_frequency      text     default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id         bigint;
  v_today              text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  v_existing           public.appointments%rowtype;
  v_updated            public.appointments%rowtype;
  v_patient            public.patients%rowtype;
  v_is_abs             boolean;
  v_was_abs            boolean;
  v_new_abs            integer;
  v_new_conseq         integer;
  v_freq               text;
  v_propagated         integer := 0;
  v_multi_synced       integer := 0;
  v_specialty          text;
  v_active_same_spec   integer := 0;
  v_existing_queue     integer := 0;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  select * into v_existing from public.appointments
   where id = p_id and company_id = v_company_id;
  if not found then raise exception 'Appointment % not found', p_id; end if;

  v_freq := null;
  if p_frequency is not null and btrim(p_frequency) <> '' then
    v_freq := lower(btrim(p_frequency));
    if v_freq not in ('semanal', 'quinzenal', 'mensal') then
      v_freq := null;
    end if;
  end if;

  update public.appointments
     set status         = coalesce(p_status, status),
         rescheduled_to = coalesce(p_rescheduled_to, rescheduled_to),
         notes          = coalesce(p_notes, notes),
         "date"         = coalesce(p_date, "date"),
         "time"         = coalesce(p_time, "time"),
         frequency      = coalesce(v_freq, frequency),
         updated_at     = now()
   where id = p_id and company_id = v_company_id
   returning * into v_updated;

  select * into v_patient from public.patients
   where id = v_updated.patient_id;

  -- ── Absence tracking ──
  v_is_abs  := coalesce(v_updated.status, '') in ('ausente','falta_nao_justificada');
  v_was_abs := coalesce(v_existing.status, '') in ('ausente','falta_nao_justificada');

  if p_status is not null then
    if v_is_abs and not v_was_abs then
      v_new_abs    := coalesce(v_patient.absence_count, 0) + 1;
      v_new_conseq := coalesce(v_patient.consecutive_unjustified_absences, 0);
      if v_updated.status = 'falta_nao_justificada' then
        v_new_conseq := v_new_conseq + 1;
      end if;
      update public.patients
         set absence_count = v_new_abs,
             consecutive_unjustified_absences = v_new_conseq,
             updated_at = now()
       where id = v_patient.id
       returning * into v_patient;

    elsif v_was_abs and not v_is_abs then
      v_new_abs    := greatest(0, coalesce(v_patient.absence_count, 1) - 1);
      v_new_conseq := coalesce(v_patient.consecutive_unjustified_absences, 0);
      if v_existing.status in ('ausente','falta_nao_justificada') then
        v_new_conseq := greatest(0, v_new_conseq - 1);
      end if;
      update public.patients
         set absence_count = v_new_abs,
             consecutive_unjustified_absences = v_new_conseq,
             updated_at = now()
       where id = v_patient.id
       returning * into v_patient;
    end if;
  end if;

  -- ── Multi sync: status + date + time + frequency ──
  if p_status is not null or p_date is not null or p_time is not null or v_freq is not null then
    update public.appointments
       set status     = case when p_status is not null then p_status else status end,
           "date"     = case when p_date is not null then p_date else "date" end,
           "time"     = case when p_time is not null then p_time else "time" end,
           frequency  = case when v_freq is not null then v_freq else frequency end,
           updated_at = now()
     where company_id = v_company_id
       and patient_id = v_updated.patient_id
       and "date"     = v_existing."date"
       and "time"     = v_existing."time"
       and id        <> v_updated.id
       and professional_id <> v_updated.professional_id;
    get diagnostics v_multi_synced = row_count;

    if v_freq is not null and v_multi_synced > 0 then
      update public.appointments future_apt
         set frequency  = v_freq,
             updated_at = now()
        from (
          select distinct recurrence_group_id
            from public.appointments
           where company_id = v_company_id
             and patient_id = v_updated.patient_id
             and "date"     = v_updated."date"
             and "time"     = v_updated."time"
             and id        <> v_updated.id
             and professional_id <> v_updated.professional_id
             and recurrence_group_id is not null
             and btrim(recurrence_group_id) <> ''
        ) partner
       where future_apt.company_id = v_company_id
         and future_apt.recurrence_group_id = partner.recurrence_group_id;
    end if;
  end if;

  -- ── Multi notes propagation ──
  if p_notes is not null
     and p_notes like 'Atendimento Multi com%'
     and v_updated.recurrence_group_id is not null
     and btrim(v_updated.recurrence_group_id) <> '' then
    update public.appointments
       set notes      = p_notes,
           updated_at = now()
     where company_id = v_company_id
       and recurrence_group_id = v_updated.recurrence_group_id
       and id <> v_updated.id
       and "date" >= v_updated."date";
  end if;

  -- ═══════════════════════════════════════════════════════════════════
  -- RESTORED from 0017: desmarcar devolve paciente à fila da
  -- especialidade se não tiver outro horário ativo na mesma área.
  -- ═══════════════════════════════════════════════════════════════════
  if p_status = 'desmarcado' and v_existing.status is distinct from 'desmarcado' then
    select specialty into v_specialty
      from public.professionals
     where id = v_updated.professional_id and company_id = v_company_id;

    if v_specialty is not null and btrim(v_specialty) <> '' then
      select count(*) into v_active_same_spec
        from public.appointments a
        join public.professionals p2 on p2.id = a.professional_id
       where a.company_id = v_company_id
         and a.patient_id = v_updated.patient_id
         and a.id <> v_updated.id
         and a.status in ('agendado','atendimento','em_atendimento')
         and a."date" >= v_today
         and lower(btrim(coalesce(p2.specialty, ''))) = lower(btrim(v_specialty));

      if v_active_same_spec = 0 then
        select count(*) into v_existing_queue
          from public.waiting_list
         where company_id = v_company_id
           and patient_id = v_updated.patient_id
           and lower(btrim(coalesce(specialty, ''))) = lower(btrim(v_specialty));

        if v_existing_queue = 0 then
          insert into public.waiting_list (
            company_id, patient_id, professional_id, specialty, priority, entry_date, notes
          ) values (
            v_company_id,
            v_updated.patient_id,
            v_updated.professional_id,
            v_specialty,
            'media',
            v_today,
            'Re-adicionado após desmarcar horário #' || v_updated.id
          );
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'id',                v_updated.id,
    'companyId',         v_updated.company_id,
    'patientId',         v_updated.patient_id,
    'professionalId',    v_updated.professional_id,
    'date',              v_updated.date,
    'time',              v_updated.time,
    'status',            v_updated.status,
    'notes',             v_updated.notes,
    'rescheduledTo',     v_updated.rescheduled_to,
    'recurrenceGroupId', v_updated.recurrence_group_id,
    'frequency',         v_updated.frequency,
    'consecutiveUnjustifiedAbsences', coalesce(v_patient.consecutive_unjustified_absences, 0),
    'escolaPublica',     coalesce(v_patient.escola_publica, false),
    'trabalhoNaRoca',    coalesce(v_patient.trabalho_na_roca, false),
    'propagatedCount',   v_propagated,
    'multiSyncedCount',  v_multi_synced
  );
end;
$$;

revoke all on function public.update_appointment(text, text, bigint, text, text, text, text, text, text) from public;
grant execute on function public.update_appointment(text, text, bigint, text, text, text, text, text, text) to anon, authenticated;

commit;
