-- =========================================================================
-- 0021_score_sincrono.sql
--
-- Sincroniza scores manuais editados no Perfil (Gestao/Arco-iris) com a
-- tabela `triagens`. Sem isso, o usuario edita "Editar Triagem" no perfil
-- (que so grava em `patients`), mas o app Triagem continua lendo o
-- `triagens.respostas` antigo e mostra um numero diferente.
--
-- Regra final: as 3 telas (Triagem lista, Gestao Perfil, Gestao Fila) leem
-- a mesma fonte e mostram o mesmo score.
--
-- Mudancas:
-- 1) Helper `_classify_area_pct(pts, max)` espelha `classificar()` do app
--    Triagem (Baixo indicativo / Indicio leve / moderado / elevado).
-- 2) Helper `_sync_triagem_from_patient_scores(company_id, patient_id)`
--    monta um `resultado` text no formato lido pelo app Triagem
--    ("Area: X pontos - Nivel | ...") e faz UPSERT na triagem mais recente
--    do paciente (match por CPF ou nome). Se nao existir triagem, cria uma
--    sintetica (respostas=null) so com o resultado_texto e flags.
-- 3) `_tg_triagens_autolink` passa a respeitar a flag de sessao
--    `app.skip_autolink` para evitar loop quando o sync (que escreve em
--    triagens) re-disparasse a trigger que escreve em patients.
-- 4) `upsert_patient` chama o sync ao final se algum campo de score foi
--    enviado no payload (manter a assinatura identica - sem DROP).
-- =========================================================================

begin;

-- 1) Helper de classificacao por percentual ----------------------------------
create or replace function public._classify_area_pct(
  p_pts integer,
  p_max integer
)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_max, 0) <= 0 then 'Baixo indicativo'
    when (coalesce(p_pts, 0)::numeric / p_max::numeric) * 100 <= 25 then 'Baixo indicativo'
    when (coalesce(p_pts, 0)::numeric / p_max::numeric) * 100 <= 50 then 'Indício leve'
    when (coalesce(p_pts, 0)::numeric / p_max::numeric) * 100 <= 75 then 'Indício moderado'
    else 'Indício elevado'
  end;
$$;

revoke all on function public._classify_area_pct(integer, integer) from public;

