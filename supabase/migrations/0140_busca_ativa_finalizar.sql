-- 0140 — Busca Ativa: botão "Finalizar e tirar da lista".
-- Novo status 'finalizado': o paciente sai da lista da Busca Ativa, mas a
-- fila e a agenda NÃO mudam (continua pausado). Fica registrado em
-- "Já passaram pela Busca Ativa". Reabrir = voltar o status para 'pendente'.

begin;

create or replace function public._busca_status_label(p_status text) returns text
language sql immutable as $$
  select case coalesce(p_status,'pendente')
    when 'em_andamento'  then 'Em andamento'
    when 'resolvido'     then 'Resolvido'
    when 'nao_resolvido' then 'Não resolvido'
    when 'finalizado'    then 'Finalizada'
    else 'Pendente' end
$$;

create or replace function public.set_busca_ativa_status(
  p_slug text, p_password text, p_source text, p_id bigint, p_status text, p_obs text default null
) returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_company_id bigint; v_row public.waiting_list%rowtype; v_apt public.appointments%rowtype;
  v_today text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');
  v_obs text := nullif(btrim(coalesce(p_obs,'')), '');
  v_n integer := 0;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  if p_status not in ('pendente','em_andamento','resolvido','nao_resolvido','finalizado') then
    raise exception 'Status de busca ativa inválido: %', p_status;
  end if;

  if p_source = 'fila' then
    update public.waiting_list
       set busca_status = p_status, busca_obs = v_obs, busca_updated_at = now(), updated_at = now()
     where id = p_id and company_id = v_company_id and paused = true
     returning * into v_row;
    if not found then raise exception 'Paciente pausado não encontrado'; end if;
    perform public._fila_hist(v_row, 'busca_ativa',
      'Busca ativa: ' || public._busca_status_label(p_status) || coalesce(' — ' || v_obs, ''), null);
    if p_status = 'finalizado' then
      perform public._busca_hist_from_fila(v_row, 'Busca ativa finalizada (continua pausado)');
    end if;
    v_n := 1;
  else
    select * into v_apt from public.appointments where id = p_id and company_id = v_company_id;
    if not found then raise exception 'Agendamento não encontrado'; end if;
    update public.appointments
       set busca_status = p_status, busca_obs = v_obs, busca_updated_at = now(), updated_at = now()
     where company_id = v_company_id and patient_id = v_apt.patient_id and professional_id = v_apt.professional_id
       and "date" >= v_today and (paused = true or lower(coalesce(status,'')) = 'pausado');
    get diagnostics v_n = row_count;
    if p_status = 'finalizado' and v_n > 0 then
      insert into public.busca_ativa_historico
        (company_id, patient_id, patient_name, prontuario, specialty, professional_name, origin, keeps_agenda,
         motivo, paused_at, return_date, busca_status, busca_obs, retorno_motivo)
      select v_company_id, v_apt.patient_id, p.name, p.prontuario, pr.specialty, pr.name,
             'Agenda — ' || coalesce(pr.name, ''), true,
             coalesce(v_apt.paused_reason, 'Pausa temporária'), v_apt.paused_at, v_apt.paused_return_date,
             'finalizado', v_obs, 'Busca ativa finalizada (continua pausado)'
        from public.patients p, public.professionals pr
       where p.id = v_apt.patient_id and pr.id = v_apt.professional_id;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'updated', v_n, 'buscaStatus', p_status, 'buscaObs', v_obs);
end $$;
revoke all on function public.set_busca_ativa_status(text, text, text, bigint, text, text) from public;
grant execute on function public.set_busca_ativa_status(text, text, text, bigint, text, text) to anon, authenticated;

commit;
