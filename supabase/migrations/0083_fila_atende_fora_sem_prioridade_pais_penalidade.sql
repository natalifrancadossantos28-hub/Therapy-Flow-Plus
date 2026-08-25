-- =========================================================================
-- 0083_fila_atende_fora_sem_prioridade_pais_penalidade.sql
--
-- Ajuste das duas regras criadas no 0082, que estavam somadas jogando o
-- paciente para o fim absoluto da fila. Agora elas são independentes:
--
--   1) JÁ ATENDE EM OUTRO LUGAR ....... perde a prioridade: sem Prioridade
--      Máxima (idade/abrigo) e sem bônus de primeira infância. Continua na
--      ordem normal, disputando pelo score e pela data de entrada.
--
--   2) PAI E MÃE REGISTRADOS .......... penalidade de 10 pontos no score de
--      ordenação (cai de pontuação), sem ir para o fim da fila.
--
-- As duas podem se acumular, mas nenhuma delas manda o paciente para o fim.
-- Ninguém sai da fila e nenhum cadastro é apagado. Idempotente.
-- =========================================================================

begin;

-- Penalidade (em pontos do score da especialidade) por pai e mãe registrados.
create or replace function public._fila_penalidade_pais()
returns int
language sql
immutable
as $$ select 10; $$;

-- A regra combinada do 0082 deixa de existir: cada critério age sozinho.
drop function if exists public._fila_desprioriza(text, boolean, text, text);

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
      coalesce(w.specialty, pr.specialty)   as eff_specialty
      from public.waiting_list w
      left join public.patients      p  on p.id  = w.patient_id
      left join public.professionals pr on pr.id = w.professional_id
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
      -- Atende fora não recebe bônus de primeira infância.
      case
        when a.atende_fora then 0
        when a.age_policy = 'fifo' then 0
        when a.age_years is null then 0
        when a.age_policy = 'min3' and a.age_years < 3 then 0
        when a.age_years < 4 then 50
        when a.age_years <= 6 then 20
        else 0
      end as age_bonus,
      -- Pai e mãe registrados: perde pontos, mas continua na disputa.
      case when a.pais_registrados then public._fila_penalidade_pais() else 0 end as penalidade_pais,
      -- Atende fora não recebe Prioridade Máxima.
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
                                  end
      ) as row,
      row_number() over (
        order by
          -- congelados (busca ativa) sempre por último
          case when w_paused then 1 else 0 end asc,
          case when is_maxima then 0 else 1 end asc,
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

commit;
