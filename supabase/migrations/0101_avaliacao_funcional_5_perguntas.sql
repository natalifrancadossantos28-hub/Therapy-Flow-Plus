-- =========================================================================
-- 0101_avaliacao_funcional_5_perguntas.sql
--
-- Avaliação Funcional Multidisciplinar: questionário "coringa" de 5 perguntas
-- (Likert 1–5, total 5–25) que serve para qualquer especialidade.
--   * Preenchido pelo profissional na ENTRADA (início do acompanhamento na
--     especialidade) e na ALTA daquela especialidade.
--   * Cada avaliação é uma linha nova (nunca sobrescreve); o front usa a mais
--     recente de cada (paciente, especialidade, tipo).
--   * Substitui o checklist ABC como reavaliação obrigatória na alta. O ABC
--     continua disponível (opcional) no prontuário.
--   * Perguntas/rótulos ficam em artifacts/arco-iris/src/lib/avaliacao-funcional.ts.
--
-- Idempotente.
-- =========================================================================

begin;

create table if not exists public.avaliacoes_funcionais (
  id                bigserial   primary key,
  company_id        bigint      not null references public.ponto_companies(id) on delete cascade,
  patient_id        bigint      not null references public.patients(id)        on delete cascade,
  tipo              text        not null check (tipo in ('entrada', 'alta')),
  specialty         text,
  professional_id   bigint,
  professional_name text,
  respostas         jsonb       not null default '[]'::jsonb,
  score_total       int         not null check (score_total between 5 and 25),
  observacoes       text,
  created_at        timestamptz not null default now()
);

create index if not exists avaliacoes_funcionais_patient_idx
  on public.avaliacoes_funcionais (company_id, patient_id, specialty, tipo, created_at desc);

alter table public.avaliacoes_funcionais enable row level security;

create or replace function public._avf_to_json(a public.avaliacoes_funcionais)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'id',               a.id,
    'patientId',        a.patient_id,
    'tipo',             a.tipo,
    'specialty',        a.specialty,
    'professionalId',   a.professional_id,
    'professionalName', a.professional_name,
    'respostas',        a.respostas,
    'scoreTotal',       a.score_total,
    'observacoes',      a.observacoes,
    'createdAt',        a.created_at
  );
$$;

create or replace function public.create_avaliacao_funcional(
  p_slug              text,
  p_password          text,
  p_patient_id        bigint,
  p_tipo              text,
  p_respostas         jsonb,
  p_specialty         text   default null,
  p_professional_id   bigint default null,
  p_professional_name text   default null,
  p_observacoes       text   default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_row        public.avaliacoes_funcionais%rowtype;
  v_total      int;
  v_val        int;
  v_item       jsonb;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  if p_tipo not in ('entrada', 'alta') then
    raise exception 'tipo inválido: %', p_tipo;
  end if;
  if not exists (select 1 from public.patients p where p.id = p_patient_id and p.company_id = v_company_id) then
    raise exception 'paciente não encontrado';
  end if;
  if jsonb_typeof(p_respostas) <> 'array' or jsonb_array_length(p_respostas) <> 5 then
    raise exception 'a avaliação funcional exige exatamente 5 respostas';
  end if;

  v_total := 0;
  for v_item in select * from jsonb_array_elements(p_respostas) loop
    if jsonb_typeof(v_item) <> 'number' then
      raise exception 'resposta inválida (esperado número de 1 a 5)';
    end if;
    v_val := (v_item)::text::int;
    if v_val < 1 or v_val > 5 then
      raise exception 'cada resposta deve estar entre 1 e 5';
    end if;
    v_total := v_total + v_val;
  end loop;

  insert into public.avaliacoes_funcionais (
    company_id, patient_id, tipo, specialty, professional_id, professional_name,
    respostas, score_total, observacoes
  ) values (
    v_company_id, p_patient_id, p_tipo,
    nullif(btrim(coalesce(p_specialty, '')), ''),
    p_professional_id,
    nullif(btrim(coalesce(p_professional_name, '')), ''),
    p_respostas, v_total,
    nullif(btrim(coalesce(p_observacoes, '')), '')
  ) returning * into v_row;

  return public._avf_to_json(v_row);
end;
$$;

revoke all on function public.create_avaliacao_funcional(text, text, bigint, text, jsonb, text, bigint, text, text) from public;
grant  execute on function public.create_avaliacao_funcional(text, text, bigint, text, jsonb, text, bigint, text, text) to anon, authenticated;

-- Histórico completo de um paciente (mais recente primeiro).
create or replace function public.list_avaliacoes_funcionais(
  p_slug       text,
  p_password   text,
  p_patient_id bigint
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
  select coalesce(jsonb_agg(public._avf_to_json(a) order by a.created_at desc, a.id desc), '[]'::jsonb)
    into v_result
    from public.avaliacoes_funcionais a
   where a.company_id = v_company_id
     and a.patient_id = p_patient_id;
  return v_result;
end;
$$;

revoke all on function public.list_avaliacoes_funcionais(text, text, bigint) from public;
grant  execute on function public.list_avaliacoes_funcionais(text, text, bigint) to anon, authenticated;

-- Resumo por (paciente, especialidade): última ENTRADA e última ALTA.
-- Alimenta o Dashboard de Evolução Clínica.
create or replace function public.list_avaliacoes_funcionais_resumo(
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
  v_result     jsonb;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  with ult as (
    select distinct on (a.patient_id, coalesce(a.specialty, ''), a.tipo) a.*
      from public.avaliacoes_funcionais a
     where a.company_id = v_company_id
     order by a.patient_id, coalesce(a.specialty, ''), a.tipo, a.created_at desc, a.id desc
  ),
  chaves as (
    select distinct patient_id, coalesce(specialty, '') as spec from ult
  ),
  por_chave as (
    select
      c.patient_id,
      p.name   as patient_name,
      p.status as patient_status,
      nullif(c.spec, '') as specialty,
      e.id as entrada_id, e.score_total as entrada_total, e.respostas as entrada_resp, e.created_at as entrada_em, e.professional_name as entrada_prof,
      s.id as alta_id,    s.score_total as alta_total,    s.respostas as alta_resp,    s.created_at as alta_em,    s.professional_name as alta_prof
      from chaves c
      join public.patients p on p.id = c.patient_id
      left join ult e on e.patient_id = c.patient_id and coalesce(e.specialty, '') = c.spec and e.tipo = 'entrada'
      left join ult s on s.patient_id = c.patient_id and coalesce(s.specialty, '') = c.spec and s.tipo = 'alta'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'patientId',   patient_id,
    'patientName', patient_name,
    'status',      patient_status,
    'specialty',   specialty,
    'entrada', case when entrada_id is null then null else jsonb_build_object(
      'id', entrada_id, 'scoreTotal', entrada_total, 'respostas', entrada_resp, 'createdAt', entrada_em, 'professionalName', entrada_prof) end,
    'alta', case when alta_id is null then null else jsonb_build_object(
      'id', alta_id, 'scoreTotal', alta_total, 'respostas', alta_resp, 'createdAt', alta_em, 'professionalName', alta_prof) end
  ) order by patient_name, specialty), '[]'::jsonb) into v_result
  from por_chave;

  return v_result;
end;
$$;

revoke all on function public.list_avaliacoes_funcionais_resumo(text, text) from public;
grant  execute on function public.list_avaliacoes_funcionais_resumo(text, text) to anon, authenticated;

commit;
