-- 0033_prioridade_maxima_abrigo_idade.sql
-- Adiciona regra de Prioridade Maxima na fila de espera:
--   1) Crianca com ate 4 anos e 11 meses (< 5 anos completos)
--   2) Reside em Abrigo / Casa da Crianca (campo novo)
-- Esses pacientes "furam a fila" e aparecem no topo, independentemente do score clinico.
--
-- Mudancas:
--   - Coluna nova: patients.abrigo_casa_crianca BOOLEAN
--   - upsert_patient: aceita 'abrigoCasaCrianca' no payload
--   - list_waiting_list: retorna 'abrigoCasaCrianca' e prioridade 'maxima' quando aplicavel,
--                        ordena 'maxima' antes de qualquer score.
--   - add_patient_to_waiting_list: define priority='maxima' quando aplicavel.

begin;

-- 1) Coluna nova
alter table public.patients
  add column if not exists abrigo_casa_crianca boolean default false;

-- 2) upsert_patient: estender para aceitar abrigoCasaCrianca
create or replace function public.upsert_patient(
  p_slug     text,
  p_password text,
  p_id       bigint,
  p_payload  jsonb
)
returns public.patients
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id    bigint;
  v_row           public.patients%rowtype;
  v_score_changed boolean;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  v_score_changed := (
       p_payload ? 'triagemScore'
    or p_payload ? 'scorePsicologia'
    or p_payload ? 'scorePsicomotricidade'
    or p_payload ? 'scoreFisioterapia'
    or p_payload ? 'scorePsicopedagogia'
    or p_payload ? 'scoreEdFisica'
    or p_payload ? 'scoreFonoaudiologia'
    or p_payload ? 'scoreTO'
    or p_payload ? 'scoreNutricionista'
    or p_payload ? 'escolaPublica'
    or p_payload ? 'trabalhoNaRoca'
    or p_payload ? 'abrigoCasaCrianca'
  );

  if p_id is null then
    insert into public.patients (
      company_id, prontuario, name, date_of_birth, cpf, cns, phone, email, address,
      guardian_name, guardian_phone, mother_name, diagnosis, notes, professional_id,
      status, entry_date, absence_count,
      triagem_score, score_psicologia, score_psicomotricidade, score_fisioterapia,
      score_psicopedagogia, score_ed_fisica, score_fonoaudiologia,
      score_to, score_nutricionista,
      escola_publica, trabalho_na_roca, abrigo_casa_crianca,
      tipo_registro, local_atendimento
    ) values (
      v_company_id,
      nullif(btrim(coalesce(p_payload->>'prontuario', '')), ''),
      coalesce(p_payload->>'name', ''),
      nullif(p_payload->>'dateOfBirth', ''),
      nullif(p_payload->>'cpf', ''),
      nullif(p_payload->>'cns', ''),
      nullif(p_payload->>'phone', ''),
      nullif(p_payload->>'email', ''),
      nullif(p_payload->>'address', ''),
      nullif(p_payload->>'guardianName', ''),
      nullif(p_payload->>'guardianPhone', ''),
      nullif(p_payload->>'motherName', ''),
      nullif(p_payload->>'diagnosis', ''),
      nullif(btrim(coalesce(p_payload->>'notes', '')), ''),
      case when p_payload ? 'professionalId' and p_payload->>'professionalId' is not null
            and btrim(p_payload->>'professionalId') <> ''
           then (p_payload->>'professionalId')::bigint end,
      coalesce(nullif(p_payload->>'status', ''), 'Aguardando Triagem'),
      coalesce(nullif(p_payload->>'entryDate', ''), to_char(now() at time zone 'UTC', 'YYYY-MM-DD'))::date,
      0,
      case when p_payload ? 'triagemScore' and p_payload->>'triagemScore' is not null
           then (p_payload->>'triagemScore')::integer end,
      case when p_payload ? 'scorePsicologia'       then (p_payload->>'scorePsicologia')::integer       end,
      case when p_payload ? 'scorePsicomotricidade' then (p_payload->>'scorePsicomotricidade')::integer end,
      case when p_payload ? 'scoreFisioterapia'     then (p_payload->>'scoreFisioterapia')::integer     end,
      case when p_payload ? 'scorePsicopedagogia'   then (p_payload->>'scorePsicopedagogia')::integer   end,
      case when p_payload ? 'scoreEdFisica'         then (p_payload->>'scoreEdFisica')::integer         end,
      case when p_payload ? 'scoreFonoaudiologia'   then (p_payload->>'scoreFonoaudiologia')::integer   end,
      case when p_payload ? 'scoreTO'               then (p_payload->>'scoreTO')::integer               end,
      case when p_payload ? 'scoreNutricionista'    then (p_payload->>'scoreNutricionista')::integer    end,
      case when p_payload ? 'escolaPublica'         then (p_payload->>'escolaPublica')::boolean         end,
      case when p_payload ? 'trabalhoNaRoca'        then (p_payload->>'trabalhoNaRoca')::boolean        end,
      case when p_payload ? 'abrigoCasaCrianca'     then (p_payload->>'abrigoCasaCrianca')::boolean     end,
      nullif(btrim(coalesce(p_payload->>'tipoRegistro', '')), ''),
      nullif(btrim(coalesce(p_payload->>'localAtendimento', '')), '')
    )
    returning * into v_row;
  else
    update public.patients set
      prontuario        = case when p_payload ? 'prontuario'       then nullif(btrim(coalesce(p_payload->>'prontuario','')),'') else prontuario end,
      name              = case when p_payload ? 'name'             and btrim(coalesce(p_payload->>'name',''))<>''
                               then p_payload->>'name' else name end,
      date_of_birth     = case when p_payload ? 'dateOfBirth'      then nullif(p_payload->>'dateOfBirth','')::date else date_of_birth end,
      cpf               = case when p_payload ? 'cpf'              then nullif(p_payload->>'cpf','') else cpf end,
      cns               = case when p_payload ? 'cns'              then nullif(p_payload->>'cns','') else cns end,
      phone             = case when p_payload ? 'phone'            then nullif(p_payload->>'phone','') else phone end,
      email             = case when p_payload ? 'email'            then nullif(p_payload->>'email','') else email end,
      address           = case when p_payload ? 'address'          then nullif(p_payload->>'address','') else address end,
      guardian_name     = case when p_payload ? 'guardianName'     then nullif(p_payload->>'guardianName','') else guardian_name end,
      guardian_phone    = case when p_payload ? 'guardianPhone'    then nullif(p_payload->>'guardianPhone','') else guardian_phone end,
      mother_name       = case when p_payload ? 'motherName'       then nullif(p_payload->>'motherName','') else mother_name end,
      diagnosis         = case when p_payload ? 'diagnosis'        then nullif(p_payload->>'diagnosis','') else diagnosis end,
      notes             = case when p_payload ? 'notes'            then nullif(btrim(coalesce(p_payload->>'notes','')),'') else notes end,
      professional_id   = case when p_payload ? 'professionalId'
                               then case when p_payload->>'professionalId' is null
                                       or btrim(coalesce(p_payload->>'professionalId',''))=''
                                         then null
                                         else (p_payload->>'professionalId')::bigint end
                               else professional_id end,
      status            = case when p_payload ? 'status'           and btrim(coalesce(p_payload->>'status',''))<>''
                               then p_payload->>'status' else status end,
      entry_date        = case when p_payload ? 'entryDate'        and btrim(coalesce(p_payload->>'entryDate',''))<>''
                               then (p_payload->>'entryDate')::date else entry_date end,
      triagem_score     = case when p_payload ? 'triagemScore'        then (p_payload->>'triagemScore')::integer        else triagem_score end,
      score_psicologia  = case when p_payload ? 'scorePsicologia'     then (p_payload->>'scorePsicologia')::integer     else score_psicologia end,
      score_psicomotricidade = case when p_payload ? 'scorePsicomotricidade' then (p_payload->>'scorePsicomotricidade')::integer else score_psicomotricidade end,
      score_fisioterapia = case when p_payload ? 'scoreFisioterapia' then (p_payload->>'scoreFisioterapia')::integer else score_fisioterapia end,
      score_psicopedagogia = case when p_payload ? 'scorePsicopedagogia' then (p_payload->>'scorePsicopedagogia')::integer else score_psicopedagogia end,
      score_ed_fisica   = case when p_payload ? 'scoreEdFisica'      then (p_payload->>'scoreEdFisica')::integer       else score_ed_fisica end,
      score_fonoaudiologia = case when p_payload ? 'scoreFonoaudiologia' then (p_payload->>'scoreFonoaudiologia')::integer else score_fonoaudiologia end,
      score_to          = case when p_payload ? 'scoreTO'            then (p_payload->>'scoreTO')::integer             else score_to end,
      score_nutricionista = case when p_payload ? 'scoreNutricionista' then (p_payload->>'scoreNutricionista')::integer else score_nutricionista end,
      escola_publica      = case when p_payload ? 'escolaPublica'    then (p_payload->>'escolaPublica')::boolean       else escola_publica end,
      trabalho_na_roca    = case when p_payload ? 'trabalhoNaRoca'   then (p_payload->>'trabalhoNaRoca')::boolean      else trabalho_na_roca end,
      abrigo_casa_crianca = case when p_payload ? 'abrigoCasaCrianca' then (p_payload->>'abrigoCasaCrianca')::boolean   else abrigo_casa_crianca end,
      tipo_registro     = case when p_payload ? 'tipoRegistro'      and btrim(coalesce(p_payload->>'tipoRegistro',''))<>''
                               then p_payload->>'tipoRegistro' else tipo_registro end,
      local_atendimento = case when p_payload ? 'localAtendimento'  then nullif(btrim(coalesce(p_payload->>'localAtendimento','')),'') else local_atendimento end,
      updated_at        = now()
    where id = p_id and company_id = v_company_id
    returning * into v_row;
    if not found then raise exception 'patient not found'; end if;
  end if;

  if v_score_changed then
    perform public._sync_priority_after_score_change(v_row.id);
  end if;

  return v_row;
