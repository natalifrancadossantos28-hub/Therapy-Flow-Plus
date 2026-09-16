-- =========================================================================
-- 0098_realinhar_recorrencia_quinzenal_mensal.sql
--
-- A 0055 substituiu update_recurrence_frequency por uma versão que só grava
-- a coluna `frequency`, perdendo a limpeza/geração de linhas da 0054. Desde
-- então, trocar uma série para quinzenal/mensal deixa as 52 linhas semanais
-- no banco marcadas como quinzenal/mensal (e trocar para semanal deixa só
-- 13/26 linhas, sem preencher as semanas). A grade semanal passava então a
-- escolher "quais semanas mostrar" a partir da primeira linha carregada na
-- janela de datas, que muda conforme o usuário navega — pacientes mensais
-- apareciam em datas erradas ou sumiam, e a Visão Mensal/Recepção mostravam
-- outra coisa.
--
-- Esta migração:
--   1. Cria _realinhar_grupo_recorrencia: para um grupo, apaga as linhas
--      automáticas (agendado/atendimento) fora do passo da frequência
--      (ancorado na PRIMEIRA linha da série) e preenche, de hoje em diante,
--      as datas no passo que estejam faltando até o fim da série (respeitando
--      o corte de recurrence_cuts e sem duplicar horários do paciente).
--      Linhas com status manual (presente, faltas, remarcado...) nunca são
--      apagadas — o histórico fica intacto.
--   2. Reescreve update_recurrence_frequency = 0054 (limpeza/geração) +
--      0055 (sincroniza a série do parceiro Multi).
--   3. Realinha todos os grupos quinzenal/mensal já existentes.
-- Idempotente.
-- =========================================================================

begin;

