-- =========================================================================
-- 0146_agenda_recorrencia_continua.sql
--
-- 1. Trocar a frequência (semanal/quinzenal/mensal) refazia a série a partir
--    da PRIMEIRA sessão do grupo. Se o paciente tinha sido remanejado (outro
--    dia/horário), a série voltava para o horário antigo, apagava o horário
--    atual e duplicava datas (ex.: José Miguel, Amanda: 08:00 -> 09:40).
--    Agora a referência é a próxima sessão do paciente (ou a última real,
--    se não houver futura), e o passo é contado a partir dela.
--
-- 2. `estender_recorrencias` travava: (a) tratava horário de grupo (2-3
--    pacientes no mesmo horário) como "horário ocupado" e não estendia;
--    (b) essas séries bloqueadas ocupavam o limite de 8 por chamada, então
--    as outras também não eram estendidas. As agendas acabavam no fim de
--    dezembro/janeiro. Agora quem já dividia o horário na última sessão da
--    série não conta como conflito e séries bloqueadas não gastam o limite.
--
-- 3. Preenche de uma vez as séries ativas (mesmas regras da rotina: sem alta,
--    pausa, Busca Ativa, corte ou alta por especialidade).
--
-- 4. Reparo do José Miguel (Amanda): volta para quarta 08:00.
--
-- Idempotente.
-- =========================================================================

begin;

-- ── 1. Realinhar grupo a partir do horário atual do paciente ─────────────
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
  v_rem      public.appointments%rowtype;
  v_ref_date date;
  v_first    date;
  v_lower    date;
  v_start    date;
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

  -- Referência = próxima sessão em aberto (dia/horário atuais do paciente).
  -- Se o trecho vigente começou numa sessão remanejada (mesmo dia da semana e
  -- horário), ela é a referência, para o passo contar a partir dela.
  select * into v_ref
    from public.appointments
   where company_id = p_company_id
     and recurrence_group_id = p_recurrence_group_id
     and "date"::date >= v_today
     and public._is_open_appointment_status(status)
   order by "date", "time", id
   limit 1;
  if found then
    select * into v_rem
      from public.appointments
     where company_id = p_company_id
       and recurrence_group_id = p_recurrence_group_id
       and "date"::date >= v_today
       and "date"::date < v_ref."date"::date
       and lower(coalesce(status, '')) = 'remanejado'
       and "time" = v_ref."time"
       and extract(dow from "date"::date) = extract(dow from v_ref."date"::date)
     order by "date", id
     limit 1;
    if found then v_ref := v_rem; end if;
  end if;
  -- Sem sessão futura: última sessão real (exclui remarcação/desmarcação pontual).
  if v_ref.id is null then
    select * into v_ref
      from public.appointments
     where company_id = p_company_id
       and recurrence_group_id = p_recurrence_group_id
       and lower(coalesce(status, '')) not in ('remarcado', 'desmarcado', 'cancelado')
     order by "date" desc, id desc
     limit 1;
  end if;
  if v_ref.id is null then
    select * into v_ref
      from public.appointments
     where company_id = p_company_id
       and recurrence_group_id = p_recurrence_group_id
     order by "date" desc, id desc
     limit 1;
  end if;
  if v_ref.id is null then
    return jsonb_build_object('deletedCount', 0, 'createdCount', 0);
  end if;
  v_ref_date := v_ref."date"::date;

  select min("date")::date, max("date")::date into v_first, v_last
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

  -- Quinzenal/mensal: tira só as sessões futuras em aberto fora do passo.
  if v_step > 7 then
    delete from public.appointments
     where company_id = p_company_id
       and recurrence_group_id = p_recurrence_group_id
       and "date"::date >= v_today
       and lower(coalesce(status, 'agendado')) in ('agendado', 'agendada', 'atendimento', 'scheduled')
       and (("date"::date - v_ref_date) % v_step) <> 0;
    get diagnostics v_deleted = row_count;
  end if;

  -- Primeira data >= hoje (e >= início da série) no passo da referência:
  -- repõe semanas entre hoje e a referência (ex.: mensal -> semanal) sem
  -- antecipar série que ainda não começou.
  v_lower := greatest(v_today, v_first);
  if v_ref_date > v_lower then
    v_start := v_ref_date - (((v_ref_date - v_lower) / v_step) * v_step);
  else
    v_start := v_ref_date + (((v_lower - v_ref_date + v_step - 1) / v_step) * v_step);
  end if;

  v_horizon := greatest(
    v_last,
    v_ref_date + ((case v_freq when 'quinzenal' then 25 when 'mensal' then 12 else 51 end) * v_step)
  );
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
  from generate_series(v_start, v_horizon, (v_step || ' days')::interval) as g(d)
  where d >= v_lower
    and not exists (
      select 1 from public.appointments dup
       where dup.company_id = p_company_id
         and dup.recurrence_group_id = p_recurrence_group_id
         and dup."date" = to_char(d, 'YYYY-MM-DD')
    )
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
revoke all on function public._realinhar_grupo_recorrencia(bigint, text, text) from public, anon, authenticated;

