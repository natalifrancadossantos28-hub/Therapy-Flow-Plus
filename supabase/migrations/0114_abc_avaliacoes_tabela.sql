-- =========================================================================
-- 0114_abc_avaliacoes_tabela.sql
--
-- Cria a tabela e as funções da Avaliação ABC (parte ABC do 0097), que
-- não existiam no banco. Sem elas a Fila de Espera (0113) quebra com
-- "relation public.abc_avaliacoes does not exist" e o ABC não salva.
-- Não mexe na fila nem nos recados. Idempotente.
-- =========================================================================

begin;
-- ── Avaliações ABC ───────────────────────────────────────────────────────────

create table if not exists public.abc_avaliacoes (
  id                     bigserial   primary key,
  company_id             bigint      not null references public.ponto_companies(id) on delete cascade,
  patient_id             bigint      not null references public.patients(id)        on delete cascade,
  tipo                   text        not null check (tipo in ('entrada', 'alta')),
  professional_id        bigint,
  professional_name      text,
  respostas              jsonb       not null default '[]'::jsonb,
  score_sensorial        int         not null default 0,
  score_relacionamento   int         not null default 0,
  score_corpo            int         not null default 0,
  score_linguagem        int         not null default 0,
  score_pessoal_social   int         not null default 0,
  score_total            int         not null default 0,
  nivel                  int         not null check (nivel in (1, 2, 3)),
  observacoes            text,
  created_at             timestamptz not null default now()
);

create index if not exists abc_avaliacoes_patient_idx
  on public.abc_avaliacoes (company_id, patient_id, tipo, created_at desc);

alter table public.abc_avaliacoes enable row level security;

create or replace function public._abc_to_json(a public.abc_avaliacoes)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'id',                 a.id,
    'patientId',          a.patient_id,
    'tipo',               a.tipo,
    'professionalId',     a.professional_id,
    'professionalName',   a.professional_name,
    'respostas',          a.respostas,
    'scoreSensorial',     a.score_sensorial,
    'scoreRelacionamento',a.score_relacionamento,
    'scoreCorpo',         a.score_corpo,
    'scoreLinguagem',     a.score_linguagem,
    'scorePessoalSocial', a.score_pessoal_social,
    'scoreTotal',         a.score_total,
    'nivel',              a.nivel,
    'observacoes',        a.observacoes,
    'createdAt',          a.created_at
  );
$$;

create or replace function public.create_abc_avaliacao(
  p_slug                 text,
  p_password             text,
  p_patient_id           bigint,
  p_tipo                 text,
  p_respostas            jsonb,
  p_score_sensorial      int,
  p_score_relacionamento int,
  p_score_corpo          int,
  p_score_linguagem      int,
  p_score_pessoal_social int,
  p_score_total          int,
  p_nivel                int,
  p_professional_id      bigint default null,
  p_professional_name    text   default null,
  p_observacoes          text   default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_row        public.abc_avaliacoes%rowtype;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  if p_tipo not in ('entrada', 'alta') then
    raise exception 'tipo inválido: %', p_tipo;
  end if;
  if not exists (select 1 from public.patients p where p.id = p_patient_id and p.company_id = v_company_id) then
    raise exception 'paciente não encontrado';
  end if;

  insert into public.abc_avaliacoes (
    company_id, patient_id, tipo, professional_id, professional_name, respostas,
    score_sensorial, score_relacionamento, score_corpo, score_linguagem,
    score_pessoal_social, score_total, nivel, observacoes
  ) values (
    v_company_id, p_patient_id, p_tipo, p_professional_id,
    nullif(btrim(coalesce(p_professional_name, '')), ''),
    coalesce(p_respostas, '[]'::jsonb),
    coalesce(p_score_sensorial, 0), coalesce(p_score_relacionamento, 0),
    coalesce(p_score_corpo, 0), coalesce(p_score_linguagem, 0),
    coalesce(p_score_pessoal_social, 0), coalesce(p_score_total, 0),
    p_nivel, nullif(btrim(coalesce(p_observacoes, '')), '')
  ) returning * into v_row;

  return public._abc_to_json(v_row);
end;
$$;

revoke all on function public.create_abc_avaliacao(text, text, bigint, text, jsonb, int, int, int, int, int, int, int, bigint, text, text) from public;
grant  execute on function public.create_abc_avaliacao(text, text, bigint, text, jsonb, int, int, int, int, int, int, int, bigint, text, text) to anon, authenticated;

-- Histórico completo de um paciente (mais recente primeiro).
create or replace function public.list_abc_avaliacoes(
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
  select coalesce(jsonb_agg(public._abc_to_json(a) order by a.created_at desc, a.id desc), '[]'::jsonb)
    into v_result
    from public.abc_avaliacoes a
   where a.company_id = v_company_id
     and a.patient_id = p_patient_id;
  return v_result;
end;
$$;

revoke all on function public.list_abc_avaliacoes(text, text, bigint) from public;
grant  execute on function public.list_abc_avaliacoes(text, text, bigint) to anon, authenticated;

-- Resumo por paciente: última ENTRADA e última ALTA (lista de pacientes,
-- dashboard de evolução).
create or replace function public.list_abc_resumo(
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
    select distinct on (a.patient_id, a.tipo) a.*
      from public.abc_avaliacoes a
     where a.company_id = v_company_id
     order by a.patient_id, a.tipo, a.created_at desc, a.id desc
  ),
  por_paciente as (
    select
      p.id as patient_id,
      p.name as patient_name,
      p.status as patient_status,
      e.id as entrada_id, e.score_total as entrada_total, e.nivel as entrada_nivel, e.created_at as entrada_em,
      e.score_sensorial as e_sens, e.score_relacionamento as e_rel, e.score_corpo as e_corpo,
      e.score_linguagem as e_ling, e.score_pessoal_social as e_ps,
      s.id as alta_id, s.score_total as alta_total, s.nivel as alta_nivel, s.created_at as alta_em,
      s.score_sensorial as s_sens, s.score_relacionamento as s_rel, s.score_corpo as s_corpo,
      s.score_linguagem as s_ling, s.score_pessoal_social as s_ps
      from public.patients p
      left join ult e on e.patient_id = p.id and e.tipo = 'entrada'
      left join ult s on s.patient_id = p.id and s.tipo = 'alta'
     where p.company_id = v_company_id
       and (e.id is not null or s.id is not null)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'patientId',    patient_id,
    'patientName',  patient_name,
    'status',       patient_status,
    'entrada', case when entrada_id is null then null else jsonb_build_object(
      'id', entrada_id, 'scoreTotal', entrada_total, 'nivel', entrada_nivel, 'createdAt', entrada_em,
      'scoreSensorial', e_sens, 'scoreRelacionamento', e_rel, 'scoreCorpo', e_corpo,
      'scoreLinguagem', e_ling, 'scorePessoalSocial', e_ps) end,
    'alta', case when alta_id is null then null else jsonb_build_object(
      'id', alta_id, 'scoreTotal', alta_total, 'nivel', alta_nivel, 'createdAt', alta_em,
      'scoreSensorial', s_sens, 'scoreRelacionamento', s_rel, 'scoreCorpo', s_corpo,
      'scoreLinguagem', s_ling, 'scorePessoalSocial', s_ps) end
  )), '[]'::jsonb) into v_result
  from por_paciente;

  return v_result;
end;
$$;

revoke all on function public.list_abc_resumo(text, text) from public;
grant  execute on function public.list_abc_resumo(text, text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
