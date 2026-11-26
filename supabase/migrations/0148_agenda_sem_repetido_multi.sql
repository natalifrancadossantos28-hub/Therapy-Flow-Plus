-- =========================================================================
-- 0148_agenda_sem_repetido_multi.sql
--
-- Paciente aparecendo 2 vezes no mesmo dia com o mesmo profissional:
-- sessão comum + Atendimento Multi (ex.: GAEL FERREIRA SANTOS, Amanda,
-- segunda 15:40 sozinho e 16:30 Multi com a Geovana). Ao criar o Multi as
-- sessões antigas saíam, mas a extensão automática recriava a série antiga
-- no horário de antes, porque só olhava o MESMO horário.
--
-- 1. A extensão não estende a série comum quando, depois da última sessão
--    dela, o paciente já está no Multi com o mesmo profissional.
-- 2. Limpa (de hoje em diante) a sessão comum "agendado" que está no mesmo
--    dia de um Atendimento Multi do mesmo paciente com o mesmo profissional,
--    e encerra a série se ela ficou sem sessões futuras (para não voltar).
-- 3. Repete a limpeza da 0147 (mesmo paciente, profissional, dia e horário).
--
-- Rode DEPOIS da 0146 e da 0147. Idempotente. Motorista fica de fora.
-- =========================================================================

begin;

-- ── 1. Extensão não recria a série comum por baixo do Multi ─────────────
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
       )
       -- Série comum não volta se, depois da última sessão dela, o paciente
       -- passou para o Atendimento Multi com o mesmo profissional (o Multi
       -- substituiu a série; ex.: Gael / Amanda).
       and not (
         coalesce(g.notes, '') not like 'Atendimento Multi com %'
         and exists (
           select 1 from public.appointments a8
            where a8.company_id = v_company_id
              and a8.patient_id = g.patient_id
              and a8.professional_id = g.professional_id
              and a8."date" > to_char(g.ultima, 'YYYY-MM-DD')
              and coalesce(a8.notes, '') like 'Atendimento Multi com %'
              and lower(coalesce(a8.status, '')) not in ('desmarcado', 'cancelado')
         )
       );

    get diagnostics v_rows = row_count;
    v_criados := v_criados + v_rows;
    if v_rows > 0 then v_series := v_series + 1; end if;
  end loop;

  return jsonb_build_object('ok', true, 'series', v_series, 'criados', v_criados);
end;
$$;
revoke all on function public._estender_recorrencias_empresa(bigint, int) from public, anon, authenticated;

-- ── 2. Sessão comum no mesmo dia do Multi (mesmo profissional) ──────────
create temp table _sobra_multi on commit drop as
select a.id, a.company_id, a.recurrence_group_id
  from public.appointments a
  join public.professionals pr
    on pr.id = a.professional_id and pr.company_id = a.company_id
 where a."date"::date >= (now() at time zone 'America/Sao_Paulo')::date
   and lower(coalesce(a.status, 'agendado')) in ('agendado', 'agendada', 'scheduled')
   and coalesce(a.notes, '') not like 'Atendimento Multi com %'
   and not public._is_transport_specialty(pr.specialty)
   and exists (
     select 1 from public.appointments m
      where m.company_id = a.company_id
        and m.patient_id = a.patient_id
        and m.professional_id = a.professional_id
        and m."date" = a."date"
        and m.id <> a.id
        and coalesce(m.notes, '') like 'Atendimento Multi com %'
        and lower(coalesce(m.status, '')) not in ('desmarcado', 'cancelado')
   );

-- ── 3. Mesmo paciente, profissional, dia e horário (igual à 0147) ───────
insert into _sobra_multi (id, company_id, recurrence_group_id)
select x.id, x.company_id, x.recurrence_group_id
  from (
    select a.id, a.company_id, a.recurrence_group_id, a.status,
           row_number() over (
             partition by a.company_id, a.patient_id, a.professional_id, a."date", a."time"
             order by (lower(coalesce(a.status, 'agendado')) in ('agendado', 'agendada', 'scheduled')),
                      (coalesce(a.notes, '') like 'Atendimento Multi com %') desc,
                      a.id
           ) as rn
      from public.appointments a
     where a."date"::date >= (now() at time zone 'America/Sao_Paulo')::date
       and lower(coalesce(a.status, '')) not in ('desmarcado', 'cancelado')
  ) x
 where x.rn > 1
   and lower(coalesce(x.status, 'agendado')) in ('agendado', 'agendada', 'scheduled')
   and not exists (select 1 from _sobra_multi s where s.id = x.id);

delete from public.appointments a
 using _sobra_multi s
 where a.id = s.id;

insert into public.recurrence_cuts (company_id, recurrence_group_id, cut_from)
select distinct s.company_id, s.recurrence_group_id,
       to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')
  from _sobra_multi s
 where s.recurrence_group_id is not null
   and btrim(s.recurrence_group_id) <> ''
   and not exists (
     select 1 from public.appointments a
      where a.company_id = s.company_id
        and a.recurrence_group_id = s.recurrence_group_id
        and a."date"::date >= (now() at time zone 'America/Sao_Paulo')::date
   )
on conflict (company_id, recurrence_group_id) do nothing;

commit;
