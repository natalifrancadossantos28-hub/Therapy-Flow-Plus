-- =========================================================================
-- 0119_fila_historico_busca_ativa_prazo.sql
--
-- Fila de Espera profissional (bloco 1):
--   1. Histórico da fila (waiting_list_history): toda entrada, saída
--      (agendado / alta / desistência / óbito / removido), pausa e retorno
--      fica registrada automaticamente por trigger — nada mais "some" sem rastro.
--   2. Busca ativa com motivo padronizado e data de retorno
--      (waiting_list.paused_return_date); vencido o prazo, o paciente volta
--      sozinho para a fila (feito no sync que roda ao abrir a tela).
--   3. list_waiting_list devolve pausedReturnDate e waitDays (dias na fila).
--   4. RPC list_waiting_list_history para a tela.
-- =========================================================================

begin;

alter table public.waiting_list add column if not exists paused_return_date text;
alter table public.waiting_list add column if not exists paused_origin text; -- ex.: 'Agenda — Bruna (Fonoaudiologia)' ou 'Fila de Espera'

create table if not exists public.waiting_list_history (
  id           bigserial primary key,
  company_id   bigint not null,
  patient_id   bigint not null,
  patient_name text,
  prontuario   text,
  specialty    text,
  evento       text not null,   -- entrada | agendado | alta | desistencia | obito | removido | pausa | retorno | retorno_automatico
  motivo       text,
  detalhe      jsonb,
  entry_date   text,
  created_at   timestamptz not null default now()
);
create index if not exists waiting_list_history_company_idx on public.waiting_list_history(company_id, created_at desc);
create index if not exists waiting_list_history_patient_idx on public.waiting_list_history(patient_id);
alter table public.waiting_list_history enable row level security;

create or replace function public._fila_hist(
  p_row public.waiting_list, p_evento text, p_motivo text, p_detalhe jsonb default null
) returns void language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_pt public.patients%rowtype;
begin
  select * into v_pt from public.patients where id = p_row.patient_id;
  insert into public.waiting_list_history
    (company_id, patient_id, patient_name, prontuario, specialty, evento, motivo, detalhe, entry_date)
  values
    (p_row.company_id, p_row.patient_id, v_pt.name, v_pt.prontuario, p_row.specialty, p_evento, p_motivo, p_detalhe, p_row.entry_date);
end $$;

create or replace function public._waiting_list_hist_trg() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_today  text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  v_status text;
  v_prof   text;
begin
  if tg_op = 'INSERT' then
    perform public._fila_hist(new, 'entrada',
      case when new.notes ilike '%manual%' then 'Inserção manual (admin)' else 'Triagem / cadastro' end,
      jsonb_build_object('priority', new.priority));
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if coalesce(new.paused,false) <> coalesce(old.paused,false) then
      if new.paused then
        perform public._fila_hist(new, 'pausa', coalesce(new.paused_reason, 'Busca ativa'),
          jsonb_build_object('retorno', new.paused_return_date));
      else
        perform public._fila_hist(new, 'retorno', coalesce(current_setting('fila.retorno_motivo', true), 'Descongelado pela equipe'), null);
      end if;
    end if;
    return new;
  end if;

  -- DELETE: descobre o motivo pelo estado do paciente / agenda
  select status into v_status from public.patients where id = old.patient_id;
  if v_status in ('Alta','Desistência','Óbito') then
    perform public._fila_hist(old,
      case v_status when 'Alta' then 'alta' when 'Óbito' then 'obito' else 'desistencia' end,
      'Saída registrada: ' || v_status, null);
    return old;
  end if;

  select p.name into v_prof
    from public.appointments a
    join public.professionals p on p.id = a.professional_id
   where a.company_id = old.company_id and a.patient_id = old.patient_id
     and a."date" >= v_today
     and coalesce(a.notes,'') not like '%[PILATES — Mãe/Responsável]%'
     and lower(coalesce(a.status,'agendado')) not in ('desmarcado','cancelado','alta','falta','falta_justificada','falta_nao_justificada','ausente','desistência','desistencia','óbito')
     and (old.specialty is null or lower(btrim(coalesce(p.specialty,''))) = lower(btrim(coalesce(old.specialty,''))))
   order by a."date", a."time" limit 1;
  if v_prof is not null then
    perform public._fila_hist(old, 'agendado', 'Vaga preenchida com ' || v_prof, jsonb_build_object('profissional', v_prof));
  else
    perform public._fila_hist(old, 'removido', 'Removido da fila', null);
  end if;
  return old;
