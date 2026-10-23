-- Pausa "Sai da agenda" não pode voltar pra agenda sozinha.
-- Bug: `estender_recorrencias` recriava a série apagada pela pausa e a limpeza
-- da fila tirava o paciente da Busca Ativa ("Vaga preenchida").
-- 1. pause_patient_from_agenda corta as séries e também tira "Desmarcado" de hoje/futuro.
-- 2. estender_recorrencias ignora paciente pausado com o profissional.
-- 3. Reparo: corta as séries de quem já está em Busca Ativa vindo da agenda.

begin;

create or replace function public.pause_patient_from_agenda(
  p_slug text, p_password text, p_patient_id bigint, p_professional_id bigint,
  p_reason text default null, p_return_date text default null
) returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_company_id bigint; v_prof public.professionals%rowtype; v_today text;
  v_removed integer := 0; v_wl_id bigint; v_origin text; v_reason text;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  v_today := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  select * into v_prof from public.professionals where id = p_professional_id and company_id = v_company_id;
  if not found then raise exception 'Profissional não encontrado'; end if;
  v_origin := 'Agenda — ' || v_prof.name || coalesce(' (' || v_prof.specialty || ')', '');
  v_reason := nullif(btrim(coalesce(p_reason,'')), '');
  if v_reason is null then v_reason := 'Pausa temporária'; end if;

  -- Corta as séries para `estender_recorrencias` não recriar os horários.
  insert into public.recurrence_cuts (company_id, recurrence_group_id, cut_from)
  select distinct v_company_id, a.recurrence_group_id, v_today
    from public.appointments a
   where a.company_id = v_company_id and a.patient_id = p_patient_id and a.professional_id = p_professional_id
     and a.recurrence_group_id is not null and btrim(a.recurrence_group_id) <> ''
  on conflict (company_id, recurrence_group_id) do update
    set cut_from = least(public.recurrence_cuts.cut_from, excluded.cut_from);

  delete from public.appointments a
   where a.company_id = v_company_id and a.patient_id = p_patient_id and a.professional_id = p_professional_id
     and a."date" >= v_today
     and lower(coalesce(a.status,'agendado')) in ('agendado','agendada','scheduled','pausado','atendimento','em_atendimento','presente','desmarcado','cancelado');
  get diagnostics v_removed = row_count;

  select id into v_wl_id from public.waiting_list
   where company_id = v_company_id and patient_id = p_patient_id
     and lower(btrim(coalesce(specialty,''))) = lower(btrim(coalesce(v_prof.specialty,'')))
   order by id limit 1;
  if v_wl_id is null then
    insert into public.waiting_list (company_id, patient_id, professional_id, specialty, priority, notes, entry_date)
    values (v_company_id, p_patient_id, p_professional_id, v_prof.specialty, 'media',
            'Pausado pela agenda de ' || v_prof.name, v_today)
    returning id into v_wl_id;
  end if;
  update public.waiting_list
     set paused = true, paused_at = now(), paused_reason = v_reason,
         paused_return_date = nullif(btrim(coalesce(p_return_date,'')), ''),
         paused_origin = v_origin, professional_id = p_professional_id, updated_at = now()
   where id = v_wl_id;

  update public.patients set notes = coalesce(notes,'') || E'\n[PAUSA ' || to_char(now() at time zone 'America/Sao_Paulo','DD/MM/YYYY') || ' — ' || v_origin || '] Motivo: ' || v_reason
         || coalesce('. Retorno previsto: ' || nullif(btrim(coalesce(p_return_date,'')), ''), ''), updated_at = now()
   where id = p_patient_id and company_id = v_company_id;

  return jsonb_build_object('ok', true, 'appointmentsRemoved', v_removed, 'waitingListId', v_wl_id, 'origin', v_origin);
end $$;
revoke all on function public.pause_patient_from_agenda(text, text, bigint, bigint, text, text) from public;
grant execute on function public.pause_patient_from_agenda(text, text, bigint, bigint, text, text) to anon, authenticated;

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
       -- Paciente pausado / em Busca Ativa com esse profissional: a série
       -- não pode ser recriada (senão ele volta pra agenda e sai da Busca Ativa).
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

insert into public.recurrence_cuts (company_id, recurrence_group_id, cut_from)
select distinct a.company_id, a.recurrence_group_id,
       to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')
  from public.waiting_list w
  join public.appointments a
    on a.company_id = w.company_id and a.patient_id = w.patient_id and a.professional_id = w.professional_id
 where coalesce(w.paused, false)
   and w.paused_origin like 'Agenda —%'
   and a.recurrence_group_id is not null and btrim(a.recurrence_group_id) <> ''
on conflict (company_id, recurrence_group_id) do update
  set cut_from = least(public.recurrence_cuts.cut_from, excluded.cut_from);

delete from public.appointments a
 using public.waiting_list w
 where a.company_id = w.company_id and a.patient_id = w.patient_id and a.professional_id = w.professional_id
   and coalesce(w.paused, false)
   and w.paused_origin like 'Agenda —%'
   and a."date" >= to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')
   and lower(coalesce(a.status,'agendado')) in ('agendado','agendada','scheduled','pausado','atendimento','em_atendimento','presente','desmarcado','cancelado');

notify pgrst, 'reload schema';

commit;
