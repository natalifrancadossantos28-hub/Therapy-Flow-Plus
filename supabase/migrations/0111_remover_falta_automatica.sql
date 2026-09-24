-- =========================================================================
-- 0111: fim da falta automática + remoção das faltas lançadas por ela
--
-- 1. auto_marcar_faltas deixa de marcar qualquer coisa (mantida como no-op
--    para não quebrar telas antigas ainda abertas que chamam a RPC).
--
-- 2. Limpeza: a rotina automática não deixava marcador próprio, então as
--    faltas dela são reconhecidas por como foram gravadas:
--      • status 'falta_nao_justificada' em atendimento a partir de 31/08/2026
--        (quando a rotina entrou, 0092), fora transporte; e
--      • gravada 24h ou mais depois do horário (regra da 0096 — depois desse
--        prazo a própria rotina já teria marcado), ou
--      • gravada 1h ou mais depois do horário no mesmo instante (updated_at
--        idêntico) que atendimentos de outro paciente — um lote da rotina;
--        a marcação manual grava um atendimento por vez.
--    Esses atendimentos voltam para 'agendado' (mesma regra do
--    reverter_falta) e o contador de faltas dos pacientes é recalculado.
-- =========================================================================

begin;

-- ── 1. Falta automática desligada ───────────────────────────────────────
create or replace function public.auto_marcar_faltas(
  p_slug        text,
  p_password    text,
  p_tolerancia  int default 1440
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform public._verify_company_admin(p_slug, p_password);
  return jsonb_build_object('marcadas', 0);
end;
$$;

revoke all on function public.auto_marcar_faltas(text, text, int) from public;
grant execute on function public.auto_marcar_faltas(text, text, int) to anon, authenticated;

-- ── 2. Remoção das faltas lançadas automaticamente ──────────────────────
create temporary table _faltas_auto on commit drop as
with candidatas as (
  select a.id,
         a.patient_id,
         a.updated_at,
         (a.updated_at at time zone 'America/Sao_Paulo')
           - (a."date" || ' ' || a."time")::timestamp as atraso
    from public.appointments a
    left join public.professionals p2
      on p2.id = a.professional_id and p2.company_id = a.company_id
   where lower(coalesce(a.status, '')) = 'falta_nao_justificada'
     and a."date" >= '2026-08-31'
     and not public._is_transport_specialty(coalesce(p2.specialty, ''))
),
auto as (
  select c.id, c.patient_id
    from candidatas c
   where c.atraso >= interval '24 hours'
      or (c.atraso >= interval '1 hour'
          and exists (
            select 1 from public.appointments o
             where o.updated_at = c.updated_at
               and o.patient_id <> c.patient_id
               and lower(coalesce(o.status, '')) = 'falta_nao_justificada'
          ))
)
select id, patient_id from auto;

update public.appointments a
   set status              = 'agendado',
       absence_reverted_at = now(),
       updated_at          = now()
  from _faltas_auto f
 where a.id = f.id;

do $$
declare
  v_total     int;
  v_pacientes int;
  v_patient   bigint;
begin
  for v_patient in select distinct patient_id from _faltas_auto loop
    perform public._recalc_patient_absences(v_patient);
  end loop;

  select count(*), count(distinct patient_id) into v_total, v_pacientes from _faltas_auto;
  raise notice 'Faltas automáticas removidas: % (em % pacientes)', v_total, v_pacientes;
end;
$$;

commit;
