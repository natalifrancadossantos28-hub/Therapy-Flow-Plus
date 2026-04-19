-- Phase 5C - Motor de Triagem: score clinico 0-100 + pesos sociais + ordenacao
-- Escala clinica: 0-360 (raw) escalada para 0-100 (display/ordering).
-- Pesos sociais: Escola Municipal/Estadual +2, Trabalho Informal/Roca/Desempregado +2.
-- Social serve apenas como desempate; nao sobrepoe gravidade clinica.
-- ORDER BY: (score_clinico_100 + score_social) DESC, entry_date ASC.

begin;

-- =========================================================================
-- _calc_priority: thresholds em percentual (25/50/75) do score clinico.
-- Social continua influenciando o badge (compat), mas ate no maximo 1 tier.
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
  v_vuln     integer;
  v_idx      integer;
  v_levels   text[] := array['baixo','leve','moderado','elevado'];
begin
  if p_triagem_score is null then return 'baixo'; end if;

  -- Normaliza para 0..100 (360 = maximo raw: 8 areas x 15 perguntas x 3 pts).
  v_pct := (p_triagem_score::numeric * 100.0) / 360.0;

  v_base_idx := case
    when v_pct >= 75 then 3
    when v_pct >= 50 then 2
    when v_pct >= 25 then 1
    else 0 end;

  -- Social: +1 tier no maximo, a partir de 2+ flags de vulnerabilidade.
  v_vuln := (case when p_escola_publica   then 1 else 0 end)
          + (case when p_trabalho_na_roca then 1 else 0 end)
          + (case when p_sem_terapia      then 1 else 0 end);

  v_idx := least(3, v_base_idx + (case when v_vuln >= 2 then 1 else 0 end));
  return v_levels[v_idx + 1];
end;
$$;

-- =========================================================================
-- list_waiting_list: ORDER BY (score_clinico_100 + score_social) DESC.
-- Social = +2 escola publica + 2 trabalho na roca (max +4, sempre < 1 tier clinico).
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
        'scoreSocial',           (case when coalesce(p.escola_publica, false)   then 2 else 0 end)
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

-- =========================================================================
-- Grants (idempotente).
-- =========================================================================
revoke all on function public._calc_priority(integer, boolean, boolean, boolean)
  from public;
grant execute on function public._calc_priority(integer, boolean, boolean, boolean)
  to anon, authenticated;

revoke all on function public.list_waiting_list(text, text, bigint) from public;
grant execute on function public.list_waiting_list(text, text, bigint)
  to anon, authenticated;

commit;
