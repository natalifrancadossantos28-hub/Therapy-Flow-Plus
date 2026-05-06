-- =============================================================================
-- 0038: Cria a funcao _sync_priority_after_score_change que estava faltando.
-- =============================================================================
--
-- Bug reportado:
--   "Erro: function public._sync_priority_after_score_change(bigint) does not exist"
--   ao cadastrar paciente novo.
--
-- Causa:
--   A migration 0033 chama public._sync_priority_after_score_change(v_row.id)
--   dentro de upsert_patient, mas o body da funcao nunca foi criado em
--   nenhuma migration anterior.
--
-- Correcao:
--   Define a funcao com a mesma logica do recalc bulk da 0034, mas escopada
--   ao paciente passado por parametro. Atualiza priority de todas as entradas
--   de waiting_list daquele paciente, respeitando:
--     * Prioridade Maxima (idade < 5 anos OU abrigo) em qualquer especialidade.
--     * Score por especialidade quando ha specialty na linha (corte 45).
--     * Score total (triagem_score) como fallback se specialty for null.
-- =============================================================================

begin;

create or replace function public._sync_priority_after_score_change(
  p_patient_id bigint
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if p_patient_id is null then
    return;
  end if;

  with target as (
    select
      w.id                                   as wid,
      coalesce(p.triagem_score, 0)           as triagem,
      coalesce(p.escola_publica, false)      as escola,
      coalesce(p.trabalho_na_roca, false)    as trabalho,
      coalesce(p.abrigo_casa_crianca, false) as abrigo,
      p.date_of_birth                        as dob,
      coalesce(w.specialty,
        (select pr.specialty from public.professionals pr where pr.id = w.professional_id)
      ) as eff_specialty,
      coalesce(p.score_psicologia, 0)        as s_psi,
      coalesce(p.score_psicomotricidade, 0)  as s_psm,
      coalesce(p.score_fisioterapia, 0)      as s_fis,
      coalesce(p.score_psicopedagogia, 0)    as s_psp,
      coalesce(p.score_ed_fisica, 0)         as s_edf,
      coalesce(p.score_fonoaudiologia, 0)    as s_fon,
      coalesce(p.score_to, 0)                as s_to,
      coalesce(p.score_nutricionista, 0)     as s_nut
      from public.waiting_list w
      join public.patients p on p.id = w.patient_id
     where w.patient_id = p_patient_id
  ),
  calc as (
    select
      wid, triagem, escola, trabalho, abrigo, dob, eff_specialty,
      case
        when eff_specialty is null or btrim(eff_specialty) = '' then null
        when eff_specialty ilike 'psicolog%'    then s_psi
        when eff_specialty ilike 'psicomot%'    then s_psm
        when eff_specialty ilike 'fisio%'       then s_fis
        when eff_specialty ilike 'psicoped%'    then s_psp
        when eff_specialty ilike 'educa%'       then s_edf
        when eff_specialty ilike 'oficina%'     then s_edf
        when eff_specialty ilike 'fono%'        then s_fon
        when eff_specialty ilike 'terapia ocup%'
          or eff_specialty ilike 't.o.%'
          or eff_specialty ilike 'to'           then s_to
        when eff_specialty ilike 'nutri%'       then s_nut
        else null
      end as sp_score
      from target
  )
  update public.waiting_list w
     set priority = case
       when (
         c.abrigo
         or (
           c.dob is not null
           and btrim(c.dob) <> ''
           and extract(year from age(current_date, c.dob::date)) < 5
         )
       ) then 'maxima'
       when c.sp_score is null then
         public._calc_priority(c.triagem, c.escola, c.trabalho, false)
       else
         public._calc_priority_specialty(c.sp_score, c.escola, c.trabalho)
     end
    from calc c
   where c.wid = w.id;
end;
$$;

revoke all on function public._sync_priority_after_score_change(bigint) from public;
grant execute on function public._sync_priority_after_score_change(bigint) to anon, authenticated;

commit;
