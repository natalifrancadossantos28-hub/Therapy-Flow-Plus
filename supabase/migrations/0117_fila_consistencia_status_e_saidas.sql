-- =========================================================================
-- 0117_fila_consistencia_status_e_saidas.sql
--
-- Fila de Espera consistente com cadastro e agenda (roda a cada abertura da
-- tela via sync_waiting_list_with_agenda e uma vez agora):
--   1. Duplicatas (mantém a mais antiga).
--   2. Paciente com agendamento ativo na mesma especialidade sai da fila
--      (inclusive entrada manual; mãe/Pilates não tira a criança).
--   3. Paciente com Alta / Desistência / Óbito não fica em fila nenhuma.
--   4. Entrada "Qualquer especialidade" é removida quando o paciente já tem
--      entrada em especialidade definida.
--   5. Status do cadastro:
--        • quem tem agendamento ativo em qualquer área → 'Atendimento'
--          (mesmo que ainda espere vaga em outra área);
--        • quem não tem agenda mas está na fila → 'Fila de Espera';
--        • quem está 'Fila de Espera' sem fila e sem agenda → 'Aguardando Triagem'.
--      Alta / Desistência / Óbito / Censo não são alterados.
-- Idempotente.
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
  v_saidas     integer := 0;
  v_null_spec  integer := 0;
  v_status_fix integer := 0;
  v_tmp        integer := 0;
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

  -- 2. Agendamento ativo na mesma especialidade tira da fila
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

  -- 3. Alta / Desistência / Óbito não ficam na fila
  delete from public.waiting_list wl
   using public.patients pt
   where wl.company_id = v_company_id
     and pt.id = wl.patient_id
     and pt.status in ('Alta', 'Desistência', 'Óbito');
  get diagnostics v_saidas = row_count;

  -- 4. "Qualquer especialidade" sai quando já há entrada com especialidade
  delete from public.waiting_list wl
   where wl.company_id = v_company_id
     and wl.specialty is null
     and exists (
       select 1 from public.waiting_list w2
        where w2.company_id = wl.company_id
          and w2.patient_id = wl.patient_id
          and w2.specialty is not null
     );
  get diagnostics v_null_spec = row_count;

  -- 5a. Agendamento ativo em qualquer área → Atendimento
  update public.patients pt
     set status = 'Atendimento', updated_at = now()
   where pt.company_id = v_company_id
     and coalesce(pt.status, '') in ('Fila de Espera', 'Aguardando Triagem', 'Cadastro Geral', '')
     and coalesce(pt.tipo_registro, '') <> 'Registro Censo Municipal'
     and exists (
       select 1 from public.appointments a
        where a.patient_id = pt.id
          and a.company_id = v_company_id
          and a."date" >= v_today
          and coalesce(a.notes, '') not like '%[PILATES — Mãe/Responsável]%'
          and lower(coalesce(a.status, 'agendado')) not in (
            'desmarcado','cancelado','alta','falta','falta_justificada',
            'falta_nao_justificada','ausente','desistência','desistencia','óbito'
          )
     );
  get diagnostics v_status_fix = row_count;

  -- 5b. Na fila, sem agenda → Fila de Espera
  update public.patients pt
     set status = 'Fila de Espera', updated_at = now()
   where pt.company_id = v_company_id
     and coalesce(pt.status, '') in ('Atendimento', 'Aguardando Triagem', 'Cadastro Geral', '')
     and exists (
       select 1 from public.waiting_list wl
        where wl.patient_id = pt.id and wl.company_id = v_company_id
     )
     and not exists (
       select 1 from public.appointments a
        where a.patient_id = pt.id
          and a.company_id = v_company_id
          and a."date" >= v_today
          and lower(coalesce(a.status, 'agendado')) not in (
            'desmarcado','cancelado','alta','falta','falta_justificada',
            'falta_nao_justificada','ausente','desistência','desistencia','óbito'
          )
     );
  get diagnostics v_tmp = row_count;
  v_status_fix := v_status_fix + v_tmp;

  -- 5c. "Fila de Espera" sem fila e sem agenda → Aguardando Triagem
  update public.patients pt
     set status = 'Aguardando Triagem', updated_at = now()
   where pt.company_id = v_company_id
     and pt.status = 'Fila de Espera'
     and not exists (
       select 1 from public.waiting_list wl
        where wl.patient_id = pt.id and wl.company_id = v_company_id
     )
     and not exists (
       select 1 from public.appointments a
        where a.patient_id = pt.id
          and a.company_id = v_company_id
          and a."date" >= v_today
          and lower(coalesce(a.status, 'agendado')) not in (
            'desmarcado','cancelado','alta','falta','falta_justificada',
            'falta_nao_justificada','ausente','desistência','desistencia','óbito'
          )
     );
  get diagnostics v_tmp = row_count;
  v_status_fix := v_status_fix + v_tmp;

  return jsonb_build_object(
    'ok', true,
    'duplicatesRemoved', v_deduped,
    'syncedRemoved', v_cleaned,
    'saidasRemoved', v_saidas,
    'nullSpecialtyRemoved', v_null_spec,
    'statusFixed', v_status_fix
  );
