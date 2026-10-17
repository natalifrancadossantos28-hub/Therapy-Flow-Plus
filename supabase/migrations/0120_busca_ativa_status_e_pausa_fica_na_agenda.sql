-- =========================================================================
-- 0120_busca_ativa_status_e_pausa_fica_na_agenda.sql
--
-- 1. Acompanhamento da Busca Ativa (assistente social): cada paciente pausado
--    ganha um status — Pendente / Em andamento / Resolvido / Não resolvido —
--    e uma observação. Mudanças ficam no histórico da fila.
-- 2. Pausa pela agenda com a pergunta "o paciente fica ou sai da agenda?":
--      • Sai da agenda  → pause_patient_from_agenda (0119) — libera o horário
--        e vai para Busca Ativa.
--      • Fica na agenda → pause_patient_keep_agenda — horários continuam
--        reservados, só marcados como pausados.
--    resume_patient_agenda_pause retoma a pausa que ficou na agenda.
-- 3. list_paused_overview devolve o status/observação da busca ativa,
--    professionalId e se o paciente continua na agenda (keepsAgenda).
-- =========================================================================

begin;

alter table public.waiting_list add column if not exists busca_status     text;
alter table public.waiting_list add column if not exists busca_obs        text;
alter table public.waiting_list add column if not exists busca_updated_at timestamptz;
alter table public.appointments add column if not exists busca_status     text;
alter table public.appointments add column if not exists busca_obs        text;
alter table public.appointments add column if not exists busca_updated_at timestamptz;

-- Nova pausa (ou retomada) sempre começa o acompanhamento do zero.
create or replace function public._waiting_list_busca_reset_trg() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if coalesce(new.paused,false) <> coalesce(old.paused,false) then
    new.busca_status := null;
    new.busca_obs := null;
    new.busca_updated_at := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_waiting_list_busca_reset on public.waiting_list;
create trigger trg_waiting_list_busca_reset
  before update on public.waiting_list
  for each row execute function public._waiting_list_busca_reset_trg();

create or replace function public._busca_status_label(p_status text) returns text
language sql immutable as $$
  select case coalesce(p_status,'pendente')
    when 'em_andamento'  then 'Em andamento'
    when 'resolvido'     then 'Resolvido'
    when 'nao_resolvido' then 'Não resolvido'
    else 'Pendente' end
$$;

create or replace function public.set_busca_ativa_status(
  p_slug text, p_password text, p_source text, p_id bigint, p_status text, p_obs text default null
) returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_company_id bigint; v_row public.waiting_list%rowtype; v_apt public.appointments%rowtype;
  v_today text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  v_obs text := nullif(btrim(coalesce(p_obs,'')), '');
  v_n integer := 0;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  if p_status not in ('pendente','em_andamento','resolvido','nao_resolvido') then
    raise exception 'Status de busca ativa inválido: %', p_status;
  end if;

  if p_source = 'fila' then
    update public.waiting_list
       set busca_status = p_status, busca_obs = v_obs, busca_updated_at = now(), updated_at = now()
     where id = p_id and company_id = v_company_id and paused = true
     returning * into v_row;
    if not found then raise exception 'Paciente pausado não encontrado'; end if;
    perform public._fila_hist(v_row, 'busca_ativa',
      'Busca ativa: ' || public._busca_status_label(p_status) || coalesce(' — ' || v_obs, ''), null);
    v_n := 1;
  else
    select * into v_apt from public.appointments where id = p_id and company_id = v_company_id;
    if not found then raise exception 'Agendamento não encontrado'; end if;
    update public.appointments
       set busca_status = p_status, busca_obs = v_obs, busca_updated_at = now(), updated_at = now()
     where company_id = v_company_id and patient_id = v_apt.patient_id and professional_id = v_apt.professional_id
       and "date" >= v_today and (paused = true or lower(coalesce(status,'')) = 'pausado');
    get diagnostics v_n = row_count;
  end if;

  return jsonb_build_object('ok', true, 'updated', v_n, 'buscaStatus', p_status, 'buscaObs', v_obs);
end $$;
revoke all on function public.set_busca_ativa_status(text, text, text, bigint, text, text) from public;
grant execute on function public.set_busca_ativa_status(text, text, text, bigint, text, text) to anon, authenticated;

-- Pausa pela agenda MANTENDO o paciente na agenda (horários continuam reservados).
create or replace function public.pause_patient_keep_agenda(
  p_slug text, p_password text, p_patient_id bigint, p_professional_id bigint,
  p_reason text default null, p_return_date text default null
) returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_company_id bigint; v_prof public.professionals%rowtype; v_n integer := 0;
  v_today text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  v_reason text := coalesce(nullif(btrim(coalesce(p_reason,'')), ''), 'Pausa temporária');
  v_ret text := nullif(btrim(coalesce(p_return_date,'')), '');
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  select * into v_prof from public.professionals where id = p_professional_id and company_id = v_company_id;
  if not found then raise exception 'Profissional não encontrado'; end if;

  update public.appointments
     set paused = true, paused_at = now(), paused_reason = v_reason, paused_return_date = v_ret,
         busca_status = null, busca_obs = null, busca_updated_at = null, updated_at = now()
   where company_id = v_company_id and patient_id = p_patient_id and professional_id = p_professional_id
     and "date" >= v_today
     and lower(coalesce(status,'agendado')) in ('agendado','agendada','scheduled','pausado','atendimento','em_atendimento');
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Nenhum horário futuro encontrado para pausar'; end if;

  update public.patients set notes = coalesce(notes,'') || E'\n[PAUSA ' || to_char(now() at time zone 'America/Sao_Paulo','DD/MM/YYYY')
         || ' — Agenda — ' || v_prof.name || ' (mantido na agenda)] Motivo: ' || v_reason
         || coalesce('. Retorno previsto: ' || v_ret, ''), updated_at = now()
   where id = p_patient_id and company_id = v_company_id;

  return jsonb_build_object('ok', true, 'appointmentsPaused', v_n);
