-- 0130 — Fila: alternância por idade, alerta de risco, sem limite de 3 áreas.
--
-- Aprovado pela coordenação após simulação (só leitura) da fila atual.
--  • Triagem 86 encaminha automaticamente para TODAS as áreas com ≥ 9 pontos
--    (antes: só as 3 maiores). Bebê < 2 anos entra também na Fisioterapia
--    (estimulação precoce), mesmo sem pontuação de Fisio.
--  • Ordem da fila em cada especialidade:
--      1. Urgência: alerta de risco na última Triagem 86 (PR01 perda de
--         habilidades, PR02 autoagressão, PR03 agressão a outros, PR05
--         alimentação/deglutição, PR08 desregulação intensa).
--      2. Alternância: 1 criança de 0–5 anos, 1 de 6+ (começa pela pequena;
--         grupo vazio → segue o outro). Sem data de nascimento → fim da fila.
--      3. Dentro de cada grupo: Prioridade Máxima (abrigo; na Fisio bebê < 2
--         anos ou idade < 5 com demanda de Fisio confirmada) → demanda pelo
--         diagnóstico → resto. Escola particular / terapia particular vão pra
--         trás. Fono passa a seguir a ordem de chegada, como as demais
--         (Fisio continua por pontuação).
--  • Bebês < 2 anos já cadastrados e ainda sem Fisio entram na fila da Fisio.
--  Não apaga nem altera datas de entrada; o histórico (trigger 0119) registra
--  as novas entradas.

create or replace function public._t86_encaminhar(p_company_id bigint, p_triagem_id bigint)
returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_row      public.triagens_86%rowtype;
  v_patient  public.patients%rowtype;
  v_nome     jsonb := jsonb_build_object('F', 'Fonoaudiologia', 'P', 'Psicologia', 'TO', 'Terapia Ocupacional',
                 'FI', 'Fisioterapia', 'PM', 'Psicomotricidade', 'N', 'Nutrição');
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
    with ar as (select k, ord from unnest(array['F','P','TO','FI','PM','N']) with ordinality u(k, ord)),
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
    v_sel := r.pontos >= 9;
    if v_sel then v_top := array_append(v_top, v_nome->>r.k); end if;
    v_pts := v_pts || jsonb_build_object(v_nome->>r.k, r.pontos);
    v_areas := v_areas || jsonb_build_array(jsonb_build_object('especialidade', v_nome->>r.k, 'pontos', r.pontos,
      'respondidas', r.respondidas, 'encaminhada', v_sel));
  end loop;

  if v_patient.date_of_birth ~ '^\d{4}-\d{2}-\d{2}'
     and v_patient.date_of_birth::date > (current_date - interval '24 months')
     and not ('Fisioterapia' = any(v_top)) then
    v_top := array_append(v_top, 'Fisioterapia');
  end if;

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
               case when s = 'Fisioterapia' and coalesce((v_pts->>s)::int, 0) < 9
                    then format('Triagem multidisciplinar #%s · estimulação precoce (bebê < 2 anos)', v_row.id)
                    else format('Triagem multidisciplinar #%s · %s/30 pts', v_row.id, v_pts->>s) end,
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
    'criterio', 'todas as áreas com 9 pontos ou mais (+ Fisio para bebê < 2 anos)',
    'areas', v_areas, 'encaminhadas', to_jsonb(v_top), 'adicionadas', to_jsonb(v_added),
    'jaNaFila', to_jsonb(array(select s from unnest(v_top) s where s = any(v_existing))),
    'prioridade', v_priority, 'reason', v_reason);
  update public.triagens_86 set encaminhamento = v_enc where id = v_row.id;
  return v_enc;
