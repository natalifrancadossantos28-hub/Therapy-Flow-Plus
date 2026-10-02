-- =========================================================================
-- 0116_fila_demanda_cid_com_traco.sql
--
-- _fila_demanda (0115) passa a reconhecer CID escrito com traço ou espaço
-- entre a letra e o número ("G-80", "H-90.5", "Q 90"). list_waiting_list
-- não muda. Idempotente.
-- =========================================================================

begin;

create or replace function public._fila_demanda(
  p_specialty text,
  p_diagnosis text
)
returns text
language sql
immutable
as $$
  with d as (
    select regexp_replace(
             translate(lower(coalesce(p_diagnosis, '')), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc'),
             '\m([a-z])\s*[-–]?\s*([0-9])', '\1\2', 'g'
           ) as t,
           lower(btrim(coalesce(p_specialty, ''))) as s
  ),
  c as (
    select
      case
        when s like '%pilates%' or s like '%parental%' or s like '%maes%' or s like '%mães%' then null
        when s like 'fisio%'      then 'fisio'
        when s like 'fono%'       then 'fono'
        when s like 'terapia ocup%' or s like 't.o%' or s = 'to' then 'to'
        when s like 'psicoped%'   then 'psicoped'
        when s like 'psicomot%'   then 'psicomot'
        when s like 'psicolog%'   then 'psico'
      end as esp,
      (t ~ '\mg80' or t ~ 'paralisia cerebral') as pc,
      (t ~ '\m(g8[1-3]|g71|g12|q05|q03|g91|q6[5-9]|q7[0-4]|q77|q78|z89|e34\.3)'
        or t ~ '(deficiencia fisica|deficiencia motora|plegia|paresia|mielomeningocele|espinha bifida|hidrocefalia|distrofia|atrofia muscular|artrogripose|pe torto|amputa|nanismo|acondroplasia|osteogenese imperfeita|malformacao de membro)') as fisica,
      (t ~ '\m(h54|h35\.1)' or t ~ '(deficiencia visual|cegueira|\mcego|baixa visao|amaurose|retinopatia da prematuridade|surdocegu)') as visual,
      (t ~ '\mh9[01]' or t ~ '(auditiv|surdez|\msurd|hipoacusia|implante coclear)') as auditiva,
      (t ~ '\mq3[5-7]' or t ~ 'fissura (labio|palat)') as fissura,
      (t ~ '\mf7[0-9]' or t ~ '(deficiencia intelectual|deficiencia mental|retardo mental)') as intelectual,
      (t ~ '\mf84' or t ~ '(autis|\mtea\M|espectro autista)') as tea,
      (t ~ '\mq9[0-9]' or t ~ '(sindrome de down|trissomia|sindrome genetica|x fragil)') as sindrome,
      (t ~ '\mq02' or t ~ '(microcefalia|zika)') as microcefalia
    from d
  ),
  r as (
    select array_remove(array[
      case when pc and esp in ('fisio','to','fono') then 'Paralisia cerebral' end,
      case when fisica and not pc and esp in ('fisio','to') then 'Deficiência física/motora' end,
      case when visual and esp in ('fisio','to') then 'Deficiência visual' end,
      case when auditiva and esp = 'fono' then 'Deficiência auditiva' end,
      case when fissura and esp = 'fono' then 'Fissura labiopalatina' end,
      case when intelectual and esp in ('psico','psicoped','to','psicomot') then 'Deficiência intelectual' end,
      case when tea and esp in ('fono','psico','to','psicomot') then 'TEA' end,
      case when sindrome and esp in ('fisio','fono','to','psicomot') then 'Síndrome genética' end,
      case when microcefalia and esp in ('fisio','fono','to','psicomot') then 'Microcefalia' end
    ], null) as itens
    from c
  )
  select nullif(array_to_string(itens, ' + '), '') from r;
$$;

grant execute on function public._fila_demanda(text, text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
