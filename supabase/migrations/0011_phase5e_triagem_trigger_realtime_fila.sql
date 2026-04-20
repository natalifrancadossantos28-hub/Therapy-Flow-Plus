-- Phase 5E - Triagem -> Fila automatica + Realtime na Fila de Espera
--
-- Objetivos:
-- 1. Manter a logica de calculo da triagem LEVE no banco: trigger simples em
--    `triagens` que chama `autolink_triagem` internamente logo apos INSERT/UPDATE,
--    usando o company_id da propria linha (sem re-autenticar). Se a frontend
--    (App.tsx) tambem chamar `autolink_triagem` via RPC, a logica e idempotente
--    (dedup por specialty ja existente).
-- 2. Fazer a Fila de Espera atualizar INSTANTANEAMENTE no painel do Arco-iris:
--    `waiting_list` e `patients` entram na publication supabase_realtime +
--    policy SELECT aberta para anon/authenticated (Realtime exige ambos).
--
-- Zero migracao de dados. Todas as mudancas sao idempotentes.

-- -----------------------------------------------------------------------------
-- 1) Helper interno: _autolink_triagem_internal(v_company_id, p_triagem_id)
--    Mesma logica de autolink_triagem, mas sem checar slug/password (ja temos
--    o company_id da linha da trigger). Usado pelo trigger e pela RPC publica.
-- -----------------------------------------------------------------------------
create or replace function public._autolink_triagem_internal(
  v_company_id bigint,
  p_triagem_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_triagem           public.triagens%rowtype;
  v_respostas         jsonb;
  v_respostas_count   integer := 0;
  v_triagem_score     integer := 0;
  v_area_scores       jsonb   := '{}'::jsonb;
  v_patient           public.patients%rowtype;
  v_cpf_clean         text;
  v_escola_publica    boolean;
  v_trabalho_na_roca  boolean;
  v_sem_terapia       boolean;
  v_priority          text;
  v_today             text;
  v_scored_specs      text[] := array[]::text[];
  v_new_specs         text[] := array[]::text[];
  v_existing_specs    text[] := array[]::text[];
  v_skipped_specs     text[] := array[]::text[];
  v_resolved_tipo     text;
  r                   record;
begin
  select * into v_triagem from public.triagens
   where id = p_triagem_id and company_id = v_company_id;
  if not found then
    return jsonb_build_object('linkedOnly', false, 'addedToQueue', false, 'reason', 'triagem_not_found');
  end if;

  if v_triagem.respostas is null or btrim(v_triagem.respostas) = '' then
    return jsonb_build_object('linkedOnly', false, 'addedToQueue', false, 'reason', 'no_respostas');
  end if;

  begin
    v_respostas := v_triagem.respostas::jsonb;
  exception when others then
    return jsonb_build_object('linkedOnly', false, 'addedToQueue', false, 'reason', 'invalid_respostas');
  end;

  if jsonb_typeof(v_respostas) <> 'array' then
    return jsonb_build_object('linkedOnly', false, 'addedToQueue', false, 'reason', 'respostas_not_array');
  end if;

  v_respostas_count := jsonb_array_length(v_respostas);
  if v_respostas_count < 120 then
    return jsonb_build_object('linkedOnly', false, 'addedToQueue', false, 'reason', 'respostas_too_short');
  end if;

  v_triagem_score := 0;
  declare
    i int := 0;
    v_sums int[] := array[0,0,0,0,0,0,0,0];
  begin
    for r in select (value::int) as val, ord
               from jsonb_array_elements_text(v_respostas) with ordinality as t(value, ord)
    loop
      exit when r.ord > 120;
      i := (r.ord - 1) / 15;
      v_sums[i + 1] := v_sums[i + 1] + r.val;
      v_triagem_score := v_triagem_score + r.val;
    end loop;

    v_area_scores := jsonb_build_object(
      'score_psicologia',       v_sums[1],
      'score_psicomotricidade', v_sums[2],
      'score_fisioterapia',     v_sums[3],
      'score_to',               v_sums[4],
      'score_fonoaudiologia',   v_sums[5],
      'score_nutricionista',    v_sums[6],
      'score_psicopedagogia',   v_sums[7],
      'score_ed_fisica',        v_sums[8]
    );

    if v_sums[1] > 0 then v_scored_specs := v_scored_specs || 'Psicologia'; end if;
    if v_sums[2] > 0 then v_scored_specs := v_scored_specs || 'Psicomotricidade'; end if;
    if v_sums[3] > 0 then v_scored_specs := v_scored_specs || 'Fisioterapia'; end if;
    if v_sums[4] > 0 then v_scored_specs := v_scored_specs || 'Terapia Ocupacional'; end if;
    if v_sums[5] > 0 then v_scored_specs := v_scored_specs || 'Fonoaudiologia'; end if;
    if v_sums[6] > 0 then v_scored_specs := v_scored_specs || 'Nutrição'; end if;
    if v_sums[7] > 0 then v_scored_specs := v_scored_specs || 'Psicopedagogia'; end if;
    if v_sums[8] > 0 then v_scored_specs := v_scored_specs || 'Educação Física'; end if;
  end;

  v_escola_publica   := coalesce(v_triagem.tipo_escola,   '') in ('Municipal', 'Estadual');
  v_trabalho_na_roca := coalesce(v_triagem.trabalho_pais, '') in ('Informal/Roça', 'Desempregado');

  v_cpf_clean := nullif(regexp_replace(coalesce(v_triagem.cpf, ''), '[^0-9]', '', 'g'), '');
  if v_cpf_clean is not null and length(v_cpf_clean) >= 11 then
    select * into v_patient from public.patients
     where company_id = v_company_id
       and regexp_replace(coalesce(cpf, ''), '[^0-9]', '', 'g') = v_cpf_clean
     limit 1;
  end if;

  if v_patient.id is null and v_triagem.nome is not null then
    select * into v_patient from public.patients
     where company_id = v_company_id
       and lower(btrim(name)) = lower(btrim(v_triagem.nome))
     limit 1;
  end if;

  if v_patient.id is null then
    return jsonb_build_object('linkedOnly', false, 'addedToQueue', false, 'reason', 'no_matching_patient');
  end if;

  update public.patients set
    triagem_score          = v_triagem_score,
    score_psicologia       = (v_area_scores->>'score_psicologia')::int,
    score_psicomotricidade = (v_area_scores->>'score_psicomotricidade')::int,
    score_fisioterapia     = (v_area_scores->>'score_fisioterapia')::int,
    score_to               = (v_area_scores->>'score_to')::int,
    score_fonoaudiologia   = (v_area_scores->>'score_fonoaudiologia')::int,
    score_nutricionista    = (v_area_scores->>'score_nutricionista')::int,
    score_psicopedagogia   = (v_area_scores->>'score_psicopedagogia')::int,
    score_ed_fisica        = (v_area_scores->>'score_ed_fisica')::int,
    escola_publica         = v_escola_publica,
    trabalho_na_roca       = v_trabalho_na_roca,
    tipo_registro          = case
                               when tipo_registro is not null and btrim(tipo_registro) <> '' then tipo_registro
                               when v_triagem.tipo_registro is not null and btrim(v_triagem.tipo_registro) <> '' then v_triagem.tipo_registro
                               else tipo_registro end,
    local_atendimento      = case
                               when local_atendimento is not null and btrim(local_atendimento) <> '' then local_atendimento
                               else v_triagem.local_atendimento end
  where id = v_patient.id and company_id = v_company_id
  returning * into v_patient;

  v_resolved_tipo := v_patient.tipo_registro;

  if v_resolved_tipo = 'Registro Censo Municipal' then
    return jsonb_build_object(
      'linkedOnly', true, 'addedToQueue', false, 'scoresUpdated', true,
      'censoMunicipal', true,
      'patientId', v_patient.id, 'patientName', v_patient.name
    );
  end if;

  if v_patient.status in ('Alta', 'Óbito', 'Desistência') then
    return jsonb_build_object(
      'linkedOnly', true, 'addedToQueue', false, 'scoresUpdated', true,
      'patientId', v_patient.id, 'patientName', v_patient.name,
      'reason', 'blocked_status'
    );
  end if;

  if array_length(v_scored_specs, 1) is null then
    return jsonb_build_object(
      'linkedOnly', true, 'addedToQueue', false, 'scoresUpdated', true,
      'patientId', v_patient.id, 'patientName', v_patient.name,
      'reason', 'no_scored_specialties'
    );
  end if;

  select coalesce(array_agg(coalesce(specialty, '')), array[]::text[]) into v_existing_specs
    from public.waiting_list
   where patient_id = v_patient.id and company_id = v_company_id;

  select coalesce(array_agg(s), array[]::text[]) into v_new_specs
    from unnest(v_scored_specs) s
   where not (s = any(v_existing_specs));

  select coalesce(array_agg(s), array[]::text[]) into v_skipped_specs
    from unnest(v_scored_specs) s
   where s = any(v_existing_specs);

  if array_length(v_new_specs, 1) is null then
    return jsonb_build_object(
      'linkedOnly',     true,
      'addedToQueue',   false,
      'scoresUpdated',  true,
      'patientId',      v_patient.id,
      'patientName',    v_patient.name,
      'specialties',    to_jsonb(v_scored_specs),
      'alreadyQueued',  to_jsonb(v_skipped_specs),
      'reason',         'all_already_queued'
    );
  end if;

  v_sem_terapia := coalesce(v_patient.local_atendimento, '') in ('Sem Atendimento', 'Nenhum');
  v_priority := public._calc_priority(
    v_triagem_score, v_escola_publica, v_trabalho_na_roca, v_sem_terapia
  );
  v_today := to_char(now() at time zone 'UTC', 'YYYY-MM-DD');

  insert into public.waiting_list (company_id, patient_id, specialty, priority, notes, entry_date)
  select v_company_id, v_patient.id, s, v_priority, null, v_today
    from unnest(v_new_specs) s;

  update public.patients set status = 'Fila de Espera'
   where id = v_patient.id and company_id = v_company_id;

  return jsonb_build_object(
    'linkedOnly',     false,
    'addedToQueue',   true,
    'scoresUpdated',  true,
    'patientId',      v_patient.id,
    'patientName',    v_patient.name,
    'priority',       v_priority,
    'specialties',    to_jsonb(v_new_specs),
    'alreadyQueued',  to_jsonb(v_skipped_specs),
    'triagemScore',   v_triagem_score
  );
end;
$$;

revoke all on function public._autolink_triagem_internal(bigint, bigint) from public;
-- Apenas SECURITY DEFINER e outras funcoes internas chamam; anon/authenticated
-- continuam usando a RPC publica autolink_triagem (com auth por slug/senha).

-- -----------------------------------------------------------------------------
-- 2) autolink_triagem (RPC publica) passa a delegar pro helper interno.
--    Mantem compat com o frontend: mesma assinatura e mesmo retorno.
-- -----------------------------------------------------------------------------
create or replace function public.autolink_triagem(
  p_slug        text,
  p_password    text,
  p_triagem_id  bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  return public._autolink_triagem_internal(v_company_id, p_triagem_id);
end;
$$;

revoke all on function public.autolink_triagem(text, text, bigint) from public;
grant execute on function public.autolink_triagem(text, text, bigint)
  to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3) Trigger AFTER INSERT OR UPDATE em triagens: roda o autolink interno.
