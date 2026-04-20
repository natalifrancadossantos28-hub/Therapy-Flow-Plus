-- =============================================================================
-- Fase 6 — Central de Notificações da Recepção (extensão)
-- =============================================================================
-- Goal: adicionar patient_phone à tabela notificacoes_recepcao para que a
-- Recepção consiga clicar em "Avisar Pais" e abrir WhatsApp direto, sem um
-- lookup adicional no paciente.
--
-- Design: coluna nullable (registros antigos ficam sem phone; o front desabilita
-- o botão "Avisar Pais" nesses casos). Só o RPC create_notificacao é ampliado
-- pra aceitar o novo parâmetro. list_notificacoes continua retornando a linha
-- inteira (a nova coluna entra automaticamente).
-- =============================================================================

alter table public.notificacoes_recepcao
  add column if not exists patient_phone text;

-- ── RPC: create_notificacao (extensão) ────────────────────────────────────────
-- Mantém a ordem dos parâmetros antigos e adiciona p_patient_phone no final
-- (default null) para preservar compatibilidade com chamadas existentes.

create or replace function public.create_notificacao(
  p_slug              text,
  p_password          text,
  p_appointment_id    bigint default null,
  p_patient_name      text   default null,
  p_professional_name text   default null,
  p_acao              text   default null,
  p_data_consulta     text   default '',
  p_hora_consulta     text   default '',
  p_patient_phone     text   default null
)
returns public.notificacoes_recepcao
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_row        public.notificacoes_recepcao%rowtype;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  if nullif(btrim(coalesce(p_patient_name, '')), '') is null then
    raise exception 'patient_name is required';
  end if;
  if nullif(btrim(coalesce(p_acao, '')), '') is null then
    raise exception 'acao is required';
  end if;

  insert into public.notificacoes_recepcao (
    company_id, appointment_id, patient_name, professional_name, acao,
    data_consulta, hora_consulta, patient_phone
  ) values (
    v_company_id, p_appointment_id, p_patient_name,
    coalesce(nullif(btrim(p_professional_name), ''), '—'),
    p_acao, coalesce(p_data_consulta, ''), coalesce(p_hora_consulta, ''),
    nullif(btrim(coalesce(p_patient_phone, '')), '')
  ) returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.create_notificacao(text, text, bigint, text, text, text, text, text, text) from public;
grant  execute on function public.create_notificacao(text, text, bigint, text, text, text, text, text, text) to anon, authenticated;
