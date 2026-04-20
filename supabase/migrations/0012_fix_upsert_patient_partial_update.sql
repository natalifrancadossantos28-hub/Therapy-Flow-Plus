-- =========================================================================
-- 0012_fix_upsert_patient_partial_update.sql
--
-- Bug: upsert_patient raise 'name is required' mesmo em UPDATE parcial
-- (ex.: salvar triagem manual em /patients/<id> so enviava scores, sem
-- repassar name, e o backend recusava). Fix:
--
-- 1. `name` so e obrigatorio no INSERT (quando p_id is null).
-- 2. No UPDATE, `name` so e atualizado se o payload incluir a chave 'name';
--    caso contrario preserva o valor atual.
-- 3. Recriar com assinatura identica (mesmos args/retorno), sem DROP,
--    para nao quebrar frontends em producao.
-- =========================================================================

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
  v_company_id bigint;
  v_row        public.patients%rowtype;
  v_name       text;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  v_name := nullif(btrim(coalesce(p_payload->>'name', '')), '');

  if p_id is null then
    -- INSERT: name obrigatorio.
    if v_name is null then
      raise exception 'name is required';
    end if;

    insert into public.patients (
      company_id, prontuario, name, date_of_birth, cpf, cns,
      phone, email, address,
      guardian_name, guardian_phone, mother_name,
      diagnosis, notes, professional_id,
      status, entry_date, absence_count,
      triagem_score,
      score_psicologia, score_psicomotricidade, score_fisioterapia,
      score_psicopedagogia, score_ed_fisica, score_fonoaudiologia,
      score_to, score_nutricionista,
      escola_publica, trabalho_na_roca,
      tipo_registro, local_atendimento
    ) values (
      v_company_id,
      nullif(btrim(coalesce(p_payload->>'prontuario', '')), ''),
      v_name,
      nullif(btrim(coalesce(p_payload->>'dateOfBirth', '')), ''),
      nullif(btrim(coalesce(p_payload->>'cpf', '')), ''),
      nullif(btrim(coalesce(p_payload->>'cns', '')), ''),
      nullif(btrim(coalesce(p_payload->>'phone', '')), ''),
      nullif(btrim(coalesce(p_payload->>'email', '')), ''),
      nullif(btrim(coalesce(p_payload->>'address', '')), ''),
      nullif(btrim(coalesce(p_payload->>'guardianName', '')), ''),
      nullif(btrim(coalesce(p_payload->>'guardianPhone', '')), ''),
      nullif(btrim(coalesce(p_payload->>'motherName', '')), ''),
      nullif(btrim(coalesce(p_payload->>'diagnosis', '')), ''),
      nullif(btrim(coalesce(p_payload->>'notes', '')), ''),
      case when p_payload ? 'professionalId' and p_payload->>'professionalId' is not null
            and btrim(p_payload->>'professionalId') <> ''
           then (p_payload->>'professionalId')::bigint end,
      coalesce(nullif(btrim(coalesce(p_payload->>'status', '')), ''), 'Aguardando Triagem'),
      coalesce(nullif(btrim(coalesce(p_payload->>'entryDate', '')), ''),
               to_char(now() at time zone 'UTC', 'YYYY-MM-DD')),
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
      case when p_payload ? 'escolaPublica'   then (p_payload->>'escolaPublica')::boolean   end,
      case when p_payload ? 'trabalhoNaRoca'  then (p_payload->>'trabalhoNaRoca')::boolean  end,
      coalesce(nullif(btrim(coalesce(p_payload->>'tipoRegistro', '')), ''), 'Paciente da Unidade'),
      nullif(btrim(coalesce(p_payload->>'localAtendimento', '')), '')
    )
    returning * into v_row;
  else
    -- UPDATE parcial: name so e atualizado se vier no payload e nao vazio.
    update public.patients set
      prontuario        = case when p_payload ? 'prontuario'
                               then nullif(btrim(coalesce(p_payload->>'prontuario', '')), '')
                               else prontuario end,
      name              = case when p_payload ? 'name' and v_name is not null
                               then v_name
                               else name end,
      date_of_birth     = case when p_payload ? 'dateOfBirth'
                               then nullif(btrim(coalesce(p_payload->>'dateOfBirth', '')), '')
                               else date_of_birth end,
      cpf               = case when p_payload ? 'cpf' then nullif(btrim(coalesce(p_payload->>'cpf', '')), '')             else cpf end,
      cns               = case when p_payload ? 'cns' then nullif(btrim(coalesce(p_payload->>'cns', '')), '')             else cns end,
      phone             = case when p_payload ? 'phone' then nullif(btrim(coalesce(p_payload->>'phone', '')), '')         else phone end,
      email             = case when p_payload ? 'email' then nullif(btrim(coalesce(p_payload->>'email', '')), '')         else email end,
      address           = case when p_payload ? 'address' then nullif(btrim(coalesce(p_payload->>'address', '')), '')     else address end,
      guardian_name     = case when p_payload ? 'guardianName'  then nullif(btrim(coalesce(p_payload->>'guardianName', '')), '')  else guardian_name end,
      guardian_phone    = case when p_payload ? 'guardianPhone' then nullif(btrim(coalesce(p_payload->>'guardianPhone', '')), '') else guardian_phone end,
      mother_name       = case when p_payload ? 'motherName'    then nullif(btrim(coalesce(p_payload->>'motherName', '')), '')    else mother_name end,
      diagnosis         = case when p_payload ? 'diagnosis'     then nullif(btrim(coalesce(p_payload->>'diagnosis', '')), '')     else diagnosis end,
      notes             = case when p_payload ? 'notes'         then nullif(btrim(coalesce(p_payload->>'notes', '')), '')         else notes end,
      professional_id   = case when p_payload ? 'professionalId'
                               then case when p_payload->>'professionalId' is null or btrim(p_payload->>'professionalId') = ''
                                         then null
                                         else (p_payload->>'professionalId')::bigint end
                               else professional_id end,
      status            = case when p_payload ? 'status' and btrim(coalesce(p_payload->>'status','')) <> ''
                               then p_payload->>'status' else status end,
      entry_date        = case when p_payload ? 'entryDate' and btrim(coalesce(p_payload->>'entryDate','')) <> ''
                               then p_payload->>'entryDate' else entry_date end,
      triagem_score     = case when p_payload ? 'triagemScore'
                               then case when p_payload->>'triagemScore' is null then null
                                         else (p_payload->>'triagemScore')::integer end
                               else triagem_score end,
      score_psicologia        = case when p_payload ? 'scorePsicologia'       then (p_payload->>'scorePsicologia')::integer       else score_psicologia end,
      score_psicomotricidade  = case when p_payload ? 'scorePsicomotricidade' then (p_payload->>'scorePsicomotricidade')::integer else score_psicomotricidade end,
      score_fisioterapia      = case when p_payload ? 'scoreFisioterapia'     then (p_payload->>'scoreFisioterapia')::integer     else score_fisioterapia end,
      score_psicopedagogia    = case when p_payload ? 'scorePsicopedagogia'   then (p_payload->>'scorePsicopedagogia')::integer   else score_psicopedagogia end,
      score_ed_fisica         = case when p_payload ? 'scoreEdFisica'         then (p_payload->>'scoreEdFisica')::integer         else score_ed_fisica end,
      score_fonoaudiologia    = case when p_payload ? 'scoreFonoaudiologia'   then (p_payload->>'scoreFonoaudiologia')::integer   else score_fonoaudiologia end,
      score_to                = case when p_payload ? 'scoreTO'               then (p_payload->>'scoreTO')::integer               else score_to end,
      score_nutricionista     = case when p_payload ? 'scoreNutricionista'    then (p_payload->>'scoreNutricionista')::integer    else score_nutricionista end,
      escola_publica    = case when p_payload ? 'escolaPublica'   then (p_payload->>'escolaPublica')::boolean   else escola_publica end,
      trabalho_na_roca  = case when p_payload ? 'trabalhoNaRoca'  then (p_payload->>'trabalhoNaRoca')::boolean  else trabalho_na_roca end,
      tipo_registro     = case when p_payload ? 'tipoRegistro'    and btrim(coalesce(p_payload->>'tipoRegistro','')) <> ''
                               then p_payload->>'tipoRegistro' else tipo_registro end,
      local_atendimento = case when p_payload ? 'localAtendimento'
                               then nullif(btrim(coalesce(p_payload->>'localAtendimento', '')), '')
                               else local_atendimento end
    where id = p_id and company_id = v_company_id
    returning * into v_row;
    if not found then raise exception 'patient not found'; end if;
  end if;

  return v_row;
end;
$$;

revoke all on function public.upsert_patient(text, text, bigint, jsonb) from public;
grant execute on function public.upsert_patient(text, text, bigint, jsonb) to anon, authenticated;
