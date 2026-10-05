-- =========================================================================
-- 0113_fila_remove_ja_agendado_mesmo_manual.sql
--
-- Paciente com agendamento ativo numa especialidade não pode continuar na
-- fila dessa mesma especialidade — nem quando a entrada foi inserida
-- manualmente pelo administrador (manual_admin), que até aqui ficava imune à
-- limpeza e permitia a duplicidade "está na fila e já está na agenda".
--
-- Exceções preservadas:
--   * agendamento da mãe/responsável (Pilates, notes com a etiqueta
--     "[PILATES — Mãe/Responsável]") não tira a criança da fila de Fisioterapia;
--   * fila de outra especialidade continua intacta.
--
-- Idempotente: pode rodar mais de uma vez.
-- =========================================================================

begin;

create or replace function public.sync_waiting_list_with_agenda(
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
  v_today      text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  v_cleaned    integer := 0;
  v_deduped    integer := 0;
  v_status_fix integer := 0;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  -- 1. Duplicatas (mantém a mais antiga)
  delete from public.waiting_list
   where company_id = v_company_id
     and id not in (
       select min(id)
         from public.waiting_list
        where company_id = v_company_id
        group by patient_id, coalesce(specialty, '__NULL__')
     );
  get diagnostics v_deduped = row_count;

  -- 2. Paciente com agendamento ativo na mesma especialidade sai da fila,
  --    inclusive entradas manuais do administrador.
  delete from public.waiting_list wl
   where wl.company_id = v_company_id
     and exists (
       select 1 from public.appointments a
         join public.professionals p on p.id = a.professional_id
                                     and p.company_id = a.company_id
        where a.company_id = v_company_id
          and a.patient_id = wl.patient_id
          and a."date" >= v_today
          and coalesce(a.notes, '') not like '%[PILATES — Mãe/Responsável]%'
          and lower(coalesce(a.status, 'agendado')) not in (
            'desmarcado','cancelado','alta','falta','falta_justificada',
            'falta_nao_justificada','ausente','desistência','desistencia','óbito'
          )
          and (
            wl.specialty is null
            or lower(btrim(coalesce(p.specialty, ''))) = lower(btrim(coalesce(wl.specialty, '')))
          )
     );
  get diagnostics v_cleaned = row_count;

  -- 3. Corrige o status de quem está em atendimento e fora da fila.
  update public.patients pt
     set status = 'Atendimento', updated_at = now()
   where pt.company_id = v_company_id
     and coalesce(pt.status, '') in ('Fila de Espera', 'Aguardando Triagem', '')
     and exists (
       select 1 from public.appointments a
        where a.patient_id = pt.id
          and a.company_id = v_company_id
          and a."date" >= v_today
          and lower(coalesce(a.status, 'agendado')) not in (
            'desmarcado','cancelado','alta','falta','falta_justificada',
            'falta_nao_justificada','ausente','desistência','desistencia','óbito'
          )
     )
     and not exists (
       select 1 from public.waiting_list wl
        where wl.patient_id = pt.id and wl.company_id = v_company_id
     );
  get diagnostics v_status_fix = row_count;

  return jsonb_build_object(
    'ok', true,
    'duplicatesRemoved', v_deduped,
    'syncedRemoved', v_cleaned,
    'statusFixed', v_status_fix
  );
end;
$$;

revoke all on function public.sync_waiting_list_with_agenda(text, text) from public;
grant execute on function public.sync_waiting_list_with_agenda(text, text) to anon, authenticated;

commit;
