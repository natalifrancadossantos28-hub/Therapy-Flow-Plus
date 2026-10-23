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
--   • copia o local da triagem mais recente do paciente (CPF; nome só se
--     faltar CPF) pro cadastro quando o cadastro está vazio;
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

with m as (
  select p.id as patient_id,
         btrim(tr.local_atendimento) as local_at,
         row_number() over (
           partition by p.id
           order by (nullif(regexp_replace(coalesce(p.cpf, ''), '[^0-9]', '', 'g'), '')
                     = nullif(regexp_replace(coalesce(tr.cpf, ''), '[^0-9]', '', 'g'), '')) desc nulls last,
                    tr.id desc
         ) as rn
    from public.patients p
    join public.triagens tr
      on tr.company_id = p.company_id
     and (
          (length(regexp_replace(coalesce(p.cpf, ''), '[^0-9]', '', 'g')) >= 11
           and regexp_replace(coalesce(p.cpf, ''), '[^0-9]', '', 'g')
             = regexp_replace(coalesce(tr.cpf, ''), '[^0-9]', '', 'g'))
       or (
            lower(btrim(coalesce(tr.nome, ''))) <> ''
            and lower(btrim(coalesce(tr.nome, ''))) = lower(btrim(p.name))
            and (nullif(regexp_replace(coalesce(p.cpf, ''), '[^0-9]', '', 'g'), '') is null
                 or nullif(regexp_replace(coalesce(tr.cpf, ''), '[^0-9]', '', 'g'), '') is null)
          )
     )
   where nullif(btrim(coalesce(p.local_atendimento, '')), '') is null
)
update public.patients p
   set local_atendimento = m.local_at,
       updated_at        = now()
  from m
 where m.rn = 1
   and m.patient_id = p.id
   and public._atende_fora(m.local_at, null);

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
