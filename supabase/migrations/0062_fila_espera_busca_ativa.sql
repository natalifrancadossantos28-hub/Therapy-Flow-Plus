-- =========================================================================
-- 0062_fila_espera_busca_ativa.sql
--
-- "Busca Ativa" / congelar paciente na fila de espera.
--
-- Quando um paciente não comparece à avaliação e entra em busca ativa, ele
-- deve sair temporariamente da disputa por vaga prioritária (sem ser apagado),
-- liberando a posição para os próximos. Ao retornar, basta "descongelar" e ele
-- volta à posição original (a ordem é por prioridade + data de entrada).
--
-- 1. Adiciona colunas paused / paused_at / paused_reason em waiting_list.
-- 2. Atualiza list_waiting_list para retornar o flag e jogar os congelados
--    para o fim da lista (sem ocupar posição prioritária).
-- 3. Cria RPC set_waiting_list_paused para congelar/descongelar uma entrada.
-- =========================================================================

begin;

-- ═══════════════════════════════════════════════════════════════════════
-- Step 1: Colunas de busca ativa
-- ═══════════════════════════════════════════════════════════════════════

alter table public.waiting_list
  add column if not exists paused        boolean      not null default false,
  add column if not exists paused_at     timestamptz,
  add column if not exists paused_reason text;

-- ═══════════════════════════════════════════════════════════════════════
-- Step 2: list_waiting_list — retorna paused/pausedAt/pausedReason e ordena
-- os pacientes congelados por último (não ocupam posição prioritária).
-- ═══════════════════════════════════════════════════════════════════════

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

  with base as (
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
      coalesce(w.specialty, pr.specialty)   as eff_specialty
      from public.waiting_list w
      left join public.patients      p  on p.id  = w.patient_id
      left join public.professionals pr on pr.id = w.professional_id
     where w.company_id = v_company_id
       and (p_professional_id is null or w.professional_id = p_professional_id)
       and (p.tipo_registro is null or p.tipo_registro <> 'Registro Censo Municipal')
  ),
  enriched as (
    select b.*,
      case
        when b.eff_specialty is null or btrim(b.eff_specialty) = '' then null
        when b.eff_specialty ilike 'psicolog%'    then b.s_psi
        when b.eff_specialty ilike 'psicomot%'    then b.s_psm
        when b.eff_specialty ilike 'fisio%'       then b.s_fis
        when b.eff_specialty ilike 'psicoped%'    then b.s_psp
        when b.eff_specialty ilike 'educa%'       then b.s_edf
        when b.eff_specialty ilike 'oficina%'     then b.s_edf
        when b.eff_specialty ilike 'fono%'        then b.s_fon
        when b.eff_specialty ilike 'terapia ocup%'
          or b.eff_specialty ilike 't.o.%'
          or b.eff_specialty ilike 'to'           then b.s_to
        when b.eff_specialty ilike 'nutri%'       then b.s_nut
        else null
      end as sp_score,
      (case when b.p_escola   then 1 else 0 end)
      + (case when b.p_trabalho then 1 else 0 end) as sp_social,
      case
        when b.p_dob is null or btrim(b.p_dob) = '' then 0
        when extract(year from age(current_date, b.p_dob::date)) < 4 then 50
        when extract(year from age(current_date, b.p_dob::date)) <= 6 then 20
        else 0
      end as age_bonus,
      -- Prioridade Maxima: < 5 anos OU abrigo
      (b.p_dob is not null
        and btrim(b.p_dob) <> ''
        and extract(year from age(current_date, b.p_dob::date)) < 5
      ) as is_under5,
      (b.p_abrigo) as is_abrigo
    from base b
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
                                    when (is_under5 or is_abrigo) then 'maxima'
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
        'scoreEspecialidadeTotal', case when sp_score is null then null else sp_score + sp_social end,
        'ageBonus',               age_bonus,
        'dateOfBirth',            p_dob,
        'prioridadeMaxima',       (is_under5 or is_abrigo),
        'prioridadeMaximaRazao',  case
                                    when is_under5 and is_abrigo then 'idade_e_abrigo'
                                    when is_under5 then 'idade'
                                    when is_abrigo then 'abrigo'
                                    else null
                                  end
      ) as row,
      row_number() over (
        order by
          -- congelados (busca ativa) sempre por último
          case when w_paused then 1 else 0 end asc,
          case when (is_under5 or is_abrigo) then 0 else 1 end asc,
          coalesce(
            sp_score + sp_social + age_bonus,
            ((coalesce(p_triagem, 0)::numeric * 100.0) / 360.0)::int
              + (case when p_escola   then 2 else 0 end)
              + (case when p_trabalho then 2 else 0 end)
              + age_bonus
          ) desc,
          entry_date asc,
          id asc
      ) as ord
      from enriched
  ) s;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- Step 3: RPC para congelar / descongelar (busca ativa)
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.set_waiting_list_paused(
  p_slug     text,
  p_password text,
  p_id       bigint,
  p_paused   boolean,
  p_reason   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_row        public.waiting_list%rowtype;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  update public.waiting_list
     set paused        = p_paused,
         paused_at     = case when p_paused then now() else null end,
         paused_reason = case when p_paused then p_reason else null end,
         updated_at    = now()
   where id = p_id and company_id = v_company_id
   returning * into v_row;

  if not found then
    raise exception 'Entrada não encontrada na fila de espera';
  end if;

  return jsonb_build_object(
    'id',           v_row.id,
    'paused',       v_row.paused,
    'pausedAt',     v_row.paused_at,
    'pausedReason', v_row.paused_reason
  );
end;
$$;

revoke all on function public.set_waiting_list_paused(text, text, bigint, boolean, text) from public;
grant execute on function public.set_waiting_list_paused(text, text, bigint, boolean, text) to anon, authenticated;

commit;
