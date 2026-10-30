-- 0135 — Critérios técnicos com validação explícita de urgência.
-- Alerta de risco/TEA/ABC, por si só, NÃO muda a posição.
-- Ordem: urgência validada; bebês <2 na Fisio; alternância 0–5/6+;
-- ordem de chegada dentro de cada grupo. Escola particular CONFIRMADA
-- ou terapia fora ficam após a fila regular, salvo urgência validada.
-- Nutrição sem laudo permanece no fim; pausados não disputam vaga.
-- Não altera respostas, datas ou diagnóstico. Validações têm histórico.

begin;
-- Dado explícito: ausência de matrícula municipal não significa escola particular.
alter table public.patients add column if not exists escola_particular_confirmada boolean;
create table if not exists public.fila_criterios_validacoes (
  id bigserial primary key,
  company_id bigint not null references public.ponto_companies(id) on delete cascade,
  waiting_list_id bigint not null references public.waiting_list(id) on delete cascade,
  urgente boolean not null default false,
  escola_particular boolean not null default false,
  responsavel text not null check (length(btrim(responsavel)) > 0),
  justificativa text not null check (length(btrim(justificativa)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists fila_criterios_validacoes_entry_idx
  on public.fila_criterios_validacoes(company_id, waiting_list_id, created_at desc, id desc);
alter table public.fila_criterios_validacoes enable row level security;
revoke all on public.fila_criterios_validacoes from anon, authenticated;

create or replace function public.validar_criterios_fila(
  p_slug text, p_password text, p_waiting_list_id bigint,
  p_urgente boolean, p_escola_particular boolean,
  p_responsavel text, p_justificativa text, p_expected_id bigint default null
) returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_company_id bigint; v_last_id bigint; v_row public.fila_criterios_validacoes%rowtype;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  perform 1 from public.waiting_list where id=p_waiting_list_id and company_id=v_company_id for update;
  if not found then raise exception 'Entrada da fila não encontrada'; end if;
  if p_urgente is null or p_escola_particular is null
    or nullif(btrim(p_responsavel),'') is null or nullif(btrim(p_justificativa),'') is null then
    raise exception 'Informe os critérios, o responsável técnico e a justificativa';
  end if;
  select id into v_last_id from public.fila_criterios_validacoes
    where company_id=v_company_id and waiting_list_id=p_waiting_list_id
    order by created_at desc, id desc limit 1;
  if v_last_id is distinct from p_expected_id then
    raise exception 'Os critérios foram alterados por outra pessoa. Atualize a fila e revise novamente';
  end if;
  update public.patients p set escola_particular_confirmada=p_escola_particular
    from public.waiting_list w where w.id=p_waiting_list_id and w.company_id=v_company_id
      and p.id=w.patient_id and p.company_id=v_company_id;
  insert into public.fila_criterios_validacoes(company_id,waiting_list_id,urgente,escola_particular,responsavel,justificativa)
    values(v_company_id,p_waiting_list_id,p_urgente,p_escola_particular,btrim(p_responsavel),btrim(p_justificativa))
    returning * into v_row;
  return jsonb_build_object('id',v_row.id,'urgente',v_row.urgente,'escolaParticular',v_row.escola_particular,
    'responsavel',v_row.responsavel,'justificativa',v_row.justificativa,'createdAt',v_row.created_at);
end;
$$;
revoke all on function public.validar_criterios_fila(text,text,bigint,boolean,boolean,text,text,bigint) from public;
grant execute on function public.validar_criterios_fila(text,text,bigint,boolean,boolean,text,text,bigint) to anon, authenticated;

-- Chaves clínicas: profissionais da mesma área contam uma única vez.
-- Transporte e atividades destinadas a mães/responsáveis não são terapia da criança.
create or replace function public._fila_especialidade_clinica(p_specialty text)
returns text language sql immutable set search_path=public,extensions,pg_temp as $$
  with nome as (
    select btrim(regexp_replace(translate(lower(coalesce(p_specialty,'')),
      'áàâãéêíóôõúç','aaaaeeiooouc'),'[^a-z0-9]+',' ','g')) as s
  )
  select case
    when s ~ 'parental|pilates|maes|responsav|motorista|transporte' then null
    when s like 'psicolog%' then 'psicologia'
    when s like 'psicomot%' then 'psicomotricidade'
    when s like 'psicoped%' then 'psicopedagogia'
    when s like 'fono%' then 'fonoaudiologia'
    when s like 'terapia ocup%' or s in ('to','t o') then 'terapia ocupacional'
    when s like 'fisio%' then 'fisioterapia'
    when s like 'nutri%' then 'nutricao'
    when s like 'educacao fisica%' or s='ed fisica' then 'educacao fisica'
    else null end from nome;
$$;
revoke all on function public._fila_especialidade_clinica(text) from public;

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

  with hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d),
  atendimentos_atuais as (
    select a.patient_id, public._fila_especialidade_clinica(pr.specialty) as especialidade
    from public.appointments a
    join public.professionals pr on pr.id=a.professional_id and pr.company_id=a.company_id
    cross join hoje h
    where a.company_id=v_company_id
      and a."date" between to_char(h.d,'YYYY-MM-DD') and to_char(h.d+60,'YYYY-MM-DD')
      and not coalesce(a.paused,false)
      and lower(coalesce(a.status,'')) in ('agendado','presente','atendimento','ativo','em_atendimento','em atendimento')
      and public._fila_especialidade_clinica(pr.specialty) is not null
      and not exists (
        select 1 from public.patient_specialty_discharges sd
        where sd.company_id=a.company_id and sd.patient_id=a.patient_id
          and public._fila_especialidade_clinica(sd.specialty)=public._fila_especialidade_clinica(pr.specialty)
      )
      and not exists (
        select 1 from public.recurrence_cuts rc where rc.company_id=a.company_id
          and rc.recurrence_group_id=a.recurrence_group_id and a."date">=rc.cut_from
      )
      -- Uma primeira avaliação apenas agendada ainda não é terapia iniciada.
      and (lower(a.status) in ('presente','atendimento','ativo','em_atendimento','em atendimento')
        or exists (
          select 1 from public.appointments hist
          join public.professionals hp on hp.id=hist.professional_id and hp.company_id=hist.company_id
          where hist.company_id=a.company_id and hist.patient_id=a.patient_id
            and hist."date"<=to_char(h.d,'YYYY-MM-DD')
            and lower(coalesce(hist.status,'')) in ('presente','atendimento','ativo','em_atendimento','em atendimento')
            and public._fila_especialidade_clinica(hp.specialty)=public._fila_especialidade_clinica(pr.specialty)
        ))
  ), cobertura as (
    select patient_id,count(distinct especialidade)::int as n_ativas,
      array_agg(distinct especialidade order by especialidade) as areas_ativas
    from atendimentos_atuais group by patient_id
  ), criterios as (
    select distinct on (waiting_list_id) * from public.fila_criterios_validacoes
    where company_id=v_company_id order by waiting_list_id,created_at desc,id desc
  ), abc as (
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
      coalesce(cob.n_ativas,0) as n_ativas, coalesce(cob.areas_ativas,array[]::text[]) as areas_ativas,
      cv.id as validacao_id, cv.urgente as urgencia_validada, p.escola_particular_confirmada as escola_particular_validada,
      cv.responsavel as criterios_responsavel, cv.justificativa as criterios_justificativa,
      w.specialty   as w_specialty, w.notes, w.entry_date, w.created_at, w.updated_at,
      coalesce(w.paused, false) as w_paused,
      w.paused_at      as w_paused_at,
      w.paused_reason  as w_paused_reason,
      w.paused_return_date as w_paused_return_date,
      w.paused_origin  as w_paused_origin,
      coalesce(w.sem_laudo, false) as w_sem_laudo,
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
      left join cobertura cob on cob.patient_id=w.patient_id
      left join criterios cv on cv.waiting_list_id=w.id
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
      -- Estimulação precoce: o bebê tem prioridade na fila da Fisioterapia.
      (a.eff_specialty ilike 'fisio%' and a.age_months between 0 and 23) as is_maxima,
      (a.eff_specialty ilike 'fisio%' and a.age_months between 0 and 23) as is_bebe_fisio,
      true as is_fifo,
      coalesce(a.urgencia_validada,false) as is_urgente,
      (coalesce(a.escola_particular_validada,false) or a.atende_fora) as is_particular,
      (a.w_sem_laudo and a.eff_specialty ilike 'nutri%') as is_sem_laudo,
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
        partition by coalesce(s.eff_specialty, ''), s.w_paused, s.is_sem_laudo, s.is_urgente, s.is_particular, least(s.n_ativas,2), s.is_bebe_fisio, s.age_grp
        order by nullif(btrim(s.entry_date),'') asc nulls last, s.created_at asc nulls last, s.id asc
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
        'ordenacao',              'tecnica_validada',
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
        'especialidadesAtivas',   n_ativas,
        'areasAtivas',            to_jsonb(areas_ativas),
        'urgente',                is_urgente,
        'alertaRisco',            to_jsonb(t_riscos),
        'grupoIdade',             case age_grp when 0 then '0-5' when 1 then '6+' else null end,
        'particular',             is_particular,
        'escolaParticular',       coalesce(escola_particular_validada,false),
        'criteriosValidacaoId',   validacao_id,
        'criteriosResponsavel',   criterios_responsavel,
        'criteriosJustificativa', criterios_justificativa,
        'semLaudo',               is_sem_laudo
      ) as row,
      -- Validação técnica, depois grupos etários em alternância e chegada.
      row_number() over (
        order by
          case when w_paused then 1 else 0 end,
          case when is_sem_laudo then 1 else 0 end,
          case when is_sem_laudo or is_urgente then 0 else 1 end,
          -- Urgência validada prevalece; fora da urgência, acesso a escola
          -- particular/terapia fora leva ao bloco final, após toda a fila regular.
          case when is_sem_laudo or is_urgente then 0 when is_particular then 1 else 0 end,
          -- Acesso equitativo: zero terapias, depois uma, depois duas ou mais.
          -- Dentro de cada bloco mantém bebês/Fisio e alternância por idade.
          case when is_sem_laudo or is_urgente then 0 else least(n_ativas,2) end,
          case when is_urgente or is_sem_laudo then 0 when is_bebe_fisio then 0 else 1 end,
          case when nullif(btrim(entry_date),'') is null then 1 else 0 end,
          case when is_urgente or is_sem_laudo or is_bebe_fisio then 0 when age_grp is null then 1 else 0 end,
          case when is_urgente or is_sem_laudo or is_bebe_fisio then 0
               when age_grp is null then grp_rank
               else grp_rank * 2 - (case when age_grp=0 then 1 else 0 end) end,
          nullif(btrim(entry_date),'') asc nulls last,
          created_at asc nulls last,
          id asc
      ) as ord
      from grouped
  ) s;

  return coalesce(v_result, '[]'::jsonb);
end;
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
  v_decisao jsonb; v_prioritaria boolean := false; v_esps text[] := array[]::text[];
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

  -- A escolha final é feita pela triadora. PRxx/diagnóstico não geram urgência.
  -- Apenas novas entradas recebem a decisão; reavaliações não apagam uma
  -- validação de prioridade já existente nem mudam a data de ingresso.
  v_decisao := v_row.social->'prioridadeFila';
  if v_decisao is not null then
    if jsonb_typeof(v_decisao) <> 'object'
      or coalesce(jsonb_typeof(v_decisao->'prioritaria'),'') <> 'boolean' then
      raise exception 'Decisão final de prioridade inválida';
    end if;
    if nullif(btrim(v_row.responsavel),'') is null then raise exception 'Informe o responsável pela decisão final'; end if;
    v_prioritaria := (v_decisao->>'prioritaria')::boolean;
    if v_prioritaria then
      if coalesce(jsonb_typeof(v_decisao->'especialidades'),'') <> 'array'
        or nullif(btrim(v_decisao->>'justificativa'),'') is null
        or nullif(btrim(v_row.responsavel),'') is null then
        raise exception 'Informe especialidades, justificativa e responsável da prioridade';
      end if;
      select coalesce(array_agg(value),array[]::text[]) into v_esps
        from jsonb_array_elements_text(v_decisao->'especialidades');
      if coalesce(array_length(v_esps,1),0)=0 or exists(select 1 from unnest(v_esps) e where not(e=any(v_top))) then
        raise exception 'A prioridade deve indicar uma especialidade elegível da triagem';
      end if;
    end if;
    insert into public.fila_criterios_validacoes(company_id,waiting_list_id,urgente,escola_particular,responsavel,justificativa)
      select p_company_id,w.id,(v_prioritaria and w.specialty=any(v_esps)),coalesce(v_patient.escola_particular_confirmada,false),
        coalesce(nullif(btrim(v_row.responsavel),''),'Triagem'),
        case when v_prioritaria and w.specialty=any(v_esps) then btrim(v_decisao->>'justificativa')
          else 'Decisão final da triagem: sem prioridade de convocação nesta especialidade' end
      from public.waiting_list w
      where w.company_id=p_company_id and w.patient_id=v_patient.id and w.specialty=any(v_added);
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


commit;