end;
$$;
revoke all on function public._t86_encaminhar(bigint, bigint) from public, anon, authenticated;

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
  t86 as (
    select distinct on (t.patient_id) t.patient_id,
           t.resultado->'somas'->>'FI' as fi_pts,
           array(select e.key from jsonb_each_text(t.respostas) e
                  where e.key in ('PR01','PR02','PR03','PR05','PR08') and e.value = 'sim'
                  order by e.key) as riscos
      from public.triagens_86 t
     where t.company_id = v_company_id
     order by t.patient_id, t.created_at desc, t.id desc
  ),
  base as (
    select
      w.id, w.company_id, w.patient_id, w.professional_id,
      w.specialty   as w_specialty, w.notes, w.entry_date, w.created_at, w.updated_at,
      coalesce(w.paused, false) as w_paused,
      w.paused_at      as w_paused_at,
      w.paused_reason  as w_paused_reason,
      w.paused_return_date as w_paused_return_date,
      w.paused_origin  as w_paused_origin,
      p.name              as p_name,
      p.phone             as p_phone,
      p.prontuario        as p_prontuario,
      p.date_of_birth     as p_dob,
      p.triagem_score     as p_triagem,
      coalesce(p.escola_publica, false)        as p_escola,
      p.escola_publica                         as p_escola_raw,
      coalesce(t86.riscos, array[]::text[])    as t_riscos,
      t86.fi_pts                               as t_fi,
      coalesce(p.trabalho_na_roca, false)      as p_trabalho,
      p.trabalho_pais     as p_trabalho_pais,
      coalesce(p.abrigo_casa_crianca, false)   as p_abrigo,
      p.mother_name       as p_mae,
      p.father_name       as p_pai,
      p.local_atendimento as p_local,
      p.outro_atendimento as p_outro,
      p.diagnosis         as p_diag,
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
      left join t86                     on t86.patient_id = w.patient_id
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
      case
        when b.p_dob is null or btrim(b.p_dob) = '' then null
        else (extract(year from age(current_date, b.p_dob::date)) * 12
              + extract(month from age(current_date, b.p_dob::date)))::int
      end as age_months,
      public._atende_fora(b.p_local, b.p_outro)   as atende_fora,
      public._pais_registrados(b.p_mae, b.p_pai)  as pais_registrados,
      public._fila_atende_fora_tipo(b.p_local, b.p_outro) as fora_tipo,
      public._fila_bonus_trabalho(b.p_trabalho_pais, b.p_trabalho) as bonus_trabalho,
      public._fila_demanda(b.eff_specialty, b.p_diag) as demanda
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
      -- 0130: Prioridade Máxima = abrigo; na Fisio, bebê < 2 anos (estimulação
      -- precoce) ou idade < 5 com demanda de Fisio confirmada na triagem (≥ 9).
      -- A idade sozinha não dá mais Prioridade Máxima na Fono.
      (a.p_abrigo
        or (a.eff_specialty ilike 'fisio%' and a.age_months is not null and a.age_months < 24)
        or (a.eff_specialty ilike 'fisio%'
            and public._fila_prioridade_maxima(a.eff_specialty, a.p_dob, a.p_abrigo)
            and a.fora_tipo is distinct from 'particular'
            and coalesce(a.t_fi ~ '^[0-9]+$' and a.t_fi::int >= 9, false))) as is_maxima,
      (a.eff_specialty ilike 'fisio%' and a.age_months is not null and a.age_months < 24) as is_bebe_fisio,
      (a.age_policy = 'fifo' or a.eff_specialty ilike 'fono%') as is_fifo,
      (coalesce(array_length(a.t_riscos, 1), 0) > 0) as is_urgente,
      (a.p_escola_raw is false or a.fora_tipo = 'particular') as is_particular,
      case when a.age_years is null then null when a.age_years <= 5 then 0 else 1 end as age_grp
    from aged a
  ),
  scored as (
    select e.*,
      case when e.is_fifo then 0 else
        greatest(
          coalesce(
            e.sp_score + e.sp_social + e.age_bonus,
            ((coalesce(e.p_triagem, 0)::numeric * 100.0) / 360.0)::int
              + (case when e.p_escola then 2 else 0 end)
              + e.age_bonus
          ) + e.bonus_trabalho - e.penalidade_fora
          + round(coalesce(e.abc_total, 0) * 72.0 / 158.0)::int,
          0
        )
      end as sort_score
    from enriched e
  ),
  grouped as (
    select s.*,
      row_number() over (
        partition by coalesce(s.eff_specialty, ''), s.w_paused, s.is_urgente, s.age_grp
        order by
          case when s.is_maxima then 0 when s.demanda is not null then 1 else 2 end,
          case when s.is_particular then 1 else 0 end,
          s.sort_score desc, s.entry_date asc, s.id asc
      ) as grp_rank
    from scored s
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
                                    when demanda is not null then 'elevado'
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
        'pausedReturnDate',       w_paused_return_date,
        'pausedOrigin',           w_paused_origin,
        'waitDays',               greatest(0, (current_date - to_date(entry_date, 'YYYY-MM-DD'))),
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
                                     else greatest(sp_score + sp_social + bonus_trabalho - penalidade_fora
                                                   + round(coalesce(abc_total, 0) * 72.0 / 158.0)::int, 0)
                                   end,
        'abcPontos',              case when abc_total is null then null else round(abc_total * 72.0 / 158.0)::int end,
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
                                    when is_bebe_fisio then 'bebe_fisio'
                                    when p_abrigo and age_years is not null and age_years < 5 then 'idade_e_abrigo'
                                    when p_abrigo then 'abrigo'
                                    else 'idade'
                                  end,
        'abcTotal',               abc_total,
        'abcNivel',               abc_nivel,
        'demandaPrioritaria',     demanda
      ) || jsonb_build_object(
        'urgente',                is_urgente,
        'alertaRisco',            to_jsonb(t_riscos),
        'grupoIdade',             case age_grp when 0 then '0-5' when 1 then '6+' else null end,
        'particular',             is_particular,
        'escolaParticular',       (p_escola_raw is false)
      ) as row,
      -- 0130: urgência (alerta de risco da triagem) primeiro; depois alterna
      -- 1 criança de 0–5 anos e 1 de 6+ (começa pela pequena; se um grupo
      -- acabar, segue o outro). Sem data de nascimento vai pro fim.
      row_number() over (
        order by
          case when w_paused then 1 else 0 end asc,
          case when is_urgente then 0 else 1 end asc,
          case when is_urgente then 0 when age_grp is null then 1 else 0 end asc,
          case when is_urgente then 0
               when age_grp is null then grp_rank
               else grp_rank * 2 - (case when age_grp = 0 then 1 else 0 end) end asc,
          case when is_maxima then 0 when demanda is not null then 1 else 2 end asc,
          case when is_particular then 1 else 0 end asc,
          sort_score desc,
          entry_date asc,
          id asc
      ) as ord
      from grouped
  ) s;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;


