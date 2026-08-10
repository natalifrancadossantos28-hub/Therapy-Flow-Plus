-- =========================================================================
-- 0079_admin_fila_autonomia.sql
--
-- Administrador com autonomia total para adicionar paciente na Fila de Espera.
--
-- Travas que existiam e impediam a inserção:
--   1. `add_patient_to_waiting_list` foi recriada em 0077 com 5 parâmetros
--      (sem `p_skip_triagem`), criando uma SOBRECARGA que sempre exige triagem
--      e podendo gerar ambiguidade no PostgREST.
--   2. `sync_waiting_list_with_agenda` (0061) roda a cada abertura da tela e
--      APAGA qualquer entrada de paciente que já tenha agendamento ativo na
--      mesma especialidade — ou seja, a inserção do admin sumia no refresh.
--   3. A inserção rebaixava o status do paciente em atendimento para
--      "Fila de Espera".
--   4. O trigger de +11 anos (0075) descarta a linha em silêncio, e a tela
--      exibia "adicionado" sem nada ter sido gravado.
--
-- Regras preservadas: sem duplicata (índice único), Censo Municipal fora da
-- fila, faixa etária até 11 anos (agora com erro explícito) e prioridade por
-- especialidade (0077).
--
-- Idempotente: pode rodar mais de uma vez.
-- =========================================================================

begin;

-- ═══════════════════════════════════════════════════════════════════════
-- Step 1: marca de inserção administrativa
-- Entradas criadas manualmente pelo admin ficam imunes à limpeza automática.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.waiting_list
  add column if not exists manual_admin boolean not null default false;

-- ═══════════════════════════════════════════════════════════════════════
-- Step 2: helpers de idade/política (self-contained)
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public._idade_from_text(p_dob text)
returns int
language sql
stable
as $$
  select case
    when p_dob ~ '^\d{4}-\d{2}-\d{2}'
      then extract(year from age(
             (now() at time zone 'America/Sao_Paulo')::date,
             to_date(substring(p_dob from 1 for 10), 'YYYY-MM-DD')))::int
    when p_dob ~ '^\d{2}/\d{2}/\d{4}'
      then extract(year from age(
             (now() at time zone 'America/Sao_Paulo')::date,
             to_date(substring(p_dob from 1 for 10), 'DD/MM/YYYY')))::int
    else null
  end;
$$;

create or replace function public._fila_age_policy(p_specialty text)
returns text
language sql
immutable
as $$
  select case
    when p_specialty is null or btrim(p_specialty) = '' then 'full'
    when p_specialty ilike '%parental%'     then 'fifo'
    when p_specialty ilike 'nutri%'         then 'fifo'
    when p_specialty ilike 'psicolog%'      then 'min3'
    when p_specialty ilike 'psicomot%'      then 'min3'
    when p_specialty ilike 'terapia ocup%'
      or p_specialty ilike 't.o.%'
      or p_specialty ilike 'to'             then 'min3'
    else 'full'
  end;
$$;

create or replace function public._fila_prioridade_maxima(
  p_specialty text,
  p_dob       text,
  p_abrigo    boolean
)
returns boolean
language plpgsql
stable
as $$
declare
  v_policy text := public._fila_age_policy(p_specialty);
  v_years  int;
begin
  if v_policy = 'fifo' then
    return false;
  end if;

  v_years := public._idade_from_text(p_dob);

  if coalesce(p_abrigo, false) then
    return true;
  end if;

  if v_years is null or v_years >= 5 then
    return false;
  end if;

  if v_policy = 'min3' and v_years < 3 then
    return false;
  end if;

  return true;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- Step 3: inserção na fila — admin sem travas
-- ═══════════════════════════════════════════════════════════════════════

-- Remove a sobrecarga de 5 argumentos criada em 0077 (sem p_skip_triagem):
-- a versão abaixo tem default para o 6º argumento e atende os dois formatos.
drop function if exists public.add_patient_to_waiting_list(text, text, bigint, text, text);

