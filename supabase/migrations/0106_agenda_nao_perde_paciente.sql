-- =========================================================================
-- 0106_agenda_nao_perde_paciente.sql
--
-- 1. Recorrência que "acaba" sozinha
--    create_appointments grava 52 semanas (26 quinzenais / 13 mensais) de
--    linhas reais. Passado esse prazo o paciente simplesmente sumia de todas
--    as telas (agenda, recepção, visão mensal, impressão) sem nenhuma alta —
--    foi o caso do atendimento fixo de quarta 08:00. Agora
--    `estender_recorrencias` completa as séries ativas até 1 ano à frente.
--    Só NÃO estende quando a saída foi intencional: corte de recorrência
--    (Excluir/Encaminhamento), alta da especialidade, paciente encerrado,
--    série toda em status terminal ou agenda de transporte.
--
-- 2. Desistência de UMA especialidade encerrava o paciente inteiro
--    discharge_patient_specialty tratava Desistência como saída global (igual
--    ao Óbito) e o trigger do 0104 apagava a agenda das outras áreas. Agora a
--    desistência é pontual como a alta: o cadastro só é encerrado quando não
--    resta nenhuma especialidade ativa. Óbito continua global.
--
-- 3. Saídas sem Avaliação Funcional
--    Tipos novos ("Cancelou avaliação", "Alta por falta") são aceitos e, no
--    encerramento global, o status do cadastro vira 'Alta' (não o texto do
--    motivo), mantendo os filtros e contadores existentes.
--
-- 4. A alta/saída de especialidade passa a registrar o corte da recorrência,
--    para que a rotina do item 1 não ressuscite a série encerrada.
--
-- Idempotente.
-- =========================================================================

begin;

-- Segurança: as tabelas de apoio vêm do 0085 e do 0094.
create table if not exists public.recurrence_cuts (
  company_id          bigint      not null references public.ponto_companies(id) on delete cascade,
  recurrence_group_id text        not null,
  cut_from            text        not null,
  created_at          timestamptz not null default now(),
  primary key (company_id, recurrence_group_id)
);
alter table public.recurrence_cuts enable row level security;

create table if not exists public.patient_specialty_discharges (
  id              bigserial   primary key,
  company_id      bigint      not null references public.ponto_companies(id) on delete cascade,
  patient_id      bigint      not null references public.patients(id)        on delete cascade,
  specialty       text        not null,
  professional_id bigint,
  tipo            text        not null default 'Alta',
  reason          text,
  discharged_at   timestamptz not null default now()
);
create unique index if not exists patient_specialty_discharges_uniq
  on public.patient_specialty_discharges (company_id, patient_id, lower(btrim(specialty)));
alter table public.patient_specialty_discharges enable row level security;

-- Helpers (vêm do 0088 e do 0104; redefinidos aqui para a migration rodar
-- sozinha em bases que ainda não aplicaram aquelas).
create or replace function public._is_transport_specialty(p_specialty text)
returns boolean
language sql
immutable
as $$
  select lower(btrim(coalesce(p_specialty, ''))) in ('motorista', 'transporte', 'motorista/transporte')
$$;

