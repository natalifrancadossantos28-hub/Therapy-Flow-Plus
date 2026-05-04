-- 0030_age_bonus_waiting_list.sql
-- Adiciona Bônus de Idade à fila de espera:
--   < 4 anos: +50 pontos (primeira infância absoluta)
--   4-6 anos: +20 pontos (primeira infância completa)
--   > 6 anos: +0 pontos
-- Score Final = Score Especialidade + Bônus Social + Bônus Idade
-- Garante que crianças menores furem a fila automaticamente.

begin;

-- Recria list_waiting_list com bônus de idade no score e ORDER BY
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
      w.id,
      w.company_id,
      w.patient_id,
      w.professional_id,
      w.specialty   as w_specialty,
      w.notes,
      w.entry_date,
      w.created_at,
      w.updated_at,
      p.name              as p_name,
      p.phone             as p_phone,
      p.prontuario        as p_prontuario,
      p.date_of_birth     as p_dob,
      p.triagem_score     as p_triagem,
      coalesce(p.escola_publica, false)     as p_escola,
      coalesce(p.trabalho_na_roca, false)   as p_trabalho,
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
      -- Bônus de Idade: < 4 anos = +50, 4-6 anos = +20, > 6 anos = 0
      case
        when b.p_dob is null then 0
        when extract(year from age(current_date, b.p_dob)) < 4 then 50
        when extract(year from age(current_date, b.p_dob)) <= 6 then 20
        else 0
      end as age_bonus
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
                                    when sp_score is null then
                                      public._calc_priority(coalesce(p_triagem, 0), p_escola, p_trabalho, false)
                                    else
                                      public._calc_priority_specialty(sp_score, p_escola, p_trabalho)
                                  end,
        'notes',                  notes,
        'entryDate',              entry_date,
        'createdAt',              created_at,
        'updatedAt',              updated_at,
        'scoreClinico',           round((coalesce(p_triagem, 0)::numeric * 100.0) / 360.0)::int,
        'scoreSocial',            (case when p_escola   then 2 else 0 end)
                                + (case when p_trabalho then 2 else 0 end),
        'triagemScore',           p_triagem,
        'escolaPublica',          p_escola,
        'trabalhoNaRoca',         p_trabalho,
        'scoreTotal150',          round((coalesce(p_triagem, 0)::numeric * 150.0) / 360.0)::int
                                + (case when p_escola   then 2 else 0 end)
                                + (case when p_trabalho then 2 else 0 end),
        'scoreEspecialidade',     sp_score,
        'scoreEspecialidadeMax',  72,
        'scoreSocialDesempate',   sp_social,
        'scoreEspecialidadeTotal', case when sp_score is null then null else sp_score + sp_social end,
        'ageBonus',               age_bonus,
        'dateOfBirth',            p_dob
      ) as row,
      row_number() over (
        order by
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

revoke all on function public.list_waiting_list(text, text, bigint) from public;
grant execute on function public.list_waiting_list(text, text, bigint) to anon, authenticated;

commit;
