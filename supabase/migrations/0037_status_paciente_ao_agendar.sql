-- =============================================================================
-- 0037: Status do paciente vira "Atendimento" automaticamente ao criar agenda.
-- =============================================================================
--
-- Problema (reportado pela Natali com a paciente Victoria Pedroso):
--   Ao criar um agendamento direto pela Agenda Geral (admin), o status do
--   paciente ficava em "Aguardando Triagem" / "Fila de Espera" mesmo já
--   estando agendado. A lista /patients mostrava informação desatualizada.
--
-- Regra:
--   Sempre que um agendamento é INSERIDO em public.appointments (qualquer
--   modo: agenda direta, fila, recorrência, etc.), se o paciente vinculado
--   estiver em "Aguardando Triagem" ou "Fila de Espera", o status passa a
--   ser "Atendimento" e o professional_id é definido.
--
-- Não muda quem já está em "Atendimento", "Alta", "Óbito" ou "Desistência".
-- Não rebaixa status no caso de Falta/Desmarcar (regras existentes seguem).
-- =============================================================================

begin;

create or replace function public._tg_appointments_sync_patient_status()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if new.patient_id is null then
    return new;
  end if;

  begin
    update public.patients
       set status          = 'Atendimento',
           professional_id = coalesce(new.professional_id, professional_id),
           updated_at      = now()
     where id = new.patient_id
       and company_id = new.company_id
       and coalesce(status, '') in ('Aguardando Triagem', 'Fila de Espera');
  exception when others then
    raise warning 'sync_patient_status falhou para appointment %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists tg_appointments_sync_patient_status on public.appointments;
create trigger tg_appointments_sync_patient_status
  after insert on public.appointments
  for each row
  execute function public._tg_appointments_sync_patient_status();

-- =============================================================================
-- Backfill: pacientes que já têm appointment ativa mas continuam em
-- "Aguardando Triagem" / "Fila de Espera" são corrigidos agora.
-- "Ativa" = qualquer status que NÃO seja cancelado/falta/desmarcado/remanejado.
-- =============================================================================
with primeiros as (
  select distinct on (a.company_id, a.patient_id)
         a.company_id, a.patient_id, a.professional_id
    from public.appointments a
   where lower(coalesce(a.status, 'agendado')) not in (
           'cancelado','cancelada',
           'desmarcado','desmarcada',
           'remanejado','remarcado',
           'falta','falta_justificada','falta_nao_justificada','ausente'
         )
   order by a.company_id, a.patient_id, a."date", a."time"
)
update public.patients p
   set status          = 'Atendimento',
       professional_id = coalesce(p.professional_id, primeiros.professional_id),
       updated_at      = now()
  from primeiros
 where primeiros.company_id = p.company_id
   and primeiros.patient_id = p.id
   and coalesce(p.status, '') in ('Aguardando Triagem', 'Fila de Espera');

commit;
