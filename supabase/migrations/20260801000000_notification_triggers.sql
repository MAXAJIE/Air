-- Notification triggers: populate the notifications table when key events occur.
-- The frontend polls this table every 30 seconds and shows badges + bell.

-- Helper: insert a notification for a user
create or replace function public.notify_user(
  p_user_id uuid,
  p_type text,
  p_payload jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications(user_id, type, payload)
  values (p_user_id, p_type, p_payload);
end; $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. job_submitted: notify the group owner when a cleaning job is submitted
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.notify_job_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
begin
  if NEW.status = 'submitted' and (OLD.status is distinct from 'submitted') then
    select owner_user_id into v_owner_id
    from public.owner_groups
    where id = NEW.owner_group_id;
    if v_owner_id is not null then
      perform public.notify_user(
        v_owner_id,
        'job_submitted',
        jsonb_build_object('jobId', NEW.id, 'propertyId', NEW.property_id)
      );
    end if;
  end if;
  return NEW;
end; $$;

drop trigger if exists trg_notify_job_submitted on public.cleaning_jobs;
create trigger trg_notify_job_submitted
  after update of status on public.cleaning_jobs
  for each row execute function public.notify_job_submitted();

-- ────────────────────────────────────────────────────────────────────────────
-- 2. job_assigned: notify the cleaner/worker when a job is assigned to them
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.notify_job_assigned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.assigned_to_user_id is not null
     and (OLD.assigned_to_user_id is distinct from NEW.assigned_to_user_id) then
    perform public.notify_user(
      NEW.assigned_to_user_id,
      'job_assigned',
      jsonb_build_object('jobId', NEW.id, 'propertyId', NEW.property_id)
    );
  end if;
  return NEW;
end; $$;

drop trigger if exists trg_notify_job_assigned on public.cleaning_jobs;
create trigger trg_notify_job_assigned
  after insert or update of assigned_to_user_id on public.cleaning_jobs
  for each row execute function public.notify_job_assigned();

-- ────────────────────────────────────────────────────────────────────────────
-- 3. amenity_discrepancy: notify the group owner of a count mismatch
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.notify_amenity_discrepancy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
begin
  if NEW.is_discrepancy then
    select og.owner_user_id into v_owner_id
    from public.properties p
    join public.owner_groups og on og.id = p.owner_group_id
    where p.id = NEW.property_id;
    if v_owner_id is not null then
      perform public.notify_user(
        v_owner_id,
        'amenity_discrepancy',
        jsonb_build_object('propertyId', NEW.property_id, 'checkId', NEW.id)
      );
    end if;
  end if;
  return NEW;
end; $$;

drop trigger if exists trg_notify_amenity_discrepancy on public.amenity_checks;
create trigger trg_notify_amenity_discrepancy
  after insert on public.amenity_checks
  for each row execute function public.notify_amenity_discrepancy();

-- ────────────────────────────────────────────────────────────────────────────
-- 4. special_request: notify workers and owner of a new guest request
-- ────────────────────────────────────────────────────────────────────────────
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
end; $$;

drop trigger if exists trg_notify_special_request on public.special_requests;
create trigger trg_notify_special_request
  after insert on public.special_requests
  for each row execute function public.notify_special_request();

-- ────────────────────────────────────────────────────────────────────────────
-- 5. payment_proof: notify the owner when a guest uploads payment proof
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.notify_payment_proof()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
begin
  if NEW.status = 'proof_submitted' and (OLD.status is distinct from 'proof_submitted') then
    select og.owner_user_id into v_owner_id
    from public.properties p
    join public.owner_groups og on og.id = p.owner_group_id
    where p.id = NEW.property_id;
    if v_owner_id is not null then
      perform public.notify_user(
        v_owner_id,
        'payment_proof',
        jsonb_build_object('orderId', NEW.id, 'propertyId', NEW.property_id)
      );
    end if;
  end if;
  return NEW;
end; $$;

drop trigger if exists trg_notify_payment_proof on public.shopping_orders;
create trigger trg_notify_payment_proof
  after update of status on public.shopping_orders
  for each row execute function public.notify_payment_proof();

-- ────────────────────────────────────────────────────────────────────────────
-- 6. hr_request: notify the HR company when an owner assigns a job to them
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.notify_hr_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.assigned_via = 'hr_request' and NEW.assigned_hr_company_id is not null
     and (OLD.assigned_via is distinct from 'hr_request'
          or OLD.assigned_hr_company_id is distinct from NEW.assigned_hr_company_id) then
    perform public.notify_user(
      NEW.assigned_hr_company_id,
      'hr_request',
      jsonb_build_object('jobId', NEW.id, 'propertyId', NEW.property_id)
    );
  end if;
  return NEW;
end; $$;

drop trigger if exists trg_notify_hr_request on public.cleaning_jobs;
create trigger trg_notify_hr_request
  after insert or update of assigned_via, assigned_hr_company_id on public.cleaning_jobs
  for each row execute function public.notify_hr_request();

-- Grant execute to authenticated for the helper function (needed by triggers)
revoke all on function public.notify_user(uuid, text, jsonb) from public;
grant execute on function public.notify_user(uuid, text, jsonb) to authenticated;
