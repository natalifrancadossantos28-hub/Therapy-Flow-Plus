-- 0023_realtime_appointments_publication.sql
--
-- Contexto: a Agenda Mensal do Admin (PR #48), a Agenda da Recepcao (PR #44) e
-- o Portal do Profissional usam supabase.channel(...).on('postgres_changes',
-- {schema:'public', table:'appointments'}, ...) para reagir em tempo real a
-- INSERT/UPDATE/DELETE em appointments. O codigo do front esta correto, mas
-- o Postgres so emite eventos para tabelas que estao na publication
-- supabase_realtime. A tabela `appointments` nunca foi adicionada nessa
-- publication (apenas waiting_list, patients e notificacoes_recepcao foram,
-- nas migrations 0010 e 0011), entao nenhum evento chegava nos canais
-- mencionados acima e o realtime ficava silencioso.
--
-- Esta migration adiciona public.appointments na publication supabase_realtime
-- de forma idempotente (ignora caso ja exista, nao falha caso a publication
-- nao exista no ambiente local).

do $$
begin
  begin
    alter publication supabase_realtime add table public.appointments;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end
$$;
