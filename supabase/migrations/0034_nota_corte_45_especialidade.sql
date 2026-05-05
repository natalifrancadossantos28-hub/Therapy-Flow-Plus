-- 0034_nota_corte_45_especialidade.sql
--
-- Ajusta a nota de corte por especialidade.
-- Antes: ≥55 elevado, ≥37 moderado, ≥19 leve, else baixo.
-- Agora: ≥45 elevado (Prioridade Alta), ≥30 moderado, ≥15 leve, else baixo.
--
-- A nota de corte (≥45) marca o paciente como "Prioridade Alta" naquela
-- fila especifica (cada uma das 8 especialidades e avaliada
-- individualmente).

begin;

create or replace function public._calc_priority_specialty(
  p_specialty_score  integer,
  p_escola_publica   boolean,
  p_trabalho_na_roca boolean
)
returns text
language plpgsql
immutable
as $$
declare
  v_eff    integer;
  v_idx    integer;
  v_levels text[] := array['baixo','leve','moderado','elevado'];
begin
  if p_specialty_score is null then
    return 'baixo';
  end if;
  -- Vulnerabilidade segue como desempate (+1 cada), nao muda a cor.
  v_eff := coalesce(p_specialty_score, 0)
         + (case when p_escola_publica   then 1 else 0 end)
         + (case when p_trabalho_na_roca then 1 else 0 end);
  v_idx := case
    when v_eff >= 45 then 3   -- Prioridade Alta
    when v_eff >= 30 then 2   -- Moderado
    when v_eff >= 15 then 1   -- Leve
    else 0                    -- Baixo
  end;
  return v_levels[v_idx + 1];
end;
$$;

revoke all on function public._calc_priority_specialty(integer, boolean, boolean) from public;
grant execute on function public._calc_priority_specialty(integer, boolean, boolean) to anon, authenticated;

-- Recalcula a prioridade salva em waiting_list para refletir o novo corte.
-- list_waiting_list ja recalcula em tempo de leitura, mas atualizamos o
-- snapshot persistido para consistencia em filtros/relatorios.
with target as (
  select
    w.id as wid,
    coalesce(p.triagem_score, 0)          as triagem,
    coalesce(p.escola_publica, false)     as escola,
    coalesce(p.trabalho_na_roca, false)   as trabalho,
    coalesce(p.abrigo_casa_crianca, false) as abrigo,
    p.date_of_birth                        as dob,
    coalesce(w.specialty,
      (select pr.specialty from public.professionals pr where pr.id = w.professional_id)
    ) as eff_specialty,
    coalesce(p.score_psicologia, 0)       as s_psi,
    coalesce(p.score_psicomotricidade, 0) as s_psm,
    coalesce(p.score_fisioterapia, 0)     as s_fis,
    coalesce(p.score_psicopedagogia, 0)   as s_psp,
    coalesce(p.score_ed_fisica, 0)        as s_edf,
    coalesce(p.score_fonoaudiologia, 0)   as s_fon,
    coalesce(p.score_to, 0)               as s_to,
    coalesce(p.score_nutricionista, 0)    as s_nut
    from public.waiting_list w
    left join public.patients p on p.id = w.patient_id
   where p.id is not null
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

commit;
