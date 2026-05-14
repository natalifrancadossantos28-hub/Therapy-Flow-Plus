-- Migration: Adiciona parametro p_skip_triagem ao add_patient_to_waiting_list
-- Permite que admin e pacientes antigos (prontuario < 500) ignorem a exigencia
-- de triagem ao serem encaminhados internamente.

create or replace function public.add_patient_to_waiting_list(
  p_slug text, p_password text, p_patient_id bigint, p_specialty text, p_notes text default null, p_skip_triagem boolean default false
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
  -- So exige triagem se p_skip_triagem = false
  if not p_skip_triagem and v_patient.triagem_score is null then
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
                 and btrim(v_patient.date_of_birth) <> ''
                 and extract(year from age(current_date, v_patient.date_of_birth::date)) < 5;
  v_is_abrigo := coalesce(v_patient.abrigo_casa_crianca, false);
  if v_is_under5 or v_is_abrigo then
    v_priority := 'maxima';
  elsif v_patient.triagem_score is null then
    -- Paciente sem triagem (legado) entra com prioridade verde (mais baixa)
    v_priority := 'verde';
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
revoke all on function public.add_patient_to_waiting_list(text, text, bigint, text, text, boolean) from public;
grant execute on function public.add_patient_to_waiting_list(text, text, bigint, text, text, boolean) to anon, authenticated;