end $$;

drop trigger if exists trg_waiting_list_hist on public.waiting_list;
create trigger trg_waiting_list_hist
  after insert or update or delete on public.waiting_list
  for each row execute function public._waiting_list_hist_trg();

-- Busca ativa com motivo + data de retorno (substitui a assinatura antiga)
drop function if exists public.set_waiting_list_paused(text, text, bigint, boolean, text);
create or replace function public.set_waiting_list_paused(
  p_slug text, p_password text, p_id bigint, p_paused boolean,
  p_reason text default null, p_return_date text default null
) returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_company_id bigint; v_row public.waiting_list%rowtype;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  update public.waiting_list
     set paused = p_paused,
         paused_at = case when p_paused then now() else null end,
         paused_reason = case when p_paused then p_reason else null end,
         paused_return_date = case when p_paused then nullif(btrim(coalesce(p_return_date,'')), '') else null end,
         paused_origin = case when p_paused then 'Fila de Espera' else null end,
         updated_at = now()
   where id = p_id and company_id = v_company_id
   returning * into v_row;
  if not found then raise exception 'Entrada não encontrada na fila de espera'; end if;
  return jsonb_build_object('id', v_row.id, 'paused', v_row.paused, 'pausedAt', v_row.paused_at,
                            'pausedReason', v_row.paused_reason, 'pausedReturnDate', v_row.paused_return_date);
end $$;
revoke all on function public.set_waiting_list_paused(text, text, bigint, boolean, text, text) from public;
grant execute on function public.set_waiting_list_paused(text, text, bigint, boolean, text, text) to anon, authenticated;

-- Retorno automático de busca ativa vencida (chamado pelo sync)
create or replace function public._fila_retorno_automatico(p_company_id bigint) returns integer
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_today text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'); v_n integer;
begin
  perform set_config('fila.retorno_motivo', 'Prazo da busca ativa venceu — voltou automaticamente', true);
  update public.waiting_list
     set paused = false, paused_at = null, paused_reason = null, paused_return_date = null, paused_origin = null, updated_at = now()
   where company_id = p_company_id and paused and paused_return_date is not null and paused_return_date <= v_today;
  get diagnostics v_n = row_count;
  perform set_config('fila.retorno_motivo', '', true);
  return v_n;
end $$;


