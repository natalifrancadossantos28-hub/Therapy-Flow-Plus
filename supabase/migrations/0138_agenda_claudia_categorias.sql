-- 0138 — Minha Agenda: mais tipos de compromisso (aniversário/festa, saúde, viagem, família, contas, escola, lazer).
-- Só amplia a lista permitida; nenhum compromisso existente muda.
do $$
declare r record;
begin
  for r in
    select con.conname from pg_constraint con
    join pg_class t on t.oid = con.conrelid
    where t.relname = 'agenda_exec_compromissos' and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%categoria%'
  loop
    execute format('alter table public.agenda_exec_compromissos drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.agenda_exec_compromissos
  add constraint agenda_exec_compromissos_categoria_check
  check (categoria in ('reuniao','evento','visita','palestra','urgente','pessoal','outro',
                       'aniversario','saude','viagem','familia','contas','escola','lazer'));
