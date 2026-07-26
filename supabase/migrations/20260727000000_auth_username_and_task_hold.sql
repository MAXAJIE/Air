-- Patch 1: allow anon to resolve a username -> email for sign-in, safely.
-- The profiles table is not readable by anon (by design). Sign-in with a
-- username requires exactly one lookup: username -> email. Expose it through
-- a SECURITY DEFINER function that returns only the email, so no other
-- profile column leaks.

create or replace function public.email_for_username(p_username text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select email
  from public.profiles
  where lower(username) = lower(p_username)
  limit 1
$$;

revoke all on function public.email_for_username(text) from public;
grant execute on function public.email_for_username(text) to anon, authenticated;

comment on function public.email_for_username(text) is
  'Resolves a username to its email for sign-in. Returns null when not found. Anon can call it.';
