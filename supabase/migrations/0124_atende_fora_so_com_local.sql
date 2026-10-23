-- =========================================================================
-- 0124_atende_fora_so_com_local.sql
--
-- FILA DE ESPERA: "atende fora" só quando o cadastro/triagem informa ONDE o
-- paciente faz terapia (CAPS, Reabilitação, Particular...).
--
-- Antes, a pergunta "Já realiza terapias em outro local?" vinha marcada como
-- "Sim" por padrão na triagem. Quem não mexia nela ficava com
-- outro_atendimento = true sem local nenhum, e a fila tirava 5 pontos
-- ("atende fora · -5") de pacientes que não têm atendimento fora.
--
-- O que a migration faz:
--   • _atende_fora passa a olhar só o local de atendimento;
--   • copia o local da triagem pro cadastro quando o cadastro está vazio;
--   • corrige os "Sim" sem local (triagens e cadastros) para "Não".
-- Ninguém sai da fila; só muda a pontuação/etiqueta de quem estava errado.
-- Idempotente.
-- =========================================================================

begin;

create or replace function public._atende_fora(
  p_local text,
  p_outro boolean
)
returns boolean
language sql
immutable
as $$
  select nullif(btrim(coalesce(p_local, '')), '') is not null
     and lower(btrim(p_local)) not in (
       'sem atendimento', 'nenhum', 'nenhuma', 'não', 'nao', 'n/a', '-'
     );
$$;

with t as (
  select tr.company_id,
         nullif(regexp_replace(coalesce(tr.cpf, ''), '[^0-9]', '', 'g'), '') as cpf_clean,
         lower(btrim(coalesce(tr.nome, '')))                                 as nome_key,
         btrim(tr.local_atendimento)                                          as local_at,
         row_number() over (partition by tr.company_id, lower(btrim(coalesce(tr.nome, '')))
                            order by tr.id desc)                              as rn
    from public.triagens tr
   where public._atende_fora(tr.local_atendimento, null)
)
update public.patients p
   set local_atendimento = t.local_at,
       updated_at        = now()
  from t
 where t.rn = 1
   and p.company_id = t.company_id
   and nullif(btrim(coalesce(p.local_atendimento, '')), '') is null
   and (
        (t.cpf_clean is not null and length(t.cpf_clean) >= 11
         and regexp_replace(coalesce(p.cpf, ''), '[^0-9]', '', 'g') = t.cpf_clean)
     or (t.nome_key <> '' and lower(btrim(p.name)) = t.nome_key)
   );

update public.triagens
   set outro_atendimento = false
 where outro_atendimento
   and not public._atende_fora(local_atendimento, null);

update public.patients
   set outro_atendimento = false,
       updated_at        = now()
 where outro_atendimento
   and not public._atende_fora(local_atendimento, null);

commit;
