-- Ponto: reconhecimento facial no quiosque (além do QR do crachá).
-- Guarda só a "assinatura" do rosto (128 números) calculada no navegador a
-- partir da foto do cadastro. O quiosque recebe apenas id + assinatura.

alter table public.ponto_employees add column if not exists face_descriptor real[];

-- Foto trocada → assinatura antiga deixa de valer.
create or replace function public._ponto_employees_reset_face()
returns trigger
language plpgsql
as $$
begin
  if new.photo is distinct from old.photo and new.face_descriptor is not distinct from old.face_descriptor then
    new.face_descriptor := null;
  end if;
  return new;
end;
$$;

drop trigger if exists ponto_employees_reset_face on public.ponto_employees;
create trigger ponto_employees_reset_face
  before update on public.ponto_employees
  for each row execute function public._ponto_employees_reset_face();

-- Admin: grava (ou apaga, com null) a assinatura do rosto do funcionário.
create or replace function public.set_employee_face(
  p_slug text, p_password text, p_id bigint, p_descriptor real[]
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_cid bigint;
begin
  v_cid := public._verify_company_admin(p_slug, p_password);
  if p_descriptor is not null and array_length(p_descriptor, 1) <> 128 then
    raise exception 'invalid face descriptor';
  end if;
  update public.ponto_employees
     set face_descriptor = p_descriptor
   where id = p_id and company_id = v_cid;
  if not found then
    raise exception 'employee not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_employee_face(text, text, bigint, real[]) from public;
grant execute on function public.set_employee_face(text, text, bigint, real[]) to anon, authenticated;

-- Admin: quem já tem o facial ativado.
create or replace function public.list_employee_faces(p_slug text, p_password text)
returns setof bigint
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_cid bigint;
begin
  v_cid := public._verify_company_admin(p_slug, p_password);
  return query
    select id from public.ponto_employees
     where company_id = v_cid and face_descriptor is not null;
end;
$$;

revoke all on function public.list_employee_faces(text, text) from public;
grant execute on function public.list_employee_faces(text, text) to anon, authenticated;

-- Quiosque: assinaturas dos funcionários ativos (sem nome, CPF ou foto).
create or replace function public.kiosk_face_list(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_cid bigint;
begin
  v_cid := public._active_company_id(p_slug);
  if v_cid is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'd', to_jsonb(face_descriptor)))
      from public.ponto_employees
     where company_id = v_cid and active = true and face_descriptor is not null
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.kiosk_face_list(text) from public;
grant execute on function public.kiosk_face_list(text) to anon, authenticated;
