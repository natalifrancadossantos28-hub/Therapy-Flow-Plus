-- =========================================================================
-- 0028_fix_priority_por_especialidade.sql
--
-- Corrige a 0027: substitui o helper _specialty_score_72 (que passava
-- composite row e quebrava no parser) por CASE inline em cada lugar
-- que precisa do score 0..72 da especialidade.
-- =========================================================================

begin;

-- limpa a versao quebrada do helper, se existir
drop function if exists public._specialty_score_72(public.patients, text);

-- _calc_priority_specialty: ja foi criada em 0027, recriamos por seguranca.
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
  v_eff := coalesce(p_specialty_score, 0)
         + (case when p_escola_publica   then 1 else 0 end)
         + (case when p_trabalho_na_roca then 1 else 0 end);
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

-- list_waiting_list: mesmo retorno da 0027, mas com CASE inline em vez de
-- _specialty_score_72(p, ...).
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
        when b.eff_specialty ilike 'ed%fisica%'
          or b.eff_specialty ilike 'educacao fisica%'
          or b.eff_specialty ilike 'educa%fisica%'
          or b.eff_specialty ilike 'oficina%'     then b.s_edf
        when b.eff_specialty ilike 'fono%'        then b.s_fon
        when b.eff_specialty ilike 'terapia ocup%'
          or b.eff_specialty ilike 't.o.%'
          or b.eff_specialty ilike 'to'           then b.s_to
        when b.eff_specialty ilike 'nutri%'       then b.s_nut
        else null
      end as sp_score,
      (case when b.p_escola   then 1 else 0 end)
      + (case when b.p_trabalho then 1 else 0 end) as sp_social
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
        'scoreEspecialidadeTotal', case when sp_score is null then null else sp_score + sp_social end
      ) as row,
      row_number() over (
        order by
          coalesce(
            sp_score + sp_social,
            ((coalesce(p_triagem, 0)::numeric * 100.0) / 360.0)::int
              + (case when p_escola   then 2 else 0 end)
              + (case when p_trabalho then 2 else 0 end)
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

-- add_patient_to_waiting_list: mesma logica, CASE inline.
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

  v_sp_score := case
    when v_specialty is null                        then null
    when v_specialty ilike 'psicolog%'              then coalesce(v_patient.score_psicologia, 0)
    when v_specialty ilike 'psicomot%'              then coalesce(v_patient.score_psicomotricidade, 0)
    when v_specialty ilike 'fisio%'                 then coalesce(v_patient.score_fisioterapia, 0)
    when v_specialty ilike 'psicoped%'              then coalesce(v_patient.score_psicopedagogia, 0)
    when v_specialty ilike 'ed%fisica%'
      or v_specialty ilike 'educacao fisica%'
      or v_specialty ilike 'educa%fisica%'
      or v_specialty ilike 'oficina%'               then coalesce(v_patient.score_ed_fisica, 0)
    when v_specialty ilike 'fono%'                  then coalesce(v_patient.score_fonoaudiologia, 0)
    when v_specialty ilike 'terapia ocup%'
      or v_specialty ilike 't.o.%'
      or v_specialty ilike 'to'                     then coalesce(v_patient.score_to, 0)
    when v_specialty ilike 'nutri%'                 then coalesce(v_patient.score_nutricionista, 0)
    else null
  end;

  if v_sp_score is null then
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
                          'specialty',      v_specialty,
                          'specialtyScore', v_sp_score,
                          'triagemScore',   v_patient.triagem_score,
                          'escolaPublica',  v_patient.escola_publica,
                          'trabalhoNaRoca', v_patient.trabalho_na_roca
                        )
  );
end;
$$;

-- Recalcula prioridades das filas existentes com a nova regra (CASE inline).
update public.waiting_list w
   set priority = case
       when (
         case
           when coalesce(w.specialty, pr.specialty) is null
             or btrim(coalesce(w.specialty, pr.specialty)) = ''            then null
           when coalesce(w.specialty, pr.specialty) ilike 'psicolog%'      then coalesce(p.score_psicologia, 0)
           when coalesce(w.specialty, pr.specialty) ilike 'psicomot%'      then coalesce(p.score_psicomotricidade, 0)
           when coalesce(w.specialty, pr.specialty) ilike 'fisio%'         then coalesce(p.score_fisioterapia, 0)
           when coalesce(w.specialty, pr.specialty) ilike 'psicoped%'      then coalesce(p.score_psicopedagogia, 0)
           when coalesce(w.specialty, pr.specialty) ilike 'ed%fisica%'
             or coalesce(w.specialty, pr.specialty) ilike 'educacao fisica%'
             or coalesce(w.specialty, pr.specialty) ilike 'educa%fisica%'
             or coalesce(w.specialty, pr.specialty) ilike 'oficina%'       then coalesce(p.score_ed_fisica, 0)
           when coalesce(w.specialty, pr.specialty) ilike 'fono%'          then coalesce(p.score_fonoaudiologia, 0)
           when coalesce(w.specialty, pr.specialty) ilike 'terapia ocup%'
             or coalesce(w.specialty, pr.specialty) ilike 't.o.%'
             or coalesce(w.specialty, pr.specialty) ilike 'to'             then coalesce(p.score_to, 0)
           when coalesce(w.specialty, pr.specialty) ilike 'nutri%'         then coalesce(p.score_nutricionista, 0)
           else null
         end
       ) is null then
         public._calc_priority(
           coalesce(p.triagem_score, 0),
           coalesce(p.escola_publica, false),
           coalesce(p.trabalho_na_roca, false),
           false
         )
       else
         public._calc_priority_specialty(
           case
             when coalesce(w.specialty, pr.specialty) ilike 'psicolog%'      then coalesce(p.score_psicologia, 0)
             when coalesce(w.specialty, pr.specialty) ilike 'psicomot%'      then coalesce(p.score_psicomotricidade, 0)
             when coalesce(w.specialty, pr.specialty) ilike 'fisio%'         then coalesce(p.score_fisioterapia, 0)
             when coalesce(w.specialty, pr.specialty) ilike 'psicoped%'      then coalesce(p.score_psicopedagogia, 0)
             when coalesce(w.specialty, pr.specialty) ilike 'ed%fisica%'
               or coalesce(w.specialty, pr.specialty) ilike 'educacao fisica%'
               or coalesce(w.specialty, pr.specialty) ilike 'educa%fisica%'
               or coalesce(w.specialty, pr.specialty) ilike 'oficina%'       then coalesce(p.score_ed_fisica, 0)
             when coalesce(w.specialty, pr.specialty) ilike 'fono%'          then coalesce(p.score_fonoaudiologia, 0)
             when coalesce(w.specialty, pr.specialty) ilike 'terapia ocup%'
               or coalesce(w.specialty, pr.specialty) ilike 't.o.%'
               or coalesce(w.specialty, pr.specialty) ilike 'to'             then coalesce(p.score_to, 0)
             when coalesce(w.specialty, pr.specialty) ilike 'nutri%'         then coalesce(p.score_nutricionista, 0)
             else 0
           end,
           coalesce(p.escola_publica, false),
           coalesce(p.trabalho_na_roca, false)
         )
     end
  from public.patients p
  left join public.professionals pr on pr.id = w.professional_id
 where p.id = w.patient_id;

commit;