--    Garante que a fila seja populada IMEDIATAMENTE apos salvar a triagem,
--    mesmo que o frontend nao chame autolink_triagem explicitamente.
--    Idempotente: dedup interno impede linhas duplicadas em waiting_list.
-- -----------------------------------------------------------------------------
create or replace function public._tg_triagens_autolink()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  -- So dispara quando respostas ja esta preenchida (ignora INSERT inicial vazio
  -- que algumas partes do fluxo possam fazer como rascunho).
  if new.respostas is null or btrim(new.respostas) = '' then
    return new;
  end if;
  -- Chamada best-effort: nunca bloquear o save.
  begin
    perform public._autolink_triagem_internal(new.company_id, new.id);
  exception when others then
    -- Nao propaga erro do autolink (mantem triagem salva mesmo se linkagem falhar).
    raise warning 'autolink_triagem falhou para triagem %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists tg_triagens_autolink on public.triagens;
create trigger tg_triagens_autolink
  after insert or update of respostas, cpf, nome, tipo_escola, trabalho_pais, local_atendimento, tipo_registro
  on public.triagens
  for each row
  execute function public._tg_triagens_autolink();

-- -----------------------------------------------------------------------------
-- 4) Realtime: adiciona waiting_list e patients na publication supabase_realtime.
--    waiting_list -> banner/atualizacao imediata na Fila de Espera.
--    patients     -> status "Fila de Espera" reflete na lista de pacientes.
--    Idempotente.
-- -----------------------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.waiting_list;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.patients;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end
$$;

-- -----------------------------------------------------------------------------
-- 5) RLS: SELECT aberto para anon/authenticated em waiting_list e patients.
--    Necessario para o Realtime entregar eventos ao cliente anon.
--    Writes continuam exclusivos pelas RPCs SECURITY DEFINER.
-- -----------------------------------------------------------------------------
drop policy if exists waiting_list_read_all on public.waiting_list;
create policy waiting_list_read_all
  on public.waiting_list
  for select
  to anon, authenticated
  using (true);

drop policy if exists patients_read_all on public.patients;
create policy patients_read_all
  on public.patients
  for select
  to anon, authenticated
  using (true);
