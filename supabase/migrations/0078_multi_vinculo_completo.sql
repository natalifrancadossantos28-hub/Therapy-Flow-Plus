-- ═══════════════════════════════════════════════════════════════════════════
-- 0078 — Atendimento Multi: completar o vínculo dos dois profissionais
--
-- Problema: o Multi grava uma linha para cada profissional, ligadas só pela
-- etiqueta "Atendimento Multi com <parceiro> (<especialidade>)". Quando a linha
-- do convidado não foi criada (ou a série dele não acompanhou a do principal),
-- o horário aparece LIVRE na agenda do convidado e o slot pode ser dado a
-- outro paciente.
--
-- Este script cria as linhas que faltam do lado do convidado, só de HOJE em
-- diante (não reescreve histórico) e só quando o agendamento do principal está
-- 'agendado'. É idempotente: rodar de novo não duplica nada.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  v_inserted int;
begin
  with host as (
    select
      a.id,
      a.company_id,
      a.patient_id,
      a.professional_id,
      a."date",
      a."time",
      a.frequency,
      btrim(regexp_replace(
        substring(a.notes from char_length('Atendimento Multi com ') + 1),
        '\s*\([^)]*\)\s*$', ''
      )) as partner_name
    from public.appointments a
    where a.notes like 'Atendimento Multi com %'
      and a.status = 'agendado'
      and a."date" >= to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD')
  ),
  resolved as (
    select
      h.*,
      guest.id   as guest_id,
      hp.name    as host_name,
      coalesce(nullif(btrim(hp.specialty), ''), '—') as host_specialty
    from host h
    join public.professionals guest
      on guest.company_id = h.company_id
     and upper(btrim(guest.name)) = upper(h.partner_name)
     and guest.id <> h.professional_id
    join public.professionals hp
      on hp.id = h.professional_id
    where h.partner_name <> ''
  ),
  missing as (
    select distinct on (r.company_id, r.patient_id, r."date", r."time", r.guest_id)
      r.*
    from resolved r
    where not exists (
      select 1
      from public.appointments b
      where b.company_id     = r.company_id
        and b.patient_id     = r.patient_id
        and b."date"         = r."date"
        and b."time"         = r."time"
        and b.professional_id = r.guest_id
    )
  )
  insert into public.appointments (
    company_id, patient_id, professional_id, "date", "time",
    status, notes, recurrence_group_id, frequency
  )
  select
    m.company_id, m.patient_id, m.guest_id, m."date", m."time",
    'agendado',
    'Atendimento Multi com ' || m.host_name || ' (' || m.host_specialty || ')',
    null,
    m.frequency
  from missing m;

  get diagnostics v_inserted = row_count;
  raise notice 'Atendimento Multi — linhas do convidado criadas: %', v_inserted;
end $$;

-- Conferência: quantos Multi ainda estão sem par (deve ficar 0 daqui pra frente)
select count(*) as multi_sem_par_de_hoje_em_diante
from public.appointments a
where a.notes like 'Atendimento Multi com %'
  and a.status = 'agendado'
  and a."date" >= to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD')
  and not exists (
    select 1
    from public.appointments b
    where b.company_id      = a.company_id
      and b.patient_id      = a.patient_id
      and b."date"          = a."date"
      and b."time"          = a."time"
      and b.professional_id <> a.professional_id
  );
