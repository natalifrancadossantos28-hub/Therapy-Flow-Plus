-- 0129 — Triagem 86: encaminhamento à fila das 3 especialidades com maior
-- pontuação elegível (≥ 9 pontos = sinalização moderada ou alta).
-- Aditiva e idempotente: só acrescenta a coluna triagens_86.encaminhamento e
-- recria funções da Triagem 86. Não apaga nem altera pacientes, filas,
-- triagens antigas ou a ABC. Quem já está numa fila mantém a data de entrada.
-- Empate: maior % das respostas válidas; depois a ordem
-- Fono, Psico, TO, Fisio, Psicomotricidade, Nutrição, Ed. Física.

alter table public.triagens_86 add column if not exists encaminhamento jsonb;

create or replace function public._t86_to_json(t public.triagens_86)
returns jsonb language sql immutable as $$
  select jsonb_build_object('id', t.id, 'patientId', t.patient_id, 'respostas', t.respostas,
    'social', t.social, 'resultado', t.resultado, 'responsavel', t.responsavel, 'createdAt', t.created_at,
    'encaminhamento', t.encaminhamento);
$$;

create or replace function public._t86_encaminhar(p_company_id bigint, p_triagem_id bigint)
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_row      public.triagens_86%rowtype;
  v_patient  public.patients%rowtype;
  v_nome     jsonb := jsonb_build_object('F', 'Fonoaudiologia', 'P', 'Psicologia', 'TO', 'Terapia Ocupacional',
                 'FI', 'Fisioterapia', 'PM', 'Psicomotricidade', 'N', 'Nutrição', 'EF', 'Educação Física');
  v_areas    jsonb := '[]'::jsonb;
  v_pts      jsonb := '{}'::jsonb;
  v_top      text[] := array[]::text[];
  v_existing text[] := array[]::text[];
  v_new      text[] := array[]::text[];
  v_added    text[] := array[]::text[];
  v_raw      int := 0;
  v_priority text;
  v_reason   text;
  v_enc      jsonb;
  v_sel      boolean;
  r          record;
