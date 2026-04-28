-- =========================================================================
-- 0027_priority_por_especialidade.sql
--
-- Fila de Espera passa a calcular cor/prioridade por ESPECIALIDADE.
-- Antes: usava score_total /150 (clinico geral 0..100 + 2*EP + 2*TNR).
-- Agora: cada entry usa a nota 0..72 da especialidade do paciente naquela
-- area + 1 (Escola Publica) + 1 (Trabalho Informal/Roca) como desempate.
--
-- Faixas (sobre 72 max):
--   <= 25%  (<=18 efetivo) -> baixo    (Verde)
--   <= 50%  (<=36 efetivo) -> leve     (Azul)
--   <= 75%  (<=54 efetivo) -> moderado (Laranja)
--   >  75%  (>54  efetivo) -> elevado  (Vermelho)
-- Vulnerabilidade soma apenas 2 pontos (max +2) ao score da especialidade,
-- portanto so muda de cor quando o paciente esta proximo da fronteira.
--
-- Quando a entrada da fila NAO tem especialidade definida (specialty NULL =
-- "qualquer especialidade"), preserva-se a regra antiga via _calc_priority
-- (score clinico 0..100 + 2*EP + 2*TNR).
-- =========================================================================

begin;

-- 1) Helper: mapeia especialidade -> nota 0..72 daquele campo do paciente. ----
create or replace function public._specialty_score_72(
  p_patient   public.patients,
  p_specialty text
)
returns integer
language sql
immutable
as $$
  select case
    when p_specialty is null or btrim(p_specialty) = '' then null
    when p_specialty ilike 'psicolog%'                       then coalesce(p_patient.score_psicologia, 0)
    when p_specialty ilike 'psicomot%'                       then coalesce(p_patient.score_psicomotricidade, 0)
    when p_specialty ilike 'fisio%'                          then coalesce(p_patient.score_fisioterapia, 0)
    when p_specialty ilike 'psicoped%'                       then coalesce(p_patient.score_psicopedagogia, 0)
    when p_specialty ilike 'ed%fisica%'
      or p_specialty ilike 'educacao fisica%'
      or p_specialty ilike 'educa%fisica%'
      or p_specialty ilike 'oficina%'                        then coalesce(p_patient.score_ed_fisica, 0)
    when p_specialty ilike 'fono%'                           then coalesce(p_patient.score_fonoaudiologia, 0)
    when p_specialty ilike 'terapia ocup%'
      or p_specialty ilike 't.o.%'
      or p_specialty ilike 'to'                              then coalesce(p_patient.score_to, 0)
    when p_specialty ilike 'nutri%'                          then coalesce(p_patient.score_nutricionista, 0)
    else null
  end;
$$;

revoke all on function public._specialty_score_72(public.patients, text) from public;

-- 2) Helper: prioridade a partir do score 0..72 + bonus social. ---------------
create or replace function public._calc_priority_specialty(
  p_specialty_score integer,
  p_escola_publica  boolean,
  p_trabalho_na_roca boolean
)
returns text
language plpgsql
immutable
as $$
declare
  v_eff   integer;
  v_idx   integer;
  v_levels text[] := array['baixo','leve','moderado','elevado'];
begin
  if p_specialty_score is null then return 'baixo'; end if;

  -- Vulnerabilidade soma apenas como desempate (1 + 1 = max 2).
  v_eff := coalesce(p_specialty_score, 0)
         + (case when p_escola_publica   then 1 else 0 end)
         + (case when p_trabalho_na_roca then 1 else 0 end);

  -- Faixas em % de 72 (espelha a logica visual ja usada na Triagem):
  --   <=18 baixo · <=36 leve · <=54 moderado · >54 elevado
  v_idx := case
    when v_eff > 54 then 3
    when v_eff > 36 then 2
    when v_eff > 18 then 1
    else 0 end;

  return v_levels[v_idx + 1];
end;
$$;

revoke all on function public._calc_priority_specialty(integer, boolean, boolean) from public;
grant execute on function public._calc_priority_specialty(integer, boolean, boolean) to anon, authenticated;

