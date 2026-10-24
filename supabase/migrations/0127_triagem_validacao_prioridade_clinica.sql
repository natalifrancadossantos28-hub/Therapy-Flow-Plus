-- =========================================================================
-- 0127_triagem_validacao_prioridade_clinica.sql
--
-- Modernização (triagem → fila):
--   1. triagem_validacoes: decisão da equipe sobre cada especialidade
--      sugerida pela triagem ou após a 1ª avaliação (confirmada / sem
--      demanda / revisar), com justificativa. Histórico append-only.
--   2. prioridades_clinicas: classificação de prioridade clínica
--      (máxima / elevada / moderada / habitual) e alerta de emergência.
--   3. list_fila_indicadores: resumo por paciente para a Fila de Espera.
--
-- Só CRIA tabelas e funções novas. Não altera a fila, o ABC, a triagem
-- nem nenhum dado existente. Nada disso muda a ordem da fila.
-- =========================================================================

begin;

create table if not exists public.triagem_validacoes (
  id            bigserial   primary key,
  company_id    bigint      not null references public.ponto_companies(id) on delete cascade,
  patient_id    bigint      not null references public.patients(id)        on delete cascade,
  specialty     text        not null,
  decisao       text        not null check (decisao in ('confirmada', 'sem_demanda', 'revisar')),
  origem        text        not null default 'triagem' check (origem in ('triagem', 'avaliacao')),
  justificativa text,
  responsavel   text,
  created_at    timestamptz not null default now()
);
create index if not exists triagem_validacoes_patient_idx
  on public.triagem_validacoes (company_id, patient_id, created_at desc);
alter table public.triagem_validacoes enable row level security;

create table if not exists public.prioridades_clinicas (
  id          bigserial   primary key,
  company_id  bigint      not null references public.ponto_companies(id) on delete cascade,
  patient_id  bigint      not null references public.patients(id)        on delete cascade,
  respostas   jsonb       not null default '{}'::jsonb,
  nivel       text        not null check (nivel in ('maxima', 'elevada', 'moderada', 'habitual')),
  alertas     jsonb       not null default '[]'::jsonb,
  emergencia  boolean     not null default false,
  responsavel text,
  observacoes text,
  created_at  timestamptz not null default now()
);
create index if not exists prioridades_clinicas_patient_idx
  on public.prioridades_clinicas (company_id, patient_id, created_at desc);
alter table public.prioridades_clinicas enable row level security;

create or replace function public._tval_to_json(v public.triagem_validacoes)
returns jsonb language sql stable as $$
  select jsonb_build_object('id', v.id, 'patientId', v.patient_id, 'specialty', v.specialty,
    'decisao', v.decisao, 'origem', v.origem, 'justificativa', v.justificativa,
    'responsavel', v.responsavel, 'createdAt', v.created_at);
$$;

create or replace function public._pcli_to_json(v public.prioridades_clinicas)
returns jsonb language sql stable as $$
  select jsonb_build_object('id', v.id, 'patientId', v.patient_id, 'respostas', v.respostas,
    'nivel', v.nivel, 'alertas', v.alertas, 'emergencia', v.emergencia,
    'responsavel', v.responsavel, 'observacoes', v.observacoes, 'createdAt', v.created_at);
$$;

create or replace function public.create_triagem_validacao(
  p_slug text, p_password text, p_patient_id bigint, p_specialty text,
  p_decisao text, p_origem text default 'triagem',
  p_justificativa text default null, p_responsavel text default null
)
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_company_id bigint;
  v_row public.triagem_validacoes%rowtype;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  if not exists (select 1 from public.patients p where p.id = p_patient_id and p.company_id = v_company_id) then
    raise exception 'paciente não encontrado';
  end if;
  if nullif(btrim(coalesce(p_specialty, '')), '') is null then
    raise exception 'especialidade inválida';
  end if;
  if p_decisao not in ('confirmada', 'sem_demanda', 'revisar') then
    raise exception 'decisão inválida';
  end if;
  if p_decisao = 'sem_demanda' and nullif(btrim(coalesce(p_justificativa, '')), '') is null then
    raise exception 'informe a justificativa técnica';
  end if;
  insert into public.triagem_validacoes (company_id, patient_id, specialty, decisao, origem, justificativa, responsavel)
  values (v_company_id, p_patient_id, btrim(p_specialty), p_decisao,
          case when p_origem = 'avaliacao' then 'avaliacao' else 'triagem' end,
          nullif(btrim(coalesce(p_justificativa, '')), ''),
          nullif(btrim(coalesce(p_responsavel, '')), ''))
  returning * into v_row;
  return public._tval_to_json(v_row);
end;
$$;
revoke all on function public.create_triagem_validacao(text, text, bigint, text, text, text, text, text) from public;
grant execute on function public.create_triagem_validacao(text, text, bigint, text, text, text, text, text) to anon, authenticated;

