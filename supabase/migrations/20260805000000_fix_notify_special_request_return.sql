-- Fix: notify_special_request() trigger function was missing RETURN NEW;
-- This caused "control reached end of trigger procedure without RETURN"
-- error whenever a special request was inserted.

create or replace function public.notify_special_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_group_id uuid;
begin
  select p.owner_group_id into v_group_id
  from public.properties p
  where p.id = NEW.property_id;

  -- Notify the owner
  select og.owner_user_id into v_owner_id
  from public.owner_groups og
  where og.id = v_group_id;
  if v_owner_id is not null then
    perform public.notify_user(
      v_owner_id,
      'special_request',
      jsonb_build_object('requestId', NEW.id, 'propertyId', NEW.property_id)
    );
  end if;

  -- Also notify all active workers in the group
  perform public.notify_user(
    m.user_id,
    'special_request',
    jsonb_build_object('requestId', NEW.id, 'propertyId', NEW.property_id)
  )
  from public.memberships m
  where m.owner_group_id = v_group_id
    and m.role = 'worker'
    and m.status = 'active';

  return NEW;
end; $$;
