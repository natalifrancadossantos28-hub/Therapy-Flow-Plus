-- =========================================================================
-- 0128_triagem_86_regras_situacao_fila.sql
--
-- 1. triagens_86 + save_triagem_86: triagem de 86 perguntas feita pela
--    Administração. Ao salvar, calcula as notas das 7 especialidades (mesma
--    escala da triagem atual: 0..3 por item, x1,5 por área) e insere a criança
--    nas filas cabíveis, sem duplicar e mantendo a data original de quem já
--    está na fila. "Não sei" / "Não se aplica" ficam fora da soma.
-- 2. fila_regras: pesos configuráveis (rascunho / validada) para simulação.
--    NÃO alteram a ordem real da fila.
-- 3. fila_situacoes: situação por especialidade (aguardando, convocado, em
--    avaliação, agendado, demanda não confirmada), com histórico.
--
-- Só CRIA tabelas e funções novas. Não altera o ABC, a triagem antiga,
-- list_waiting_list nem dados existentes (fora as notas/fila do paciente
-- triado, exatamente como a triagem atual já faz).
-- =========================================================================

begin;

create table if not exists public.triagens_86 (
  id           bigserial   primary key,
  company_id   bigint      not null references public.ponto_companies(id) on delete cascade,
  patient_id   bigint      not null references public.patients(id) on delete cascade,
  respostas    jsonb       not null default '{}'::jsonb,
  social       jsonb       not null default '{}'::jsonb,
  resultado    jsonb       not null default '{}'::jsonb,
  responsavel  text,
  created_at   timestamptz not null default now()
);
create index if not exists triagens_86_patient_idx on public.triagens_86 (company_id, patient_id, created_at desc);

create table if not exists public.fila_regras (
  id           bigserial   primary key,
  company_id   bigint      not null references public.ponto_companies(id) on delete cascade,
  pesos        jsonb       not null default '{}'::jsonb,
  status       text        not null default 'rascunho' check (status in ('rascunho', 'validada')),
  responsavel  text,
  observacoes  text,
  created_at   timestamptz not null default now()
);
create index if not exists fila_regras_company_idx on public.fila_regras (company_id, created_at desc);

create table if not exists public.fila_situacoes (
  id               bigserial   primary key,
  company_id       bigint      not null references public.ponto_companies(id) on delete cascade,
  waiting_list_id  bigint,
  patient_id       bigint      not null references public.patients(id) on delete cascade,
  specialty        text        not null,
  situacao         text        not null check (situacao in
                     ('aguardando', 'convocado', 'em_avaliacao', 'agendado', 'demanda_nao_confirmada')),
  justificativa    text,
  responsavel      text,
  created_at       timestamptz not null default now()
);
create index if not exists fila_situacoes_idx on public.fila_situacoes (company_id, patient_id, specialty, created_at desc);

-- ── Triagem 86 ───────────────────────────────────────────────────────────
create or replace function public._t86_to_json(t public.triagens_86)
returns jsonb language sql immutable as $$
  select jsonb_build_object('id', t.id, 'patientId', t.patient_id, 'respostas', t.respostas,
    'social', t.social, 'resultado', t.resultado, 'responsavel', t.responsavel, 'createdAt', t.created_at);
$$;

