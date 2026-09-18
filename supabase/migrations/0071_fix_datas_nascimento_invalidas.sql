-- =============================================================================
-- 0071: Corrigir datas de nascimento inválidas (quebrava a Fila de Espera)
-- =============================================================================
--
-- Sintoma:
--   "Erro ao carregar fila — date/time field value out of range: '22/01/2018'"
--   A Fila de Espera (e outras telas) quebravam por inteiro.
--
-- Causa:
--   patients.date_of_birth é TEXT (migration 0007). Vários RPCs fazem
--   `date_of_birth::date` (ex.: list_waiting_list, _sync_priority_after_score_change,
--   encaminhamento). Quando algum paciente tem a data gravada em formato
--   brasileiro "DD/MM/AAAA" (ex.: "22/01/2018") o cast falha e derruba a query
--   inteira — não só aquele paciente.
--
-- Correção (robusta e permanente, cobre TODAS as telas de uma vez):
--   1. Helpers _safe_dob / _norm_dob que convertem qualquer formato conhecido
--      (ISO "AAAA-MM-DD", "DD/MM/AAAA", "DD-MM-AAAA", "DD.MM.AAAA") para date,
--      devolvendo NULL quando não dá pra interpretar (nunca lançam erro).
--   2. Normaliza os dados existentes: toda date_of_birth passa a ser ISO
--      "AAAA-MM-DD" (ou NULL se for lixo). Assim nenhum `::date` falha mais.
--   3. Trigger BEFORE INSERT/UPDATE em patients que normaliza automaticamente
--      qualquer valor novo — impede que o problema volte no futuro.
-- =============================================================================

begin;

-- ── 1. Helpers de parsing tolerante ──────────────────────────────────────────
create or replace function public._safe_dob(p text)
returns date
language plpgsql
immutable
set search_path = public, extensions, pg_temp
as $$
declare
  t text := btrim(coalesce(p, ''));
begin
  if t = '' then
    return null;
  end if;
  begin
    -- ISO: AAAA-MM-DD (aceita hora/sufixo depois)
    if t ~ '^\d{4}-\d{1,2}-\d{1,2}' then
      return to_date(substring(t from '^(\d{4}-\d{1,2}-\d{1,2})'), 'YYYY-MM-DD');
    -- Brasileiro: DD/MM/AAAA, DD-MM-AAAA, DD.MM.AAAA
    elsif t ~ '^\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4}' then
      return to_date(
        translate(substring(t from '^(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4})'), '.-', '//'),
        'DD/MM/YYYY'
      );
    else
      -- última tentativa: deixa o Postgres tentar (dentro do bloco protegido)
      return t::date;
    end if;
  exception when others then
    return null;
  end;
end;
$$;

create or replace function public._norm_dob(p text)
returns text
language sql
immutable
set search_path = public, extensions, pg_temp
as $$
  select case
           when public._safe_dob(p) is null then null
           else to_char(public._safe_dob(p), 'YYYY-MM-DD')
         end;
$$;

-- ── 2. Normaliza os dados existentes ─────────────────────────────────────────
-- Reescreve só as linhas cujo valor atual não está já em ISO válido.
update public.patients
   set date_of_birth = public._norm_dob(date_of_birth)
 where date_of_birth is not null
   and public._norm_dob(date_of_birth) is distinct from date_of_birth;

-- ── 3. Trigger que mantém a coluna sempre válida no futuro ────────────────────
create or replace function public._normalize_patient_dob()
returns trigger
language plpgsql
set search_path = public, extensions, pg_temp
as $$
begin
  new.date_of_birth := public._norm_dob(new.date_of_birth);
  return new;
end;
$$;

drop trigger if exists trg_normalize_patient_dob on public.patients;
create trigger trg_normalize_patient_dob
  before insert or update on public.patients
  for each row execute function public._normalize_patient_dob();

commit;
