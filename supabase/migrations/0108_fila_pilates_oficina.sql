-- =========================================================================
-- 0108_fila_pilates_oficina.sql
--
-- Novas especialidades na fila: "Fisioterapia Pilates" (atendimento das
-- mães/responsáveis, exclusivo do Leonardo) e "Oficina".
--
-- Sem isso, "Fisioterapia Pilates" cairia no `ilike 'fisio%'` de
-- `_fila_age_policy` e herdaria a prioridade por idade da Fisioterapia — mas
-- quem é atendido é o responsável adulto, então a fila tem que ser por ordem
-- de chegada (FIFO), como na Psicologia Parental. "Oficina" já era FIFO.
--
-- Só mexe na política de ordenação. Nenhum cadastro é apagado e nenhum
-- paciente sai da fila. Pode rodar mais de uma vez.
-- =========================================================================

begin;

create or replace function public._fila_age_policy(p_specialty text)
returns text
language sql
immutable
as $$
  select case
    when p_specialty is null or btrim(p_specialty) = '' then 'fifo'
    -- Pilates antes de "fisio%": atende o responsável, não a criança.
    when p_specialty ilike '%pilates%' then 'fifo'
    when p_specialty ilike 'fono%'     then 'full'
    when p_specialty ilike 'fisio%'    then 'full'
    else 'fifo'
  end;
$$;

commit;
