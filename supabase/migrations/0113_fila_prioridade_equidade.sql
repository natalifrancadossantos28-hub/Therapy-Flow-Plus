-- =========================================================================
-- 0113_fila_prioridade_equidade.sql
--
-- Prioridade da fila por equidade (clínica municipal / SUS):
--   * Nome do pai não muda mais a posição (fim da penalidade do 0083).
--   * Trabalho dos pais: Desempregado +10 pontos; Informal/Roça +5.
--   * Já atende fora:
--       Particular ......... -10 pontos, sem bônus de idade e sem Prioridade
--                            Máxima por idade.
--       CAPS/Reabilitação .. -5 pontos; mantém prioridade e bônus de idade.
--   * Abrigo / Casa da Criança mantém Prioridade Máxima em qualquer caso.
--   * ABC e a nota da triagem continuam como estavam.
--
-- O trabalho dos pais passa a ficar no cadastro (patients.trabalho_pais),
-- preenchido pelo cadastro e pela triagem. Ninguém sai da fila. Idempotente.
-- =========================================================================

begin;

alter table public.patients add column if not exists trabalho_pais text;

-- Backfill: última triagem do paciente (CPF ou nome).
update public.patients p
   set trabalho_pais = (
     select tr.trabalho_pais
       from public.triagens tr
      where tr.company_id = p.company_id
        and nullif(btrim(coalesce(tr.trabalho_pais, '')), '') is not null
        and (
             (length(regexp_replace(coalesce(tr.cpf, ''), '[^0-9]', '', 'g')) >= 11
              and regexp_replace(coalesce(tr.cpf, ''), '[^0-9]', '', 'g')
                = regexp_replace(coalesce(p.cpf, ''), '[^0-9]', '', 'g'))
          or lower(btrim(tr.nome)) = lower(btrim(p.name))
        )
      order by tr.created_at desc, tr.id desc
      limit 1
   )
 where p.trabalho_pais is null;

create or replace function public._fila_atende_fora_tipo(
  p_local text,
  p_outro boolean
)
returns text
language sql
immutable
as $$
  select case
    when lower(btrim(coalesce(p_local, ''))) like 'particular%' then 'particular'
    when public._atende_fora(p_local, p_outro) then 'sus'
    else null
  end;
$$;

create or replace function public._fila_bonus_trabalho(
  p_trabalho_pais text,
  p_trabalho_na_roca boolean
)
returns int
language sql
immutable
as $$
  select case
    when lower(btrim(coalesce(p_trabalho_pais, ''))) like 'desempregad%' then 10
    when lower(btrim(coalesce(p_trabalho_pais, ''))) like 'informal%' then 5
    when nullif(btrim(coalesce(p_trabalho_pais, '')), '') is null
         and coalesce(p_trabalho_na_roca, false) then 5
    else 0
  end;
$$;

-- Triagem salva leva o trabalho dos pais para o cadastro.
create or replace function public._sync_pais_from_triagem()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_cpf_clean text;
begin
  v_cpf_clean := nullif(regexp_replace(coalesce(new.cpf, ''), '[^0-9]', '', 'g'), '');

  update public.patients p
     set father_name       = coalesce(nullif(btrim(coalesce(new.nome_pai, '')), ''), p.father_name),
         outro_atendimento = coalesce(new.outro_atendimento, p.outro_atendimento),
         trabalho_pais     = coalesce(nullif(btrim(coalesce(new.trabalho_pais, '')), ''), p.trabalho_pais),
         updated_at        = now()
   where p.company_id = new.company_id
     and (
          (v_cpf_clean is not null
           and length(v_cpf_clean) >= 11
           and regexp_replace(coalesce(p.cpf, ''), '[^0-9]', '', 'g') = v_cpf_clean)
       or (coalesce(btrim(new.nome), '') <> ''
           and lower(btrim(p.name)) = lower(btrim(new.nome)))
     );

  return new;
end;
$$;

