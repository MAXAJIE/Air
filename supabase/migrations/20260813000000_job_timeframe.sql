-- A scheduled clean is a timeframe, like any other task: it starts at
-- `scheduled_at` and is due at `due_at`. The mirrored task now carries both.

ALTER TABLE public.cleaning_jobs ADD COLUMN IF NOT EXISTS due_at timestamptz;

CREATE OR REPLACE FUNCTION public.sync_task_from_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_prop text; v_status public.task_status;
BEGIN
  IF NEW.assigned_to_user_id IS NULL THEN RETURN NEW; END IF;
  SELECT name INTO v_prop FROM public.properties WHERE id = NEW.property_id;
  v_status := (CASE NEW.status
                 WHEN 'reviewed' THEN 'done'
                 WHEN 'submitted' THEN 'submitted'
                 WHEN 'in_progress' THEN 'in_progress'
                 ELSE 'pending' END)::public.task_status;
  INSERT INTO public.tasks (owner_group_id, assigned_to_user_id, title, description,
    created_by_user_id, status, start_at, due_at, cleaning_job_id, property_id, source, is_private)
  VALUES (NEW.owner_group_id, NEW.assigned_to_user_id,
    'Cleaning — ' || COALESCE(v_prop, 'property'), NULL,
    COALESCE(public.group_owner_id(NEW.owner_group_id), NEW.assigned_to_user_id),
    v_status, NEW.scheduled_at, COALESCE(NEW.due_at, NEW.scheduled_at),
    NEW.id, NEW.property_id, 'cleaning', false)
  ON CONFLICT (cleaning_job_id) WHERE cleaning_job_id IS NOT NULL DO UPDATE SET
    assigned_to_user_id = EXCLUDED.assigned_to_user_id,
    status = EXCLUDED.status,
    start_at = EXCLUDED.start_at,
    due_at = EXCLUDED.due_at,
    title = EXCLUDED.title;
  RETURN NEW;
END $$;
