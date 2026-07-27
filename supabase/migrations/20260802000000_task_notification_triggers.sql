-- Task notification triggers: populate the notifications table when tasks
-- are assigned or submitted. The frontend maps these to the /tasks route.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. task_assigned: notify the assignee when a task is assigned to them
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.notify_task_assigned()
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
      'task_assigned',
      jsonb_build_object('taskId', NEW.id, 'propertyId', NEW.property_id)
    );
  end if;
  return NEW;
end; $$;

drop trigger if exists trg_notify_task_assigned on public.tasks;
create trigger trg_notify_task_assigned
  after insert or update of assigned_to_user_id on public.tasks
  for each row execute function public.notify_task_assigned();

-- ────────────────────────────────────────────────────────────────────────────
-- 2. task_submitted: notify the group owner when a task is submitted
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.notify_task_submitted()
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
        'task_submitted',
        jsonb_build_object('taskId', NEW.id, 'propertyId', NEW.property_id)
      );
    end if;
  end if;
  return NEW;
end; $$;

drop trigger if exists trg_notify_task_submitted on public.tasks;
create trigger trg_notify_task_submitted
  after update of status on public.tasks
  for each row execute function public.notify_task_submitted();