-- 3) list_waiting_list: prioridade e ordenacao por especialidade. -------------
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

  with rows_calc as (
    select
      w.*,
      p,
      pr.name      as pr_name,
      pr.specialty as pr_specialty,
      coalesce(w.specialty, pr.specialty) as eff_specialty
      from public.waiting_list w
      left join public.patients      p  on p.id  = w.patient_id
      left join public.professionals pr on pr.id = w.professional_id
     where w.company_id = v_company_id
       and (p_professional_id is null or w.professional_id = p_professional_id)
       and (p.tipo_registro is null or p.tipo_registro <> 'Registro Censo Municipal')
  ),
  enriched as (
    select
      r.*,
      public._specialty_score_72((r.p).*::public.patients, r.eff_specialty) as sp_score,
      (case when coalesce((r.p).escola_publica, false)   then 1 else 0 end)
        + (case when coalesce((r.p).trabalho_na_roca, false) then 1 else 0 end) as sp_social
    from rows_calc r
  )
  select coalesce(jsonb_agg(row order by ord), '[]'::jsonb) into v_result
  from (
    select
      jsonb_build_object(
        'id',                     id,
        'companyId',              company_id,
        'patientId',              patient_id,
        'patientName',            coalesce((p).name, ''),
        'patientPhone',           (p).phone,
        'patientProntuario',      (p).prontuario,
        'professionalId',         professional_id,
        'specialty',              eff_specialty,
        'professionalName',       pr_name,
        'professionalSpecialty',  pr_specialty,
        'priority',               case
                                    when sp_score is null
                                      then public._calc_priority(
                                             coalesce((p).triagem_score, 0),
                                             coalesce((p).escola_publica, false),
                                             coalesce((p).trabalho_na_roca, false),
                                             false
                                           )
                                    else public._calc_priority_specialty(
                                             sp_score,
                                             coalesce((p).escola_publica, false),
                                             coalesce((p).trabalho_na_roca, false)
                                           )
                                  end,
        'notes',                  notes,
        'entryDate',              entry_date,
        'createdAt',              created_at,
        'updatedAt',              updated_at,
        -- compatibilidade com UI antiga (score clinico /100 e total /150)
        'scoreClinico',           round((coalesce((p).triagem_score, 0)::numeric * 100.0) / 360.0)::int,
        'scoreSocial',            (case when coalesce((p).escola_publica, false)   then 2 else 0 end)
                                + (case when coalesce((p).trabalho_na_roca, false) then 2 else 0 end),
        'triagemScore',           (p).triagem_score,
        'escolaPublica',          (p).escola_publica,
        'trabalhoNaRoca',         (p).trabalho_na_roca,
        'scoreTotal150',          round((coalesce((p).triagem_score, 0)::numeric * 150.0) / 360.0)::int
                                + (case when coalesce((p).escola_publica, false)   then 2 else 0 end)
                                + (case when coalesce((p).trabalho_na_roca, false) then 2 else 0 end),
        -- novos campos por especialidade
        'scoreEspecialidade',     sp_score,
        'scoreEspecialidadeMax',  72,
        'scoreSocialDesempate',   sp_social,
        'scoreEspecialidadeTotal', case when sp_score is null then null else sp_score + sp_social end
      ) as row,
      row_number() over (
        order by
          -- Ordena dentro de cada cor por score efetivo da especialidade.
          -- Se nao tem specialty (NULL), cai no clinico /100 + 2*EP + 2*TNR.
          coalesce(
            sp_score + sp_social,
            ((coalesce((p).triagem_score, 0)::numeric * 100.0) / 360.0)::int
              + (case when coalesce((p).escola_publica, false)   then 2 else 0 end)
              + (case when coalesce((p).trabalho_na_roca, false) then 2 else 0 end)
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

-- 4) add_patient_to_waiting_list: usa a nova regra por especialidade. ---------
create or replace function public.add_patient_to_waiting_list(
  p_slug       text,
  p_password   text,
  p_patient_id bigint,
  p_specialty  text,
  p_notes      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id  bigint;
  v_patient     public.patients%rowtype;
  v_existing_id bigint;
  v_priority    text;
  v_today       text;
  v_entry       public.waiting_list%rowtype;
  v_specialty   text;
  v_sp_score    integer;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  v_specialty := nullif(btrim(coalesce(p_specialty, '')), '');

  select * into v_patient from public.patients
   where id = p_patient_id and company_id = v_company_id;
  if not found then raise exception 'patient not found'; end if;

  if coalesce(v_patient.tipo_registro, '') = 'Registro Censo Municipal' then
    raise exception 'Pacientes do Censo Municipal nao podem ser adicionados a fila.';
  end if;

  if v_patient.triagem_score is null then
    raise exception 'O paciente precisa ter triagem registrada antes de entrar na fila.';
  end if;

  if v_specialty is null then
    select id into v_existing_id from public.waiting_list
     where patient_id = p_patient_id and company_id = v_company_id and specialty is null
     limit 1;
  else
    select id into v_existing_id from public.waiting_list
     where patient_id = p_patient_id and company_id = v_company_id and specialty = v_specialty
     limit 1;
  end if;

  if v_existing_id is not null then
    raise exception 'Ja na fila: este paciente ja esta na fila%',
      case when v_specialty is null then '.' else ' para ' || v_specialty || '.' end;
  end if;

  v_sp_score := public._specialty_score_72(v_patient, v_specialty);
  if v_sp_score is null then
    -- specialty NULL ou desconhecida: mantem regra antiga por score clinico.
    v_priority := public._calc_priority(
      v_patient.triagem_score,
      coalesce(v_patient.escola_publica, false),
      coalesce(v_patient.trabalho_na_roca, false),
      false
    );
  else
    v_priority := public._calc_priority_specialty(
      v_sp_score,
      coalesce(v_patient.escola_publica, false),
      coalesce(v_patient.trabalho_na_roca, false)
    );
  end if;
  v_today := to_char(now() at time zone 'UTC', 'YYYY-MM-DD');

  insert into public.waiting_list (
    company_id, patient_id, professional_id, specialty, priority, notes, entry_date
  ) values (
    v_company_id, p_patient_id, null, v_specialty, v_priority, p_notes, v_today
  )
  returning * into v_entry;

  update public.patients
     set status = 'Fila de Espera'
   where id = p_patient_id and company_id = v_company_id;

  return jsonb_build_object(
    'id',               v_entry.id,
    'companyId',        v_entry.company_id,
    'patientId',        v_entry.patient_id,
    'professionalId',   v_entry.professional_id,
    'specialty',        v_entry.specialty,
    'priority',         v_entry.priority,
    'notes',            v_entry.notes,
    'entryDate',        v_entry.entry_date,
    'createdAt',        v_entry.created_at,
    'updatedAt',        v_entry.updated_at,
    'patientName',      v_patient.name,
    'calculatedFrom',   jsonb_build_object(
                          'specialty',         v_specialty,
                          'specialtyScore',    v_sp_score,
                          'triagemScore',      v_patient.triagem_score,
                          'escolaPublica',     v_patient.escola_publica,
                          'trabalhoNaRoca',    v_patient.trabalho_na_roca
                        )
  );
end;
$$;

-- 5) Recalc das prioridades existentes (Rafael/Jana/etc voltam pras cores certas).
update public.waiting_list w
   set priority = case
       when public._specialty_score_72(p, coalesce(w.specialty, pr.specialty)) is null then
         public._calc_priority(
           coalesce(p.triagem_score, 0),
           coalesce(p.escola_publica, false),
           coalesce(p.trabalho_na_roca, false),
           false
         )
       else
         public._calc_priority_specialty(
           public._specialty_score_72(p, coalesce(w.specialty, pr.specialty)),
           coalesce(p.escola_publica, false),
           coalesce(p.trabalho_na_roca, false)
         )
     end
  from public.patients p
  left join public.professionals pr on pr.id = w.professional_id
 where p.id = w.patient_id;

commit;