-- 2) Sync: patients (manual) -> triagens -------------------------------------
create or replace function public._sync_triagem_from_patient_scores(
  p_company_id bigint,
  p_patient_id bigint
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_pat        public.patients%rowtype;
  v_triagem_id bigint;
  v_resultado  text;
  v_escola     text;
  v_trabalho   text;
  v_max_area   integer := 45;  -- 15 perguntas * 3 pontos por area (espelha App.tsx do Triagem)
  v_cpf_clean  text;
begin
  if p_company_id is null or p_patient_id is null then
    return;
  end if;

  select * into v_pat
    from public.patients
   where id = p_patient_id and company_id = p_company_id;
  if not found then
    return;
  end if;

  v_resultado := concat_ws(' | ',
    'Psicológico: '         || coalesce(v_pat.score_psicologia, 0)       || ' pontos - ' || public._classify_area_pct(coalesce(v_pat.score_psicologia, 0), v_max_area),
    'Psicomotricidade: '    || coalesce(v_pat.score_psicomotricidade, 0) || ' pontos - ' || public._classify_area_pct(coalesce(v_pat.score_psicomotricidade, 0), v_max_area),
    'Fisioterapia: '        || coalesce(v_pat.score_fisioterapia, 0)     || ' pontos - ' || public._classify_area_pct(coalesce(v_pat.score_fisioterapia, 0), v_max_area),
    'Terapia Ocupacional: ' || coalesce(v_pat.score_to, 0)               || ' pontos - ' || public._classify_area_pct(coalesce(v_pat.score_to, 0), v_max_area),
    'Fonoaudiologia: '      || coalesce(v_pat.score_fonoaudiologia, 0)   || ' pontos - ' || public._classify_area_pct(coalesce(v_pat.score_fonoaudiologia, 0), v_max_area),
    'Nutrição: '            || coalesce(v_pat.score_nutricionista, 0)    || ' pontos - ' || public._classify_area_pct(coalesce(v_pat.score_nutricionista, 0), v_max_area),
    'Psicopedagogia: '      || coalesce(v_pat.score_psicopedagogia, 0)   || ' pontos - ' || public._classify_area_pct(coalesce(v_pat.score_psicopedagogia, 0), v_max_area),
    'Educação Física: '     || coalesce(v_pat.score_ed_fisica, 0)        || ' pontos - ' || public._classify_area_pct(coalesce(v_pat.score_ed_fisica, 0), v_max_area)
  );

  v_escola := case when coalesce(v_pat.escola_publica, false) then 'Municipal' else null end;
  v_trabalho := case when coalesce(v_pat.trabalho_na_roca, false) then 'Informal/Roça' else null end;

  v_cpf_clean := nullif(regexp_replace(coalesce(v_pat.cpf, ''), '[^0-9]', '', 'g'), '');

  -- Procura a triagem mais recente do paciente (CPF normalizado OU nome).
  if v_cpf_clean is not null then
    select id into v_triagem_id
      from public.triagens
     where company_id = p_company_id
       and regexp_replace(coalesce(cpf, ''), '[^0-9]', '', 'g') = v_cpf_clean
     order by created_at desc
     limit 1;
  end if;

  if v_triagem_id is null and coalesce(v_pat.name, '') <> '' then
    select id into v_triagem_id
      from public.triagens
     where company_id = p_company_id
       and lower(btrim(coalesce(nome, ''))) = lower(btrim(v_pat.name))
     order by created_at desc
     limit 1;
  end if;

  -- Pula a trigger autolink durante o write (evita loop e impede que
  -- respostas antigas sobrescrevam os scores manuais que acabamos de gravar).
  perform set_config('app.skip_autolink', 'on', true);

  if v_triagem_id is null then
    -- Cria triagem sintetica. respostas=null sinaliza "sem questionario";
    -- o app Triagem usa parsePontosTotal(resultado) na lista, entao mostra
    -- o score correto mesmo sem respostas detalhadas.
    insert into public.triagens (
      company_id, nome, cpf, resultado, respostas,
      tipo_escola, trabalho_pais, data
    ) values (
      p_company_id, v_pat.name, v_pat.cpf, v_resultado, null,
      v_escola, v_trabalho,
      to_char(now() at time zone 'UTC', 'DD/MM/YYYY')
    );
  else
    update public.triagens set
      resultado     = v_resultado,
      tipo_escola   = coalesce(v_escola, tipo_escola),
      trabalho_pais = coalesce(v_trabalho, trabalho_pais)
    where id = v_triagem_id;
  end if;

  -- Limpa a flag dentro da transacao (set_config 'is_local' = true ja garante
  -- que ela so vale ate o COMMIT, mas zeramos por seguranca).
  perform set_config('app.skip_autolink', '', true);
end;
$$;

revoke all on function public._sync_triagem_from_patient_scores(bigint, bigint) from public;

-- 3) Trigger autolink: respeita flag anti-loop -------------------------------
create or replace function public._tg_triagens_autolink()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if coalesce(current_setting('app.skip_autolink', true), '') = 'on' then
    return new;
  end if;
  if new.respostas is null or btrim(new.respostas) = '' then
    return new;
  end if;
  begin
    perform public._autolink_triagem_internal(new.company_id, new.id);
  exception when others then
    raise warning 'autolink_triagem falhou para triagem %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

-- 4) upsert_patient: dispara sync ao final se score foi enviado --------------
-- Reaproveita o corpo do 0012 (mesma assinatura, sem DROP).
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
  v_name          text;
  v_score_changed boolean;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  v_name := nullif(btrim(coalesce(p_payload->>'name', '')), '');

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
  );

  if p_id is null then
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

  if v_score_changed then
    -- Reflete a edicao manual em triagens, para o app Triagem mostrar
    -- o mesmo score que a Gestao acabou de gravar. Best-effort: nao
    -- bloqueia o save em caso de falha.
    begin
      perform public._sync_triagem_from_patient_scores(v_company_id, v_row.id);
    exception when others then
      raise warning 'sync triagem falhou para paciente %: %', v_row.id, sqlerrm;
    end;
  end if;

  return v_row;
end;
$$;

revoke all on function public.upsert_patient(text, text, bigint, jsonb) from public;
grant execute on function public.upsert_patient(text, text, bigint, jsonb) to anon, authenticated;

commit;