create or replace function public.add_patient_to_waiting_list(
  p_slug text, p_password text, p_patient_id bigint, p_specialty text,
  p_notes text default null, p_skip_triagem boolean default false
) returns jsonb language plpgsql security definer
  set search_path = public, extensions, pg_temp as $$
declare
  v_company_id bigint;
  v_patient public.patients%rowtype;
  v_existing_id bigint;
  v_priority text;
  v_today text;
  v_entry public.waiting_list%rowtype;
  v_specialty text;
  v_sp_score integer;
  v_is_maxima boolean;
  v_idade int;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  v_specialty := nullif(btrim(coalesce(p_specialty,'')),'');
  select * into v_patient from public.patients where id = p_patient_id and company_id = v_company_id;
  if not found then raise exception 'patient not found'; end if;
  if coalesce(v_patient.tipo_registro,'') = 'Registro Censo Municipal' then
    raise exception 'Pacientes do Censo Municipal nao podem ser adicionados a fila.'; end if;

  -- Faixa etária: erro explícito (antes o trigger descartava em silêncio).
  v_idade := public._idade_from_text(v_patient.date_of_birth);
  if v_idade is not null and v_idade > 11 then
    raise exception 'A fila de espera atende ate 11 anos. % tem % anos.', v_patient.name, v_idade;
  end if;

  -- Triagem só é exigida fora da inserção administrativa.
  if not coalesce(p_skip_triagem, false) and v_patient.triagem_score is null then
    raise exception 'O paciente precisa ter triagem registrada antes de entrar na fila.'; end if;

  if v_specialty is null then
    select id into v_existing_id from public.waiting_list
     where patient_id = p_patient_id and company_id = v_company_id and specialty is null limit 1;
  else
    select id into v_existing_id from public.waiting_list
     where patient_id = p_patient_id and company_id = v_company_id and specialty = v_specialty limit 1;
  end if;
  if v_existing_id is not null then
    raise exception 'Ja na fila: este paciente ja esta na fila%',
      case when v_specialty is null then '.' else ' para '||v_specialty||'.' end;
  end if;

  v_sp_score := case
    when v_specialty is null              then null
    when v_specialty ilike 'psicolog%'    then coalesce(v_patient.score_psicologia, 0)
    when v_specialty ilike 'psicomot%'    then coalesce(v_patient.score_psicomotricidade, 0)
    when v_specialty ilike 'fisio%'       then coalesce(v_patient.score_fisioterapia, 0)
    when v_specialty ilike 'psicoped%'    then coalesce(v_patient.score_psicopedagogia, 0)
    when v_specialty ilike 'educa%'       then coalesce(v_patient.score_ed_fisica, 0)
    when v_specialty ilike 'oficina%'     then coalesce(v_patient.score_ed_fisica, 0)
    when v_specialty ilike 'fono%'        then coalesce(v_patient.score_fonoaudiologia, 0)
    when v_specialty ilike 'terapia ocup%'
      or v_specialty ilike 't.o.%'
      or v_specialty ilike 'to'           then coalesce(v_patient.score_to, 0)
    when v_specialty ilike 'nutri%'       then coalesce(v_patient.score_nutricionista, 0)
    else null
  end;

  v_is_maxima := public._fila_prioridade_maxima(
    v_specialty, v_patient.date_of_birth, coalesce(v_patient.abrigo_casa_crianca, false));

  if v_is_maxima then
    v_priority := 'maxima';
  elsif v_patient.triagem_score is null then
    -- Sem triagem (inserção administrativa): entra com a prioridade mais baixa.
    v_priority := 'verde';
  elsif v_sp_score is null then
    v_priority := public._calc_priority(v_patient.triagem_score,
      coalesce(v_patient.escola_publica,false), coalesce(v_patient.trabalho_na_roca,false), false);
  else
    v_priority := public._calc_priority_specialty(v_sp_score,
      coalesce(v_patient.escola_publica,false), coalesce(v_patient.trabalho_na_roca,false));
  end if;

  v_today := to_char(now() at time zone 'UTC','YYYY-MM-DD');
  insert into public.waiting_list (company_id, patient_id, professional_id, specialty,
                                   priority, notes, entry_date, manual_admin)
  values (v_company_id, p_patient_id, null, v_specialty, v_priority, p_notes, v_today,
          coalesce(p_skip_triagem, false))
  returning * into v_entry;

  if v_entry.id is null then
    raise exception 'Nao foi possivel inserir % na fila (regra do banco bloqueou a insercao).', v_patient.name;
  end if;

  -- Não rebaixa o status de quem já está em atendimento (ou já teve saída
  -- registrada): o paciente pode estar em atendimento numa especialidade e
  -- na fila de outra ao mesmo tempo.
  update public.patients set status = 'Fila de Espera'
   where id = p_patient_id and company_id = v_company_id
     and coalesce(status,'') not in ('Atendimento','Alta','Óbito','Desistência');

  return jsonb_build_object('id',v_entry.id,'companyId',v_entry.company_id,'patientId',v_entry.patient_id,
    'professionalId',v_entry.professional_id,'specialty',v_entry.specialty,'priority',v_entry.priority,
    'notes',v_entry.notes,'entryDate',v_entry.entry_date,'createdAt',v_entry.created_at,
    'updatedAt',v_entry.updated_at,'patientName',v_patient.name,
    'calculatedFrom',jsonb_build_object('specialty',v_specialty,'specialtyScore',v_sp_score,
      'triagemScore',v_patient.triagem_score,'escolaPublica',v_patient.escola_publica,
      'trabalhoNaRoca',v_patient.trabalho_na_roca,
      'abrigoCasaCrianca', v_patient.abrigo_casa_crianca,
      'manualAdmin', coalesce(p_skip_triagem,false),
      'prioridadeMaxima', v_is_maxima));