end;
$$;
revoke all on function public.upsert_patient(text, text, bigint, jsonb) from public;
grant execute on function public.upsert_patient(text, text, bigint, jsonb) to anon, authenticated;

-- 3) list_waiting_list com Prioridade Maxima
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
      case
        when b.p_dob is null then 0
        when extract(year from age(current_date, b.p_dob)) < 4 then 50
        when extract(year from age(current_date, b.p_dob)) <= 6 then 20
        else 0
      end as age_bonus,
      -- Prioridade Maxima: < 5 anos OU abrigo
      (b.p_dob is not null
        and extract(year from age(current_date, b.p_dob)) < 5
      ) as is_under5,
      (b.p_abrigo) as is_abrigo
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
                                    when (is_under5 or is_abrigo) then 'maxima'
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
        'prioridadeMaxima',       (is_under5 or is_abrigo),
        'prioridadeMaximaRazao',  case
                                    when is_under5 and is_abrigo then 'idade_e_abrigo'
                                    when is_under5 then 'idade'
                                    when is_abrigo then 'abrigo'
                                    else null
                                  end
      ) as row,
      row_number() over (
        order by
          case when (is_under5 or is_abrigo) then 0 else 1 end asc,
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

-- 4) add_patient_to_waiting_list: priority='maxima' quando aplicavel
create or replace function public.add_patient_to_waiting_list(
  p_slug text, p_password text, p_patient_id bigint, p_specialty text, p_notes text default null
) returns jsonb language plpgsql security definer
  set search_path = public, extensions, pg_temp as $$
