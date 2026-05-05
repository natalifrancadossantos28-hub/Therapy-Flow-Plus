-- =========================================================================
-- 0036_status_recorrente_herdado.sql
--
-- Quando o profissional marca uma sessao recorrente como "atendimento" (Em
-- Atendimento), o status passa a valer para TODAS as semanas futuras dessa
-- mesma recorrencia (mesmo recurrence_group_id), sobrescrevendo apenas as
-- linhas que ainda estao "agendado". Status terminais como falta, alta,
-- desmarcado, remanejado, remarcado, etc. NAO sao tocados.
--
-- Sem mudancas terminais? sem propagacao. Migration idempotente.
-- =========================================================================

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
  v_company_id bigint;
  v_existing   public.appointments%rowtype;
  v_updated    public.appointments%rowtype;
  v_patient    public.patients%rowtype;
  v_was_abs    boolean;
  v_is_abs     boolean;
  v_new_abs    integer;
  v_new_conseq integer;
  v_propagated integer := 0;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  select * into v_existing
    from public.appointments
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

  -- ─────────────────────────────────────────────────────────────────
  -- Heranca: quando o profissional marca uma sessao recorrente como
  -- "atendimento", as semanas FUTURAS desse mesmo recurrence_group_id
  -- que ainda estao "agendado" passam tambem para "atendimento".
  -- Nao toca em status terminais (falta_*, ausente, alta, desmarcado,
  -- remanejado, remarcado, cancelado, etc.).
  -- ─────────────────────────────────────────────────────────────────
  if p_status = 'atendimento'
     and v_existing.recurrence_group_id is not null
     and btrim(v_existing.recurrence_group_id) <> '' then
    update public.appointments
       set status     = 'atendimento',
           updated_at = now()
     where company_id = v_company_id
       and recurrence_group_id = v_existing.recurrence_group_id
       and id <> v_updated.id
       and "date" > v_updated."date"
       and lower(coalesce(status, 'agendado')) in ('agendado','agendada','scheduled');
    get diagnostics v_propagated = row_count;
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
    'propagatedCount',   v_propagated
  );
end;
$$;

revoke all on function public.update_appointment(text, text, bigint, text, text, text, text, text) from public;
grant execute on function public.update_appointment(text, text, bigint, text, text, text, text, text) to anon, authenticated;

-- Backfill: para cada grupo de recorrencia onde ja existe alguma sessao em
-- "atendimento", propaga o status para as ocorrencias futuras "agendado"
-- da mesma serie.
with primeiras as (
  select recurrence_group_id, min("date") as first_atend_date
    from public.appointments
   where recurrence_group_id is not null
     and btrim(recurrence_group_id) <> ''
     and lower(coalesce(status, '')) = 'atendimento'
   group by recurrence_group_id
)
update public.appointments a
   set status     = 'atendimento',
       updated_at = now()
  from primeiras p
 where a.recurrence_group_id = p.recurrence_group_id
   and a."date" > p.first_atend_date
   and lower(coalesce(a.status, 'agendado')) in ('agendado','agendada','scheduled');

commit;