end; $$;

revoke all on function public.add_patient_to_waiting_list(text, text, bigint, text, text, boolean) from public;
grant execute on function public.add_patient_to_waiting_list(text, text, bigint, text, text, boolean) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- Step 4: limpeza automática respeita a inserção administrativa
-- ═══════════════════════════════════════════════════════════════════════

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
  v_status_fix integer := 0;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

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

  -- 2. Paciente com agendamento ativo na mesma especialidade sai da fila,
  --    exceto quando a entrada foi criada manualmente pelo administrador.
  delete from public.waiting_list wl
   where wl.company_id = v_company_id
     and coalesce(wl.manual_admin, false) = false
     and exists (
       select 1 from public.appointments a
         join public.professionals p on p.id = a.professional_id
                                     and p.company_id = a.company_id
        where a.company_id = v_company_id
          and a.patient_id = wl.patient_id
          and a."date" >= v_today
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

  -- 3. Corrige o status de quem está em atendimento e fora da fila.
  update public.patients pt
     set status = 'Atendimento', updated_at = now()
   where pt.company_id = v_company_id
     and coalesce(pt.status, '') in ('Fila de Espera', 'Aguardando Triagem', '')
     and exists (
       select 1 from public.appointments a
        where a.patient_id = pt.id
          and a.company_id = v_company_id
          and a."date" >= v_today
          and lower(coalesce(a.status, 'agendado')) not in (
            'desmarcado','cancelado','alta','falta','falta_justificada',
            'falta_nao_justificada','ausente','desistência','desistencia','óbito'
          )
     )
     and not exists (
       select 1 from public.waiting_list wl
        where wl.patient_id = pt.id and wl.company_id = v_company_id
     );
  get diagnostics v_status_fix = row_count;

  return jsonb_build_object(
    'ok', true,
    'duplicatesRemoved', v_deduped,
    'syncedRemoved', v_cleaned,
    'statusFixed', v_status_fix
  );
end;
$$;

revoke all on function public.sync_waiting_list_with_agenda(text, text) from public;
grant execute on function public.sync_waiting_list_with_agenda(text, text) to anon, authenticated;

commit;