declare
  v_company_id bigint;
  v_patient public.patients%rowtype;
  v_existing_id bigint;
  v_priority text;
  v_today text;
  v_entry public.waiting_list%rowtype;
  v_specialty text;
  v_sp_score integer;
  v_is_under5 boolean;
  v_is_abrigo boolean;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  v_specialty := nullif(btrim(coalesce(p_specialty,'')),'');
  select * into v_patient from public.patients where id = p_patient_id and company_id = v_company_id;
  if not found then raise exception 'patient not found'; end if;
  if coalesce(v_patient.tipo_registro,'') = 'Registro Censo Municipal' then
    raise exception 'Pacientes do Censo Municipal nao podem ser adicionados a fila.'; end if;
  if v_patient.triagem_score is null then
    raise exception 'O paciente precisa ter triagem registrada antes de entrar na fila.'; end if;
  if v_specialty is null then
    select id into v_existing_id from public.waiting_list
     where patient_id = p_patient_id and company_id = v_company_id and specialty is null limit 1;
  else
    select id into v_existing_id from public.waiting_list
     where patient_id = p_patient_id and company_id = v_company_id and specialty = v_specialty limit 1;
  end if;
  if v_existing_id is not null then
    raise exception 'Ja na fila: este paciente ja esta na fila%',
      case when v_specialty is null then '.' else ' para '||v_specialty||'.' end;
  end if;
  v_sp_score := case
    when v_specialty is null              then null
    when v_specialty ilike 'psicolog%'    then coalesce(v_patient.score_psicologia, 0)
    when v_specialty ilike 'psicomot%'    then coalesce(v_patient.score_psicomotricidade, 0)
    when v_specialty ilike 'fisio%'       then coalesce(v_patient.score_fisioterapia, 0)
    when v_specialty ilike 'psicoped%'    then coalesce(v_patient.score_psicopedagogia, 0)
    when v_specialty ilike 'educa%'       then coalesce(v_patient.score_ed_fisica, 0)
    when v_specialty ilike 'oficina%'     then coalesce(v_patient.score_ed_fisica, 0)
    when v_specialty ilike 'fono%'        then coalesce(v_patient.score_fonoaudiologia, 0)
    when v_specialty ilike 'terapia ocup%'
      or v_specialty ilike 't.o.%'
      or v_specialty ilike 'to'           then coalesce(v_patient.score_to, 0)
    when v_specialty ilike 'nutri%'       then coalesce(v_patient.score_nutricionista, 0)
    else null
  end;
  v_is_under5 := v_patient.date_of_birth is not null
                 and extract(year from age(current_date, v_patient.date_of_birth)) < 5;
  v_is_abrigo := coalesce(v_patient.abrigo_casa_crianca, false);
  if v_is_under5 or v_is_abrigo then
    v_priority := 'maxima';
  elsif v_sp_score is null then
    v_priority := public._calc_priority(v_patient.triagem_score,
      coalesce(v_patient.escola_publica,false), coalesce(v_patient.trabalho_na_roca,false), false);
  else
    v_priority := public._calc_priority_specialty(v_sp_score,
      coalesce(v_patient.escola_publica,false), coalesce(v_patient.trabalho_na_roca,false));
  end if;
  v_today := to_char(now() at time zone 'UTC','YYYY-MM-DD');
  insert into public.waiting_list (company_id, patient_id, professional_id, specialty, priority, notes, entry_date)
  values (v_company_id, p_patient_id, null, v_specialty, v_priority, p_notes, v_today)
  returning * into v_entry;
  update public.patients set status = 'Fila de Espera'
   where id = p_patient_id and company_id = v_company_id;
  return jsonb_build_object('id',v_entry.id,'companyId',v_entry.company_id,'patientId',v_entry.patient_id,
    'professionalId',v_entry.professional_id,'specialty',v_entry.specialty,'priority',v_entry.priority,
    'notes',v_entry.notes,'entryDate',v_entry.entry_date,'createdAt',v_entry.created_at,
    'updatedAt',v_entry.updated_at,'patientName',v_patient.name,
    'calculatedFrom',jsonb_build_object('specialty',v_specialty,'specialtyScore',v_sp_score,
      'triagemScore',v_patient.triagem_score,'escolaPublica',v_patient.escola_publica,
      'trabalhoNaRoca',v_patient.trabalho_na_roca,
      'abrigoCasaCrianca', v_patient.abrigo_casa_crianca,
      'prioridadeMaxima', (v_is_under5 or v_is_abrigo)));
end; $$;
revoke all on function public.add_patient_to_waiting_list(text, text, bigint, text, text) from public;
grant execute on function public.add_patient_to_waiting_list(text, text, bigint, text, text) to anon, authenticated;

-- 5) Recalcular prioridade dos pacientes ja na fila (idade pode mudar a cada dia)
update public.waiting_list w
   set priority = 'maxima'
  from public.patients p
 where p.id = w.patient_id
   and (
     coalesce(p.abrigo_casa_crianca, false)
     or (p.date_of_birth is not null and extract(year from age(current_date, p.date_of_birth)) < 5)
   );

commit;
