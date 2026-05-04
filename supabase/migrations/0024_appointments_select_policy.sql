-- 0024_appointments_select_policy.sql
--
-- Contexto: a migration 0023 adicionou public.appointments na publication
-- supabase_realtime, mas o realtime continuou silencioso porque a tabela tem
-- RLS habilitado (0008 linha 44) e nenhuma policy SELECT. O Supabase Realtime
-- so entrega eventos para clientes que poderiam ler aquela linha via RLS;
-- sem policy de SELECT, anon/authenticated nao recebem nada.
--
-- Padrao identico ao usado em waiting_list e patients (migration 0011 linhas
-- 325-337): SELECT aberto para anon e authenticated, escritas continuam
-- exclusivas das RPCs SECURITY DEFINER (que bypassam RLS).
--
-- Este policy nao muda o comportamento do app: todas as leituras hoje passam
-- por RPCs SECURITY DEFINER (list_appointments_today, list_appointments,
-- get_appointments_stats), que ignoram RLS. Esta policy serve unicamente
-- para o Realtime entregar eventos postgres_changes para a Agenda Mensal do
-- Admin (PR #48), Agenda da Recepcao (PR #44) e Portal do Profissional.

drop policy if exists appointments_read_all on public.appointments;
create policy appointments_read_all
  on public.appointments
  for select
  to anon, authenticated
  using (true);
