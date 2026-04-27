-- 0022: Pesos sociais viram apenas desempate (nao mudam a cor da prioridade).
--
-- Mudancas:
-- 1. _calc_priority: cor (Verde/Azul/Laranja/Vermelho) passa a depender SO da
--    demanda clinica (triagem_score). Antes, 2+ flags sociais subiam um tier;
--    agora a cor e puramente clinica. Pesos sociais continuam sendo entrada
--    para evitar mudanca de assinatura, mas sao ignorados na classificacao.
-- 2. list_waiting_list: bonus social cai para +1 cada (era +2). Maximo +2.
--    Continua sendo somado ao scoreTotal150 e usado no ORDER BY como desempate
--    entre pacientes com a mesma gravidade clinica - nunca atravessa um tier.
-- 3. Reclassifica todas as entradas existentes em waiting_list para refletir a
--    nova regra (cor = clinica pura).

begin;

-- =========================================================================
-- _calc_priority: thresholds em percentual (25/50/75) do score clinico SO.
-- Social NAO sobrepoe gravidade clinica (servia apenas como desempate).
-- =========================================================================
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
  v_pct      numeric;
  v_base_idx integer;
  v_levels   text[] := array['baixo','leve','moderado','elevado'];
begin
  if p_triagem_score is null then return 'baixo'; end if;

  v_pct := (p_triagem_score::numeric * 100.0) / 360.0;

  v_base_idx := case
    when v_pct >= 75 then 3
    when v_pct >= 50 then 2
    when v_pct >= 25 then 1
    else 0 end;

  -- Pesos sociais nao mudam a cor (mantidos como entrada por compatibilidade).
  -- p_escola_publica / p_trabalho_na_roca / p_sem_terapia: ignorados aqui.
  return v_levels[v_base_idx + 1];
end;
$$;

revoke all on function public._calc_priority(integer, boolean, boolean, boolean)
  from public;
grant execute on function public._calc_priority(integer, boolean, boolean, boolean)
  to anon, authenticated;

-- =========================================================================
-- list_waiting_list: bonus social vira +1 cada (era +2). Max +2.
-- Social continua sendo desempate no ORDER BY entre mesma gravidade clinica.
-- =========================================================================
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
        'scoreSocial',           (case when coalesce(p.escola_publica, false)   then 1 else 0 end)
                               + (case when coalesce(p.trabalho_na_roca, false) then 1 else 0 end),
        'triagemScore',          p.triagem_score,
        'escolaPublica',         p.escola_publica,
        'trabalhoNaRoca',        p.trabalho_na_roca,
        'scoreTotal150',         round((coalesce(p.triagem_score, 0)::numeric * 150.0) / 360.0)::int
                               + (case when coalesce(p.escola_publica, false)   then 1 else 0 end)
                               + (case when coalesce(p.trabalho_na_roca, false) then 1 else 0 end)
      ) as row,
      row_number() over (
        order by
          (
            (coalesce(p.triagem_score, 0)::numeric * 100.0) / 360.0
            + (case when coalesce(p.escola_publica, false)   then 1 else 0 end)
            + (case when coalesce(p.trabalho_na_roca, false) then 1 else 0 end)
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

-- =========================================================================
-- Reclassifica entradas existentes na fila para refletir a regra nova
-- (cor = clinica pura).
-- =========================================================================
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
