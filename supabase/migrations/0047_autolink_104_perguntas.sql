-- =========================================================================
-- 0047_autolink_104_perguntas.sql
--
-- Atualiza _autolink_triagem_internal para a nova distribuição de
-- 104 perguntas (antes: 120 = 8 x 15).
--
-- Nova distribuição:
--   Psicológico:          15 perguntas  (ord  1..15)
--   Psicomotricidade:     10 perguntas  (ord 16..25)
--   Fisioterapia:         15 perguntas  (ord 26..40)
--   Terapia Ocupacional:  15 perguntas  (ord 41..55)
--   Fonoaudiologia:       15 perguntas  (ord 56..70)
--   Nutrição:             12 perguntas  (ord 71..82)
--   Psicopedagogia:       12 perguntas  (ord 83..94)
--   Educação Física:      10 perguntas  (ord 95..104)
--
-- Também suporta triagens legado com 120 perguntas (8 x 15).
--
-- Migration idempotente.
-- =========================================================================

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

  -- Suporta 104 (novo) e 120 (legado)
  if v_respostas_count < 104 then
    return jsonb_build_object('linkedOnly', false, 'addedToQueue', false, 'reason', 'respostas_too_short');
  end if;

  v_triagem_score := 0;
  declare
    v_sums int[] := array[0,0,0,0,0,0,0,0];
    v_ord  int;
    v_val  int;
    v_idx  int;
  begin
    for r in select (value::int) as val, ord
               from jsonb_array_elements_text(v_respostas) with ordinality as t(value, ord)
    loop
      v_ord := r.ord;
      v_val := r.val;

      if v_respostas_count >= 120 then
        -- Legado: 8 x 15 perguntas
        exit when v_ord > 120;
        v_idx := ((v_ord - 1) / 15) + 1;
      else
        -- Novo: 104 perguntas com distribuição variável
        exit when v_ord > 104;
        if    v_ord <= 15 then v_idx := 1;  -- Psicológico (15)
        elsif v_ord <= 25 then v_idx := 2;  -- Psicomotricidade (10)
        elsif v_ord <= 40 then v_idx := 3;  -- Fisioterapia (15)
        elsif v_ord <= 55 then v_idx := 4;  -- Terapia Ocupacional (15)
        elsif v_ord <= 70 then v_idx := 5;  -- Fonoaudiologia (15)
        elsif v_ord <= 82 then v_idx := 6;  -- Nutrição (12)
        elsif v_ord <= 94 then v_idx := 7;  -- Psicopedagogia (12)
        else                   v_idx := 8;  -- Educação Física (10)
        end if;
      end if;

      v_sums[v_idx] := v_sums[v_idx] + v_val;
      v_triagem_score := v_triagem_score + v_val;
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

  -- Match paciente por CPF ou nome
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

  -- Atualiza scores no paciente
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
    abrigo_casa_crianca    = coalesce(v_triagem.abrigo_casa_crianca, abrigo_casa_crianca),
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

  -- Verifica quais especialidades já estão na fila
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

  -- Calcula prioridade e adiciona à fila
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
    'linkedOnly',          false,
    'addedToQueue',        true,
    'scoresUpdated',       true,
    'patientId',           v_patient.id,
    'patientName',         v_patient.name,
    'priority',            v_priority,
    'addedSpecialties',    to_jsonb(v_new_specs),
    'existingSpecialties', to_jsonb(v_skipped_specs),
    'skippedSpecialties',  to_jsonb(v_skipped_specs),
    'triagemScore',        v_triagem_score
  );
end;
$$;

revoke all on function public._autolink_triagem_internal(bigint, bigint) from public;