create or replace function public.save_triagem_86(
  p_slug text, p_password text, p_patient_id bigint,
  p_respostas jsonb, p_social jsonb default '{}'::jsonb, p_responsavel text default null
)
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_company_id bigint;
  v_patient    public.patients%rowtype;
  v_row        public.triagens_86%rowtype;
  v_map        jsonb := jsonb_build_object(
                   'F',  jsonb_build_array('Fonoaudiologia', 'score_fonoaudiologia'),
                   'P',  jsonb_build_array('Psicologia', 'score_psicologia'),
                   'TO', jsonb_build_array('Terapia Ocupacional', 'score_to'),
                   'FI', jsonb_build_array('Fisioterapia', 'score_fisioterapia'),
                   'PM', jsonb_build_array('Psicomotricidade', 'score_psicomotricidade'),
                   'N',  jsonb_build_array('Nutrição', 'score_nutricionista'),
                   'EF', jsonb_build_array('Educação Física', 'score_ed_fisica'));
  v_sums       jsonb := '{}'::jsonb;
  v_raw_tot    int := 0;
  v_score      int;
  v_specs      text[] := array[]::text[];
  v_new        text[] := array[]::text[];
  v_existing   text[] := array[]::text[];
  v_added      text[] := array[]::text[];
  v_priority   text;
  r            record;
  k            text;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  select * into v_patient from public.patients where id = p_patient_id and company_id = v_company_id;
  if not found then raise exception 'paciente não encontrado'; end if;
  if p_respostas is null or jsonb_typeof(p_respostas) <> 'object' then raise exception 'respostas inválidas'; end if;

  for k in select jsonb_object_keys(v_map) loop
    v_sums := v_sums || jsonb_build_object(k, 0);
  end loop;
  for r in select key, value #>> '{}' as val from jsonb_each(p_respostas) loop
    k := substring(r.key from '^([A-Z]+)\d{2}$');
    if k is not null and v_map ? k and r.val ~ '^[0-3]$' then
      v_sums := jsonb_set(v_sums, array[k], to_jsonb((v_sums->>k)::int + r.val::int));
      v_raw_tot := v_raw_tot + r.val::int;
    end if;
  end loop;

  insert into public.triagens_86 (company_id, patient_id, respostas, social, resultado, responsavel)
  values (v_company_id, p_patient_id, p_respostas, coalesce(p_social, '{}'::jsonb),
          jsonb_build_object('somas', v_sums), nullif(btrim(coalesce(p_responsavel, '')), ''))
  returning * into v_row;

  update public.patients set
    triagem_score          = round(v_raw_tot * 4.0 / 3.0)::int,
    score_fonoaudiologia   = round((v_sums->>'F')::int  * 1.5)::int,
    score_psicologia       = round((v_sums->>'P')::int  * 1.5)::int,
    score_to               = round((v_sums->>'TO')::int * 1.5)::int,
    score_fisioterapia     = round((v_sums->>'FI')::int * 1.5)::int,
    score_psicomotricidade = round((v_sums->>'PM')::int * 1.5)::int,
    score_nutricionista    = round((v_sums->>'N')::int  * 1.5)::int,
    score_ed_fisica        = round((v_sums->>'EF')::int * 1.5)::int
  where id = p_patient_id and company_id = v_company_id
  returning * into v_patient;

  for k in select jsonb_object_keys(v_map) loop
    if (v_sums->>k)::int > 0 then v_specs := array_append(v_specs, v_map->k->>0); end if;
  end loop;

  if coalesce(v_patient.tipo_registro, '') = 'Registro Censo Municipal'
     or v_patient.status in ('Alta', 'Óbito', 'Desistência')
     or array_length(v_specs, 1) is null then
    return jsonb_build_object('triagem', public._t86_to_json(v_row), 'linkedOnly', true, 'addedToQueue', false,
      'patientId', v_patient.id, 'specialties', to_jsonb(v_specs),
      'reason', case when array_length(v_specs, 1) is null then 'no_scored_specialties' else 'blocked_status' end);
  end if;

  select coalesce(array_agg(coalesce(specialty, '')), array[]::text[]) into v_existing
    from public.waiting_list where patient_id = v_patient.id and company_id = v_company_id;
  select coalesce(array_agg(s), array[]::text[]) into v_new from unnest(v_specs) s where not (s = any(v_existing));

  if array_length(v_new, 1) is not null then
    v_score := round(v_raw_tot * 4.0 / 3.0)::int;
    v_priority := public._calc_priority(v_score, coalesce(v_patient.escola_publica, false),
      coalesce(v_patient.trabalho_na_roca, false),
      coalesce(v_patient.local_atendimento, '') in ('Sem Atendimento', 'Nenhum'));
    with ins as (
      insert into public.waiting_list (company_id, patient_id, specialty, priority, notes, entry_date)
      select v_company_id, v_patient.id, s, v_priority, null, to_char(now() at time zone 'UTC', 'YYYY-MM-DD')
        from unnest(v_new) s
      returning specialty
    ) select coalesce(array_agg(specialty), array[]::text[]) into v_added from ins;
    if array_length(v_added, 1) is not null then
      update public.patients set status = 'Fila de Espera'
       where id = v_patient.id and company_id = v_company_id and status not in ('Atendimento');
    end if;
  end if;

  return jsonb_build_object('triagem', public._t86_to_json(v_row),
    'linkedOnly', array_length(v_added, 1) is null, 'addedToQueue', array_length(v_added, 1) is not null,
    'patientId', v_patient.id, 'patientName', v_patient.name, 'priority', v_priority,
    'specialties', to_jsonb(v_specs), 'addedSpecialties', to_jsonb(v_added),
    'existingSpecialties', to_jsonb(array(select s from unnest(v_specs) s where s = any(v_existing))),
    'reason', case when array_length(v_added, 1) is not null then null
                   when array_length(v_new, 1) is null then 'all_already_queued' else 'not_inserted' end);