create or replace function public._realinhar_grupo_recorrencia(
  p_company_id          bigint,
  p_recurrence_group_id text,
  p_frequency           text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_freq     text;
  v_step     integer;
  v_ref      public.appointments%rowtype;
  v_last     date;
  v_horizon  date;
  v_cut      date;
  v_today    date := (now() at time zone 'America/Sao_Paulo')::date;
  v_deleted  integer := 0;
  v_created  integer := 0;
begin
  v_freq := lower(btrim(coalesce(p_frequency, 'semanal')));
  if v_freq not in ('semanal', 'quinzenal', 'mensal') then
    v_freq := 'semanal';
  end if;
  v_step := case v_freq when 'quinzenal' then 14 when 'mensal' then 28 else 7 end;

  select * into v_ref
    from public.appointments
   where company_id = p_company_id
     and recurrence_group_id = p_recurrence_group_id
   order by "date", id
   limit 1;
  if not found then
    return jsonb_build_object('deletedCount', 0, 'createdCount', 0);
  end if;

  select max("date")::date into v_last
    from public.appointments
   where company_id = p_company_id
     and recurrence_group_id = p_recurrence_group_id;

  select c.cut_from::date into v_cut
    from public.recurrence_cuts c
   where c.company_id = p_company_id
     and c.recurrence_group_id = p_recurrence_group_id;

  update public.appointments
     set frequency = v_freq, updated_at = now()
   where company_id = p_company_id
     and recurrence_group_id = p_recurrence_group_id
     and coalesce(frequency, '') <> v_freq;

  if v_step > 7 then
    delete from public.appointments
     where company_id = p_company_id
       and recurrence_group_id = p_recurrence_group_id
       and "date"::date > v_ref."date"::date
       and lower(coalesce(status, 'agendado')) in ('agendado', 'agendada', 'atendimento', 'scheduled')
       and (("date"::date - v_ref."date"::date) % v_step) <> 0;
    get diagnostics v_deleted = row_count;
  end if;

  -- Preenche só do presente em diante: não inventa histórico.
  v_horizon := greatest(v_last, v_ref."date"::date + ((case v_freq when 'quinzenal' then 25 when 'mensal' then 12 else 51 end) * v_step));
  if v_cut is not null then
    v_horizon := least(v_horizon, v_cut - 1);
  end if;

  insert into public.appointments (
    company_id, patient_id, professional_id,
    "date", "time", status, notes,
    recurrence_group_id, frequency
  )
  select
    v_ref.company_id, v_ref.patient_id, v_ref.professional_id,
    to_char(d, 'YYYY-MM-DD'), v_ref."time", 'agendado', v_ref.notes,
    p_recurrence_group_id, v_freq
  from generate_series(v_ref."date"::date, v_horizon, (v_step || ' days')::interval) as g(d)
  where d >= v_today
    and not exists (
      select 1 from public.appointments dup
       where dup.company_id = p_company_id
         and dup.patient_id = v_ref.patient_id
         and dup.professional_id = v_ref.professional_id
         and dup."date" = to_char(d, 'YYYY-MM-DD')
         and dup."time" = v_ref."time"
    );
  get diagnostics v_created = row_count;

  return jsonb_build_object('deletedCount', v_deleted, 'createdCount', v_created);
end;
$$;

revoke all on function public._realinhar_grupo_recorrencia(bigint, text, text) from public;

create or replace function public.update_recurrence_frequency(
  p_slug                text,
  p_password            text,
  p_recurrence_group_id text,
  p_frequency           text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id    bigint;
  v_freq          text;
  v_count         integer;
  v_partner_group text;
  v_own           jsonb;
  v_partner       jsonb := jsonb_build_object('deletedCount', 0, 'createdCount', 0);
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  if p_recurrence_group_id is null or btrim(p_recurrence_group_id) = '' then
    raise exception 'recurrence_group_id is required';
  end if;

  v_freq := lower(btrim(coalesce(p_frequency, 'semanal')));
  if v_freq not in ('semanal', 'quinzenal', 'mensal') then
    v_freq := 'semanal';
  end if;

  select count(*) into v_count
    from public.appointments
   where company_id = v_company_id
     and recurrence_group_id = p_recurrence_group_id;
  if v_count = 0 then
    raise exception 'No appointments found for group %', p_recurrence_group_id;
  end if;

  -- Série do parceiro Multi (mesmo paciente, mesma data/hora, outro profissional).
  select distinct a2.recurrence_group_id into v_partner_group
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
   limit 1;

  v_own := public._realinhar_grupo_recorrencia(v_company_id, p_recurrence_group_id, v_freq);
  if v_partner_group is not null then
    v_partner := public._realinhar_grupo_recorrencia(v_company_id, v_partner_group, v_freq);
  end if;

  return jsonb_build_object(
    'ok', true,
    'updatedCount', v_count,
    'frequency', v_freq,
    'deletedCount', (v_own->>'deletedCount')::int + (v_partner->>'deletedCount')::int,
    'createdCount', (v_own->>'createdCount')::int + (v_partner->>'createdCount')::int,
    'partnerGroupSynced', v_partner_group is not null
  );
end;
$$;

revoke all on function public.update_recurrence_frequency(text, text, text, text) from public;
grant execute on function public.update_recurrence_frequency(text, text, text, text) to anon, authenticated;

-- ── Correção de dados: realinha as séries quinzenais/mensais existentes ─────
do $$
declare
  grp     record;
  v_res   jsonb;
  v_del   integer := 0;
  v_new   integer := 0;
begin
  for grp in
    select distinct on (a.company_id, a.recurrence_group_id)
           a.company_id, a.recurrence_group_id, lower(coalesce(a.frequency, 'semanal')) as frequency
      from public.appointments a
     where a.recurrence_group_id is not null
       and btrim(a.recurrence_group_id) <> ''
       and lower(coalesce(a.frequency, 'semanal')) in ('quinzenal', 'mensal')
     order by a.company_id, a.recurrence_group_id, a."date", a.id
  loop
    v_res := public._realinhar_grupo_recorrencia(grp.company_id, grp.recurrence_group_id, grp.frequency);
    v_del := v_del + (v_res->>'deletedCount')::int;
    v_new := v_new + (v_res->>'createdCount')::int;
  end loop;
  raise notice 'Recorrências quinzenal/mensal realinhadas: % linhas fantasmas apagadas, % linhas criadas', v_del, v_new;
end;
$$;

commit;