create or replace function public._is_closed_patient_status(p_status text)
returns boolean
language sql
immutable
as $$
  select lower(btrim(coalesce(p_status, ''))) in
    ('alta', 'óbito', 'obito', 'desistência', 'desistencia')
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Completar as recorrências ativas
-- ═══════════════════════════════════════════════════════════════════════
create or replace function public.estender_recorrencias(
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
  v_today      date;
  v_horizonte  date;
  v_criados    int := 0;
  v_series     int := 0;
  g            record;
  v_step       int;
  v_rows       int;
  v_next       date;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  v_today     := (now() at time zone 'America/Sao_Paulo')::date;
  v_horizonte := v_today + 365;

  for g in
    select a.recurrence_group_id                      as grupo,
           max(a."date")::date                        as ultima,
           min(lower(coalesce(a.frequency, 'semanal'))) as freq
      from public.appointments a
     where a.company_id = v_company_id
       and a.recurrence_group_id is not null
       and btrim(a.recurrence_group_id) <> ''
     group by a.recurrence_group_id
       -- Série viva (parou de ter linhas há no máximo 180 dias) e sem um ano
       -- inteiro de folga à frente. Quem recebeu alta/desistência/óbito ou teve
       -- corte administrativo é descartado adiante, não por este prazo.
       having max(a."date")::date >= v_today - 180
          and max(a."date")::date <  v_horizonte - 30
  loop
    v_step := case g.freq when 'quinzenal' then 14 when 'mensal' then 28 else 7 end;

    -- Corte registrado pela Administração (Excluir Agendamento / Encaminhamento).
    if exists (
      select 1 from public.recurrence_cuts c
       where c.company_id = v_company_id
         and c.recurrence_group_id = g.grupo
    ) then
      continue;
    end if;

    v_next := g.ultima + v_step;
    if v_next <= v_today then
      v_next := v_today + ((v_step - ((v_today - g.ultima) % v_step)) % v_step);
      if v_next <= v_today then v_next := v_next + v_step; end if;
    end if;

    insert into public.appointments (
      company_id, patient_id, professional_id, "date", "time", status, notes,
      recurrence_group_id, frequency
    )
    select v_company_id, m.patient_id, m.professional_id,
           to_char(d, 'YYYY-MM-DD'), m."time", 'agendado', m.notes,
           g.grupo, m.frequency
      from (
        select a.patient_id, a.professional_id, a."time", a.notes, a.frequency
          from public.appointments a
         where a.company_id = v_company_id
           and a.recurrence_group_id = g.grupo
         order by a."date" desc, a.id desc
         limit 1
      ) m
      join public.patients p
        on p.id = m.patient_id and p.company_id = v_company_id
      join public.professionals pr
        on pr.id = m.professional_id and pr.company_id = v_company_id
      cross join generate_series(v_next, v_horizonte, (v_step || ' days')::interval) as d
     where not public._is_closed_patient_status(p.status)
       and not public._is_transport_specialty(pr.specialty)
       -- Alta/saída registrada nessa especialidade.
       and not exists (
         select 1 from public.patient_specialty_discharges sd
          where sd.company_id = v_company_id
            and sd.patient_id = m.patient_id
            and lower(btrim(sd.specialty)) = lower(btrim(coalesce(pr.specialty, '')))
       )
       -- Série inteira encerrada (alta/óbito/desistência lançados na própria linha).
       and not exists (
         select 1 from public.appointments a2
          where a2.company_id = v_company_id
            and a2.recurrence_group_id = g.grupo
          having bool_and(lower(coalesce(a2.status, '')) in
                 ('alta', 'óbito', 'obito', 'desistência', 'desistencia'))
       )
       -- Já existe linha desta série no dia.
       and not exists (
         select 1 from public.appointments a3
          where a3.company_id = v_company_id
            and a3.recurrence_group_id = g.grupo
            and a3."date" = to_char(d, 'YYYY-MM-DD')
       )
       -- Horário do profissional já ocupado por outro atendimento.
       and not exists (
         select 1 from public.appointments a4
          where a4.company_id = v_company_id
            and a4.professional_id = m.professional_id
            and a4."date" = to_char(d, 'YYYY-MM-DD')
            and a4."time"  = m."time"
       );

    get diagnostics v_rows = row_count;
    v_criados := v_criados + v_rows;
    if v_rows > 0 then v_series := v_series + 1; end if;
  end loop;

  return jsonb_build_object('ok', true, 'series', v_series, 'criados', v_criados);
end;
$$;

revoke all on function public.estender_recorrencias(text, text) from public;
grant execute on function public.estender_recorrencias(text, text) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 2 + 3 + 4. Saída por especialidade
-- ═══════════════════════════════════════════════════════════════════════
create or replace function public.discharge_patient_specialty(
  p_slug            text,
  p_password        text,
  p_patient_id      bigint,
  p_specialty       text,
  p_professional_id bigint default null,
  p_tipo            text   default 'Alta',
  p_reason          text   default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_patient    public.patients%rowtype;
  v_spec       text;
  v_today      text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  v_tipo       text := coalesce(nullif(btrim(p_tipo), ''), 'Alta');
  v_restantes  text[];
  v_global     boolean;
  v_novo       text;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  v_spec := nullif(btrim(coalesce(p_specialty, '')), '');

  select * into v_patient from public.patients
   where id = p_patient_id and company_id = v_company_id;
  if not found then raise exception 'patient not found'; end if;

  if v_spec is not null then
    insert into public.patient_specialty_discharges
      (company_id, patient_id, specialty, professional_id, tipo, reason)
    values (v_company_id, p_patient_id, v_spec, p_professional_id, v_tipo, p_reason)
    on conflict (company_id, patient_id, lower(btrim(specialty)))
      do update set professional_id = excluded.professional_id,
                    tipo            = excluded.tipo,
                    reason          = excluded.reason,
                    discharged_at   = now();

    delete from public.waiting_list w
     where w.company_id = v_company_id
       and w.patient_id = p_patient_id
       and lower(btrim(coalesce(w.specialty, ''))) = lower(v_spec);

    -- Corte das séries desta especialidade: sem isso `estender_recorrencias`
    -- recriaria as ocorrências apagadas logo abaixo.
    insert into public.recurrence_cuts (company_id, recurrence_group_id, cut_from)
    select distinct v_company_id, a.recurrence_group_id, v_today
      from public.appointments a
      join public.professionals pr
        on pr.id = a.professional_id and pr.company_id = a.company_id
     where a.company_id = v_company_id
       and a.patient_id = p_patient_id
       and a.recurrence_group_id is not null
       and btrim(a.recurrence_group_id) <> ''
       and lower(btrim(coalesce(pr.specialty, ''))) = lower(v_spec)
    on conflict (company_id, recurrence_group_id) do update
      set cut_from = least(public.recurrence_cuts.cut_from, excluded.cut_from);

    delete from public.appointments a
     using public.professionals pr
     where a.company_id = v_company_id
       and a.patient_id = p_patient_id
       and pr.id = a.professional_id
       and pr.company_id = a.company_id
       and lower(btrim(coalesce(pr.specialty, ''))) = lower(v_spec)
       and a."date" >= v_today;
  end if;

  v_restantes := public._especialidades_ativas(v_company_id, p_patient_id, v_spec);

  -- Óbito encerra o cadastro inteiro. Alta, Desistência e as saídas sem
  -- avaliação (não iniciou / falta) valem só para a especialidade: o cadastro
  -- só é encerrado quando não sobra nenhuma área ativa.
  v_global := v_tipo in ('Óbito', 'Obito')
              or coalesce(array_length(v_restantes, 1), 0) = 0;

  if v_global then
    v_novo := case when v_tipo in ('Óbito', 'Obito', 'Desistência', 'Desistencia')
                   then v_tipo else 'Alta' end;
  elsif exists (
    select 1 from public.waiting_list w
     where w.company_id = v_company_id and w.patient_id = p_patient_id
  ) then
    v_novo := 'Fila de Espera';
  else
    v_novo := 'Atendimento';
  end if;

  update public.patients
     set status = v_novo, updated_at = now()
   where id = p_patient_id and company_id = v_company_id;

  return jsonb_build_object(
    'ok',                 true,
    'patientId',          p_patient_id,
    'specialty',          v_spec,
    'tipo',               v_tipo,
    'statusGlobal',       v_novo,
    'altaGlobalAplicada', v_global,
    'especialidadesAtivas', to_jsonb(v_restantes)
  );
end;
$$;

revoke all on function public.discharge_patient_specialty(text, text, bigint, text, bigint, text, text) from public;
grant execute on function public.discharge_patient_specialty(text, text, bigint, text, bigint, text, text) to anon, authenticated;

commit;
