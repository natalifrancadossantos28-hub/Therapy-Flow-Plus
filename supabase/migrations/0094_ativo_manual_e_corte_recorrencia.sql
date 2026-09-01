-- =============================================================================
-- 0094: botão "Ativo" na agenda + exclusão de recorrência que não volta
-- =============================================================================
--
-- 1) Ativo manual
--    "Ativo" é derivado (0091): o paciente vira Ativo no dia seguinte ao
--    primeiro atendimento daquela especialidade. Faltava o profissional/admin
--    poder marcar na hora, logo depois da primeira avaliação. A marcação
--    manual vira uma linha em `patient_first_evaluation`, que
--    `list_first_evaluation_done` passa a unir ao histórico — o status do
--    agendamento não é tocado (nada de novo valor de status circulando pelas
--    consultas de ocupação, fila, faltas e dashboards).
--
-- 2) Corte de recorrência
--    "Excluir Agendamento" apaga as linhas da data em diante, mas a agenda
--    projeta ocorrências virtuais até 4 semanas além da última linha real —
--    então os cards excluídos reapareciam no recarregamento. Agora o corte
--    fica registrado em `recurrence_cuts` e o front para de projetar a série
--    a partir dessa data.
-- =============================================================================

begin;

-- ── 1) Primeira avaliação marcada na mão ─────────────────────────────────────
create table if not exists public.patient_first_evaluation (
  id          bigserial   primary key,
  company_id  bigint      not null references public.ponto_companies(id) on delete cascade,
  patient_id  bigint      not null references public.patients(id)        on delete cascade,
  specialty   text        not null,
  marked_at   timestamptz not null default now()
);
create unique index if not exists patient_first_evaluation_uk
  on public.patient_first_evaluation (company_id, patient_id, lower(btrim(specialty)));
alter table public.patient_first_evaluation enable row level security;