end;
$$;
revoke all on function public.save_triagem_86(text, text, bigint, jsonb, jsonb, text) from public;
grant execute on function public.save_triagem_86(text, text, bigint, jsonb, jsonb, text) to anon, authenticated;

create or replace function public.list_triagens_86(p_slug text, p_password text, p_patient_id bigint)
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_company_id bigint; v_result jsonb;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  select coalesce(jsonb_agg(public._t86_to_json(t) order by t.created_at desc, t.id desc), '[]'::jsonb)
    into v_result from public.triagens_86 t
   where t.company_id = v_company_id and t.patient_id = p_patient_id;
  return v_result;
end;
$$;
revoke all on function public.list_triagens_86(text, text, bigint) from public;
grant execute on function public.list_triagens_86(text, text, bigint) to anon, authenticated;

-- Último resumo da triagem 86 por paciente (para a fila e a simulação).
create or replace function public.list_triagens_86_resumo(p_slug text, p_password text)
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_company_id bigint; v_result jsonb;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  select coalesce(jsonb_object_agg(t.patient_id::text, jsonb_build_object(
           'id', t.id, 'createdAt', t.created_at, 'resultado', t.resultado,
           'prioridades', (select coalesce(jsonb_agg(e.key), '[]'::jsonb) from jsonb_each_text(t.respostas) e
                            where e.key like 'PR%' and e.value = 'sim'),
           'social', (select coalesce(jsonb_agg(e.key), '[]'::jsonb) from jsonb_each_text(t.respostas) e
                       where e.key ~ '^S0[3-6]$' and e.value in ('sim', 'ninguem')))), '{}'::jsonb)
    into v_result
    from (select distinct on (patient_id) * from public.triagens_86
           where company_id = v_company_id order by patient_id, created_at desc, id desc) t;
  return v_result;
end;
$$;
revoke all on function public.list_triagens_86_resumo(text, text) from public;
grant execute on function public.list_triagens_86_resumo(text, text) to anon, authenticated;

-- ── Regras / pesos (simulação) ───────────────────────────────────────────
create or replace function public.save_fila_regras(
  p_slug text, p_password text, p_pesos jsonb, p_status text default 'rascunho',
  p_responsavel text default null, p_observacoes text default null
)
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_company_id bigint; v_row public.fila_regras%rowtype;
begin
  v_company_id := public._verify_visual_admin(p_slug, p_password);
  if p_pesos is null or jsonb_typeof(p_pesos) <> 'object' then raise exception 'pesos inválidos'; end if;
  if p_status = 'validada' and nullif(btrim(coalesce(p_responsavel, '')), '') is null then
    raise exception 'informe o responsável pela validação';
  end if;
  insert into public.fila_regras (company_id, pesos, status, responsavel, observacoes)
  values (v_company_id, p_pesos, case when p_status = 'validada' then 'validada' else 'rascunho' end,
          nullif(btrim(coalesce(p_responsavel, '')), ''), nullif(btrim(coalesce(p_observacoes, '')), ''))
  returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'pesos', v_row.pesos, 'status', v_row.status,
    'responsavel', v_row.responsavel, 'observacoes', v_row.observacoes, 'createdAt', v_row.created_at);