drop trigger if exists trg_sync_pais_from_triagem on public.triagens;
create trigger trg_sync_pais_from_triagem
  after insert or update of nome_pai, outro_atendimento, trabalho_pais, cpf, nome on public.triagens
  for each row execute function public._sync_pais_from_triagem();

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
    or p_payload ? 'trabalhoPais'
    or p_payload ? 'localAtendimento'
  );

  if p_id is null then
    insert into public.patients (
      company_id, prontuario, name, date_of_birth, cpf, cns, phone, email, address,
      guardian_name, guardian_phone, mother_name, father_name, diagnosis, notes,
      professional_id, status, entry_date, absence_count,
      triagem_score, score_psicologia, score_psicomotricidade, score_fisioterapia,
      score_psicopedagogia, score_ed_fisica, score_fonoaudiologia,
      score_to, score_nutricionista,
      escola_publica, trabalho_na_roca, abrigo_casa_crianca,
      tipo_registro, local_atendimento, outro_atendimento, photo_url, trabalho_pais
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
      nullif(p_payload->>'fatherName', ''),
      nullif(p_payload->>'diagnosis', ''),
      nullif(btrim(coalesce(p_payload->>'notes', '')), ''),
      case when p_payload ? 'professionalId' and p_payload->>'professionalId' is not null
            and btrim(p_payload->>'professionalId') <> ''
           then (p_payload->>'professionalId')::bigint end,
      coalesce(nullif(p_payload->>'status', ''), 'Aguardando Triagem'),
      coalesce(nullif(p_payload->>'entryDate', ''), to_char(now() at time zone 'UTC', 'YYYY-MM-DD')),
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
      nullif(btrim(coalesce(p_payload->>'localAtendimento', '')), ''),
      case when p_payload ? 'outroAtendimento'      then (p_payload->>'outroAtendimento')::boolean      end,
      nullif(p_payload->>'photoUrl', ''),
      nullif(btrim(coalesce(p_payload->>'trabalhoPais', '')), '')
    )
    returning * into v_row;
  else
    update public.patients set
      prontuario        = case when p_payload ? 'prontuario'       then nullif(btrim(coalesce(p_payload->>'prontuario','')),'') else prontuario end,
      name              = case when p_payload ? 'name'             and btrim(coalesce(p_payload->>'name',''))<>''
                               then p_payload->>'name' else name end,
      date_of_birth     = case when p_payload ? 'dateOfBirth'      then nullif(p_payload->>'dateOfBirth','') else date_of_birth end,
      cpf               = case when p_payload ? 'cpf'              then nullif(p_payload->>'cpf','') else cpf end,
      cns               = case when p_payload ? 'cns'              then nullif(p_payload->>'cns','') else cns end,
      phone             = case when p_payload ? 'phone'            then nullif(p_payload->>'phone','') else phone end,
      email             = case when p_payload ? 'email'            then nullif(p_payload->>'email','') else email end,
      address           = case when p_payload ? 'address'          then nullif(p_payload->>'address','') else address end,
      guardian_name     = case when p_payload ? 'guardianName'     then nullif(p_payload->>'guardianName','') else guardian_name end,
      guardian_phone    = case when p_payload ? 'guardianPhone'    then nullif(p_payload->>'guardianPhone','') else guardian_phone end,
      mother_name       = case when p_payload ? 'motherName'       then nullif(p_payload->>'motherName','') else mother_name end,
      father_name       = case when p_payload ? 'fatherName'       then nullif(p_payload->>'fatherName','') else father_name end,
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
                               then p_payload->>'entryDate' else entry_date end,
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
      outro_atendimento = case when p_payload ? 'outroAtendimento'  then (p_payload->>'outroAtendimento')::boolean else outro_atendimento end,
      photo_url         = case when p_payload ? 'photoUrl'          then nullif(p_payload->>'photoUrl','') else photo_url end,
      trabalho_pais     = case when p_payload ? 'trabalhoPais'      then nullif(btrim(coalesce(p_payload->>'trabalhoPais','')),'') else trabalho_pais end,
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

  with abc as (
    select distinct on (a.patient_id) a.patient_id, a.score_total, a.nivel
      from public.abc_avaliacoes a
     where a.company_id = v_company_id and a.tipo = 'entrada'
     order by a.patient_id, a.created_at desc, a.id desc
  ),
  base as (
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
      p.trabalho_pais     as p_trabalho_pais,
      coalesce(p.abrigo_casa_crianca, false)   as p_abrigo,
      p.mother_name       as p_mae,
      p.father_name       as p_pai,
      p.local_atendimento as p_local,
      p.outro_atendimento as p_outro,
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
      coalesce(w.specialty, pr.specialty)   as eff_specialty,
      abc.score_total     as abc_total,
      abc.nivel           as abc_nivel
      from public.waiting_list w
      left join public.patients      p  on p.id  = w.patient_id
      left join public.professionals pr on pr.id = w.professional_id
      left join abc                     on abc.patient_id = w.patient_id
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
      end as age_years,
      public._atende_fora(b.p_local, b.p_outro)   as atende_fora,
      public._pais_registrados(b.p_mae, b.p_pai)  as pais_registrados,
      public._fila_atende_fora_tipo(b.p_local, b.p_outro) as fora_tipo,
      public._fila_bonus_trabalho(b.p_trabalho_pais, b.p_trabalho) as bonus_trabalho
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
      (case when a.p_escola then 1 else 0 end) as sp_social,
      case
        when a.fora_tipo = 'particular' then 0
        when a.age_policy = 'fifo' then 0
        when a.age_years is null then 0
        when a.age_policy = 'min3' and a.age_years < 3 then 0
        when a.age_years < 4 then 50
        when a.age_years <= 6 then 20
        else 0
      end as age_bonus,
      0 as penalidade_pais,
      case a.fora_tipo when 'particular' then 10 when 'sus' then 5 else 0 end as penalidade_fora,
      (public._fila_prioridade_maxima(a.eff_specialty, a.p_dob, a.p_abrigo)
        and (a.p_abrigo or a.fora_tipo is distinct from 'particular')) as is_maxima,
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
        'scoreEspecialidadeTotal', case
                                     when sp_score is null then null
                                     else greatest(sp_score + sp_social + bonus_trabalho - penalidade_fora, 0)
                                   end,
        'ageBonus',               age_bonus,
        'dateOfBirth',            p_dob,
        'ordenacao',              case when is_fifo then 'chegada' else 'prioridade' end,
        'atendeFora',             atende_fora,
        'paisRegistrados',        pais_registrados,
        'penalidadePais',         penalidade_pais,
        'trabalhoPais',           p_trabalho_pais,
        'bonusTrabalho',          bonus_trabalho,
        'atendeForaTipo',         fora_tipo,
        'penalidadeFora',         penalidade_fora,
        'localAtendimento',       p_local,
        'prioridadeMaxima',       is_maxima,
        'prioridadeMaximaRazao',  case
                                    when not is_maxima then null
                                    when p_abrigo and age_years is not null and age_years < 5 then 'idade_e_abrigo'
                                    when p_abrigo then 'abrigo'
                                    else 'idade'
                                  end,
        'abcTotal',               abc_total,
        'abcNivel',               abc_nivel
      ) as row,
      row_number() over (
        order by
          case when w_paused then 1 else 0 end asc,
          case when is_maxima then 0 else 1 end asc,
          -- ABC: maior pontuação primeiro; sem ABC vai depois.
          case when abc_total is null then 1 else 0 end asc,
          coalesce(abc_total, 0) desc,
          case when is_fifo then 0 else
            greatest(
              coalesce(
                sp_score + sp_social + age_bonus,
                ((coalesce(p_triagem, 0)::numeric * 100.0) / 360.0)::int
                  + (case when p_escola   then 2 else 0 end)
                  + age_bonus
              ) + bonus_trabalho - penalidade_fora,
              0
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

notify pgrst, 'reload schema';

commit;
