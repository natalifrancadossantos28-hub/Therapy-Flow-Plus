-- =========================================================================
-- 0048_update_recurrence_frequency.sql
--
-- RPC para alterar a frequência (periodicidade) de todos os appointments
-- de um grupo de recorrência. Necessário porque RLS bloqueia updates
-- diretos pela chave anon — todas as mutações devem passar por funções
-- SECURITY DEFINER autenticadas via slug/password.
-- =========================================================================

begin;

create or replace function public.update_recurrence_frequency(
  p_slug                text,
  p_password            text,
  p_recurrence_group_id text,
  p_frequency           text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_freq       text;
  v_count      integer;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  if p_recurrence_group_id is null or btrim(p_recurrence_group_id) = '' then
    raise exception 'recurrence_group_id is required';
  end if;

  v_freq := lower(btrim(coalesce(p_frequency, 'semanal')));
  if v_freq not in ('semanal', 'quinzenal', 'mensal') then
    v_freq := 'semanal';
  end if;

  update public.appointments
     set frequency   = v_freq,
         updated_at  = now()
   where company_id = v_company_id
     and recurrence_group_id = p_recurrence_group_id;

  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'updatedCount', v_count,
    'frequency', v_freq
  );
end;
$$;

revoke all on function public.update_recurrence_frequency(text, text, text, text) from public;
grant execute on function public.update_recurrence_frequency(text, text, text, text) to anon, authenticated;

commit;
