-- =========================================================================
-- 0025_priority_unified_total_score.sql
--
-- Unifica a regra de prioridade entre Triagem, Perfil (Gestao) e Fila de
-- Espera. Antes deste SQL, vulnerabilidades subiam um nivel inteiro de
-- prioridade automaticamente, o que distorcia a fila (paciente Verde com
-- 2 flags sociais virava Laranja).
--
-- Regra nova (unica em todas as telas):
--   score_total = score_clinico_100 + (+2 escola_publica) + (+2 trabalho_na_roca)
--   priority(score_total): 0-24 baixo · 25-49 leve · 50-74 moderado · >=75 elevado
--
-- Vulnerabilidade soma apenas 2 pontos por item (max +4) ao score total.
-- Soh empurra de nivel quando o paciente ja esta perto da fronteira.
-- =========================================================================

begin;

-- 1) _calc_priority: total = clinico_pct + 2*EP + 2*TNR ----------------------
create or replace function public._calc_priority(
  p_triagem_score      integer,
  p_escola_publica     boolean,
  p_trabalho_na_roca   boolean,
  p_sem_terapia        boolean
)
returns text
language plpgsql
immutable
as $$
declare
  v_clin    numeric;
  v_vuln    integer;
  v_total   numeric;
  v_idx     integer;
  v_levels  text[] := array['baixo','leve','moderado','elevado'];
begin
  if p_triagem_score is null then return 'baixo'; end if;

  -- Score clinico em 0..100 (raw 0..360 = 8 areas x 15 perguntas x 3 pts).
  v_clin := (p_triagem_score::numeric * 100.0) / 360.0;

  -- Bonus de vulnerabilidade: +2 cada flag (max +4). p_sem_terapia eh
  -- mantido na assinatura por compat, mas nao soma mais.
  v_vuln := (case when p_escola_publica   then 2 else 0 end)
          + (case when p_trabalho_na_roca then 2 else 0 end);

  v_total := v_clin + v_vuln;

  v_idx := case
    when v_total >= 75 then 3
    when v_total >= 50 then 2
    when v_total >= 25 then 1
    else 0 end;

  return v_levels[v_idx + 1];
end;
$$;

revoke all on function public._calc_priority(integer, boolean, boolean, boolean) from public;
grant execute on function public._calc_priority(integer, boolean, boolean, boolean) to anon, authenticated;

-- 2) list_waiting_list: scoreSocial = +2 cada (alinha com _calc_priority) ----
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
  select coalesce(jsonb_agg(row order by ord), '[]'::jsonb) into v_result
  from (
    select
      jsonb_build_object(
        'id',                    w.id,
        'companyId',             w.company_id,
        'patientId',             w.patient_id,
        'patientName',           coalesce(p.name, ''),
        'patientPhone',          p.phone,
        'patientProntuario',     p.prontuario,
        'professionalId',        w.professional_id,
        'specialty',             coalesce(w.specialty, pr.specialty),
        'professionalName',      pr.name,
        'professionalSpecialty', pr.specialty,
        'priority',              w.priority,
        'notes',                 w.notes,
        'entryDate',             w.entry_date,
        'createdAt',             w.created_at,
        'updatedAt',             w.updated_at,
        'scoreClinico',          round((coalesce(p.triagem_score, 0)::numeric * 100.0) / 360.0)::int,
        'scoreSocial',           (case when coalesce(p.escola_publica, false)   then 2 else 0 end)
                               + (case when coalesce(p.trabalho_na_roca, false) then 2 else 0 end),
        'triagemScore',          p.triagem_score,
        'escolaPublica',         p.escola_publica,
        'trabalhoNaRoca',        p.trabalho_na_roca,
        'scoreTotal150',         round((coalesce(p.triagem_score, 0)::numeric * 150.0) / 360.0)::int
                               + (case when coalesce(p.escola_publica, false)   then 2 else 0 end)
                               + (case when coalesce(p.trabalho_na_roca, false) then 2 else 0 end)
      ) as row,
      row_number() over (
        order by
          (
            (coalesce(p.triagem_score, 0)::numeric * 100.0) / 360.0
            + (case when coalesce(p.escola_publica, false)   then 2 else 0 end)
            + (case when coalesce(p.trabalho_na_roca, false) then 2 else 0 end)
          ) desc,
          w.entry_date asc,
          w.id asc
      ) as ord
      from public.waiting_list w
      left join public.patients      p  on p.id  = w.patient_id
      left join public.professionals pr on pr.id = w.professional_id
     where w.company_id = v_company_id
       and (p_professional_id is null or w.professional_id = p_professional_id)
       and (p.tipo_registro is null or p.tipo_registro <> 'Registro Censo Municipal')
  ) s;
  return coalesce(v_result, '[]'::jsonb);
end;
$$;

revoke all on function public.list_waiting_list(text, text, bigint) from public;
grant execute on function public.list_waiting_list(text, text, bigint) to anon, authenticated;

-- 3) Recalcula prioridade nas filas existentes ------------------------------
update public.waiting_list w
   set priority = public._calc_priority(
         coalesce(p.triagem_score, 0),
         coalesce(p.escola_publica, false),
         coalesce(p.trabalho_na_roca, false),
         coalesce(p.local_atendimento, '') in ('Sem Atendimento', 'Nenhum')
       )
  from public.patients p
 where p.id = w.patient_id;

commit;
