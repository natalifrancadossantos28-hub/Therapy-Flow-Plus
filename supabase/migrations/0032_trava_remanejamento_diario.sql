-- 0032_trava_remanejamento_diario.sql
-- Regra de negocio: 1 remanejamento por paciente por dia.
-- ----------------------------------------------------------------------------
-- Quando um profissional move um paciente (status -> 'remanejado' ou 'remarcado')
-- registramos a data (em America/Sao_Paulo) em patients.last_remanejamento_date.
-- Em qualquer tentativa subsequente de remanejar/remarcar o MESMO paciente no
-- MESMO dia, o update_appointment levanta exception com a mensagem padronizada
-- 'JA_REMANEJADO_HOJE: ...'. O frontend captura e mostra toast amigavel.
--
-- Liberacao: amanha (proximo dia em America/Sao_Paulo) o paciente fica
-- disponivel para um novo remanejamento.
--
-- Nao quebra contrato: assinatura de update_appointment continua identica.
-- ----------------------------------------------------------------------------

begin;

alter table public.patients
  add column if not exists last_remanejamento_date date;

create or replace function public.update_appointment(
  p_slug           text,
  p_password       text,
  p_id             bigint,
  p_status         text default null,
  p_rescheduled_to text default null,
  p_notes          text default null,
  p_date           text default null,
  p_time           text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_company_id         bigint;
  v_today              text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  v_today_date         date := (now() at time zone 'America/Sao_Paulo')::date;
  v_existing           public.appointments%rowtype;
  v_updated            public.appointments%rowtype;
  v_patient            public.patients%rowtype;
  v_was_abs            boolean;
  v_is_abs             boolean;
  v_new_abs            integer;
  v_new_conseq         integer;
  v_specialty          text;
  v_prof_name          text;
  v_active_same_spec   integer := 0;
  v_existing_queue     integer := 0;
  v_stats_total        integer := 0;
  v_stats_consec       integer := 0;
  v_is_remanej         boolean;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  select * into v_existing from public.appointments
   where id = p_id and company_id = v_company_id;
  if not found then raise exception 'Appointment not found'; end if;

  -- =================================================================
  -- Trava: 1 remanejamento por paciente por dia.
  -- Aplica quando p_status sera setado para 'remanejado' ou 'remarcado'.
  -- =================================================================
  v_is_remanej := p_status is not null and p_status in ('remanejado','remarcado');

  if v_is_remanej then
    select * into v_patient from public.patients
     where id = v_existing.patient_id and company_id = v_company_id;

    if v_patient.id is not null
       and v_patient.last_remanejamento_date is not null
       and v_patient.last_remanejamento_date = v_today_date then
      raise exception 'JA_REMANEJADO_HOJE: Este paciente ja foi remanejado hoje. Tente novamente amanha.';
    end if;
  end if;

  update public.appointments set
    status         = coalesce(p_status,         status),
    rescheduled_to = coalesce(p_rescheduled_to, rescheduled_to),
    notes          = coalesce(p_notes,          notes),
    "date"         = coalesce(p_date,           "date"),
    "time"         = coalesce(p_time,           "time"),
    updated_at     = now()
  where id = p_id and company_id = v_company_id
  returning * into v_updated;

  -- Marca data do remanejamento no paciente para travar segunda tentativa hoje.
  if v_is_remanej then
    update public.patients
       set last_remanejamento_date = v_today_date,
           updated_at               = now()
     where id = v_updated.patient_id
       and company_id = v_company_id;
  end if;

  -- ===============================================================
  -- Contador global em patients (preservado para nao quebrar telas
  -- que ainda leem patient.absence_count). O contador "efetivo" pro
  -- alerta de alta e calculado por profissional abaixo.
  -- ===============================================================
  v_was_abs := v_existing.status in ('ausente','falta_justificada','falta_nao_justificada');
  v_is_abs  := coalesce(p_status, v_existing.status) in ('ausente','falta_justificada','falta_nao_justificada');

  select * into v_patient from public.patients
   where id = v_existing.patient_id and company_id = v_company_id;

  if v_patient.id is not null then
    if p_status is not null and v_is_abs and not v_was_abs then
      v_new_abs    := coalesce(v_patient.absence_count, 0) + 1;
      v_new_conseq := coalesce(v_patient.consecutive_unjustified_absences, 0);
      if p_status in ('ausente','falta_nao_justificada') then
        v_new_conseq := v_new_conseq + 1;
      elsif p_status = 'falta_justificada' then
        v_new_conseq := 0;
      end if;
      update public.patients
         set absence_count = v_new_abs,
             consecutive_unjustified_absences = v_new_conseq,
             updated_at = now()
       where id = v_patient.id
       returning * into v_patient;
    elsif v_was_abs and p_status is not null and not v_is_abs then
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

  -- ===============================================================
  -- Preservado do 0017: desmarcar devolve paciente a fila da
  -- especialidade se nao tiver outro horario ativo na mesma area.
  -- ===============================================================
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
         and a.status in ('agendado','em_atendimento')
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
            v_company_id, v_updated.patient_id, v_updated.professional_id,
            v_specialty, 'media', v_today,
            'Re-adicionado automaticamente apos desmarcar horario #' || v_updated.id
          );
        end if;
      end if;
    end if;
  end if;

  -- ===============================================================
  -- Dados POR profissional pro alerta preventivo / modal de alta.
  -- ===============================================================
  select name, specialty into v_prof_name, v_specialty
    from public.professionals
   where id = v_updated.professional_id and company_id = v_company_id;

  select abs_count, consecutive_abs
    into v_stats_total, v_stats_consec
    from public._absence_stats_by_prof(v_company_id, v_updated.patient_id, v_updated.professional_id);

  return jsonb_build_object(
    'id',                v_updated.id,
    'companyId',         v_updated.company_id,
    'patientId',         v_updated.patient_id,
    'professionalId',    v_updated.professional_id,
    'date',              v_updated."date",
    'time',              v_updated."time",
    'status',            v_updated.status,
    'notes',             v_updated.notes,
    'rescheduledTo',     v_updated.rescheduled_to,
    'recurrenceGroupId', v_updated.recurrence_group_id,
    'frequency',         v_updated.frequency,
    'consecutiveUnjustifiedAbsences', coalesce(v_stats_consec, 0),
    'absenceCountByProf',             coalesce(v_stats_total, 0),
    'professionalName',               coalesce(v_prof_name, ''),
    'professionalSpecialty',          coalesce(v_specialty, ''),
    'patientAbsenceCountTotal',       coalesce(v_patient.absence_count, 0),
    'escolaPublica',                  coalesce(v_patient.escola_publica, false),
    'trabalhoNaRoca',                 coalesce(v_patient.trabalho_na_roca, false)
  );
end;
$fn$;

revoke all on function public.update_appointment(text, text, bigint, text, text, text, text, text) from public;
grant execute on function public.update_appointment(text, text, bigint, text, text, text, text, text) to anon, authenticated;

commit;