end;
$$;

revoke all on function public.sync_waiting_list_with_agenda(text, text) from public;
grant execute on function public.sync_waiting_list_with_agenda(text, text) to anon, authenticated;

-- Aplica agora (equivalente da função, para todas as unidades).

delete from public.waiting_list wl using public.patients pt
 where pt.id = wl.patient_id and pt.status in ('Alta','Desistência','Óbito');

delete from public.waiting_list wl
 where wl.specialty is null
   and exists (select 1 from public.waiting_list w2
                where w2.company_id = wl.company_id and w2.patient_id = wl.patient_id and w2.specialty is not null);

with hoje as (select to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') d),
ativo as (
  select distinct a.patient_id from public.appointments a, hoje
   where a."date" >= hoje.d
     and coalesce(a.notes, '') not like '%[PILATES — Mãe/Responsável]%'
     and lower(coalesce(a.status,'agendado')) not in ('desmarcado','cancelado','alta','falta','falta_justificada','falta_nao_justificada','ausente','desistência','desistencia','óbito')
)
update public.patients pt set status = 'Atendimento', updated_at = now()
 where coalesce(pt.status,'') in ('Fila de Espera','Aguardando Triagem','Cadastro Geral','')
   and coalesce(pt.tipo_registro,'') <> 'Registro Censo Municipal'
   and pt.id in (select patient_id from ativo);

with hoje as (select to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') d),
ativo as (
  select distinct a.patient_id from public.appointments a, hoje
   where a."date" >= hoje.d
     and lower(coalesce(a.status,'agendado')) not in ('desmarcado','cancelado','alta','falta','falta_justificada','falta_nao_justificada','ausente','desistência','desistencia','óbito')
)
update public.patients pt set status = 'Aguardando Triagem', updated_at = now()
 where pt.status = 'Fila de Espera'
   and pt.id not in (select patient_id from public.waiting_list)
   and pt.id not in (select patient_id from ativo);

with hoje as (select to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') d)
delete from public.waiting_list wl
 using hoje
 where exists (
   select 1 from public.appointments a
     join public.professionals p on p.id = a.professional_id and p.company_id = a.company_id
    where a.company_id = wl.company_id and a.patient_id = wl.patient_id and a."date" >= hoje.d
      and coalesce(a.notes, '') not like '%[PILATES — Mãe/Responsável]%'
      and lower(coalesce(a.status,'agendado')) not in ('desmarcado','cancelado','alta','falta','falta_justificada','falta_nao_justificada','ausente','desistência','desistencia','óbito')
      and (wl.specialty is null or lower(btrim(coalesce(p.specialty,''))) = lower(btrim(coalesce(wl.specialty,''))))
 );

with hoje as (select to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') d),
ativo as (
  select distinct a.patient_id from public.appointments a, hoje
   where a."date" >= hoje.d
     and lower(coalesce(a.status,'agendado')) not in ('desmarcado','cancelado','alta','falta','falta_justificada','falta_nao_justificada','ausente','desistência','desistencia','óbito')
)
update public.patients pt set status = 'Fila de Espera', updated_at = now()
 where coalesce(pt.status,'') in ('Atendimento','Aguardando Triagem','Cadastro Geral','')
   and pt.id in (select patient_id from public.waiting_list)
   and pt.id not in (select patient_id from ativo);

notify pgrst, 'reload schema';
commit;
