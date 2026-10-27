-- 0132 — Fila de Espera: corrigir a data de entrada de uma especialidade.
-- Cada especialidade tem a sua data (waiting_list.entry_date). A data do cadastro
-- (patients.entry_date) continua separada e não é copiada para a fila.
-- A correção fica registrada no histórico (evento 'data_corrigida', de → para).

create or replace function public.set_waiting_list_entry_date(
  p_slug text, p_password text, p_id bigint, p_entry_date text, p_motivo text
) returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_company_id bigint;
  v_row public.waiting_list%rowtype;
  v_old text;
  v_new date;
  v_dob date;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Informe o motivo da correção da data.';
  end if;
  begin
    v_new := to_date(btrim(p_entry_date), 'YYYY-MM-DD');
  exception when others then
    raise exception 'Data inválida.';
  end;
  if v_new > v_hoje then raise exception 'A data de entrada não pode ser no futuro.'; end if;

  select * into v_row from public.waiting_list where id = p_id and company_id = v_company_id;
  if not found then raise exception 'Entrada não encontrada na fila de espera.'; end if;

  begin
    select to_date(p.date_of_birth, 'YYYY-MM-DD') into v_dob from public.patients p where p.id = v_row.patient_id;
  exception when others then v_dob := null;
  end;
  if v_dob is not null and v_new < v_dob then
    raise exception 'A data de entrada não pode ser antes do nascimento.';
  end if;

  v_old := v_row.entry_date;
  update public.waiting_list set entry_date = to_char(v_new, 'YYYY-MM-DD')
   where id = p_id returning * into v_row;

  perform public._fila_hist(v_row, 'data_corrigida', btrim(p_motivo),
    jsonb_build_object('de', v_old, 'para', v_row.entry_date));

  return jsonb_build_object('id', v_row.id, 'entryDate', v_row.entry_date, 'anterior', v_old);
end $$;
revoke all on function public.set_waiting_list_entry_date(text, text, bigint, text, text) from public;
grant execute on function public.set_waiting_list_entry_date(text, text, bigint, text, text) to anon, authenticated;
