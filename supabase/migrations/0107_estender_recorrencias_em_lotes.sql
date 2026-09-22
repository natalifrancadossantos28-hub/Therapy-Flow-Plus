-- =========================================================================
-- 0107_estender_recorrencias_em_lotes.sql
--
-- A rotina do 0106 (`estender_recorrencias`) estourava o statement_timeout do
-- PostgREST em produção: varria todas as séries de uma vez e criava um ano de
-- ocorrências por série. Resultado: erro 57014 em toda chamada e nenhuma
-- recorrência completada — o paciente continuava sumindo da agenda quando as
-- 52 semanas originais acabavam.
--
-- Agora a rotina trabalha em lotes: no máximo `p_limite` séries por chamada,
-- horizonte de 180 dias e as séries encerradas (corte, alta da especialidade,
-- paciente encerrado, transporte) são descartadas na própria consulta, sem
-- gastar lote. Como a agenda, a recepção e a visão mensal chamam a rotina ao
-- abrir, as séries pendentes se completam em poucas cargas.
--
-- Idempotente.
-- =========================================================================

begin;

create index if not exists appointments_grupo_data_idx
  on public.appointments (company_id, recurrence_group_id, "date");

create index if not exists appointments_prof_data_hora_idx
  on public.appointments (company_id, professional_id, "date", "time");

drop function if exists public.estender_recorrencias(text, text);

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
  v_today      date;
  v_horizonte  date;
  v_criados    int := 0;
  v_series     int := 0;
  v_limite     int := greatest(1, least(coalesce(p_limite, 8), 40));
  g            record;
  v_step       int;
  v_rows       int;
  v_next       date;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  v_today     := (now() at time zone 'America/Sao_Paulo')::date;
  v_horizonte := v_today + 180;

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
         -- Série viva (parou há no máximo 180 dias) e ainda sem 150 dias de
         -- folga à frente. Saídas intencionais são filtradas abaixo.
         having max(a."date")::date >= v_today - 180
            and max(a."date")::date <  v_today + 150
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
     order by u.ultima
     limit v_limite
  loop
    v_step := case g.freq when 'quinzenal' then 14 when 'mensal' then 28 else 7 end;

    v_next := g.ultima + v_step;
    if v_next <= v_today then
      v_next := v_today + ((v_step - ((v_today - g.ultima) % v_step)) % v_step);
      if v_next <= v_today then v_next := v_next + v_step; end if;
    end if;

    insert into public.appointments (
      company_id, patient_id, professional_id, "date", "time", status, notes,
      recurrence_group_id, frequency
    )
    select v_company_id, g.patient_id, g.professional_id,
           to_char(d, 'YYYY-MM-DD'), g.hora, 'agendado', g.notes,
           g.grupo, g.frequency
      from generate_series(v_next, v_horizonte, (v_step || ' days')::interval) as d
     where not exists (
         select 1 from public.appointments a3
          where a3.company_id = v_company_id
            and a3.recurrence_group_id = g.grupo
            and a3."date" = to_char(d, 'YYYY-MM-DD')
       )
       and not exists (
         select 1 from public.appointments a4
          where a4.company_id = v_company_id
            and a4.professional_id = g.professional_id
            and a4."date" = to_char(d, 'YYYY-MM-DD')
            and a4."time"  = g.hora
       );

    get diagnostics v_rows = row_count;
    v_criados := v_criados + v_rows;
    if v_rows > 0 then v_series := v_series + 1; end if;
  end loop;

  return jsonb_build_object('ok', true, 'series', v_series, 'criados', v_criados);
end;
$$;

revoke all on function public.estender_recorrencias(text, text, int) from public;
grant execute on function public.estender_recorrencias(text, text, int) to anon, authenticated;

commit;