begin
  select * into v_row from public.triagens_86 where id = p_triagem_id and company_id = p_company_id for update;
  if not found then raise exception 'triagem não encontrada'; end if;
  if v_row.encaminhamento is not null then return v_row.encaminhamento; end if;
  select * into v_patient from public.patients where id = v_row.patient_id and company_id = p_company_id;

  for r in
    with ar as (select k, ord from unnest(array['F','P','TO','FI','PM','N','EF']) with ordinality u(k, ord)),
    rs as (select substring(key from '^([A-Z]+)\d{2}$') k, value #>> '{}' val from jsonb_each(v_row.respostas)),
    s as (
      select ar.k, ar.ord,
             coalesce(sum(rs.val::int) filter (where rs.val ~ '^[0-3]$'), 0)::int pontos,
             count(*) filter (where rs.val ~ '^[0-3]$')::int respondidas
        from ar left join rs on rs.k = ar.k group by ar.k, ar.ord)
    select *, case when respondidas > 0 then pontos::numeric / (respondidas * 3) else 0 end pct
      from s order by pontos desc, pct desc, ord
  loop
    v_raw := v_raw + r.pontos;
    v_sel := r.pontos >= 9 and coalesce(array_length(v_top, 1), 0) < 3;
    if v_sel then v_top := array_append(v_top, v_nome->>r.k); end if;
    v_pts := v_pts || jsonb_build_object(v_nome->>r.k, r.pontos);
    v_areas := v_areas || jsonb_build_array(jsonb_build_object('especialidade', v_nome->>r.k, 'pontos', r.pontos,
      'respondidas', r.respondidas, 'encaminhada', v_sel));
  end loop;

  if coalesce(v_patient.tipo_registro, '') = 'Registro Censo Municipal'
     or v_patient.status in ('Alta', 'Óbito', 'Desistência') then
    v_reason := 'blocked_status';
  elsif array_length(v_top, 1) is null then
    v_reason := 'no_eligible_specialties';
  else
    select coalesce(array_agg(coalesce(specialty, '')), array[]::text[]) into v_existing
      from public.waiting_list where patient_id = v_patient.id and company_id = p_company_id;
    select coalesce(array_agg(s), array[]::text[]) into v_new from unnest(v_top) s where not (s = any(v_existing));
    if array_length(v_new, 1) is not null then
      v_priority := public._calc_priority(round(v_raw * 4.0 / 3.0)::int, coalesce(v_patient.escola_publica, false),
        coalesce(v_patient.trabalho_na_roca, false),
        coalesce(v_patient.local_atendimento, '') in ('Sem Atendimento', 'Nenhum'));
      with ins as (
        insert into public.waiting_list (company_id, patient_id, specialty, priority, notes, entry_date)
        select p_company_id, v_patient.id, s, v_priority,
               format('Triagem multidisciplinar #%s · %s/30 pts', v_row.id, v_pts->>s),
               to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')
          from unnest(v_new) s
        returning specialty
      ) select coalesce(array_agg(specialty), array[]::text[]) into v_added from ins;
      if array_length(v_added, 1) is not null then
        update public.patients set status = 'Fila de Espera'
         where id = v_patient.id and company_id = p_company_id and status not in ('Atendimento');
      end if;
    end if;
    v_reason := case when array_length(v_added, 1) is not null then null
                     when array_length(v_new, 1) is null then 'all_already_queued' else 'not_inserted' end;
  end if;

  v_enc := jsonb_build_object('em', now(), 'origem', 'triagem_86',
    'criterio', '3 maiores pontuações com 9 pontos ou mais',
    'areas', v_areas, 'encaminhadas', to_jsonb(v_top), 'adicionadas', to_jsonb(v_added),
    'jaNaFila', to_jsonb(array(select s from unnest(v_top) s where s = any(v_existing))),
    'prioridade', v_priority, 'reason', v_reason);
  update public.triagens_86 set encaminhamento = v_enc where id = v_row.id;
  return v_enc;
end;
$$;
revoke all on function public._t86_encaminhar(bigint, bigint) from public, anon, authenticated;

create or replace function public._t86_resposta(p_triagem_id bigint)
returns jsonb language sql stable security definer
set search_path = public, extensions, pg_temp as $$
  select jsonb_build_object('triagem', public._t86_to_json(t), 'patientId', t.patient_id,
    'encaminhamento', t.encaminhamento,
    'addedToQueue', coalesce(jsonb_array_length(t.encaminhamento->'adicionadas'), 0) > 0,
    'linkedOnly', coalesce(jsonb_array_length(t.encaminhamento->'adicionadas'), 0) = 0,
    'specialties', coalesce(t.encaminhamento->'encaminhadas', '[]'::jsonb),
    'addedSpecialties', coalesce(t.encaminhamento->'adicionadas', '[]'::jsonb),
    'existingSpecialties', coalesce(t.encaminhamento->'jaNaFila', '[]'::jsonb),
    'priority', t.encaminhamento->>'prioridade',
    'reason', case when t.encaminhamento is null then 'pending' else t.encaminhamento->>'reason' end)
  from public.triagens_86 t where t.id = p_triagem_id;
$$;
revoke all on function public._t86_resposta(bigint) from public, anon, authenticated;

drop function if exists public.save_triagem_86(text, text, bigint, jsonb, jsonb, text);
create or replace function public.save_triagem_86(
  p_slug text, p_password text, p_patient_id bigint,
  p_respostas jsonb, p_social jsonb default '{}'::jsonb, p_responsavel text default null,
  p_enfileirar boolean default true
)
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_company_id bigint;
  v_patient    public.patients%rowtype;
  v_row        public.triagens_86%rowtype;
  v_cols       jsonb := jsonb_build_object('F', 'score_fonoaudiologia', 'P', 'score_psicologia', 'TO', 'score_to',
                   'FI', 'score_fisioterapia', 'PM', 'score_psicomotricidade', 'N', 'score_nutricionista', 'EF', 'score_ed_fisica');
  v_sums       jsonb := '{}'::jsonb;
  v_raw_tot    int := 0;
  r            record;
  k            text;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  select * into v_patient from public.patients where id = p_patient_id and company_id = v_company_id;
  if not found then raise exception 'paciente não encontrado'; end if;
  if p_respostas is null or jsonb_typeof(p_respostas) <> 'object' then raise exception 'respostas inválidas'; end if;

  for k in select jsonb_object_keys(v_cols) loop v_sums := v_sums || jsonb_build_object(k, 0); end loop;
  for r in select key, value #>> '{}' as val from jsonb_each(p_respostas) loop
    k := substring(r.key from '^([A-Z]+)\d{2}$');
    if k is not null and v_cols ? k and r.val ~ '^[0-3]$' then
      v_sums := jsonb_set(v_sums, array[k], to_jsonb((v_sums->>k)::int + r.val::int));
      v_raw_tot := v_raw_tot + r.val::int;
    end if;
  end loop;

  insert into public.triagens_86 (company_id, patient_id, respostas, social, resultado, responsavel)
  values (v_company_id, p_patient_id, p_respostas, coalesce(p_social, '{}'::jsonb),
          jsonb_build_object('somas', v_sums), nullif(btrim(coalesce(p_responsavel, '')), ''))
  returning * into v_row;

  update public.patients set
    triagem_score          = round(v_raw_tot * 4.0 / 3.0)::int,
    score_fonoaudiologia   = round((v_sums->>'F')::int  * 1.5)::int,
    score_psicologia       = round((v_sums->>'P')::int  * 1.5)::int,
    score_to               = round((v_sums->>'TO')::int * 1.5)::int,
    score_fisioterapia     = round((v_sums->>'FI')::int * 1.5)::int,
    score_psicomotricidade = round((v_sums->>'PM')::int * 1.5)::int,
    score_nutricionista    = round((v_sums->>'N')::int  * 1.5)::int,
    score_ed_fisica        = round((v_sums->>'EF')::int * 1.5)::int
  where id = p_patient_id and company_id = v_company_id;

  if coalesce(p_enfileirar, true) then
    perform public._t86_encaminhar(v_company_id, v_row.id);
  end if;
  return public._t86_resposta(v_row.id) || jsonb_build_object('patientName', v_patient.name);
end;
$$;
revoke all on function public.save_triagem_86(text, text, bigint, jsonb, jsonb, text, boolean) from public;
grant execute on function public.save_triagem_86(text, text, bigint, jsonb, jsonb, text, boolean) to anon, authenticated;

-- Conclui o fluxo do cadastro (Triagem → ABC): encaminha a triagem já salva.
-- Idempotente: se já foi encaminhada, só devolve o registro.
create or replace function public.encaminhar_triagem_86(p_slug text, p_password text, p_triagem_id bigint)
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_company_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  perform public._t86_encaminhar(v_company_id, p_triagem_id);
  return public._t86_resposta(p_triagem_id);
end;
$$;
revoke all on function public.encaminhar_triagem_86(text, text, bigint) from public;
grant execute on function public.encaminhar_triagem_86(text, text, bigint) to anon, authenticated;
