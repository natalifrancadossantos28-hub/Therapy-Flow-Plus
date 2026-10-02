-- =========================================================================
-- 0115_fila_demanda_por_diagnostico.sql
--
-- Demanda prioritária pela deficiência informada no diagnóstico/CID do
-- cadastro (patients.diagnosis). Cada deficiência dá prioridade só nas
-- especialidades que mais precisam dela:
--
--   Paralisia cerebral (G80) ............ Fisio, T.O., Fono
--   Física/motora (G81-G83, G71, G12, Q05, Q03/G91, Q65-Q74, Q77/Q78,
--     amputação, nanismo...) ............ Fisio, T.O.
--   Visual (H54, cegueira, baixa visão,
--     retinopatia da prematuridade) ..... Fisio, T.O.
--   Auditiva (H90/H91, surdez, implante) . Fono
--   Fissura labiopalatina (Q35-Q37) ..... Fono
--   Intelectual (F70-F79) ............... Psicologia, Psicopedagogia, T.O.,
--                                          Psicomotricidade
--   TEA (F84, autismo) .................. Fono, Psicologia, T.O.,
--                                          Psicomotricidade
--   Síndromes (Q90-Q99, Down...) ........ Fisio, Fono, T.O., Psicomotricidade
--   Microcefalia (Q02) .................. Fisio, Fono, T.O., Psicomotricidade
--
-- Fisioterapia Pilates e especialidades do responsável não entram.
-- Na especialidade da demanda o paciente fica logo depois da Prioridade
-- Máxima (antes do ABC) e a prioridade aparece como Elevado; entre eles
-- segue a ordem normal da especialidade. Mantém as regras do 0113.
-- Ninguém sai da fila. Idempotente.
-- =========================================================================

begin;

