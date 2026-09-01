-- 0095 — Data de nascimento do profissional
--
-- Alimenta os avisos de aniversário na agenda do profissional e a Central de
-- Mensagens da Administração. Campo opcional: cadastros antigos seguem válidos.

begin;

alter table public.professionals
  add column if not exists birth_date date;

-- upsert_professional passa a aceitar payload->>'birthDate' ("YYYY-MM-DD" ou "").
create or replace function public.upsert_professional(
  p_slug     text,
  p_password text,
  p_id       bigint,
  p_payload  jsonb
)
returns public.professionals
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_company_id bigint;
  v_row        public.professionals%rowtype;
  v_name       text;
  v_pin        text;
  v_birth      date;
begin
  v_company_id := public._verify_company_admin(p_slug, p_password);

  v_name := nullif(btrim(coalesce(p_payload->>'name', '')), '');
  if v_name is null then
    raise exception 'name is required';
  end if;

  -- Normalise PIN: null, empty, or exactly 4 digits
  if p_payload ? 'pin' then
    if p_payload->>'pin' is null or btrim(p_payload->>'pin') = '' then
      v_pin := null;
    else
      v_pin := btrim(p_payload->>'pin');
      if v_pin !~ '^[0-9]{4}$' then
        raise exception 'PIN inválido - deve conter exatamente 4 dígitos numéricos';
      end if;
    end if;
  end if;

  if p_payload ? 'birthDate' then
    v_birth := nullif(btrim(coalesce(p_payload->>'birthDate', '')), '')::date;
  end if;

  if p_id is null then
    insert into public.professionals (
      company_id, name, specialty, email, phone, pin,
      carga_horaria, tipo_contrato, salario, birth_date
    ) values (
      v_company_id,
      v_name,
      nullif(btrim(coalesce(p_payload->>'specialty', '')), ''),
      nullif(btrim(coalesce(p_payload->>'email', '')), ''),
      nullif(btrim(coalesce(p_payload->>'phone', '')), ''),
      v_pin,
      coalesce(nullif(btrim(coalesce(p_payload->>'cargaHoraria', '')), ''), '30h'),
      coalesce(nullif(btrim(coalesce(p_payload->>'tipoContrato', '')), ''), 'Contratado'),
      case when p_payload ? 'salario' and p_payload->>'salario' is not null
                and btrim(p_payload->>'salario') <> ''
           then (p_payload->>'salario')::numeric
           else null end,
      v_birth
    )
    returning * into v_row;
  else
    update public.professionals set
      name          = v_name,
      specialty     = nullif(btrim(coalesce(p_payload->>'specialty', '')), ''),
      email         = nullif(btrim(coalesce(p_payload->>'email', '')), ''),
      phone         = nullif(btrim(coalesce(p_payload->>'phone', '')), ''),
      pin           = case when p_payload ? 'pin' then v_pin else pin end,
      carga_horaria = case when p_payload ? 'cargaHoraria'
                           then coalesce(nullif(btrim(coalesce(p_payload->>'cargaHoraria', '')), ''), '30h')
                           else carga_horaria end,
      tipo_contrato = case when p_payload ? 'tipoContrato'
                           then coalesce(nullif(btrim(coalesce(p_payload->>'tipoContrato', '')), ''), 'Contratado')
                           else tipo_contrato end,
      salario       = case when p_payload ? 'salario'
                           then case when p_payload->>'salario' is null
                                        or btrim(p_payload->>'salario') = ''
                                     then null
                                     else (p_payload->>'salario')::numeric end
                           else salario end,
      birth_date    = case when p_payload ? 'birthDate' then v_birth else birth_date end
    where id = p_id and company_id = v_company_id
    returning * into v_row;

    if not found then
      raise exception 'professional not found';
    end if;
  end if;

  return v_row;
end;
$$;

revoke all on function public.upsert_professional(text, text, bigint, jsonb)    from public;
grant execute on function public.upsert_professional(text, text, bigint, jsonb) to anon, authenticated;

commit;