end;
$$;
revoke all on function public.save_fila_regras(text, text, jsonb, text, text, text) from public;
grant execute on function public.save_fila_regras(text, text, jsonb, text, text, text) to anon, authenticated;

create or replace function public.list_fila_regras(p_slug text, p_password text)
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_company_id bigint; v_result jsonb;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'pesos', r.pesos, 'status', r.status,
           'responsavel', r.responsavel, 'observacoes', r.observacoes, 'createdAt', r.created_at)
           order by r.created_at desc, r.id desc), '[]'::jsonb)
    into v_result
    from (select * from public.fila_regras where company_id = v_company_id
           order by created_at desc, id desc limit 30) r;
  return v_result;
end;
$$;
revoke all on function public.list_fila_regras(text, text) from public;
grant execute on function public.list_fila_regras(text, text) to anon, authenticated;

-- ── Situação por especialidade ───────────────────────────────────────────
create or replace function public._fsit_to_json(s public.fila_situacoes)
returns jsonb language sql immutable as $$
  select jsonb_build_object('id', s.id, 'waitingListId', s.waiting_list_id, 'patientId', s.patient_id,
    'specialty', s.specialty, 'situacao', s.situacao, 'justificativa', s.justificativa,
    'responsavel', s.responsavel, 'createdAt', s.created_at);
$$;

create or replace function public.create_fila_situacao(
  p_slug text, p_password text, p_waiting_list_id bigint, p_situacao text,
  p_justificativa text default null, p_responsavel text default null
)
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_company_id bigint; v_w public.waiting_list%rowtype; v_row public.fila_situacoes%rowtype;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  select * into v_w from public.waiting_list where id = p_waiting_list_id and company_id = v_company_id;
  if not found then raise exception 'entrada da fila não encontrada'; end if;
  if p_situacao not in ('aguardando', 'convocado', 'em_avaliacao', 'agendado', 'demanda_nao_confirmada') then
    raise exception 'situação inválida';
  end if;
  if p_situacao = 'demanda_nao_confirmada' and nullif(btrim(coalesce(p_justificativa, '')), '') is null then
    raise exception 'informe a justificativa';
  end if;
  insert into public.fila_situacoes (company_id, waiting_list_id, patient_id, specialty, situacao, justificativa, responsavel)
  values (v_company_id, v_w.id, v_w.patient_id, coalesce(v_w.specialty, ''), p_situacao,
          nullif(btrim(coalesce(p_justificativa, '')), ''), nullif(btrim(coalesce(p_responsavel, '')), ''))
  returning * into v_row;
  return public._fsit_to_json(v_row);
end;
$$;
revoke all on function public.create_fila_situacao(text, text, bigint, text, text, text) from public;
grant execute on function public.create_fila_situacao(text, text, bigint, text, text, text) to anon, authenticated;

-- Histórico completo da empresa (últimos 2000), mais recente primeiro.
create or replace function public.list_fila_situacoes(p_slug text, p_password text)
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_company_id bigint; v_result jsonb;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  select coalesce(jsonb_agg(public._fsit_to_json(s) order by s.created_at desc, s.id desc), '[]'::jsonb)
    into v_result
    from (select * from public.fila_situacoes where company_id = v_company_id
           order by created_at desc, id desc limit 2000) s;
  return v_result;
end;
$$;
revoke all on function public.list_fila_situacoes(text, text) from public;
grant execute on function public.list_fila_situacoes(text, text) to anon, authenticated;

commit;