-- ── 2. Estender séries sem travar em horário de grupo ────────────────────
create or replace function public._estender_recorrencias_empresa(
  p_company_id bigint,
  p_limite     int
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint := p_company_id;
  v_today      date := (now() at time zone 'America/Sao_Paulo')::date;
  v_horizonte  date;
  v_criados    int := 0;
  v_series     int := 0;
  g            record;
  v_step       int;
  v_rows       int;
  v_next       date;
  v_fim        date;
begin
  v_horizonte := v_today + 365;

  for g in
    with ultimos as (
      select a.recurrence_group_id                        as grupo,
             max(a."date")::date                          as ultima,
             min(lower(coalesce(a.frequency, 'semanal'))) as freq
        from public.appointments a
       where a.company_id = v_company_id
         and a.recurrence_group_id is not null
         and btrim(a.recurrence_group_id) <> ''
       group by a.recurrence_group_id
      having max(a."date")::date >= v_today - 35
         and max(a."date")::date <  v_today + 335
    )
    select u.grupo, u.ultima, u.freq, m.patient_id, m.professional_id,
           m."time" as hora, m.notes, m.frequency
      from ultimos u
      cross join lateral (
        select a.patient_id, a.professional_id, a."time", a.notes, a.frequency
          from public.appointments a
         where a.company_id = v_company_id
           and a.recurrence_group_id = u.grupo
         order by a."date" desc, a.id desc
         limit 1
      ) m
      join public.patients p
        on p.id = m.patient_id and p.company_id = v_company_id
      join public.professionals pr
        on pr.id = m.professional_id and pr.company_id = v_company_id
     where not public._is_closed_patient_status(p.status)
       and not public._is_transport_specialty(pr.specialty)
       and not exists (
         select 1 from public.recurrence_cuts c
          where c.company_id = v_company_id
            and c.recurrence_group_id = u.grupo
       )
       and not exists (
         select 1 from public.patient_specialty_discharges sd
          where sd.company_id = v_company_id
            and sd.patient_id = m.patient_id
            and lower(btrim(sd.specialty)) = lower(btrim(coalesce(pr.specialty, '')))
       )
       and not exists (
         select 1 from public.waiting_list w
          where w.company_id = v_company_id
            and w.patient_id = m.patient_id
            and coalesce(w.paused, false)
            and w.professional_id = m.professional_id
       )
       and not exists (
         select 1 from public.appointments a6
          where a6.company_id = v_company_id
            and a6.recurrence_group_id = u.grupo
            and a6."date" = to_char(u.ultima, 'YYYY-MM-DD')
            and (coalesce(a6.paused, false) or lower(coalesce(a6.status, '')) = 'pausado')
       )
     order by u.ultima, u.grupo
  loop
    exit when v_series >= p_limite;
    v_step := case g.freq when 'quinzenal' then 14 when 'mensal' then 28 else 7 end;

    v_next := g.ultima + v_step;
    if v_next <= v_today then
      v_next := v_today + ((v_step - ((v_today - g.ultima) % v_step)) % v_step);
      if v_next <= v_today then v_next := v_next + v_step; end if;
    end if;

    -- A série para na primeira data em que o horário já está com OUTRO
    -- paciente que não dividia o horário com este na última sessão (quem já
    -- era do mesmo grupo continua junto).
    select min(d)::date into v_fim
      from generate_series(v_next, v_horizonte, (v_step || ' days')::interval) as d
     where exists (
       select 1 from public.appointments a4
        where a4.company_id = v_company_id
          and a4.professional_id = g.professional_id
          and a4."date" = to_char(d, 'YYYY-MM-DD')
          and a4."time"  = g.hora
          and a4.patient_id <> g.patient_id
          and lower(coalesce(a4.status, '')) not in ('desmarcado', 'cancelado')
          and not exists (
            select 1 from public.appointments a7
             where a7.company_id = v_company_id
               and a7.professional_id = g.professional_id
               and a7."date" = to_char(g.ultima, 'YYYY-MM-DD')
               and a7."time" = g.hora
               and a7.patient_id = a4.patient_id
          )
     );
    v_fim := coalesce(v_fim - 1, v_horizonte);
    if v_fim < v_next then continue; end if;

    insert into public.appointments (
      company_id, patient_id, professional_id, "date", "time", status, notes,
      recurrence_group_id, frequency
    )
    select v_company_id, g.patient_id, g.professional_id,
           to_char(d, 'YYYY-MM-DD'), g.hora, 'agendado', g.notes,
           g.grupo, g.frequency
      from generate_series(v_next, v_fim, (v_step || ' days')::interval) as d
     where not exists (
         select 1 from public.appointments a3
          where a3.company_id = v_company_id
            and a3."date" = to_char(d, 'YYYY-MM-DD')
            and (a3.recurrence_group_id = g.grupo
                 or (a3.patient_id = g.patient_id
                     and a3.professional_id = g.professional_id
                     and a3."time" = g.hora))
       );

    get diagnostics v_rows = row_count;
    v_criados := v_criados + v_rows;
    if v_rows > 0 then v_series := v_series + 1; end if;
  end loop;

  return jsonb_build_object('ok', true, 'series', v_series, 'criados', v_criados);
end;
$$;
revoke all on function public._estender_recorrencias_empresa(bigint, int) from public, anon, authenticated;

create or replace function public.estender_recorrencias(
  p_slug     text,
  p_password text,
  p_limite   int default 8
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
  return public._estender_recorrencias_empresa(
    v_company_id, greatest(1, least(coalesce(p_limite, 8), 40))
  );
end;
$$;
revoke all on function public.estender_recorrencias(text, text, int) from public;
grant execute on function public.estender_recorrencias(text, text, int) to anon, authenticated;

-- ── 4. Reparo: José Miguel (Amanda) volta para quarta 08:00 ──────────────
-- Remove as sessões futuras em aberto criadas às 09:40 pela troca de
-- frequência e refaz a série semanal a partir da sessão de 08:00 que sobrou.
delete from public.appointments
 where company_id = 9
   and recurrence_group_id = '73a33ef8-9218-47e7-a9de-d5760369720f'
   and "date"::date >= (now() at time zone 'America/Sao_Paulo')::date
   and "time" = '09:40'
   and lower(coalesce(status, 'agendado')) = 'agendado';
select public._realinhar_grupo_recorrencia(9, '73a33ef8-9218-47e7-a9de-d5760369720f', 'semanal');

-- ── 3. Preenche agora todas as séries ativas ────────────────────────────
select public._estender_recorrencias_empresa(c.id, 100000)
  from public.companies c;

commit;
