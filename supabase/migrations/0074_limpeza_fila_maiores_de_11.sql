-- =============================================================================
-- 0074: Limpeza em lote — retirar da Fila de Espera pacientes com +11 anos
-- =============================================================================
--
-- Regra do núcleo: a fila de espera prioriza crianças. Pacientes com idade
-- ESTRITAMENTE acima de 11 anos (12+) não permanecem na fila — mas continuam
-- CADASTRADOS normalmente (o registro em `patients` NÃO é tocado).
--
-- O front-end (PR #217) já tira esses pacientes da fila ao carregar a tela.
-- Este script faz a mesma limpeza de uma vez só no banco (inclui quem está
-- "esperando triagem"), sem depender de abrir a tela.
--
-- Seguro:
--   * Só apaga linhas de `waiting_list` (a fila). Cadastro do paciente intacto.
--   * Datas sem valor ou em formato irreconhecível NÃO são removidas
--     (não removemos ninguém por falta de dado).
--   * Idempotente: pode rodar quantas vezes quiser.
--
-- Aceita data de nascimento como YYYY-MM-DD (padrão) ou DD/MM/AAAA (legado).
-- Idade calculada no fuso America/Sao_Paulo.
-- =============================================================================

begin;

with parsed as (
  select
    w.id as wl_id,
    case
      when p.date_of_birth ~ '^\d{4}-\d{2}-\d{2}'
        then to_date(substring(p.date_of_birth from 1 for 10), 'YYYY-MM-DD')
      when p.date_of_birth ~ '^\d{2}/\d{2}/\d{4}'
        then to_date(substring(p.date_of_birth from 1 for 10), 'DD/MM/YYYY')
      else null
    end as dob
  from public.waiting_list w
  join public.patients p on p.id = w.patient_id
)
delete from public.waiting_list w
using parsed pa
where w.id = pa.wl_id
  and pa.dob is not null
  and extract(
        year from age((now() at time zone 'America/Sao_Paulo')::date, pa.dob)
      ) > 11;

commit;
