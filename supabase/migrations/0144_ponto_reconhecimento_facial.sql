-- Ponto: reconhecimento facial no quiosque (além do QR do crachá).
-- Guarda só a "assinatura" do rosto (128 números) calculada no navegador a
-- partir da foto do cadastro. As assinaturas nunca saem do banco: o quiosque
-- manda a assinatura do rosto na câmera e recebe só o id de quem bateu.

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
-- p_photo_hash = sha256 (hex) da foto usada no cálculo; se a foto mudou nesse
-- meio-tempo, recusa (P0002) para não gravar assinatura de foto antiga.
drop function if exists public.set_employee_face(text, text, bigint, real[]);
create or replace function public.set_employee_face(
  p_slug text, p_password text, p_id bigint, p_descriptor real[], p_photo_hash text
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
  if p_descriptor is not null and (array_ndims(p_descriptor) <> 1 or array_length(p_descriptor, 1) <> 128
      or array_position(p_descriptor, null) is not null or p_photo_hash is null) then
    raise exception 'invalid face descriptor';
  end if;
  update public.ponto_employees
     set face_descriptor = p_descriptor
   where id = p_id and company_id = v_cid
     and (p_descriptor is null
          or encode(sha256(convert_to(coalesce(photo, ''), 'UTF8')), 'hex') = p_photo_hash);
  if not found then
    raise exception 'employee not found or photo changed' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_employee_face(text, text, bigint, real[], text) from public;
grant execute on function public.set_employee_face(text, text, bigint, real[], text) to anon, authenticated;

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

drop function if exists public.kiosk_face_list(text);

-- Quiosque: quantos funcionários ativos têm o facial ativado.
create or replace function public.kiosk_face_count(p_slug text)
returns integer
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select count(*)::int
    from public.ponto_employees
   where company_id = public._active_company_id(p_slug)
     and active = true and face_descriptor is not null;
$$;

revoke all on function public.kiosk_face_count(text) from public;
grant execute on function public.kiosk_face_count(text) to anon, authenticated;

-- Quiosque: compara a assinatura da câmera com as da empresa (distância
-- euclidiana < 0.5) e devolve só o id do mais parecido, ou null.
create or replace function public.kiosk_face_match(p_slug text, p_descriptor real[])
returns bigint
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_cid bigint;
  v_id bigint;
begin
  if p_descriptor is null or array_ndims(p_descriptor) <> 1 or array_length(p_descriptor, 1) <> 128
     or array_position(p_descriptor, null) is not null then
    return null;
  end if;
  v_cid := public._active_company_id(p_slug);
  if v_cid is null then return null; end if;
  select e.id into v_id
    from public.ponto_employees e
    cross join lateral (
      select sqrt(sum((a - b) * (a - b))) as dist
        from unnest(e.face_descriptor, p_descriptor) as t(a, b)
    ) x
   where e.company_id = v_cid and e.active = true and e.face_descriptor is not null
     and x.dist < 0.5
   order by x.dist
   limit 1;
  return v_id;
end;
$$;

revoke all on function public.kiosk_face_match(text, real[]) from public;
grant execute on function public.kiosk_face_match(text, real[]) to anon, authenticated;
