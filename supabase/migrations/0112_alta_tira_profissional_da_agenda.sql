-- 0112 — Alta/Desistência por especialidade tira o paciente da agenda do
-- profissional em qualquer caso.
--
-- Problema (Benício 304 × Ariane): a alta na agenda da profissional não
-- removeu a série futura dela nem a projeção "Atendimento Multi com Ariane"
-- gravada nas linhas do parceiro (Miguel). O paciente continuava aparecendo
-- na grade da Ariane em todas as visões.
--
-- discharge_patient_specialty apagava a agenda futura só pela ESPECIALIDADE
-- do profissional. Agora, além disso:
--   1. quando p_professional_id é informado, corta e apaga também as séries
--      futuras desse profissional (mesmo que a especialidade cadastrada nele
--      esteja escrita diferente da recebida);
--   2. limpa a etiqueta "Atendimento Multi com <profissional>" das linhas dos
--      outros profissionais daqui em diante — é ela que projeta o card na
--      agenda de quem saiu. O parceiro continua atendendo normalmente;
--   3. devolve quantas linhas/etiquetas foram removidas para o front conferir.
-- Histórico (datas anteriores a hoje) não é alterado.

create or replace function public.discharge_patient_specialty(
  p_slug            text,
  p_password        text,
  p_patient_id      bigint,
  p_specialty       text,
  p_professional_id bigint default null,
  p_tipo            text   default 'Alta',
  p_reason          text   default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_patient    public.patients%rowtype;
  v_spec       text;
  v_prof_name  text;
  v_today      text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  v_tipo       text := coalesce(nullif(btrim(p_tipo), ''), 'Alta');
  v_restantes  text[];
  v_global     boolean;
  v_novo       text;
  v_removidos  integer := 0;
  v_multi      integer := 0;
  v_n          integer;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  v_spec := nullif(btrim(coalesce(p_specialty, '')), '');

  select * into v_patient from public.patients
   where id = p_patient_id and company_id = v_company_id;
  if not found then raise exception 'patient not found'; end if;

  if p_professional_id is not null then
    select pr.name into v_prof_name
      from public.professionals pr
     where pr.id = p_professional_id and pr.company_id = v_company_id;
    -- Sem especialidade informada, usa a do profissional.
    if v_spec is null then
      select nullif(btrim(coalesce(pr.specialty, '')), '') into v_spec
        from public.professionals pr
       where pr.id = p_professional_id and pr.company_id = v_company_id;
    end if;
  end if;

  if v_spec is not null then
    insert into public.patient_specialty_discharges
      (company_id, patient_id, specialty, professional_id, tipo, reason)
    values (v_company_id, p_patient_id, v_spec, p_professional_id, v_tipo, p_reason)
    on conflict (company_id, patient_id, lower(btrim(specialty)))
      do update set professional_id = excluded.professional_id,
                    tipo            = excluded.tipo,
                    reason          = excluded.reason,
                    discharged_at   = now();

    delete from public.waiting_list w
     where w.company_id = v_company_id
       and w.patient_id = p_patient_id
       and lower(btrim(coalesce(w.specialty, ''))) = lower(v_spec);
  end if;

  -- Corte das séries (da especialidade e/ou do profissional): sem isso
  -- `estender_recorrencias` recriaria as ocorrências apagadas logo abaixo.
  insert into public.recurrence_cuts (company_id, recurrence_group_id, cut_from)
  select distinct v_company_id, a.recurrence_group_id, v_today
    from public.appointments a
    join public.professionals pr
      on pr.id = a.professional_id and pr.company_id = a.company_id
   where a.company_id = v_company_id
     and a.patient_id = p_patient_id
     and a.recurrence_group_id is not null
     and btrim(a.recurrence_group_id) <> ''
     and (
       (v_spec is not null and lower(btrim(coalesce(pr.specialty, ''))) = lower(v_spec))
       or (p_professional_id is not null and a.professional_id = p_professional_id)
     )
  on conflict (company_id, recurrence_group_id) do update
    set cut_from = least(public.recurrence_cuts.cut_from, excluded.cut_from);

  delete from public.appointments a
   using public.professionals pr
   where a.company_id = v_company_id
     and a.patient_id = p_patient_id
     and pr.id = a.professional_id
     and pr.company_id = a.company_id
     and a."date" >= v_today
     and (
       (v_spec is not null and lower(btrim(coalesce(pr.specialty, ''))) = lower(v_spec))
       or (p_professional_id is not null and a.professional_id = p_professional_id)
     );
  get diagnostics v_removidos = row_count;

  -- Projeção do Atendimento Multi na agenda de quem saiu: a linha real é do
  -- parceiro (que segue atendendo); só a etiqueta é limpa, daqui em diante.
  if v_prof_name is not null and btrim(v_prof_name) <> '' then
    update public.appointments a
       set notes = ''
     where a.company_id = v_company_id
       and a.patient_id = p_patient_id
       and a."date" >= v_today
       and a.professional_id is distinct from p_professional_id
       and a.notes is not null
       and lower(a.notes) like lower('Atendimento Multi com ' || btrim(v_prof_name)) || '%';
    get diagnostics v_n = row_count;
    v_multi := v_multi + v_n;
  end if;

  v_restantes := public._especialidades_ativas(v_company_id, p_patient_id, v_spec);

  -- Óbito encerra o cadastro inteiro. Alta, Desistência e as saídas sem
  -- avaliação (não iniciou / falta) valem só para a especialidade: o cadastro
  -- só é encerrado quando não sobra nenhuma área ativa.
  v_global := v_tipo in ('Óbito', 'Obito')
              or coalesce(array_length(v_restantes, 1), 0) = 0;

  if v_global then
    v_novo := case when v_tipo in ('Óbito', 'Obito', 'Desistência', 'Desistencia')
                   then v_tipo else 'Alta' end;
  elsif exists (
    select 1 from public.waiting_list w
     where w.company_id = v_company_id and w.patient_id = p_patient_id
  ) then
    v_novo := 'Fila de Espera';
  else
    v_novo := 'Atendimento';
  end if;

  update public.patients
     set status = v_novo, updated_at = now()
   where id = p_patient_id and company_id = v_company_id;

  return jsonb_build_object(
    'ok',                   true,
    'patientId',            p_patient_id,
    'specialty',            v_spec,
    'professionalId',       p_professional_id,
    'tipo',                 v_tipo,
    'statusGlobal',         v_novo,
    'altaGlobalAplicada',   v_global,
    'especialidadesAtivas', to_jsonb(v_restantes),
    'agendaRemovida',       v_removidos,
    'multiLimpos',          v_multi
  );
end;
$$;

revoke all on function public.discharge_patient_specialty(text, text, bigint, text, bigint, text, text) from public;
grant execute on function public.discharge_patient_specialty(text, text, bigint, text, bigint, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
