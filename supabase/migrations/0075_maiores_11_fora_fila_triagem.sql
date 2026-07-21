-- 0075_maiores_11_fora_fila_triagem.sql
-- Pacientes com mais de 11 anos não podem ficar na Fila de Espera nem
-- "Aguardando Triagem": eles saem dessas etapas e ficam apenas em
-- "Cadastro Geral" (cadastro preservado). Também barra a entrada automática
-- de novos +11 nessas etapas.
--
-- Garantias:
--   • só mexe em waiting_list e patients.status (nunca apaga o cadastro);
--   • "+11" = idade estritamente maior que 11 anos;
--   • datas de nascimento ausentes/inválidas NÃO removem/alteram ninguém;
--   • aceita data no formato ISO (YYYY-MM-DD) e legado (DD/MM/YYYY);
--   • idempotente (pode rodar quantas vezes quiser).

begin;

-- Idade (em anos) a partir do texto da data de nascimento, no fuso de Brasília.
-- Retorna null quando a data está ausente ou fora dos formatos conhecidos.
create or replace function public._idade_from_text(p_dob text)
returns int
language sql
stable
as $$
  select case
    when p_dob ~ '^\d{4}-\d{2}-\d{2}'
      then extract(year from age(
             (now() at time zone 'America/Sao_Paulo')::date,
             to_date(substring(p_dob from 1 for 10), 'YYYY-MM-DD')))::int
    when p_dob ~ '^\d{2}/\d{2}/\d{4}'
      then extract(year from age(
             (now() at time zone 'America/Sao_Paulo')::date,
             to_date(substring(p_dob from 1 for 10), 'DD/MM/YYYY')))::int
    else null
  end;
$$;

-- 1) Limpeza dos que já estão presos: tira da fila e move o status pra
--    "Cadastro Geral". A fila diminui e fica só a faixa até 11 anos.
delete from public.waiting_list w
 using public.patients p
 where w.patient_id = p.id
   and public._idade_from_text(p.date_of_birth) > 11;

update public.patients p
   set status = 'Cadastro Geral',
       updated_at = now()
 where public._idade_from_text(p.date_of_birth) > 11
   and p.status in ('Aguardando Triagem', 'Fila de Espera');

-- 2) Barra os próximos automaticamente:
--    (a) qualquer paciente +11 que for gravado com status de etapa
--        (Aguardando Triagem / Fila de Espera) é normalizado pra Cadastro Geral.
create or replace function public._patients_barrar_maiores_11()
returns trigger
language plpgsql
as $$
declare
  v_idade int;
begin
  v_idade := public._idade_from_text(new.date_of_birth);
  if v_idade is not null and v_idade > 11
     and new.status in ('Aguardando Triagem', 'Fila de Espera') then
    new.status := 'Cadastro Geral';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_patients_barrar_maiores_11 on public.patients;
create trigger trg_patients_barrar_maiores_11
  before insert or update on public.patients
  for each row execute function public._patients_barrar_maiores_11();

--    (b) toda tentativa de inserir um +11 na fila é silenciosamente ignorada
--        (não quebra triagem/encaminhamento; apenas não cria a linha na fila).
create or replace function public._waiting_list_barrar_maiores_11()
returns trigger
language plpgsql
as $$
declare
  v_idade int;
begin
  select public._idade_from_text(p.date_of_birth)
    into v_idade
    from public.patients p
   where p.id = new.patient_id;
  if v_idade is not null and v_idade > 11 then
    return null; -- barra a entrada na fila
  end if;
  return new;
end;
$$;

drop trigger if exists trg_waiting_list_barrar_maiores_11 on public.waiting_list;
create trigger trg_waiting_list_barrar_maiores_11
  before insert on public.waiting_list
  for each row execute function public._waiting_list_barrar_maiores_11();

commit;
