-- Agenda da Cláudia: aviso na hora, sem duplicar o lembrete anterior.
-- Preserva preferências de Não avisar, compromissos concluídos e controle de acesso.

begin;
create or replace function public.agenda_exec_disparar()
returns int language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_agora timestamp := (now() at time zone 'America/Sao_Paulo');
  v_hoje  date := (now() at time zone 'America/Sao_Paulo')::date;
  v_itens jsonb := '[]'::jsonb;
  v_min   int;
  r       record;
begin
  -- Sem a chave dos avisos, não marca nada como enviado (para não perder lembretes).
  if not exists (select 1 from public.agenda_exec_config where id = 1 and vapid_private is not null) then
    return -1;
  end if;
  delete from public.agenda_exec_lotes where criado_em < now() - interval '7 days';
  delete from public.agenda_exec_envios where em < now() - interval '60 days';

  for r in
    select c.*, (c.data + c.hora::time) as inicio
      from public.agenda_exec_compromissos c
     where not c.concluido and c.hora is not null and c.antecedencia_min > 0
       and c.data between v_hoje - 1 and v_hoje + 2
       and (c.data + c.hora::time) - make_interval(mins => c.antecedencia_min) <= v_agora
       and (c.data + c.hora::time) > v_agora
       and exists (select 1 from public.agenda_exec_push p where p.usuario_id = c.dona_id)
  loop
    insert into public.agenda_exec_envios (chave) values (format('a:%s:%s:%s:%s', r.id, r.data, r.hora, r.antecedencia_min))
    on conflict do nothing;
    if found then
      v_min := greatest(0, ceil(extract(epoch from (r.inicio - v_agora)) / 60)::int);
      v_itens := v_itens || jsonb_build_array(jsonb_build_object('dona', r.dona_id, 'tag', 'c' || r.id, 'url', '/agenda-claudia',
        'title', case when v_min <= 1 then 'Agora: ' || r.titulo else 'Daqui a ' || public._agx_falta(v_min) || ': ' || r.titulo end,
        'body', 'Às ' || public._agx_hora(r.hora) || coalesce(' · ' || r.local, '')));
    end if;
  end loop;

  -- Aviso NA HORA, independente do lembrete anterior. Janela de 5 minutos
  -- cobre um atraso breve do cron; cada horário é enviado uma única vez.
  for r in
    select c.* from public.agenda_exec_compromissos c
     where not c.concluido and c.hora is not null and c.antecedencia_min is not null
       and c.data=v_hoje
       and (c.data+c.hora::time)<=v_agora
       and (c.data+c.hora::time)+interval '5 minutes'>v_agora
       and exists(select 1 from public.agenda_exec_push p where p.usuario_id=c.dona_id)
  loop
    insert into public.agenda_exec_envios(chave) values(format('h:%s:%s:%s',r.id,r.data,r.hora))
      on conflict do nothing;
    if found then
      v_itens:=v_itens||jsonb_build_array(jsonb_build_object('dona',r.dona_id,'tag','c'||r.id,
        'url','/agenda-claudia','title','⏰ Agora: '||r.titulo,
        'body','Seu compromisso começa às '||public._agx_hora(r.hora)||coalesce(' · '||r.local,'')));
    end if;
  end loop;

  if v_agora::time >= time '07:00' and v_agora::time < time '12:00' then
    for r in
      select c.dona_id, count(*) as n,
             string_agg(public._agx_hora(c.hora) || ' ' || c.titulo, ' · ' order by c.hora nulls first) as lista
        from public.agenda_exec_compromissos c
       where c.data = v_hoje and not c.concluido and c.avisar_dia
         and (c.hora is null or c.hora::time > v_agora::time)
         and exists (select 1 from public.agenda_exec_push p where p.usuario_id = c.dona_id)
       group by c.dona_id
    loop
      insert into public.agenda_exec_envios (chave) values (format('d:%s:%s', r.dona_id, v_hoje)) on conflict do nothing;
      if found then
        v_itens := v_itens || jsonb_build_array(jsonb_build_object('dona', r.dona_id, 'tag', 'dia', 'url', '/agenda-claudia',
          'title', 'Bom dia! Hoje você tem ' || r.n || case when r.n = 1 then ' compromisso' else ' compromissos' end,
          'body', r.lista));
      end if;
    end loop;
  end if;

  if v_agora::time >= time '18:00' and v_agora::time < time '22:00' then
    for r in
      select c.dona_id, count(*) as n,
             string_agg(public._agx_hora(c.hora) || ' ' || c.titulo, ' · ' order by c.hora nulls first) as lista
        from public.agenda_exec_compromissos c
       where c.data = v_hoje + 1 and not c.concluido and c.avisar_vespera
         and exists (select 1 from public.agenda_exec_push p where p.usuario_id = c.dona_id)
       group by c.dona_id
    loop
      insert into public.agenda_exec_envios (chave) values (format('v:%s:%s', r.dona_id, v_hoje + 1)) on conflict do nothing;
      if found then
        v_itens := v_itens || jsonb_build_array(jsonb_build_object('dona', r.dona_id, 'tag', 'vespera', 'url', '/agenda-claudia',
          'title', 'Amanhã você tem ' || r.n || case when r.n = 1 then ' compromisso' else ' compromissos' end,
          'body', r.lista));
      end if;
    end loop;
  end if;

  for r in delete from public.agenda_exec_testes where enviar_em <= now() returning usuario_id loop
    v_itens := v_itens || jsonb_build_array(jsonb_build_object('dona', r.usuario_id, 'tag', 'teste', 'url', '/agenda-claudia',
      'title', 'Teste do NFs: os avisos estão funcionando', 'body', 'Este celular vai receber os lembretes da sua agenda.'));
  end loop;

  if jsonb_array_length(v_itens) = 0 then return 0; end if;
  return public._agx_enviar(v_itens);
end $$;


revoke all on function public.agenda_exec_disparar() from public,anon,authenticated;
commit;