create or replace function public.marcar_primeira_avaliacao(
  p_slug       text,
  p_password   text,
  p_patient_id bigint,
  p_specialty  text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  if p_specialty is null or btrim(p_specialty) = '' then
    raise exception 'specialty is required';
  end if;

  insert into public.patient_first_evaluation (company_id, patient_id, specialty)
  values (v_company_id, p_patient_id, btrim(p_specialty))
  on conflict do nothing;

  return jsonb_build_object('ativo', true, 'specialty', btrim(p_specialty));
end;
$$;

revoke all on function public.marcar_primeira_avaliacao(text, text, bigint, text) from public;
grant execute on function public.marcar_primeira_avaliacao(text, text, bigint, text) to anon, authenticated;

-- Histórico (0091) + marcações manuais.
create or replace function public.list_first_evaluation_done(
  p_slug     text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_today      text;
  v_result     jsonb;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  v_today := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_result
    from (
      select distinct
        a.patient_id,
        p2.specialty
      from public.appointments a
      join public.professionals p2
        on p2.id = a.professional_id
       and p2.company_id = a.company_id
      where a.company_id = v_company_id
        and a."date" < v_today
        and not public._is_transport_specialty(p2.specialty)
        and lower(coalesce(a.status, '')) not in (
          'desmarcado', 'cancelado', 'remarcado', 'remanejado',
          'ausente', 'falta_nao_justificada', 'falta_justificada',
          'justificado', 'abonado'
        )

      union

      select fe.patient_id, fe.specialty
        from public.patient_first_evaluation fe
       where fe.company_id = v_company_id
    ) t;

  return v_result;
end;
$$;

revoke all on function public.list_first_evaluation_done(text, text) from public;
grant execute on function public.list_first_evaluation_done(text, text) to anon, authenticated;

-- ── 2) Corte de recorrência ──────────────────────────────────────────────────
create table if not exists public.recurrence_cuts (
  company_id          bigint      not null references public.ponto_companies(id) on delete cascade,
  recurrence_group_id text        not null,
  cut_from            text        not null,
  created_at          timestamptz not null default now(),
  primary key (company_id, recurrence_group_id)
);
alter table public.recurrence_cuts enable row level security;

create or replace function public.list_recurrence_cuts(
  p_slug     text,
  p_password text
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

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_result
    from (
      select c.recurrence_group_id, c.cut_from
        from public.recurrence_cuts c
       where c.company_id = v_company_id
    ) t;

  return v_result;
end;
$$;

revoke all on function public.list_recurrence_cuts(text, text) from public;
grant execute on function public.list_recurrence_cuts(text, text) to anon, authenticated;

create or replace function public.delete_recurrence_forward(
  p_slug                text,
  p_password            text,
  p_recurrence_group_id text,
  p_from_date           text,
  p_patient_id          bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id    bigint;
  v_deleted_count integer := 0;
  v_extra         integer := 0;
  v_partner_group text;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  if p_recurrence_group_id is null or btrim(p_recurrence_group_id) = '' then
    raise exception 'recurrence_group_id is required';
  end if;

  -- Grupo da recorrência parceira (Multi), antes de apagar as linhas.
  if p_patient_id is not null then
    select a2.recurrence_group_id into v_partner_group
      from public.appointments a1
      join public.appointments a2
        on a2.company_id = a1.company_id
       and a2.patient_id = a1.patient_id
       and a2."date"     = a1."date"
       and a2."time"     = a1."time"
       and a2.professional_id <> a1.professional_id
       and a2.recurrence_group_id is not null
       and btrim(a2.recurrence_group_id) <> ''
       and a2.recurrence_group_id <> p_recurrence_group_id
     where a1.company_id = v_company_id
       and a1.recurrence_group_id = p_recurrence_group_id
       and a1.patient_id = p_patient_id
     limit 1;
  end if;

  delete from public.appointments
   where company_id = v_company_id
     and recurrence_group_id = p_recurrence_group_id
     and "date" >= p_from_date;
  get diagnostics v_deleted_count = row_count;

  insert into public.recurrence_cuts (company_id, recurrence_group_id, cut_from)
  values (v_company_id, p_recurrence_group_id, p_from_date)
  on conflict (company_id, recurrence_group_id) do update
    set cut_from = least(public.recurrence_cuts.cut_from, excluded.cut_from);

  if v_partner_group is not null then
    delete from public.appointments
     where company_id = v_company_id
       and recurrence_group_id = v_partner_group
       and "date" >= p_from_date;
    get diagnostics v_extra = row_count;
    v_deleted_count := v_deleted_count + v_extra;

    insert into public.recurrence_cuts (company_id, recurrence_group_id, cut_from)
    values (v_company_id, v_partner_group, p_from_date)
    on conflict (company_id, recurrence_group_id) do update
      set cut_from = least(public.recurrence_cuts.cut_from, excluded.cut_from);
  end if;

  return jsonb_build_object(
    'ok', true,
    'deletedCount', v_deleted_count,
    'fromDate', p_from_date
  );
end;
$$;

revoke all on function public.delete_recurrence_forward(text, text, text, text, bigint) from public;
grant execute on function public.delete_recurrence_forward(text, text, text, text, bigint) to anon, authenticated;

-- Reagendar o mesmo grupo depois do corte (fluxo de remanejar/retomar) volta a
-- valer: qualquer linha nova em data >= corte desfaz o corte.
create or replace function public._limpar_corte_recorrencia()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if new.recurrence_group_id is not null and btrim(new.recurrence_group_id) <> '' then
    delete from public.recurrence_cuts c
     where c.company_id = new.company_id
       and c.recurrence_group_id = new.recurrence_group_id
       and new."date" >= c.cut_from;
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_limpar_corte on public.appointments;
create trigger appointments_limpar_corte
  after insert on public.appointments
  for each row execute function public._limpar_corte_recorrencia();

commit;
