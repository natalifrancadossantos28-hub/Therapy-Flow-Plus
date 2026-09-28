-- =========================================================================
-- 0110_vinculo_ativo_sem_agenda_fantasma.sql
--
-- Paciente aparecia "Ativo" na Equipe de Atendimento de um profissional em
-- cuja agenda ele não estava (ex.: JASMINY 408 x Lucas Fisio).
--
-- Causa: `estender_recorrencias` (0107) reanimava séries paradas há até 180
-- dias e, quando o horário já estava ocupado por outro paciente, pulava as
-- semanas ocupadas e criava o bloco meses à frente. Resultado: uma série
-- encerrada voltava como um punhado de agendamentos soltos no futuro — nada
-- na grade atual, mas vínculo "ativo" no cadastro.
--
-- Correção:
--   1. só estende série realmente corrente (última ocorrência <= 35 dias);
--   2. para de gerar no primeiro conflito de horário, em vez de saltar meses;
--   3. limpa os blocos futuros órfãos já criados (sem nenhuma ocorrência na
--      janela corrente), preservando qualquer linha com histórico real.
--
-- Idempotente.
-- =========================================================================

begin;

-- 1) Limpeza: agendamentos futuros de um par paciente/profissional sem nenhuma
-- ocorrência na janela corrente (últimos 30 / próximos 45 dias). São sempre
-- linhas geradas pela rotina: status 'agendado', sem presença nem falta.
with hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d),
pares as (
  select a.company_id, a.patient_id, a.professional_id
    from public.appointments a, hoje h
   group by a.company_id, a.patient_id, a.professional_id, h.d
  having count(*) filter (
           where a."date"::date between h.d - 30 and h.d + 45
         ) = 0
     and count(*) filter (
           where a."date"::date > h.d + 45 and a.status = 'agendado'
         ) > 0
)
delete from public.appointments a
 using pares p, hoje h
 where a.company_id = p.company_id
   and a.patient_id = p.patient_id
   and a.professional_id = p.professional_id
   and a."date"::date > h.d + 45
   and a.status = 'agendado';

-- 2) Rotina de extensão sem ressuscitar série morta nem pular meses.
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
  v_ocupado    boolean;
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
         -- Série corrente: parou há no máximo 35 dias (cobre mensal) e ainda
         -- sem 150 dias de folga à frente. Série parada há mais tempo é saída
         -- real do paciente e não pode ser reanimada.
         having max(a."date")::date >= v_today - 35
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

    -- Horário já ocupado por outro paciente: a série não tem como continuar.
    -- Antes a rotina pulava a data e criava o bloco meses à frente, gerando
    -- "vínculo ativo" sem agenda.
    select exists (
      select 1 from public.appointments a4
       where a4.company_id = v_company_id
         and a4.professional_id = g.professional_id
         and a4."date" = to_char(v_next, 'YYYY-MM-DD')
         and a4."time"  = g.hora
         and a4.patient_id <> g.patient_id
    ) into v_ocupado;
    if v_ocupado then continue; end if;

    insert into public.appointments (
      company_id, patient_id, professional_id, "date", "time", status, notes,
      recurrence_group_id, frequency
    )
    select v_company_id, g.patient_id, g.professional_id,
           to_char(d, 'YYYY-MM-DD'), g.hora, 'agendado', g.notes,
           g.grupo, g.frequency
      from generate_series(v_next, v_horizonte, (v_step || ' days')::interval) as d
      -- Para na primeira data ocupada: mantém a série contínua.
     where d <= coalesce((
             select min(a5."date"::date)
               from public.appointments a5
              where a5.company_id = v_company_id
                and a5.professional_id = g.professional_id
                and a5."time" = g.hora
                and a5.patient_id <> g.patient_id
                and a5."date"::date >= v_next
           ) - 1, v_horizonte)
       and not exists (
         select 1 from public.appointments a3
          where a3.company_id = v_company_id
            and a3.recurrence_group_id = g.grupo
            and a3."date" = to_char(d, 'YYYY-MM-DD')
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
