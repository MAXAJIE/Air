-- HR company notifications: add HR company as an additional recipient when a
-- job is submitted or reviewed, so the cleaning company stays in the loop.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Update notify_job_submitted: also notify assigned_hr_company_id
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
    -- Notify the group owner
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
    -- Notify the HR company (if assigned via HR)
    if NEW.assigned_hr_company_id is not null then
      perform public.notify_user(
        NEW.assigned_hr_company_id,
        'hr_job_submitted',
        jsonb_build_object('jobId', NEW.id, 'propertyId', NEW.property_id)
      );
    end if;
  end if;
  return NEW;
end; $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Update notify_job_reviewed: also notify assigned_hr_company_id
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.notify_job_reviewed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.status = 'reviewed'
     and (OLD.status is distinct from 'reviewed') then
    -- Notify the cleaner
    if NEW.assigned_to_user_id is not null then
      perform public.notify_user(
        NEW.assigned_to_user_id,
        'job_reviewed',
        jsonb_build_object('jobId', NEW.id, 'propertyId', NEW.property_id)
      );
    end if;
    -- Notify the HR company (if assigned via HR)
    if NEW.assigned_hr_company_id is not null then
      perform public.notify_user(
        NEW.assigned_hr_company_id,
        'hr_job_reviewed',
        jsonb_build_object('jobId', NEW.id, 'propertyId', NEW.property_id)
      );
    end if;
  end if;
  return NEW;
end; $$;