-- Bebês < 2 anos sem Fisio (nem na fila, nem com profissional de Fisio, nem
-- com agenda de Fisio nos últimos 60 dias / futura) entram na fila da Fisio.
insert into public.waiting_list (company_id, patient_id, specialty, priority, notes, entry_date)
select p.company_id, p.id, 'Fisioterapia', 'elevado',
       'Estimulação precoce (bebê < 2 anos) — regra 0130',
       to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')
  from public.patients p
 where p.date_of_birth ~ '^\d{4}-\d{2}-\d{2}'
   and p.date_of_birth::date > (current_date - interval '24 months')
   and p.date_of_birth::date <= current_date
   and coalesce(p.tipo_registro, '') <> 'Registro Censo Municipal'
   and coalesce(p.status, '') not in ('Alta', 'Óbito', 'Desistência')
   and not exists (select 1 from public.waiting_list w
                    where w.patient_id = p.id and w.specialty ilike 'fisio%')
   and not exists (select 1 from public.professionals pr
                    where pr.id = p.professional_id and pr.specialty ilike 'fisio%')
   and not exists (select 1 from public.appointments ap
                     join public.professionals pr on pr.id = ap.professional_id
                    where ap.patient_id = p.id and pr.specialty ilike 'fisio%'
                      and ap."date" >= to_char(current_date - 60, 'YYYY-MM-DD'));
