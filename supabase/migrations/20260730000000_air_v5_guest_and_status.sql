-- Guest access: /g/{access_code} is a public shareable link. Anon has no
-- SELECT on public.properties (rows contain owner-scoped data), so expose a
-- narrow security-definer RPC returning only the fields the guest page needs.

create or replace function public.guest_property_by_code(_code text)
returns table (
  id uuid,
  name text,
  address text,
  place_name text,
  photo_path text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, p.address, p.place_name, p.photo_path
  from public.properties p
  where p.access_code = _code
  limit 1
$$;

revoke all on function public.guest_property_by_code(text) from public;
grant execute on function public.guest_property_by_code(text) to anon, authenticated;
