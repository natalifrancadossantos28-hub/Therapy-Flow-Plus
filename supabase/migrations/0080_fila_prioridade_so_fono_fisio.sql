-- =========================================================================
-- 0080_fila_prioridade_so_fono_fisio.sql
--
-- Prioridade da FILA DE ESPERA passa a valer SÓ para Fonoaudiologia e
-- Fisioterapia. Todas as demais especialidades seguem estritamente a ordem de
-- chegada (FIFO): do mais antigo para o mais novo pela data de entrada.
--
-- Antes (0077): Psicologia, Psicomotricidade e T.O. ainda recebiam prioridade
-- por idade a partir dos 3 anos, e "abrigo" dava Prioridade Máxima em quase
-- todas as especialidades.
--
-- Agora:
--   • Fonoaudiologia e Fisioterapia .......... prioridade máxima por
--     idade/abrigo + bônus de primeira infância (sem mudança).
--   • Todas as demais ........................ FIFO puro: sem bônus de idade e
--     sem prioridade máxima; ordena pela data de entrada na fila.
--
-- Só mexe na ordenação/prioridade da fila. Nenhum cadastro é apagado e nenhum
-- paciente sai da fila. Pode rodar mais de uma vez.
-- =========================================================================

begin;

-- ═══════════════════════════════════════════════════════════════════════
-- Step 1: política de idade por especialidade
--   'fifo'  → ordem de chegada, sem prioridade por idade
--   'min3'  → prioridade por idade só para 3 anos ou mais (não usado hoje)
--   'full'  → regra padrão (prioridade desde o nascimento) — só Fono/Fisio
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public._fila_age_policy(p_specialty text)
returns text
language sql
immutable
as $$
  select case
    when p_specialty is null or btrim(p_specialty) = '' then 'fifo'
    when p_specialty ilike 'fono%'  then 'full'
    when p_specialty ilike 'fisio%' then 'full'
    else 'fifo'
  end;
$$;

-- Prioridade Máxima considerando a política da especialidade.
create or replace function public._fila_prioridade_maxima(
  p_specialty text,
  p_dob       text,
  p_abrigo    boolean
)
returns boolean
language plpgsql
stable
as $$
declare
  v_policy text := public._fila_age_policy(p_specialty);
  v_years  int;
