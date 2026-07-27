-- Task approved notification trigger: when an owner approves a task (status → done),
-- notify the assignee that their task was approved.

create or replace function public.notify_task_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.status = 'done'
     and (OLD.status is distinct from 'done')
     and NEW.assigned_to_user_id is not null then
    perform public.notify_user(
      NEW.assigned_to_user_id,
      'task_approved',
      jsonb_build_object('taskId', NEW.id, 'propertyId', NEW.property_id)
    );
  end if;
  return NEW;
end; $$;

drop trigger if exists trg_notify_task_approved on public.tasks;
create trigger trg_notify_task_approved
  after update of status on public.tasks
  for each row execute function public.notify_task_approved();

-- Also notify the cleaner when a cleaning job is reviewed (status → reviewed)
create or replace function public.notify_job_reviewed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.status = 'reviewed'
     and (OLD.status is distinct from 'reviewed')
     and NEW.assigned_to_user_id is not null then
    perform public.notify_user(
      NEW.assigned_to_user_id,
      'job_reviewed',
      jsonb_build_object('jobId', NEW.id, 'propertyId', NEW.property_id)
    );
  end if;
  return NEW;
end; $$;

drop trigger if exists trg_notify_job_reviewed on public.cleaning_jobs;
create trigger trg_notify_job_reviewed
  after update of status on public.cleaning_jobs
  for each row execute function public.notify_job_reviewed();
