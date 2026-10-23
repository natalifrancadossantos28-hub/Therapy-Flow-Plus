-- =========================================================================
-- 0125_avaliacao_sociofamiliar.sql
--
-- Avaliação Sociofamiliar no prontuário: transporte, cuidados, rede de apoio,
-- sobrecarga do cuidador, alimentação, moradia, barreiras de acesso,
-- interrupção de terapias e situações de proteção social.
--
-- Cada avaliação fica registrada com data, quem avaliou e justificativa.
-- O indicador social é EXPERIMENTAL e fica separado do escore clínico:
-- não entra na fila de espera nem muda a ordem de ninguém.
-- Alertas (ex.: suspeita de violência, fome) aparecem independentemente
-- da pontuação. Não apaga nem altera dados existentes.
-- =========================================================================

begin;

create table if not exists public.avaliacoes_sociofamiliares (
  id                bigserial   primary key,
  company_id        bigint      not null references public.ponto_companies(id) on delete cascade,
  patient_id        bigint      not null references public.patients(id)        on delete cascade,
  professional_id   bigint,
  professional_name text,
  respostas         jsonb       not null default '{}'::jsonb,
  score             int         not null default 0 check (score >= 0),
  score_max         int         not null default 0 check (score_max >= 0),
  alertas           jsonb       not null default '[]'::jsonb,
  justificativa     text        not null,
  observacoes       text,
  created_at        timestamptz not null default now()
);

create index if not exists avaliacoes_sociofamiliares_patient_idx
  on public.avaliacoes_sociofamiliares (company_id, patient_id, created_at desc);

alter table public.avaliacoes_sociofamiliares enable row level security;

create or replace function public._avsf_to_json(a public.avaliacoes_sociofamiliares)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', a.id, 'patientId', a.patient_id,
    'professionalId', a.professional_id, 'professionalName', a.professional_name,
    'respostas', a.respostas, 'score', a.score, 'scoreMax', a.score_max,
    'alertas', a.alertas, 'justificativa', a.justificativa,
    'observacoes', a.observacoes, 'createdAt', a.created_at);
$$;

create or replace function public.create_avaliacao_sociofamiliar(
  p_slug              text,
  p_password          text,
  p_patient_id        bigint,
  p_respostas         jsonb,
  p_score             int,
  p_score_max         int,
  p_alertas           jsonb,
  p_justificativa     text,
  p_professional_id   bigint default null,
  p_professional_name text   default null,
  p_observacoes       text   default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_row        public.avaliacoes_sociofamiliares%rowtype;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  if not exists (select 1 from public.patients p where p.id = p_patient_id and p.company_id = v_company_id) then
    raise exception 'paciente não encontrado';
  end if;
  if jsonb_typeof(coalesce(p_respostas, 'null'::jsonb)) <> 'object' then
    raise exception 'respostas inválidas';
  end if;
  if jsonb_typeof(coalesce(p_alertas, '[]'::jsonb)) <> 'array' then
    raise exception 'alertas inválidos';
  end if;
  if coalesce(p_score, -1) < 0 or coalesce(p_score_max, -1) < 0 or p_score > p_score_max then
    raise exception 'pontuação inválida';
  end if;
  if nullif(btrim(coalesce(p_justificativa, '')), '') is null then
    raise exception 'informe a justificativa / parecer da avaliação';
  end if;

  insert into public.avaliacoes_sociofamiliares (
    company_id, patient_id, professional_id, professional_name,
    respostas, score, score_max, alertas, justificativa, observacoes
  ) values (
    v_company_id, p_patient_id, p_professional_id,
    nullif(btrim(coalesce(p_professional_name, '')), ''),
    p_respostas, p_score, p_score_max, coalesce(p_alertas, '[]'::jsonb),
    btrim(p_justificativa),
    nullif(btrim(coalesce(p_observacoes, '')), '')
  ) returning * into v_row;

  return public._avsf_to_json(v_row);
end;
$$;

revoke all on function public.create_avaliacao_sociofamiliar(text, text, bigint, jsonb, int, int, jsonb, text, bigint, text, text) from public;
grant  execute on function public.create_avaliacao_sociofamiliar(text, text, bigint, jsonb, int, int, jsonb, text, bigint, text, text) to anon, authenticated;

create or replace function public.list_avaliacoes_sociofamiliares(
  p_slug       text,
  p_password   text,
  p_patient_id bigint
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
  select coalesce(jsonb_agg(public._avsf_to_json(a) order by a.created_at desc, a.id desc), '[]'::jsonb)
    into v_result
    from public.avaliacoes_sociofamiliares a
   where a.company_id = v_company_id
     and a.patient_id = p_patient_id;
  return v_result;
end;
$$;

revoke all on function public.list_avaliacoes_sociofamiliares(text, text, bigint) from public;
grant  execute on function public.list_avaliacoes_sociofamiliares(text, text, bigint) to anon, authenticated;

commit;
