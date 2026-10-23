-- Busca Ativa: histórico de quem já passou por ela (motivo, status final,
-- observação da assistente social e quando/como retornou) e dados de contato
-- (endereço, responsável) na lista para o relatório impresso.

begin;

create table if not exists public.busca_ativa_historico (
  id                bigserial primary key,
  company_id        bigint not null,
  patient_id        bigint not null,
  patient_name      text,
  prontuario        text,
  specialty         text,
  professional_name text,
  origin            text,
  keeps_agenda      boolean not null default false,
  motivo            text,
  paused_at         timestamptz,
  return_date       text,
  busca_status      text,
  busca_obs         text,
  returned_at       timestamptz not null default now(),
  retorno_motivo    text
);
create index if not exists busca_ativa_historico_patient_idx
  on public.busca_ativa_historico (company_id, patient_id, returned_at desc);
alter table public.busca_ativa_historico enable row level security;

create or replace function public._busca_hist_from_fila(p_row public.waiting_list, p_motivo text)
returns void language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_pt public.patients%rowtype; v_prof text;
begin
  select * into v_pt from public.patients where id = p_row.patient_id;
  select name into v_prof from public.professionals where id = p_row.professional_id;
  insert into public.busca_ativa_historico
    (company_id, patient_id, patient_name, prontuario, specialty, professional_name, origin, keeps_agenda,
     motivo, paused_at, return_date, busca_status, busca_obs, retorno_motivo)
  values
    (p_row.company_id, p_row.patient_id, v_pt.name, v_pt.prontuario, p_row.specialty, v_prof,
     coalesce(p_row.paused_origin, 'Fila de Espera'), false,
     coalesce(p_row.paused_reason, 'Busca ativa'), p_row.paused_at, p_row.paused_return_date,
     coalesce(p_row.busca_status, 'pendente'), p_row.busca_obs, p_motivo);
end $$;

create or replace function public._waiting_list_busca_hist_trg() returns trigger
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_status text;
begin
  if tg_op = 'UPDATE' then
    if coalesce(old.paused, false) and not coalesce(new.paused, false) then
      perform public._busca_hist_from_fila(old,
        coalesce(nullif(current_setting('fila.retorno_motivo', true), ''), 'Retornou aos atendimentos'));
    end if;
    return new;
  end if;
  if coalesce(old.paused, false) then
    select status into v_status from public.patients where id = old.patient_id;
    perform public._busca_hist_from_fila(old,
      case when v_status in ('Alta','Desistência','Óbito') then 'Saída: ' || v_status
           else 'Saiu da Busca Ativa (removido da fila)' end);
  end if;
  return old;
end $$;

drop trigger if exists trg_waiting_list_busca_hist on public.waiting_list;
create trigger trg_waiting_list_busca_hist
  after update or delete on public.waiting_list
  for each row execute function public._waiting_list_busca_hist_trg();

-- Retorno de quem ficou na agenda: registra no histórico antes de limpar.
create or replace function public.resume_patient_agenda_pause(
  p_slug text, p_password text, p_patient_id bigint, p_professional_id bigint
) returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_company_id bigint; v_n integer := 0;
  v_today text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  insert into public.busca_ativa_historico
    (company_id, patient_id, patient_name, prontuario, specialty, professional_name, origin, keeps_agenda,
     motivo, paused_at, return_date, busca_status, busca_obs, retorno_motivo)
  select a.company_id, a.patient_id, p.name, p.prontuario, pr.specialty, pr.name,
         'Agenda — ' || coalesce(pr.name, ''), true,
         coalesce(a.paused_reason, 'Pausa temporária'), a.paused_at, a.paused_return_date,
         coalesce(a.busca_status, 'pendente'), a.busca_obs, 'Retornou aos atendimentos'
    from public.appointments a
    left join public.patients p on p.id = a.patient_id
    left join public.professionals pr on pr.id = a.professional_id
   where a.company_id = v_company_id and a.patient_id = p_patient_id and a.professional_id = p_professional_id
     and a."date" >= v_today and (a.paused = true or lower(coalesce(a.status,'')) = 'pausado')
   order by a."date", a."time"
   limit 1;

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

create or replace function public.list_busca_ativa_historico(
  p_slug text, p_password text, p_patient_id bigint default null, p_limit integer default 500
) returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_company_id bigint; v_out jsonb;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', h.id, 'patientId', h.patient_id, 'patientName', h.patient_name, 'prontuario', h.prontuario,
    'specialty', h.specialty, 'professionalName', h.professional_name, 'origin', h.origin,
    'keepsAgenda', h.keeps_agenda, 'motivo', h.motivo, 'pausedAt', h.paused_at,
    'returnDate', h.return_date, 'buscaStatus', h.busca_status, 'buscaObs', h.busca_obs,
    'returnedAt', h.returned_at, 'retornoMotivo', h.retorno_motivo) order by h.returned_at desc), '[]'::jsonb)
  into v_out
  from (select * from public.busca_ativa_historico
         where company_id = v_company_id and (p_patient_id is null or patient_id = p_patient_id)
         order by returned_at desc limit greatest(1, least(p_limit, 2000))) h;
  return v_out;
end $$;
revoke all on function public.list_busca_ativa_historico(text, text, bigint, integer) from public;
grant execute on function public.list_busca_ativa_historico(text, text, bigint, integer) to anon, authenticated;

-- Mesma lista de antes + endereço e responsável (para o relatório da assistente social).
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
      'address', p.address, 'guardianName', coalesce(p.guardian_name, p.mother_name),
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
      'address', p.address, 'guardianName', coalesce(p.guardian_name, p.mother_name),
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

-- Quem já voltou da busca ativa antes desta migração (pelo histórico da fila).
insert into public.busca_ativa_historico
  (company_id, patient_id, patient_name, prontuario, specialty, origin, keeps_agenda,
   motivo, paused_at, return_date, busca_status, returned_at, retorno_motivo)
select r.company_id, r.patient_id, r.patient_name, r.prontuario, r.specialty, 'Busca Ativa', false,
       coalesce(pz.motivo, 'Busca ativa'), pz.created_at, pz.detalhe->>'retorno', null, r.created_at, r.motivo
  from public.waiting_list_history r
  left join lateral (
    select x.motivo, x.created_at, x.detalhe from public.waiting_list_history x
     where x.company_id = r.company_id and x.patient_id = r.patient_id
       and coalesce(x.specialty,'') = coalesce(r.specialty,'')
       and x.evento = 'pausa' and x.created_at <= r.created_at
     order by x.created_at desc limit 1
  ) pz on true
 where r.evento in ('retorno', 'retorno_automatico')
   and not exists (select 1 from public.busca_ativa_historico b
                    where b.company_id = r.company_id and b.patient_id = r.patient_id and b.returned_at = r.created_at);

notify pgrst, 'reload schema';

commit;
