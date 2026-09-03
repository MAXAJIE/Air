-- Round 2 fixes: notification duplicates, per-role activity, history clearing.

-- 1. Duplicate notifications ------------------------------------------------
-- The original schema shipped catch-all triggers that were later replaced by
-- per-event triggers; both fired, so every event produced two rows.
DROP TRIGGER IF EXISTS trg_notify_jobs ON public.cleaning_jobs;
DROP TRIGGER IF EXISTS trg_notify_discrepancy ON public.amenity_checks;
DROP TRIGGER IF EXISTS trg_notify_order_proof ON public.shopping_orders;

-- Belt and braces: never store the same unread notification twice in a row.
CREATE OR REPLACE FUNCTION public.notify_user(
  p_user_id uuid,
  p_type text,
  p_payload jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = p_user_id
      AND n.type = p_type
      AND n.payload = p_payload
      AND n.read = false
      AND n.created_at > now() - interval '5 minutes'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.notifications(user_id, type, payload, target_url)
  VALUES (p_user_id, p_type, p_payload, public.notification_target_url(p_type, p_payload));
END;
$$;

-- 2. Activity log: owner and cleaning company are separate entities ---------
ALTER TABLE public.activity_log ADD COLUMN IF NOT EXISTS actor_role text;

CREATE OR REPLACE FUNCTION public.activity_log_set_actor_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.actor_role IS NULL AND NEW.actor_user_id IS NOT NULL THEN
    SELECT p.primary_role INTO NEW.actor_role
    FROM public.profiles p
    WHERE p.user_id = NEW.actor_user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_log_actor_role ON public.activity_log;
CREATE TRIGGER trg_activity_log_actor_role
  BEFORE INSERT ON public.activity_log
  FOR EACH ROW EXECUTE FUNCTION public.activity_log_set_actor_role();

UPDATE public.activity_log a
SET actor_role = p.primary_role
FROM public.profiles p
WHERE a.actor_role IS NULL AND p.user_id = a.actor_user_id;

CREATE INDEX IF NOT EXISTS activity_log_actor_role_idx ON public.activity_log(actor_role);

-- 3. Clearing history -------------------------------------------------------
-- Nothing is deleted: rows are archived so reports and audits stay intact.
ALTER TABLE public.cleaning_jobs ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.complaint_resolutions ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE OR REPLACE FUNCTION public.clear_history(p_group uuid, p_scope text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_count integer := 0;
  v_rows integer;
BEGIN
  SELECT owner_user_id INTO v_owner FROM public.owner_groups WHERE id = p_group;
  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Only the group owner can clear history';
  END IF;

  IF p_scope IN ('complaints', 'all') THEN
    UPDATE public.complaint_resolutions r
    SET archived_at = now()
    FROM public.properties p
    WHERE p.id = r.property_id
      AND p.owner_group_id = p_group
      AND r.archived_at IS NULL;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_count := v_count + v_rows;
  END IF;

  IF p_scope IN ('cleaning', 'all') THEN
    UPDATE public.cleaning_jobs
    SET archived_at = now()
    WHERE owner_group_id = p_group
      AND status = 'reviewed'
      AND archived_at IS NULL;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_count := v_count + v_rows;
  END IF;

  IF p_scope IN ('tasks', 'all') THEN
    UPDATE public.tasks
    SET archived_at = now()
    WHERE owner_group_id = p_group
      AND status = 'done'
      AND archived_at IS NULL;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_count := v_count + v_rows;
  END IF;

  IF p_scope = 'all' THEN
    DELETE FROM public.activity_log
    WHERE owner_group_id = p_group;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_count := v_count + v_rows;
  END IF;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_history(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.clear_history(uuid, text) TO authenticated;
