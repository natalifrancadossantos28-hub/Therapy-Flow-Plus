-- =============================================================================
-- 0017: Cancelar / desmarcar devolve o paciente à fila da especialidade
-- =============================================================================
--
-- Regra confirmada com Natali:
--   Ao desmarcar um agendamento (status = 'desmarcado'), se o paciente
--   NÃO tiver outro horário ativo em profissionais da MESMA especialidade,
--   ele volta automaticamente para a waiting_list daquela especialidade.
--   Outras filas (Fono, Psico, etc) ficam intocadas.
--
-- Considerações:
--   * "Horário ativo" = appointment com status 'agendado' OU 'em_atendimento'
--     e data >= hoje (America/Sao_Paulo).
--   * Re-inserimos com priority='media' e entry_date=hoje. O score exibido
--     na fila é calculado de patient.triagem_score + vulnerabilidades, então
--     continua o mesmo que o paciente tinha antes.
--   * Idempotente: se já existe uma entrada da mesma especialidade, não duplica.
--   * Alta usa uma RPC separada (delete_appointment_alta), então não entra aqui.
--   * 'remanejado' / 'remarcado' não disparam re-entrada (paciente continua
--     previsto no grupo de recorrência).
--
-- Sem breaking changes: update_appointment mantém a mesma assinatura e as
-- mesmas chaves JSON existentes; apenas adiciona o efeito colateral descrito.
-- =============================================================================

begin;

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
as $$
declare
  v_company_id         bigint;
  v_today              text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  v_existing           public.appointments%rowtype;
  v_updated            public.appointments%rowtype;
  v_patient            public.patients%rowtype;
  v_was_abs            boolean;
  v_is_abs             boolean;
  v_new_abs            integer;
  v_new_conseq         integer;
  v_specialty          text;
  v_active_same_spec   integer := 0;
  v_existing_queue     integer := 0;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  select * into v_existing from public.appointments
   where id = p_id and company_id = v_company_id;
  if not found then raise exception 'Appointment not found'; end if;

  update public.appointments set
    status         = coalesce(p_status,         status),
    rescheduled_to = coalesce(p_rescheduled_to, rescheduled_to),
    notes          = coalesce(p_notes,          notes),
    "date"         = coalesce(p_date,           "date"),
    "time"         = coalesce(p_time,           "time"),
    updated_at     = now()
  where id = p_id and company_id = v_company_id
  returning * into v_updated;

  -- ===============================================================
  -- Contador de faltas do paciente (global, inalterado do 0008).
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
  -- NOVO (0017): desmarcar devolve o paciente à fila da especialidade
  -- se ele não tiver outro horário ativo em profissionais da mesma área.
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
         and a.date >= v_today
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
            'Re-adicionado automaticamente após desmarcar horário #' || v_updated.id
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
    'trabalhoNaRoca',    coalesce(v_patient.trabalho_na_roca, false)
  );
end;
$$;

revoke all on function public.update_appointment(text, text, bigint, text, text, text, text, text) from public;
grant execute on function public.update_appointment(text, text, bigint, text, text, text, text, text) to anon, authenticated;

commit;
