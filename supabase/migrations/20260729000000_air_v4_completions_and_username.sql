-- Air v4:
--  * Reliable username -> email lookup for sign-in (reads auth.users, so it
--    still works when public.profiles.email is blank).
--  * Permanent record of task submissions so the "Finished jobs" counter on
--    a cleaner/worker dashboard does not fall when an owner reopens a task.

create or replace function public.email_for_username(p_username text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(u.email, p.email)
  from public.profiles p
  left join auth.users u on u.id = p.user_id
  where lower(p.username) = lower(trim(p_username))
     or lower(p.display_name) = lower(trim(p_username))
  order by (lower(p.username) = lower(trim(p_username))) desc
  limit 1
$$;

revoke all on function public.email_for_username(text) from public;
grant execute on function public.email_for_username(text) to anon, authenticated;

-- Immutable audit of every submission. One row per submit, never deleted when
-- an owner reopens a task, so the counter can only ever go up.
create table if not exists public.task_completion_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  user_id uuid not null,
  owner_group_id uuid,
  submitted_at timestamptz not null default now()
);
create index if not exists task_completion_events_user_idx
  on public.task_completion_events(user_id);

grant select on public.task_completion_events to authenticated;
grant all on public.task_completion_events to service_role;

alter table public.task_completion_events enable row level security;

drop policy if exists "own completions readable" on public.task_completion_events;
create policy "own completions readable"
  on public.task_completion_events
  for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.log_task_submission()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.status = 'submitted' and (OLD.status is distinct from 'submitted') then
    insert into public.task_completion_events(task_id, user_id, owner_group_id, submitted_at)
    values (NEW.id, coalesce(NEW.assigned_to_user_id, auth.uid()), NEW.owner_group_id, now());
  end if;
  return NEW;
end; $$;

drop trigger if exists tasks_log_submission on public.tasks;
create trigger tasks_log_submission
  after update of status on public.tasks
  for each row execute function public.log_task_submission();