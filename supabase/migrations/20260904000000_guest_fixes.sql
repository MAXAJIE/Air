-- Follow-up fixes.
--
-- 1. Hygiene photos win over the plain review notification: a 5-star review
--    with hygiene pictures must read as a complaint, not as "review received".

create or replace function public.notify_hygiene_photo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_property uuid;
  v_owner uuid;
  v_existing int;
begin
  select count(*) into v_existing
    from public.room_condition_photos
   where submission_id = NEW.submission_id
     and id <> NEW.id;
  if v_existing > 0 then
    return NEW;
  end if;

  v_property := public.submission_property(NEW.submission_id);
  v_owner := public.group_owner_id(public.property_group(v_property));
  if v_owner is null then
    return NEW;
  end if;

  -- The submission row was inserted first and already raised its own alert.
  -- Photos make it a complaint, so drop the softer unread alert for that row.
  delete from public.notifications
   where user_id = v_owner
     and read = false
     and type in ('review_received', 'low_rating')
     and payload->>'submissionId' = NEW.submission_id::text;

  perform public.notify_user(
    v_owner,
    'hygiene_complaint',
    jsonb_build_object('propertyId', v_property, 'submissionId', NEW.submission_id)
  );
  return NEW;
end;
$$;