create or replace function public.list_triagem_validacoes(p_slug text, p_password text, p_patient_id bigint)
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_company_id bigint; v_result jsonb;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  select coalesce(jsonb_agg(public._tval_to_json(v) order by v.created_at desc, v.id desc), '[]'::jsonb)
    into v_result from public.triagem_validacoes v
   where v.company_id = v_company_id and v.patient_id = p_patient_id;
  return v_result;
end;
$$;
revoke all on function public.list_triagem_validacoes(text, text, bigint) from public;
grant execute on function public.list_triagem_validacoes(text, text, bigint) to anon, authenticated;

create or replace function public.create_prioridade_clinica(
  p_slug text, p_password text, p_patient_id bigint, p_respostas jsonb,
  p_nivel text, p_alertas jsonb, p_emergencia boolean,
  p_responsavel text default null, p_observacoes text default null
)
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_company_id bigint;
  v_row public.prioridades_clinicas%rowtype;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  if not exists (select 1 from public.patients p where p.id = p_patient_id and p.company_id = v_company_id) then
    raise exception 'paciente não encontrado';
  end if;
  if jsonb_typeof(coalesce(p_respostas, 'null'::jsonb)) <> 'object' then
    raise exception 'respostas inválidas';
  end if;
  if jsonb_typeof(coalesce(p_alertas, '[]'::jsonb)) <> 'array' then
    raise exception 'alertas inválidos';
  end if;
  if p_nivel not in ('maxima', 'elevada', 'moderada', 'habitual') then
    raise exception 'nível inválido';
  end if;
  insert into public.prioridades_clinicas (company_id, patient_id, respostas, nivel, alertas, emergencia, responsavel, observacoes)
  values (v_company_id, p_patient_id, p_respostas, p_nivel, coalesce(p_alertas, '[]'::jsonb),
          coalesce(p_emergencia, false),
          nullif(btrim(coalesce(p_responsavel, '')), ''),
          nullif(btrim(coalesce(p_observacoes, '')), ''))
  returning * into v_row;
  return public._pcli_to_json(v_row);
end;
$$;
revoke all on function public.create_prioridade_clinica(text, text, bigint, jsonb, text, jsonb, boolean, text, text) from public;
grant execute on function public.create_prioridade_clinica(text, text, bigint, jsonb, text, jsonb, boolean, text, text) to anon, authenticated;

create or replace function public.list_prioridades_clinicas(p_slug text, p_password text, p_patient_id bigint)
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_company_id bigint; v_result jsonb;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  select coalesce(jsonb_agg(public._pcli_to_json(v) order by v.created_at desc, v.id desc), '[]'::jsonb)
    into v_result from public.prioridades_clinicas v
   where v.company_id = v_company_id and v.patient_id = p_patient_id;
  return v_result;
end;
$$;
revoke all on function public.list_prioridades_clinicas(text, text, bigint) from public;
grant execute on function public.list_prioridades_clinicas(text, text, bigint) to anon, authenticated;

-- Resumo por paciente para a Fila: última prioridade clínica, último
-- indicador social e a decisão mais recente por especialidade.
create or replace function public.list_fila_indicadores(p_slug text, p_password text)
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_company_id bigint; v_result jsonb;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  with pc as (
    select distinct on (patient_id) patient_id, nivel, emergencia, created_at
      from public.prioridades_clinicas where company_id = v_company_id
     order by patient_id, created_at desc, id desc
  ), so as (
    select distinct on (patient_id) patient_id, score, score_max, created_at
      from public.avaliacoes_sociofamiliares where company_id = v_company_id
     order by patient_id, created_at desc, id desc
  ), va as (
    select patient_id, jsonb_object_agg(specialty, decisao) as m from (
      select distinct on (patient_id, specialty) patient_id, specialty, decisao
        from public.triagem_validacoes where company_id = v_company_id
       order by patient_id, specialty, created_at desc, id desc
    ) x group by patient_id
  ), ids as (
    select patient_id from pc union select patient_id from so union select patient_id from va
  )
  select coalesce(jsonb_object_agg(ids.patient_id::text, jsonb_build_object(
           'prioridade', case when pc.patient_id is null then null else
              jsonb_build_object('nivel', pc.nivel, 'emergencia', pc.emergencia, 'createdAt', pc.created_at) end,
           'social', case when so.patient_id is null then null else
              jsonb_build_object('score', so.score, 'scoreMax', so.score_max, 'createdAt', so.created_at) end,
           'validacoes', coalesce(va.m, '{}'::jsonb))), '{}'::jsonb)
    into v_result
    from ids
    left join pc on pc.patient_id = ids.patient_id
    left join so on so.patient_id = ids.patient_id
    left join va on va.patient_id = ids.patient_id;
  return v_result;
end;
$$;
revoke all on function public.list_fila_indicadores(text, text) from public;
grant execute on function public.list_fila_indicadores(text, text) to anon, authenticated;

commit;
