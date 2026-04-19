-- Phase 5D - Arco-iris: prontuario manual/sugerido a partir de 500 + realtime recepcao
--
-- 1. next_prontuario sugere a partir de 500 (antes: 400). Permanece permitido
--    digitar manualmente qualquer valor (ex: 1, 2, 10) via upsert_patient.
-- 2. notificacoes_recepcao entra na publication supabase_realtime para que o
--    painel da recepcao receba novas notificacoes em tempo real (INSERT).
-- 3. Politica RLS de SELECT para anon/authenticated (os dados nao sao sensiveis
--    - patient_name/professional_name/acao - e ja sao acessiveis via RPC
--    list_notificacoes). Sem esta policy a subscription do Realtime nao recebe
--    eventos mesmo que a tabela esteja na publication.

-- -----------------------------------------------------------------------------
-- 1) next_prontuario: sugerir a partir de 500
-- -----------------------------------------------------------------------------
create or replace function public.next_prontuario(
  p_slug     text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_max        integer := 499;
  v_candidate  integer;
  v_ultimo     text;
  r            record;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);
  for r in
    select prontuario from public.patients
     where company_id = v_company_id and prontuario is not null
  loop
    v_candidate := nullif(regexp_replace(r.prontuario, '[^0-9]', '', 'g'), '')::integer;
    if v_candidate is not null and v_candidate >= 500 and v_candidate > v_max then
      v_max := v_candidate;
    end if;
  end loop;
  v_ultimo := case when v_max > 499 then v_max::text else null end;
  return jsonb_build_object(
    'nextProntuario', (v_max + 1)::text,
    'ultimo',         v_ultimo
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 2) Realtime: adiciona notificacoes_recepcao na publication supabase_realtime
--    (idempotente - ignora erro se ja estiver adicionada).
-- -----------------------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.notificacoes_recepcao;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end
$$;

-- -----------------------------------------------------------------------------
-- 3) RLS: SELECT aberto para anon/authenticated em notificacoes_recepcao.
--    Necessario para o Realtime entregar eventos de INSERT ao cliente anon.
--    Writes continuam exclusivos pelas RPCs SECURITY DEFINER.
-- -----------------------------------------------------------------------------
drop policy if exists notificacoes_read_all on public.notificacoes_recepcao;
create policy notificacoes_read_all
  on public.notificacoes_recepcao
  for select
  to anon, authenticated
  using (true);