-- Pausa pela AGENDA: paciente sai da grade do profissional (horário fica livre)
-- e vai para a lista "Pausados / Busca Ativa" (fila pausada da especialidade),
-- com motivo, origem e previsão de retorno. Histórico fica no prontuário.
create or replace function public.pause_patient_from_agenda(
  p_slug text, p_password text, p_patient_id bigint, p_professional_id bigint,
  p_reason text default null, p_return_date text default null
) returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_company_id bigint; v_prof public.professionals%rowtype; v_today text;
  v_removed integer := 0; v_wl_id bigint; v_origin text; v_reason text;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  v_today := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  select * into v_prof from public.professionals where id = p_professional_id and company_id = v_company_id;
  if not found then raise exception 'Profissional não encontrado'; end if;
  v_origin := 'Agenda — ' || v_prof.name || coalesce(' (' || v_prof.specialty || ')', '');
  v_reason := nullif(btrim(coalesce(p_reason,'')), '');
  if v_reason is null then v_reason := 'Pausa temporária'; end if;

  delete from public.appointments a
   where a.company_id = v_company_id and a.patient_id = p_patient_id and a.professional_id = p_professional_id
     and a."date" >= v_today
     and lower(coalesce(a.status,'agendado')) in ('agendado','agendada','scheduled','pausado','atendimento','em_atendimento','presente');
  get diagnostics v_removed = row_count;

  select id into v_wl_id from public.waiting_list
   where company_id = v_company_id and patient_id = p_patient_id
     and lower(btrim(coalesce(specialty,''))) = lower(btrim(coalesce(v_prof.specialty,'')))
   order by id limit 1;
  if v_wl_id is null then
    insert into public.waiting_list (company_id, patient_id, professional_id, specialty, priority, notes, entry_date)
    values (v_company_id, p_patient_id, p_professional_id, v_prof.specialty, 'media',
            'Pausado pela agenda de ' || v_prof.name, v_today)
    returning id into v_wl_id;
  end if;
  update public.waiting_list
     set paused = true, paused_at = now(), paused_reason = v_reason,
         paused_return_date = nullif(btrim(coalesce(p_return_date,'')), ''),
         paused_origin = v_origin, professional_id = p_professional_id, updated_at = now()
   where id = v_wl_id;

  update public.patients set notes = coalesce(notes,'') || E'\n[PAUSA ' || to_char(now() at time zone 'America/Sao_Paulo','DD/MM/YYYY') || ' — ' || v_origin || '] Motivo: ' || v_reason
         || coalesce('. Retorno previsto: ' || nullif(btrim(coalesce(p_return_date,'')), ''), ''), updated_at = now()
   where id = p_patient_id and company_id = v_company_id;

  return jsonb_build_object('ok', true, 'appointmentsRemoved', v_removed, 'waitingListId', v_wl_id, 'origin', v_origin);
end $$;
revoke all on function public.pause_patient_from_agenda(text, text, bigint, bigint, text, text) from public;
grant execute on function public.pause_patient_from_agenda(text, text, bigint, bigint, text, text) to anon, authenticated;

-- Visão "Pausados / Busca Ativa": fonte única = fila pausada (+ legado a.paused na agenda)
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
      'specialty', coalesce(w.specialty, pr.specialty, ''), 'professionalName', coalesce(pr.name,''),
      'origin', coalesce(w.paused_origin, 'Fila de Espera'),
      'pausedReason', coalesce(w.paused_reason, 'Busca ativa'), 'pausedAt', w.paused_at,
      'pausedReturnDate', w.paused_return_date,
      'returnOverdue', (w.paused_return_date is not null and w.paused_return_date < v_today),
      'entryDate', w.entry_date,
      'waitDays', greatest(0, current_date - to_date(w.entry_date, 'YYYY-MM-DD'))
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
      'specialty', coalesce(pr.specialty,''), 'professionalName', coalesce(pr.name,''),
      'origin', 'Agenda — ' || coalesce(pr.name,''),
      'pausedReason', coalesce(a.paused_reason, 'Pausa temporária'), 'pausedAt', a.paused_at,
      'pausedReturnDate', a.paused_return_date,
      'returnOverdue', (a.paused_return_date is not null and a.paused_return_date < v_today),
      'entryDate', null, 'waitDays', null
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

create or replace function public.list_waiting_list_history(
  p_slug text, p_password text, p_patient_id bigint default null, p_limit integer default 300
) returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_company_id bigint; v_out jsonb;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', h.id, 'patientId', h.patient_id, 'patientName', h.patient_name, 'prontuario', h.prontuario,
    'specialty', h.specialty, 'evento', h.evento, 'motivo', h.motivo, 'detalhe', h.detalhe,
    'entryDate', h.entry_date, 'createdAt', h.created_at) order by h.created_at desc), '[]'::jsonb)
  into v_out
  from (select * from public.waiting_list_history
         where company_id = v_company_id and (p_patient_id is null or patient_id = p_patient_id)
         order by created_at desc limit greatest(1, least(p_limit, 2000))) h;
  return v_out;
end $$;
revoke all on function public.list_waiting_list_history(text, text, bigint, integer) from public;
grant execute on function public.list_waiting_list_history(text, text, bigint, integer) to anon, authenticated;

