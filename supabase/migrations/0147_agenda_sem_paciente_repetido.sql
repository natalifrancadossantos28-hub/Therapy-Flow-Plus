-- =========================================================================
-- 0147_agenda_sem_paciente_repetido.sql
--
-- Limpa o paciente repetido no MESMO profissional, MESMO dia e MESMO horário
-- (sessões de hoje em diante). Causas já corrigidas:
--   • Remanejar para outro dia da semana jogava a sessão seguinte em cima da
--     nova (ex.: Alice / Karla, segunda 30/11 duas vezes) — corrigido no app.
--   • A extensão automática recriava a série antiga por baixo da série do
--     Atendimento Multi (ex.: Endrew / Geovana) — corrigido na 0146.
--   • Transporte criado duas vezes para o mesmo horário — o app agora bloqueia.
--
-- Fica uma linha por horário, nesta ordem: a que já tem situação (remanejado,
-- remarcado, presente, falta...), depois a do Atendimento Multi, depois a mais
-- antiga. Só são apagadas linhas "agendado"; histórico e presenças ficam.
-- Série que perdeu todas as sessões futuras é encerrada para não voltar.
--
-- Rode DEPOIS da 0146. Idempotente.
-- =========================================================================

begin;

create temp table _dup_apagar on commit drop as
with abertas as (
  select a.id, a.company_id, a.recurrence_group_id, a.status, a."date", a."time",
         row_number() over (
           partition by a.company_id, a.patient_id, a.professional_id, a."date", a."time"
           order by (lower(coalesce(a.status, 'agendado')) in ('agendado', 'agendada', 'scheduled')),
                    (coalesce(a.notes, '') like 'Atendimento Multi com %') desc,
                    a.id
         ) as rn
    from public.appointments a
   where a."date"::date >= (now() at time zone 'America/Sao_Paulo')::date
     and lower(coalesce(a.status, '')) not in ('desmarcado', 'cancelado')
)
select id, company_id, recurrence_group_id, "date", "time"
  from abertas
 where rn > 1
   and lower(coalesce(status, 'agendado')) in ('agendado', 'agendada', 'scheduled');

-- Confere de novo na hora de apagar: se a recepção marcou presença ou mudou a
-- sessão nesse meio tempo, ela fica.
create temp table _dup_removidas on commit drop as
select company_id, recurrence_group_id from _dup_apagar limit 0;

with del as (
  delete from public.appointments a
   using _dup_apagar d
   where a.id = d.id
     and a."date" = d."date"
     and a."time" = d."time"
     and lower(coalesce(a.status, 'agendado')) in ('agendado', 'agendada', 'scheduled')
  returning a.company_id, a.recurrence_group_id
)
insert into _dup_removidas select company_id, recurrence_group_id from del;

insert into public.recurrence_cuts (company_id, recurrence_group_id, cut_from)
select distinct d.company_id, d.recurrence_group_id,
       to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')
  from _dup_removidas d
 where d.recurrence_group_id is not null
   and btrim(d.recurrence_group_id) <> ''
   and not exists (
     select 1 from public.appointments a
      where a.company_id = d.company_id
        and a.recurrence_group_id = d.recurrence_group_id
        and a."date"::date >= (now() at time zone 'America/Sao_Paulo')::date
   )
on conflict (company_id, recurrence_group_id) do nothing;

commit;
