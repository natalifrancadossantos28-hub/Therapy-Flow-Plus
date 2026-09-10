-- =========================================================================
-- 0097_abc_checklist_e_recados_equipe.sql
--
-- 1) Avaliação ABC (Autism Behavior Checklist) integrada ao prontuário.
--    * Histórico por paciente separando ENTRADA (triagem) e ALTA
--      (reavaliação obrigatória ao dar alta). Nunca sobrescreve: cada
--      avaliação é uma linha nova; o front usa a mais recente de cada tipo.
--    * Pontuação por área e total calculadas no front (itens/pesos ficam em
--      artifacts/arco-iris/src/lib/abc-checklist.ts) e gravadas aqui para
--      relatórios/ordenacão sem depender do JS.
--    * Nível de impacto: 1 = Alto (vermelho), 2 = Moderado (amarelo),
--      3 = Baixo (verde).
--
-- 2) Fila de espera passa a priorizar pela pontuação ABC de ENTRADA
--    (maior pontuação = maior urgência). Sem ABC cai para a ordenação atual.
--
-- 3) Recados da equipe: canal profissional → administração.
--
-- Idempotente.
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

-- ── Fila de espera: prioriza pela pontuação ABC de entrada ───────────────────
-- Mesma função do 0083, acrescentando abcTotal/abcNivel e usando o ABC como
-- primeiro critério depois de congelados e Prioridade Máxima. Quem não tem
-- ABC fica depois de quem tem, mantendo entre si a ordenação anterior.

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
      p.name              as p_name,
      p.phone             as p_phone,
      p.prontuario        as p_prontuario,
      p.date_of_birth     as p_dob,
      p.triagem_score     as p_triagem,
      coalesce(p.escola_publica, false)        as p_escola,
      coalesce(p.trabalho_na_roca, false)      as p_trabalho,
      coalesce(p.abrigo_casa_crianca, false)   as p_abrigo,
      p.mother_name       as p_mae,
      p.father_name       as p_pai,
      p.local_atendimento as p_local,
      p.outro_atendimento as p_outro,
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
      public._pais_registrados(b.p_mae, b.p_pai)  as pais_registrados
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
      (case when a.p_escola   then 1 else 0 end)
      + (case when a.p_trabalho then 1 else 0 end) as sp_social,
      case
        when a.atende_fora then 0
        when a.age_policy = 'fifo' then 0
        when a.age_years is null then 0
        when a.age_policy = 'min3' and a.age_years < 3 then 0
        when a.age_years < 4 then 50
        when a.age_years <= 6 then 20
        else 0
      end as age_bonus,
      case when a.pais_registrados then public._fila_penalidade_pais() else 0 end as penalidade_pais,
      (public._fila_prioridade_maxima(a.eff_specialty, a.p_dob, a.p_abrigo)
        and not a.atende_fora) as is_maxima,
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
                                     else greatest(sp_score + sp_social - penalidade_pais, 0)
                                   end,
        'ageBonus',               age_bonus,
        'dateOfBirth',            p_dob,
        'ordenacao',              case when is_fifo then 'chegada' else 'prioridade' end,
        'atendeFora',             atende_fora,
        'paisRegistrados',        pais_registrados,
        'penalidadePais',         penalidade_pais,
        'localAtendimento',       p_local,
        'prioridadeMaxima',       is_maxima,
        'prioridadeMaximaRazao',  case
                                    when not is_maxima then null
                                    when p_abrigo and age_years is not null and age_years < 5 then 'idade_e_abrigo'
                                    when p_abrigo then 'abrigo'
                                    else 'idade'
                                  end,
        'abcTotal',               abc_total,
        'abcNivel',               abc_nivel
      ) as row,
      row_number() over (
        order by
          case when w_paused then 1 else 0 end asc,
          case when is_maxima then 0 else 1 end asc,
          -- ABC: maior pontuação primeiro; sem ABC vai depois.
          case when abc_total is null then 1 else 0 end asc,
          coalesce(abc_total, 0) desc,
          case when is_fifo then 0 else
            greatest(
              coalesce(
                sp_score + sp_social + age_bonus,
                ((coalesce(p_triagem, 0)::numeric * 100.0) / 360.0)::int
                  + (case when p_escola   then 2 else 0 end)
                  + (case when p_trabalho then 2 else 0 end)
                  + age_bonus
              ) - penalidade_pais,
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

-- ── Recados da equipe (profissional → administração) ─────────────────────────

create table if not exists public.recados_equipe (
  id                bigserial   primary key,
  company_id        bigint      not null references public.ponto_companies(id) on delete cascade,
  professional_id   bigint,
  professional_name text        not null,
  specialty         text,
  mensagem          text        not null,
  lido              boolean     not null default false,
  created_at        timestamptz not null default now()
);

create index if not exists recados_equipe_company_idx
  on public.recados_equipe (company_id, created_at desc);

alter table public.recados_equipe enable row level security;

create or replace function public._recado_to_json(r public.recados_equipe)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'id',               r.id,
    'professionalId',   r.professional_id,
    'professionalName', r.professional_name,
    'specialty',        r.specialty,
    'mensagem',         r.mensagem,
    'lido',             r.lido,
    'createdAt',        r.created_at
  );
$$;

create or replace function public.create_recado_equipe(
  p_slug              text,
  p_password          text,
  p_professional_id   bigint,
  p_professional_name text,
  p_specialty         text,
  p_mensagem          text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_row        public.recados_equipe%rowtype;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  if nullif(btrim(coalesce(p_mensagem, '')), '') is null then
    raise exception 'mensagem is required';
  end if;
  insert into public.recados_equipe (company_id, professional_id, professional_name, specialty, mensagem)
  values (
    v_company_id, p_professional_id,
    coalesce(nullif(btrim(p_professional_name), ''), '—'),
    nullif(btrim(coalesce(p_specialty, '')), ''),
    btrim(p_mensagem)
  ) returning * into v_row;
  return public._recado_to_json(v_row);
end;
$$;

revoke all on function public.create_recado_equipe(text, text, bigint, text, text, text) from public;
grant  execute on function public.create_recado_equipe(text, text, bigint, text, text, text) to anon, authenticated;

create or replace function public.list_recados_equipe(
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
  select coalesce(jsonb_agg(public._recado_to_json(r) order by r.created_at desc, r.id desc), '[]'::jsonb)
    into v_result
    from public.recados_equipe r
   where r.company_id = v_company_id;
  return v_result;
end;
$$;

revoke all on function public.list_recados_equipe(text, text) from public;
grant  execute on function public.list_recados_equipe(text, text) to anon, authenticated;

create or replace function public.mark_recado_equipe_lido(
  p_slug     text,
  p_password text,
  p_id       bigint,
  p_lido     boolean default true
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  update public.recados_equipe
     set lido = coalesce(p_lido, true)
   where id = p_id and company_id = v_company_id;
end;
$$;

revoke all on function public.mark_recado_equipe_lido(text, text, bigint, boolean) from public;
grant  execute on function public.mark_recado_equipe_lido(text, text, bigint, boolean) to anon, authenticated;

commit;