-- Marco inicial: registra "entrada" para quem já está na fila hoje (sem isso o histórico começaria vazio)
insert into public.waiting_list_history (company_id, patient_id, patient_name, prontuario, specialty, evento, motivo, entry_date, created_at)
select w.company_id, w.patient_id, p.name, p.prontuario, w.specialty, 'entrada', 'Já estava na fila quando o histórico foi ativado', w.entry_date, w.created_at
  from public.waiting_list w join public.patients p on p.id = w.patient_id
 where not exists (select 1 from public.waiting_list_history h where h.patient_id = w.patient_id and coalesce(h.specialty,'') = coalesce(w.specialty,'') and h.evento = 'entrada');

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

  with abc as (
    select distinct on (a.patient_id) a.patient_id, a.score_total, a.nivel
      from public.abc_avaliacoes a
     where a.company_id = v_company_id and a.tipo = 'entrada'
     order by a.patient_id, a.created_at desc, a.id desc
  ),
  base as (
    select
      w.id, w.company_id, w.patient_id, w.professional_id,
      w.specialty   as w_specialty, w.notes, w.entry_date, w.created_at, w.updated_at,
      coalesce(w.paused, false) as w_paused,
      w.paused_at      as w_paused_at,
      w.paused_reason  as w_paused_reason,
      w.paused_return_date as w_paused_return_date,
      w.paused_origin  as w_paused_origin,
      p.name              as p_name,
      p.phone             as p_phone,
      p.prontuario        as p_prontuario,
      p.date_of_birth     as p_dob,
      p.triagem_score     as p_triagem,
      coalesce(p.escola_publica, false)        as p_escola,
      coalesce(p.trabalho_na_roca, false)      as p_trabalho,
      p.trabalho_pais     as p_trabalho_pais,
      coalesce(p.abrigo_casa_crianca, false)   as p_abrigo,
      p.mother_name       as p_mae,
      p.father_name       as p_pai,
      p.local_atendimento as p_local,
      p.outro_atendimento as p_outro,
      p.diagnosis         as p_diag,
      coalesce(p.score_psicologia, 0)       as s_psi,
      coalesce(p.score_psicomotricidade, 0) as s_psm,
      coalesce(p.score_fisioterapia, 0)     as s_fis,
      coalesce(p.score_psicopedagogia, 0)   as s_psp,
      coalesce(p.score_ed_fisica, 0)        as s_edf,
      coalesce(p.score_fonoaudiologia, 0)   as s_fon,
      coalesce(p.score_to, 0)               as s_to,
      coalesce(p.score_nutricionista, 0)    as s_nut,
      pr.name             as pr_name,
      pr.specialty        as pr_specialty,
      coalesce(w.specialty, pr.specialty)   as eff_specialty,
      abc.score_total     as abc_total,
      abc.nivel           as abc_nivel
      from public.waiting_list w
      left join public.patients      p  on p.id  = w.patient_id
      left join public.professionals pr on pr.id = w.professional_id
      left join abc                     on abc.patient_id = w.patient_id
     where w.company_id = v_company_id
       and (p_professional_id is null or w.professional_id = p_professional_id)
       and (p.tipo_registro is null or p.tipo_registro <> 'Registro Censo Municipal')
  ),
  aged as (
    select b.*,
      public._fila_age_policy(b.eff_specialty) as age_policy,
      case
        when b.p_dob is null or btrim(b.p_dob) = '' then null
        else extract(year from age(current_date, b.p_dob::date))::int
      end as age_years,
      public._atende_fora(b.p_local, b.p_outro)   as atende_fora,
      public._pais_registrados(b.p_mae, b.p_pai)  as pais_registrados,
      public._fila_atende_fora_tipo(b.p_local, b.p_outro) as fora_tipo,
      public._fila_bonus_trabalho(b.p_trabalho_pais, b.p_trabalho) as bonus_trabalho,
      public._fila_demanda(b.eff_specialty, b.p_diag) as demanda
    from base b
  ),
  enriched as (
    select a.*,
      case
        when a.eff_specialty is null or btrim(a.eff_specialty) = '' then null
        when a.eff_specialty ilike 'psicolog%'    then a.s_psi
        when a.eff_specialty ilike 'psicomot%'    then a.s_psm
        when a.eff_specialty ilike 'fisio%'       then a.s_fis
        when a.eff_specialty ilike 'psicoped%'    then a.s_psp
        when a.eff_specialty ilike 'educa%'       then a.s_edf
        when a.eff_specialty ilike 'oficina%'     then a.s_edf
        when a.eff_specialty ilike 'fono%'        then a.s_fon
        when a.eff_specialty ilike 'terapia ocup%'
          or a.eff_specialty ilike 't.o.%'
          or a.eff_specialty ilike 'to'           then a.s_to
        when a.eff_specialty ilike 'nutri%'       then a.s_nut
        else null
      end as sp_score,
      (case when a.p_escola then 1 else 0 end) as sp_social,
      case
        when a.fora_tipo = 'particular' then 0
        when a.age_policy = 'fifo' then 0
        when a.age_years is null then 0
        when a.age_policy = 'min3' and a.age_years < 3 then 0
        when a.age_years < 4 then 50
        when a.age_years <= 6 then 20
        else 0
      end as age_bonus,
      0 as penalidade_pais,
      case a.fora_tipo when 'particular' then 10 when 'sus' then 5 else 0 end as penalidade_fora,
      (public._fila_prioridade_maxima(a.eff_specialty, a.p_dob, a.p_abrigo)
        and (a.p_abrigo or a.fora_tipo is distinct from 'particular')) as is_maxima,
      (a.age_policy = 'fifo') as is_fifo
    from aged a
  )
  select coalesce(jsonb_agg(row order by ord), '[]'::jsonb) into v_result
  from (
    select
      jsonb_build_object(
        'id',                     id,
        'companyId',              company_id,
        'patientId',              patient_id,
        'patientName',            coalesce(p_name, ''),
        'patientPhone',           p_phone,
        'patientProntuario',      p_prontuario,
        'professionalId',         professional_id,
        'specialty',              eff_specialty,
        'professionalName',       pr_name,
        'professionalSpecialty',  pr_specialty,
        'priority',               case
                                    when is_maxima then 'maxima'
                                    when demanda is not null then 'elevado'
                                    when sp_score is null then
                                      public._calc_priority(coalesce(p_triagem, 0), p_escola, p_trabalho, false)
                                    else
                                      public._calc_priority_specialty(sp_score, p_escola, p_trabalho)
                                  end,
        'notes',                  notes,
        'entryDate',              entry_date,
        'createdAt',              created_at,
        'updatedAt',              updated_at,
        'paused',                 w_paused,
        'pausedAt',               w_paused_at,
        'pausedReason',           w_paused_reason,
        'pausedReturnDate',       w_paused_return_date,
        'pausedOrigin',           w_paused_origin,
        'waitDays',               greatest(0, (current_date - to_date(entry_date, 'YYYY-MM-DD'))),
        'scoreClinico',           round((coalesce(p_triagem, 0)::numeric * 100.0) / 360.0)::int,
        'scoreSocial',            (case when p_escola   then 2 else 0 end)
                                + (case when p_trabalho then 2 else 0 end),
        'triagemScore',           p_triagem,
        'escolaPublica',          p_escola,
        'trabalhoNaRoca',         p_trabalho,
        'abrigoCasaCrianca',      p_abrigo,
        'scoreTotal150',          round((coalesce(p_triagem, 0)::numeric * 150.0) / 360.0)::int
                                + (case when p_escola   then 2 else 0 end)
                                + (case when p_trabalho then 2 else 0 end),
        'scoreEspecialidade',     sp_score,
        'scoreEspecialidadeMax',  72,
        'scoreSocialDesempate',   sp_social,
        'scoreEspecialidadeTotal', case
                                     when sp_score is null then null
                                     else greatest(sp_score + sp_social + bonus_trabalho - penalidade_fora
                                                   + round(coalesce(abc_total, 0) * 72.0 / 158.0)::int, 0)
                                   end,
        'abcPontos',              case when abc_total is null then null else round(abc_total * 72.0 / 158.0)::int end,
        'ageBonus',               age_bonus,
        'dateOfBirth',            p_dob,
        'ordenacao',              case when is_fifo then 'chegada' else 'prioridade' end,
        'atendeFora',             atende_fora,
        'paisRegistrados',        pais_registrados,
        'penalidadePais',         penalidade_pais,
        'trabalhoPais',           p_trabalho_pais,
        'bonusTrabalho',          bonus_trabalho,
        'atendeForaTipo',         fora_tipo,
        'penalidadeFora',         penalidade_fora,
        'localAtendimento',       p_local,
        'prioridadeMaxima',       is_maxima,
        'prioridadeMaximaRazao',  case
                                    when not is_maxima then null
                                    when p_abrigo and age_years is not null and age_years < 5 then 'idade_e_abrigo'
                                    when p_abrigo then 'abrigo'
                                    else 'idade'
                                  end,
        'abcTotal',               abc_total,
        'abcNivel',               abc_nivel,
        'demandaPrioritaria',     demanda
      ) as row,
      row_number() over (
        order by
          case when w_paused then 1 else 0 end asc,
          case when is_maxima then 0 else 1 end asc,
          case when demanda is not null then 0 else 1 end asc,
          -- Checklist ABC não pula a fila: soma na pontuação (escala 0..72,
          -- como a nota da especialidade) e só conta onde a fila é por pontuação.
          case when is_fifo then 0 else
            greatest(
              coalesce(
                sp_score + sp_social + age_bonus,
                ((coalesce(p_triagem, 0)::numeric * 100.0) / 360.0)::int
                  + (case when p_escola   then 2 else 0 end)
                  + age_bonus
              ) + bonus_trabalho - penalidade_fora
              + round(coalesce(abc_total, 0) * 72.0 / 158.0)::int,
              0
            )
          end desc,
          entry_date asc,
          id asc
      ) as ord
      from enriched
  ) s;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

