-- 0140 — Busca Ativa separada da Pausa.
-- Pausa: o profissional pausa o atendimento (ex.: mãe vai ganhar bebê). Continua
--        como era (waiting_list.paused / appointments.paused), lista "Pausados".
-- Busca Ativa: caso social para a assistente social (violação de direitos etc.).
--        Tabela própria; a criança continua na fila e na agenda normalmente.
--        "Finalizar e tirar da lista" só fecha o caso; nada na fila/agenda muda.
-- Os pausados de hoje entram como casos de Busca Ativa (origem 'pausa'); a
-- gestão tira os que são só pausa com o botão "É só pausa".

begin;

create table if not exists public.busca_ativa_casos (
  id              bigserial primary key,
  company_id      bigint not null,
  patient_id      bigint not null,
  specialty       text,
  professional_id bigint,
  motivo          text not null,
  encaminhado_por text,
  origem          text not null default 'encaminhamento' check (origem in ('encaminhamento','pausa')),
  status          text not null default 'pendente'
                  check (status in ('pendente','em_andamento','resolvido','nao_resolvido','finalizado')),
  obs             text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  finalizado_at   timestamptz,
  saida           text
);
create index if not exists busca_ativa_casos_company_idx on public.busca_ativa_casos (company_id, finalizado_at);
create index if not exists busca_ativa_casos_patient_idx on public.busca_ativa_casos (company_id, patient_id);
alter table public.busca_ativa_casos enable row level security;

do $$
declare v_today text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
begin
  if exists (select 1 from public.busca_ativa_casos) then return; end if;

  insert into public.busca_ativa_casos
    (company_id, patient_id, specialty, professional_id, motivo, encaminhado_por, origem, status, obs, created_at, updated_at)
  select w.company_id, w.patient_id, coalesce(w.specialty, pr.specialty), w.professional_id,
         coalesce(w.paused_reason, 'Busca ativa'), coalesce(w.paused_origin, 'Fila de Espera'), 'pausa',
         case when w.busca_status in ('pendente','em_andamento','resolvido','nao_resolvido') then w.busca_status else 'pendente' end,
         w.busca_obs, coalesce(w.paused_at, now()), coalesce(w.busca_updated_at, w.paused_at, now())
    from public.waiting_list w
    left join public.professionals pr on pr.id = w.professional_id
   where w.paused = true;

  insert into public.busca_ativa_casos
    (company_id, patient_id, specialty, professional_id, motivo, encaminhado_por, origem, status, obs, created_at, updated_at)
  select distinct on (a.company_id, a.patient_id, a.professional_id)
         a.company_id, a.patient_id, pr.specialty, a.professional_id,
         coalesce(a.paused_reason, 'Pausa temporária'), 'Agenda — ' || coalesce(pr.name, ''), 'pausa',
         case when a.busca_status in ('pendente','em_andamento','resolvido','nao_resolvido') then a.busca_status else 'pendente' end,
         a.busca_obs, coalesce(a.paused_at, now()), coalesce(a.busca_updated_at, a.paused_at, now())
    from public.appointments a
    left join public.professionals pr on pr.id = a.professional_id
   where a."date" >= v_today and a.patient_id is not null
     and (a.paused = true or lower(coalesce(a.status,'')) = 'pausado')
   order by a.company_id, a.patient_id, a.professional_id, a."date";
end $$;

create or replace function public.list_busca_ativa_casos(
  p_slug text, p_password text, p_patient_id bigint default null
) returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_company_id bigint; v_out jsonb;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'patientId', c.patient_id, 'patientName', coalesce(p.name, ''), 'prontuario', p.prontuario,
    'patientPhone', coalesce(p.phone, p.guardian_phone), 'address', p.address,
    'guardianName', coalesce(p.guardian_name, p.mother_name),
    'specialty', coalesce(c.specialty, pr.specialty), 'professionalId', c.professional_id,
    'professionalName', pr.name, 'motivo', c.motivo, 'encaminhadoPor', c.encaminhado_por,
    'origem', c.origem, 'status', c.status, 'obs', c.obs, 'createdAt', c.created_at,
    'updatedAt', c.updated_at, 'finalizadoAt', c.finalizado_at, 'saida', c.saida
  ) order by c.created_at), '[]'::jsonb)
  into v_out
  from public.busca_ativa_casos c
  left join public.patients p on p.id = c.patient_id
  left join public.professionals pr on pr.id = c.professional_id
  where c.company_id = v_company_id and (p_patient_id is null or c.patient_id = p_patient_id);
  return v_out;
end $$;
revoke all on function public.list_busca_ativa_casos(text, text, bigint) from public;
grant execute on function public.list_busca_ativa_casos(text, text, bigint) to anon, authenticated;

create or replace function public.open_busca_ativa_caso(
  p_slug text, p_password text, p_patient_id bigint, p_motivo text,
  p_specialty text default null, p_professional_id bigint default null, p_encaminhado_por text default null
) returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_company_id bigint; v_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception 'Informe o motivo da busca ativa'; end if;
  if not exists (select 1 from public.patients where id = p_patient_id and company_id = v_company_id) then
    raise exception 'Paciente não encontrado';
  end if;
  insert into public.busca_ativa_casos (company_id, patient_id, specialty, professional_id, motivo, encaminhado_por)
  values (v_company_id, p_patient_id, nullif(btrim(coalesce(p_specialty, '')), ''), p_professional_id,
          btrim(p_motivo), nullif(btrim(coalesce(p_encaminhado_por, '')), ''))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
revoke all on function public.open_busca_ativa_caso(text, text, bigint, text, text, bigint, text) from public;
grant execute on function public.open_busca_ativa_caso(text, text, bigint, text, text, bigint, text) to anon, authenticated;

create or replace function public.update_busca_ativa_caso(
  p_slug text, p_password text, p_id bigint, p_status text, p_obs text default null, p_saida text default null
) returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_company_id bigint;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  if p_status not in ('pendente','em_andamento','resolvido','nao_resolvido','finalizado') then
    raise exception 'Status de busca ativa inválido: %', p_status;
  end if;
  update public.busca_ativa_casos
     set status = p_status,
         obs = nullif(btrim(coalesce(p_obs, '')), ''),
         updated_at = now(),
         finalizado_at = case when p_status = 'finalizado' then coalesce(finalizado_at, now()) end,
         saida = case when p_status = 'finalizado' then coalesce(nullif(btrim(coalesce(p_saida, '')), ''), 'Busca ativa finalizada') end
   where id = p_id and company_id = v_company_id;
  if not found then raise exception 'Caso de busca ativa não encontrado'; end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.update_busca_ativa_caso(text, text, bigint, text, text, text) from public;
grant execute on function public.update_busca_ativa_caso(text, text, bigint, text, text, text) to anon, authenticated;

commit;
