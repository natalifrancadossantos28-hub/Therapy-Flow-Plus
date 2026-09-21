-- =========================================================================
-- 0104_alta_limpa_agenda_futura.sql
--
-- Paciente com status global Alta / Óbito / Desistência continuava com
-- linhas "agendado" de hoje em diante na tabela appointments (altas antigas
-- que apagavam só uma série, séries duplicadas, Multi, etc.). Como a grade
-- passou a mostrar tudo que está no banco (0086/0098), esses horários
-- reapareciam na agenda NF como se o paciente ainda estivesse em atendimento.
--
-- Esta migration:
--   1. apaga (backfill) os agendamentos futuros ainda não realizados de
--      pacientes encerrados — o histórico (presenças/faltas/datas passadas)
--      é preservado;
--   2. cria trigger em patients: sempre que o status virar Alta/Óbito/
--      Desistência, os agendamentos futuros não realizados são removidos;
--      agendar de novo continua reativando o paciente (create_appointments).
--   3. consulta final: resumo da agenda fixa de cada profissional (paciente,
--      dia da semana, hora, frequência) para conferir com a folha impressa.
--
-- Idempotente.
-- =========================================================================

begin;

-- ═══════════════════════════════════════════════════════════════════════
-- Helper: status de agendamento que ainda não aconteceram (podem ser apagados)
-- ═══════════════════════════════════════════════════════════════════════
create or replace function public._is_open_appointment_status(p_status text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(p_status, '')) in ('agendado', 'ativo', 'atendimento', 'em_atendimento', 'em atendimento')
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
-- 1. Backfill — remove agenda futura de quem já está encerrado
-- ═══════════════════════════════════════════════════════════════════════
create temp table if not exists _0104_removidos as
select a.id, a.company_id, a.patient_id, p.name as patient_name, p.status as patient_status,
       pr.name as professional_name, pr.specialty, a."date", a."time", a.status, a.frequency
  from public.appointments a
  join public.patients p       on p.id = a.patient_id and p.company_id = a.company_id
  left join public.professionals pr on pr.id = a.professional_id
 where public._is_closed_patient_status(p.status)
   and public._is_open_appointment_status(a.status)
   and a."date" >= to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');

delete from public.appointments a
 using _0104_removidos r
 where a.id = r.id;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Trigger — status encerrado limpa a agenda futura na hora
-- ═══════════════════════════════════════════════════════════════════════
create or replace function public._patient_encerrado_limpa_agenda()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if public._is_closed_patient_status(new.status)
     and not public._is_closed_patient_status(old.status) then
    delete from public.appointments a
     where a.company_id = new.company_id
       and a.patient_id = new.id
       and public._is_open_appointment_status(a.status)
       and a."date" >= to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_patient_encerrado_limpa_agenda on public.patients;

create trigger trg_patient_encerrado_limpa_agenda
  after update of status on public.patients
  for each row execute function public._patient_encerrado_limpa_agenda();

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Conferência
-- ═══════════════════════════════════════════════════════════════════════
-- 3a. O que foi removido pelo backfill
select * from _0104_removidos order by professional_name, "date", "time";

-- 3b. Agenda fixa atual por profissional (de hoje em diante), para bater com a
--     folha impressa: um registro por paciente + dia da semana + hora.
select pr.name                                           as profissional,
       pr.specialty                                      as especialidade,
       p.name                                            as paciente,
       p.id                                              as paciente_id,
       p.status                                          as status_paciente,
       case extract(isodow from a."date"::date)
         when 1 then 'Seg' when 2 then 'Ter' when 3 then 'Qua'
         when 4 then 'Qui' when 5 then 'Sex' when 6 then 'Sáb' else 'Dom' end as dia,
       a."time"                                          as hora,
       min(a.frequency)                                  as frequencia,
       min(a."date")                                     as proxima_data,
       count(*)                                          as datas_futuras
  from public.appointments a
  join public.patients p        on p.id = a.patient_id and p.company_id = a.company_id
  join public.professionals pr  on pr.id = a.professional_id
 where a."date" >= to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')
   and public._is_open_appointment_status(a.status)
 group by pr.name, pr.specialty, p.name, p.id, p.status,
          extract(isodow from a."date"::date), a."time"
 order by pr.name, extract(isodow from a."date"::date), a."time", p.name;