create or replace function public._fila_demanda(
  p_specialty text,
  p_diagnosis text
)
returns text
language sql
immutable
as $$
  with d as (
    select translate(lower(coalesce(p_diagnosis, '')), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc') as t,
           lower(btrim(coalesce(p_specialty, ''))) as s
  ),
  c as (
    select
      case
        when s like '%pilates%' or s like '%parental%' or s like '%maes%' or s like '%mães%' then null
        when s like 'fisio%'      then 'fisio'
        when s like 'fono%'       then 'fono'
        when s like 'terapia ocup%' or s like 't.o%' or s = 'to' then 'to'
        when s like 'psicoped%'   then 'psicoped'
        when s like 'psicomot%'   then 'psicomot'
        when s like 'psicolog%'   then 'psico'
      end as esp,
      (t ~ '\mg80' or t ~ 'paralisia cerebral') as pc,
      (t ~ '\m(g8[1-3]|g71|g12|q05|q03|g91|q6[5-9]|q7[0-4]|q77|q78|z89|e34\.3)'
        or t ~ '(deficiencia fisica|deficiencia motora|plegia|paresia|mielomeningocele|espinha bifida|hidrocefalia|distrofia|atrofia muscular|artrogripose|pe torto|amputa|nanismo|acondroplasia|osteogenese imperfeita|malformacao de membro)') as fisica,
      (t ~ '\m(h54|h35\.1)' or t ~ '(deficiencia visual|cegueira|\mcego|baixa visao|amaurose|retinopatia da prematuridade|surdocegu)') as visual,
      (t ~ '\mh9[01]' or t ~ '(auditiv|surdez|\msurd|hipoacusia|implante coclear)') as auditiva,
      (t ~ '\mq3[5-7]' or t ~ 'fissura (labio|palat)') as fissura,
      (t ~ '\mf7[0-9]' or t ~ '(deficiencia intelectual|deficiencia mental|retardo mental)') as intelectual,
      (t ~ '\mf84' or t ~ '(autis|\mtea\M|espectro autista)') as tea,
      (t ~ '\mq9[0-9]' or t ~ '(sindrome de down|trissomia|sindrome genetica|x fragil)') as sindrome,
      (t ~ '\mq02' or t ~ '(microcefalia|zika)') as microcefalia
    from d
  ),
  r as (
    select array_remove(array[
      case when pc and esp in ('fisio','to','fono') then 'Paralisia cerebral' end,
      case when fisica and not pc and esp in ('fisio','to') then 'Deficiência física/motora' end,
      case when visual and esp in ('fisio','to') then 'Deficiência visual' end,
      case when auditiva and esp = 'fono' then 'Deficiência auditiva' end,
      case when fissura and esp = 'fono' then 'Fissura labiopalatina' end,
      case when intelectual and esp in ('psico','psicoped','to','psicomot') then 'Deficiência intelectual' end,
      case when tea and esp in ('fono','psico','to','psicomot') then 'TEA' end,
      case when sindrome and esp in ('fisio','fono','to','psicomot') then 'Síndrome genética' end,
      case when microcefalia and esp in ('fisio','fono','to','psicomot') then 'Microcefalia' end
    ], null) as itens
    from c
  )
  select nullif(array_to_string(itens, ' + '), '') from r;
$$;

grant execute on function public._fila_demanda(text, text) to anon, authenticated;

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
      p.trabalho_pais     as p_trabalho_pais,
      coalesce(p.abrigo_casa_crianca, false)   as p_abrigo,
      p.mother_name       as p_mae,
      p.father_name       as p_pai,
      p.local_atendimento as p_local,
      p.outro_atendimento as p_outro,
      p.diagnosis         as p_diag,
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
      public._pais_registrados(b.p_mae, b.p_pai)  as pais_registrados,
      public._fila_atende_fora_tipo(b.p_local, b.p_outro) as fora_tipo,
      public._fila_bonus_trabalho(b.p_trabalho_pais, b.p_trabalho) as bonus_trabalho,
      public._fila_demanda(b.eff_specialty, b.p_diag) as demanda
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
      (case when a.p_escola then 1 else 0 end) as sp_social,
      case
        when a.fora_tipo = 'particular' then 0
        when a.age_policy = 'fifo' then 0
        when a.age_years is null then 0
        when a.age_policy = 'min3' and a.age_years < 3 then 0
        when a.age_years < 4 then 50
        when a.age_years <= 6 then 20
        else 0
      end as age_bonus,
      0 as penalidade_pais,
      case a.fora_tipo when 'particular' then 10 when 'sus' then 5 else 0 end as penalidade_fora,
      (public._fila_prioridade_maxima(a.eff_specialty, a.p_dob, a.p_abrigo)
        and (a.p_abrigo or a.fora_tipo is distinct from 'particular')) as is_maxima,
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
                                    when demanda is not null then 'elevado'
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
                                     else greatest(sp_score + sp_social + bonus_trabalho - penalidade_fora, 0)
                                   end,
        'ageBonus',               age_bonus,
        'dateOfBirth',            p_dob,
        'ordenacao',              case when is_fifo then 'chegada' else 'prioridade' end,
        'atendeFora',             atende_fora,
        'paisRegistrados',        pais_registrados,
        'penalidadePais',         penalidade_pais,
        'trabalhoPais',           p_trabalho_pais,
        'bonusTrabalho',          bonus_trabalho,
        'atendeForaTipo',         fora_tipo,
        'penalidadeFora',         penalidade_fora,
        'localAtendimento',       p_local,
        'prioridadeMaxima',       is_maxima,
        'prioridadeMaximaRazao',  case
                                    when not is_maxima then null
                                    when p_abrigo and age_years is not null and age_years < 5 then 'idade_e_abrigo'
                                    when p_abrigo then 'abrigo'
                                    else 'idade'
                                  end,
        'abcTotal',               abc_total,
        'abcNivel',               abc_nivel,
        'demandaPrioritaria',     demanda
      ) as row,
      row_number() over (
        order by
          case when w_paused then 1 else 0 end asc,
          case when is_maxima then 0 else 1 end asc,
          case when demanda is not null then 0 else 1 end asc,
          -- ABC: maior pontuação primeiro; sem ABC vai depois.
          case when abc_total is null then 1 else 0 end asc,
          coalesce(abc_total, 0) desc,
          case when is_fifo then 0 else
            greatest(
              coalesce(
                sp_score + sp_social + age_bonus,
                ((coalesce(p_triagem, 0)::numeric * 100.0) / 360.0)::int
                  + (case when p_escola   then 2 else 0 end)
                  + age_bonus
              ) + bonus_trabalho - penalidade_fora,
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

notify pgrst, 'reload schema';

commit;