begin
  if v_policy = 'fifo' then
    return false;
  end if;

  if p_dob is not null and btrim(p_dob) <> '' then
    v_years := extract(year from age(current_date, p_dob::date))::int;
  end if;

  if coalesce(p_abrigo, false) then
    return true;
  end if;

  if v_years is null or v_years >= 5 then
    return false;
  end if;

  -- Psicologia / Psicomotricidade / T.O.: só a partir de 3 anos.
  if v_policy = 'min3' and v_years < 3 then
    return false;
  end if;

  return true;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- Step 2: list_waiting_list — bônus de idade e ordenação por política
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
  aged as (
    select b.*,
      public._fila_age_policy(b.eff_specialty) as age_policy,
      case
        when b.p_dob is null or btrim(b.p_dob) = '' then null
        else extract(year from age(current_date, b.p_dob::date))::int
      end as age_years
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
      -- Bônus de primeira infância, respeitando a política da especialidade.
      case
        when a.age_policy = 'fifo' then 0
        when a.age_years is null then 0
        when a.age_policy = 'min3' and a.age_years < 3 then 0
        when a.age_years < 4 then 50
        when a.age_years <= 6 then 20
        else 0
      end as age_bonus,
      public._fila_prioridade_maxima(a.eff_specialty, a.p_dob, a.p_abrigo) as is_maxima,
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
        'scoreEspecialidadeTotal', case when sp_score is null then null else sp_score + sp_social end,
        'ageBonus',               age_bonus,
        'dateOfBirth',            p_dob,
        'ordenacao',              case when is_fifo then 'chegada' else 'prioridade' end,
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
          -- FIFO: score neutro para que a data de entrada decida a ordem.
          case when is_fifo then 0 else
            coalesce(
              sp_score + sp_social + age_bonus,
              ((coalesce(p_triagem, 0)::numeric * 100.0) / 360.0)::int
                + (case when p_escola   then 2 else 0 end)
                + (case when p_trabalho then 2 else 0 end)
                + age_bonus
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

-- ═══════════════════════════════════════════════════════════════════════
-- Step 4: recálculo automático (após mudança de score) respeita a política
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public._sync_priority_after_score_change(p_patient_id bigint)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  with target as (
    select
      w.id as wid,
      coalesce(p.triagem_score, 0)              as triagem,
      coalesce(p.escola_publica, false)         as escola,
      coalesce(p.trabalho_na_roca, false)       as trabalho,
      coalesce(p.abrigo_casa_crianca, false)    as abrigo,
      p.date_of_birth                           as dob,
      coalesce(p.score_psicologia, 0)           as s_psi,
      coalesce(p.score_psicomotricidade, 0)     as s_psm,
      coalesce(p.score_fisioterapia, 0)         as s_fis,
      coalesce(p.score_psicopedagogia, 0)       as s_psp,
      coalesce(p.score_ed_fisica, 0)            as s_edf,
      coalesce(p.score_fonoaudiologia, 0)       as s_fon,
      coalesce(p.score_to, 0)                   as s_to,
      coalesce(p.score_nutricionista, 0)        as s_nut,
      coalesce(w.specialty, pr.specialty)       as eff_specialty
      from public.waiting_list w
      join public.patients p on p.id = w.patient_id
      left join public.professionals pr on pr.id = w.professional_id
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
       when public._fila_prioridade_maxima(c.eff_specialty, c.dob, c.abrigo) then 'maxima'
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

-- ═══════════════════════════════════════════════════════════════════════
-- Step 5: corrigir as entradas que já estão na fila marcadas como 'maxima'
-- indevidamente (Nutrição/Parental, ou bebês em Psico/Psicomot/T.O.).
-- Ninguém sai da fila — só a prioridade gravada é recalculada.
-- ═══════════════════════════════════════════════════════════════════════

with alvo as (
  select
    w.id as wid,
    coalesce(w.specialty, pr.specialty) as eff_specialty,
    p.date_of_birth                     as dob,
    coalesce(p.abrigo_casa_crianca, false) as abrigo,
    coalesce(p.triagem_score, 0)        as triagem,
    coalesce(p.escola_publica, false)   as escola,
    coalesce(p.trabalho_na_roca, false) as trabalho,
    coalesce(p.score_psicologia, 0)       as s_psi,
    coalesce(p.score_psicomotricidade, 0) as s_psm,
    coalesce(p.score_fisioterapia, 0)     as s_fis,
    coalesce(p.score_psicopedagogia, 0)   as s_psp,
    coalesce(p.score_ed_fisica, 0)        as s_edf,
    coalesce(p.score_fonoaudiologia, 0)   as s_fon,
    coalesce(p.score_to, 0)               as s_to,
    coalesce(p.score_nutricionista, 0)    as s_nut
    from public.waiting_list w
    join public.patients p on p.id = w.patient_id
    left join public.professionals pr on pr.id = w.professional_id
),
calc as (
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
    end as sp_score
  from alvo a
)
update public.waiting_list w
   set priority = case
     when public._fila_prioridade_maxima(c.eff_specialty, c.dob, c.abrigo) then 'maxima'
     when c.sp_score is null then
       public._calc_priority(c.triagem, c.escola, c.trabalho, false)
     else
       public._calc_priority_specialty(c.sp_score, c.escola, c.trabalho)
   end,
       updated_at = now()
  from calc c
 where c.wid = w.id
   and w.priority is distinct from (case
     when public._fila_prioridade_maxima(c.eff_specialty, c.dob, c.abrigo) then 'maxima'
     when c.sp_score is null then
       public._calc_priority(c.triagem, c.escola, c.trabalho, false)
     else
       public._calc_priority_specialty(c.sp_score, c.escola, c.trabalho)
   end);

commit;
