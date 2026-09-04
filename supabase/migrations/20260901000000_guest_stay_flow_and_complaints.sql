-- Guest stay flow (check-in, checkout) + notes/complaint separation.
--
-- 1. Resolved special requests are kept instead of deleted, so the owner's
--    "show resolved" filter has rows to show.
-- 2. The guest session carries the welcome-checklist answers and a checkout
--    timestamp.
-- 3. A room-condition submission now has a `complaint` column that is separate
--    from ordinary `notes`, and the complaint notification only fires for real
--    complaints: explicit complaint text, hygiene photos, or a rating under a
--    configurable star threshold.

-- 1 ----------------------------------------------------------------------
drop trigger if exists trg_auto_delete_resolved_special_request on public.special_requests;
drop function if exists public.auto_delete_resolved_special_request();

-- 2 ----------------------------------------------------------------------
alter table public.customer_sessions
  add column if not exists guest_name text,
  add column if not exists party_size integer,
  add column if not exists contact_number text,
  add column if not exists check_in_at timestamptz,
  add column if not exists checked_out_at timestamptz;

-- 3 ----------------------------------------------------------------------
alter table public.room_condition_submissions
  add column if not exists complaint text;

-- Star threshold: per-property override wins, else the group setting, else 4.
create table if not exists public.group_settings (
  owner_group_id uuid primary key references public.owner_groups(id) on delete cascade,
  complaint_star_threshold integer not null default 4
    check (complaint_star_threshold between 1 and 5),
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.group_settings to authenticated;
grant all on public.group_settings to service_role;

alter table public.group_settings enable row level security;

drop policy if exists "group members read settings" on public.group_settings;
create policy "group members read settings"
on public.group_settings for select to authenticated
using (public.is_group_member(owner_group_id));

drop policy if exists "group owners write settings" on public.group_settings;
create policy "group owners write settings"
on public.group_settings for all to authenticated
using (public.is_group_member(owner_group_id))
with check (public.is_group_member(owner_group_id));

alter table public.properties
  add column if not exists complaint_star_threshold integer
    check (complaint_star_threshold between 1 and 5);

create or replace function public.complaint_threshold(_property_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    p.complaint_star_threshold,
    (select gs.complaint_star_threshold
       from public.group_settings gs
      where gs.owner_group_id = p.owner_group_id),
    4
  )
  from public.properties p
  where p.id = _property_id
$$;

-- Room condition: one notification per submission, with the right kind.
create or replace function public.notify_room_condition_complaint()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _owner uuid;
  _threshold integer;
  _kind text;
begin
  _owner := public.group_owner_id(public.property_group(NEW.property_id));
  if _owner is null then
    return NEW;
  end if;

  _threshold := public.complaint_threshold(NEW.property_id);

  -- Hygiene photos raise their own 'hygiene_complaint' via trg_notify_hygiene_photo.
  -- Only an explicit complaint, or a rating below the threshold, is a complaint.
  if NEW.complaint is not null and length(btrim(NEW.complaint)) > 0 then
    _kind := 'hygiene_complaint';
  elsif NEW.overall_rating is not null and NEW.overall_rating < _threshold then
    _kind := 'low_rating';
  else
    _kind := 'review_received';
  end if;

  perform public.notify_user(
    _owner,
    _kind,
    jsonb_build_object(
      'propertyId', NEW.property_id,
      'submissionId', NEW.id,
      'rating', NEW.overall_rating
    )
  );

  return NEW;
end;
$$;

drop trigger if exists trg_notify_room_condition_complaint on public.room_condition_submissions;
create trigger trg_notify_room_condition_complaint
after insert on public.room_condition_submissions
for each row execute function public.notify_room_condition_complaint();

-- Cleaner ratings use the same configurable threshold.
create or replace function public.notify_low_cleaner_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _owner uuid;
begin
  if NEW.rating >= public.complaint_threshold(NEW.property_id) then
    return NEW;
  end if;

  _owner := public.group_owner_id(public.property_group(NEW.property_id));
  if _owner is null then
    return NEW;
  end if;

  perform public.notify_user(
    _owner,
    'low_rating',
    jsonb_build_object(
      'propertyId', NEW.property_id,
      'ratingId', NEW.id,
      'rating', NEW.rating,
      'cleanerUserId', NEW.cleaner_user_id
    )
  );

  return NEW;
end;
$$;
