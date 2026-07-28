-- 1. Fix kick_hr_company: the previous body called a non-existent two-argument
--    is_group_owner() overload and wrote the status 'revoked', which is not a
--    value of the membership_status enum ('active','removed'). Both made the
--    RPC fail whenever an owner removed a cleaning company.
CREATE OR REPLACE FUNCTION public.kick_hr_company(p_group_id uuid, p_hr_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_group_owner(p_group_id) THEN
    RAISE EXCEPTION 'Only the owner can remove cleaning companies';
  END IF;

  UPDATE public.hr_affiliations
     SET status = 'removed'
   WHERE owner_group_id = p_group_id
     AND hr_company_user_id = p_hr_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.kick_hr_company(uuid, uuid) TO authenticated;

-- Any rows written with the broken value never existed (the enum rejected them),
-- so no data backfill is required.

-- ────────────────────────────────────────────────────────────────────────
-- 2. Activity log — every role sees what they have done.
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  owner_group_id uuid REFERENCES public.owner_groups(id) ON DELETE CASCADE,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS activity_log_actor_idx ON public.activity_log(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_group_idx ON public.activity_log(owner_group_id, created_at DESC);

DROP POLICY IF EXISTS "actors read own activity" ON public.activity_log;
CREATE POLICY "actors read own activity" ON public.activity_log FOR SELECT TO authenticated
  USING (
    actor_user_id = auth.uid()
    OR (owner_group_id IS NOT NULL AND public.is_group_owner(owner_group_id))
    OR (owner_group_id IS NOT NULL AND public.is_hr_affiliated(owner_group_id))
  );

DROP POLICY IF EXISTS "actors write own activity" ON public.activity_log;
CREATE POLICY "actors write own activity" ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (actor_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.log_activity(
  p_actor uuid,
  p_group uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_meta jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.activity_log(actor_user_id, owner_group_id, action, entity_type, entity_id, meta)
  VALUES (p_actor, p_group, p_action, p_entity_type, p_entity_id, coalesce(p_meta, '{}'::jsonb));
END;
$$;

-- Cleaning jobs -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_cleaning_job_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_activity(auth.uid(), NEW.owner_group_id, 'job_created', 'cleaning_job', NEW.id,
      jsonb_build_object('propertyId', NEW.property_id, 'status', NEW.status));
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.log_activity(auth.uid(), NEW.owner_group_id, 'job_' || NEW.status::text, 'cleaning_job', NEW.id,
      jsonb_build_object('propertyId', NEW.property_id, 'status', NEW.status));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_log_cleaning_job ON public.cleaning_jobs;
CREATE TRIGGER trg_log_cleaning_job
  AFTER INSERT OR UPDATE OF status ON public.cleaning_jobs
  FOR EACH ROW EXECUTE FUNCTION public.log_cleaning_job_activity();

-- Tasks -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_task_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_activity(auth.uid(), NEW.owner_group_id, 'task_created', 'task', NEW.id,
      jsonb_build_object('title', NEW.title, 'status', NEW.status));
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.log_activity(auth.uid(), NEW.owner_group_id, 'task_' || NEW.status::text, 'task', NEW.id,
      jsonb_build_object('title', NEW.title, 'status', NEW.status));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_log_task ON public.tasks;
CREATE TRIGGER trg_log_task
  AFTER INSERT OR UPDATE OF status ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_task_activity();

-- Shopping orders ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_order_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_group uuid;
BEGIN
  v_group := public.property_group(NEW.property_id);
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_activity(auth.uid(), v_group, 'order_created', 'shopping_order', NEW.id,
      jsonb_build_object('propertyId', NEW.property_id, 'status', NEW.status));
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.log_activity(auth.uid(), v_group, 'order_' || NEW.status::text, 'shopping_order', NEW.id,
      jsonb_build_object('propertyId', NEW.property_id, 'status', NEW.status));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_log_order ON public.shopping_orders;
CREATE TRIGGER trg_log_order
  AFTER INSERT OR UPDATE OF status ON public.shopping_orders
  FOR EACH ROW EXECUTE FUNCTION public.log_order_activity();

-- Guest reviews -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_rating_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_group uuid;
  v_owner uuid;
BEGIN
  v_group := public.property_group(NEW.property_id);
  PERFORM public.log_activity(NEW.cleaner_user_id, v_group, 'review_received', 'cleaner_rating', NEW.id,
    jsonb_build_object('propertyId', NEW.property_id, 'rating', NEW.rating));

  SELECT owner_user_id INTO v_owner FROM public.owner_groups WHERE id = v_group;
  IF v_owner IS NOT NULL THEN
    PERFORM public.notify_user(
      v_owner,
      'review_received',
      jsonb_build_object('propertyId', NEW.property_id, 'rating', NEW.rating)
    );
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_log_rating ON public.cleaner_ratings;
CREATE TRIGGER trg_log_rating
  AFTER INSERT ON public.cleaner_ratings
  FOR EACH ROW EXECUTE FUNCTION public.log_rating_activity();

-- Special requests --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_special_request_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.log_activity(auth.uid(), public.property_group(NEW.property_id),
    'special_request_created', 'special_request', NEW.id,
    jsonb_build_object('propertyId', NEW.property_id));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_log_special_request ON public.special_requests;
CREATE TRIGGER trg_log_special_request
  AFTER INSERT ON public.special_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_special_request_activity();

-- Memberships -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_membership_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_activity(auth.uid(), NEW.owner_group_id, 'member_joined', 'membership', NEW.id,
      jsonb_build_object('role', NEW.role, 'userId', NEW.user_id));
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.log_activity(auth.uid(), NEW.owner_group_id, 'member_' || NEW.status::text, 'membership', NEW.id,
      jsonb_build_object('role', NEW.role, 'userId', NEW.user_id));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_log_membership ON public.memberships;
CREATE TRIGGER trg_log_membership
  AFTER INSERT OR UPDATE OF status ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.log_membership_activity();

-- Cleaning company affiliations ------------------------------------------
CREATE OR REPLACE FUNCTION public.log_hr_affiliation_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_activity(auth.uid(), NEW.owner_group_id, 'company_joined', 'hr_affiliation', NEW.id,
      jsonb_build_object('userId', NEW.hr_company_user_id));
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.log_activity(auth.uid(), NEW.owner_group_id, 'company_' || NEW.status::text, 'hr_affiliation', NEW.id,
      jsonb_build_object('userId', NEW.hr_company_user_id));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_log_hr_affiliation ON public.hr_affiliations;
CREATE TRIGGER trg_log_hr_affiliation
  AFTER INSERT OR UPDATE OF status ON public.hr_affiliations
  FOR EACH ROW EXECUTE FUNCTION public.log_hr_affiliation_activity();

-- Realtime: reviews and activity must stream to open dashboards.
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.cleaner_ratings; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.room_condition_submissions; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- Reload PostgREST so the new table/RPC are visible immediately.
NOTIFY pgrst, 'reload schema';