revoke all on function public.list_waiting_list(text, text, bigint) from public;
grant execute on function public.list_waiting_list(text, text, bigint) to anon, authenticated;

-- sync: igual à 0117 + retorno automático de busca ativa vencida
create or replace function public.sync_waiting_list_with_agenda(
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
  v_today      text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  v_cleaned    integer := 0;
  v_deduped    integer := 0;
  v_saidas     integer := 0;
  v_null_spec  integer := 0;
  v_status_fix integer := 0;
  v_tmp        integer := 0;
  v_retorno    integer := 0;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  v_retorno := public._fila_retorno_automatico(v_company_id);

  -- 1. Duplicatas (mantém a mais antiga)
  delete from public.waiting_list
   where company_id = v_company_id
     and id not in (
       select min(id)
         from public.waiting_list
        where company_id = v_company_id
        group by patient_id, coalesce(specialty, '__NULL__')
     );
  get diagnostics v_deduped = row_count;

  -- 2. Agendamento ativo na mesma especialidade tira da fila
  delete from public.waiting_list wl
   where wl.company_id = v_company_id
     and exists (
       select 1 from public.appointments a
         join public.professionals p on p.id = a.professional_id
                                     and p.company_id = a.company_id
        where a.company_id = v_company_id
          and a.patient_id = wl.patient_id
          and a."date" >= v_today
          and coalesce(a.notes, '') not like '%[PILATES — Mãe/Responsável]%'
          and lower(coalesce(a.status, 'agendado')) not in (
            'desmarcado','cancelado','alta','falta','falta_justificada',
            'falta_nao_justificada','ausente','desistência','desistencia','óbito'
          )
          and (
            wl.specialty is null
            or lower(btrim(coalesce(p.specialty, ''))) = lower(btrim(coalesce(wl.specialty, '')))
          )
     );
  get diagnostics v_cleaned = row_count;

  -- 3. Alta / Desistência / Óbito não ficam na fila
  delete from public.waiting_list wl
   using public.patients pt
   where wl.company_id = v_company_id
     and pt.id = wl.patient_id
     and pt.status in ('Alta', 'Desistência', 'Óbito');
  get diagnostics v_saidas = row_count;

  -- 4. "Qualquer especialidade" sai quando já há entrada com especialidade
  delete from public.waiting_list wl
   where wl.company_id = v_company_id
     and wl.specialty is null
     and exists (
       select 1 from public.waiting_list w2
        where w2.company_id = wl.company_id
          and w2.patient_id = wl.patient_id
          and w2.specialty is not null
     );
  get diagnostics v_null_spec = row_count;

  -- 5a. Agendamento ativo em qualquer área → Atendimento
  update public.patients pt
     set status = 'Atendimento', updated_at = now()
   where pt.company_id = v_company_id
     and coalesce(pt.status, '') in ('Fila de Espera', 'Aguardando Triagem', 'Cadastro Geral', '')
     and coalesce(pt.tipo_registro, '') <> 'Registro Censo Municipal'
     and exists (
       select 1 from public.appointments a
        where a.patient_id = pt.id
          and a.company_id = v_company_id
          and a."date" >= v_today
          and coalesce(a.notes, '') not like '%[PILATES — Mãe/Responsável]%'
          and lower(coalesce(a.status, 'agendado')) not in (
            'desmarcado','cancelado','alta','falta','falta_justificada',
            'falta_nao_justificada','ausente','desistência','desistencia','óbito'
          )
     );
  get diagnostics v_status_fix = row_count;

  -- 5b. Na fila, sem agenda → Fila de Espera
  update public.patients pt
     set status = 'Fila de Espera', updated_at = now()
   where pt.company_id = v_company_id
     and coalesce(pt.status, '') in ('Atendimento', 'Aguardando Triagem', 'Cadastro Geral', '')
     and exists (
       select 1 from public.waiting_list wl
        where wl.patient_id = pt.id and wl.company_id = v_company_id
     )
     and not exists (
       select 1 from public.appointments a
        where a.patient_id = pt.id
          and a.company_id = v_company_id
          and a."date" >= v_today
          and lower(coalesce(a.status, 'agendado')) not in (
            'desmarcado','cancelado','alta','falta','falta_justificada',
            'falta_nao_justificada','ausente','desistência','desistencia','óbito'
          )
     );
  get diagnostics v_tmp = row_count;
  v_status_fix := v_status_fix + v_tmp;

  -- 5c. "Fila de Espera" sem fila e sem agenda → Aguardando Triagem
  update public.patients pt
     set status = 'Aguardando Triagem', updated_at = now()
   where pt.company_id = v_company_id
     and pt.status = 'Fila de Espera'
     and not exists (
       select 1 from public.waiting_list wl
        where wl.patient_id = pt.id and wl.company_id = v_company_id
     )
     and not exists (
       select 1 from public.appointments a
        where a.patient_id = pt.id
          and a.company_id = v_company_id
          and a."date" >= v_today
          and lower(coalesce(a.status, 'agendado')) not in (
            'desmarcado','cancelado','alta','falta','falta_justificada',
            'falta_nao_justificada','ausente','desistência','desistencia','óbito'
          )
     );
  get diagnostics v_tmp = row_count;
  v_status_fix := v_status_fix + v_tmp;

  return jsonb_build_object(
    'ok', true,
    'duplicatesRemoved', v_deduped,
    'syncedRemoved', v_cleaned,
    'saidasRemoved', v_saidas,
    'nullSpecialtyRemoved', v_null_spec,
    'statusFixed', v_status_fix,
    'autoReturned', v_retorno
  );
end;
$$;

revoke all on function public.sync_waiting_list_with_agenda(text, text) from public;
grant execute on function public.sync_waiting_list_with_agenda(text, text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