end $$;
revoke all on function public.pause_patient_keep_agenda(text, text, bigint, bigint, text, text) from public;
grant execute on function public.pause_patient_keep_agenda(text, text, bigint, bigint, text, text) to anon, authenticated;

create or replace function public.resume_patient_agenda_pause(
  p_slug text, p_password text, p_patient_id bigint, p_professional_id bigint
) returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_company_id bigint; v_n integer := 0;
  v_today text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  update public.appointments
     set paused = false, paused_at = null, paused_reason = null, paused_return_date = null,
         busca_status = null, busca_obs = null, busca_updated_at = null,
         status = case when lower(coalesce(status,'')) = 'pausado' then 'agendado' else status end,
         updated_at = now()
   where company_id = v_company_id and patient_id = p_patient_id and professional_id = p_professional_id
     and "date" >= v_today and (paused = true or lower(coalesce(status,'')) = 'pausado');
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'appointmentsResumed', v_n);
end $$;
revoke all on function public.resume_patient_agenda_pause(text, text, bigint, bigint) from public;
grant execute on function public.resume_patient_agenda_pause(text, text, bigint, bigint) to anon, authenticated;

create or replace function public.list_paused_overview(p_slug text, p_password text)
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_company_id bigint; v_today text; v_fila jsonb; v_agenda jsonb;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  v_today := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  select coalesce(jsonb_agg(row order by (row->>'pausedAt') desc nulls last), '[]'::jsonb) into v_fila
  from (
    select jsonb_build_object(
      'source', 'fila', 'id', w.id, 'patientId', w.patient_id, 'patientName', coalesce(p.name,''),
      'prontuario', p.prontuario, 'patientPhone', coalesce(p.phone, p.guardian_phone),
      'specialty', coalesce(w.specialty, pr.specialty, ''), 'professionalId', w.professional_id,
      'professionalName', coalesce(pr.name,''),
      'origin', coalesce(w.paused_origin, 'Fila de Espera'), 'keepsAgenda', false,
      'pausedReason', coalesce(w.paused_reason, 'Busca ativa'), 'pausedAt', w.paused_at,
      'pausedReturnDate', w.paused_return_date,
      'returnOverdue', (w.paused_return_date is not null and w.paused_return_date < v_today),
      'entryDate', w.entry_date,
      'waitDays', greatest(0, current_date - to_date(w.entry_date, 'YYYY-MM-DD')),
      'buscaStatus', coalesce(w.busca_status, 'pendente'), 'buscaObs', w.busca_obs,
      'buscaUpdatedAt', w.busca_updated_at
    ) as row
    from public.waiting_list w
    left join public.patients p on p.id = w.patient_id
    left join public.professionals pr on pr.id = w.professional_id
    where w.company_id = v_company_id and w.paused = true
  ) sub;
  select coalesce(jsonb_agg(row order by (row->>'pausedAt') desc nulls last), '[]'::jsonb) into v_agenda
  from (
    select distinct on (a.patient_id, a.professional_id) jsonb_build_object(
      'source', 'agenda', 'id', a.id, 'patientId', a.patient_id, 'patientName', coalesce(p.name,''),
      'prontuario', p.prontuario, 'patientPhone', coalesce(p.phone, p.guardian_phone),
      'specialty', coalesce(pr.specialty,''), 'professionalId', a.professional_id,
      'professionalName', coalesce(pr.name,''),
      'origin', 'Agenda — ' || coalesce(pr.name,''), 'keepsAgenda', true,
      'pausedReason', coalesce(a.paused_reason, 'Pausa temporária'), 'pausedAt', a.paused_at,
      'pausedReturnDate', a.paused_return_date,
      'returnOverdue', (a.paused_return_date is not null and a.paused_return_date < v_today),
      'entryDate', null, 'waitDays', null,
      'buscaStatus', coalesce(a.busca_status, 'pendente'), 'buscaObs', a.busca_obs,
      'buscaUpdatedAt', a.busca_updated_at
    ) as row
    from public.appointments a
    left join public.patients p on p.id = a.patient_id
    left join public.professionals pr on pr.id = a.professional_id
    where a.company_id = v_company_id and a."date" >= v_today
      and (a.paused = true or lower(coalesce(a.status,'')) = 'pausado')
    order by a.patient_id, a.professional_id, a."date"
  ) sub;
  return jsonb_build_object('fila', v_fila, 'agenda', v_agenda);
end $$;
revoke all on function public.list_paused_overview(text, text) from public;
grant execute on function public.list_paused_overview(text, text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
