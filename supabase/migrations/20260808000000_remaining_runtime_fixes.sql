-- Remaining runtime fixes after the bundled 0001-0004 patches.
-- - Scheduling a direct or HR cleaning job could fail inside notification
--   triggers because INSERT triggers referenced OLD.
-- - The frontend already reads notifications.target_url and
--   cleaning_job_items.requires_photo, so make those schema changes explicit.
-- - Reviews must be visible to affiliated HR companies without widening public
--   access to guest comments.

ALTER TABLE public.cleaning_job_items
  ADD COLUMN IF NOT EXISTS requires_photo boolean NOT NULL DEFAULT false;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS target_url text;

CREATE OR REPLACE FUNCTION public.notification_target_url(p_type text, p_payload jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_property text := COALESCE(p_payload->>'propertyId', p_payload->>'property_id');
BEGIN
  IF p_payload ? 'url' THEN
    RETURN p_payload->>'url';
  END IF;

  IF p_type IN ('special_request') THEN
    RETURN '/shop?section=requests' || CASE WHEN v_property IS NOT NULL THEN '&property=' || v_property ELSE '' END;
  ELSIF p_type IN ('payment_proof') THEN
    RETURN '/shop?section=shop' || CASE WHEN v_property IS NOT NULL THEN '&property=' || v_property ELSE '' END;
  ELSIF p_type IN ('job_submitted', 'amenity_discrepancy') THEN
    RETURN '/cleaning?tab=jobs' || CASE WHEN v_property IS NOT NULL THEN '&property=' || v_property ELSE '' END;
  ELSIF p_type IN ('hr_request', 'hr_job_submitted', 'hr_job_reviewed') THEN
    RETURN '/inbox';
  ELSIF p_type IN ('job_assigned', 'job_reviewed') THEN
    RETURN '/jobs';
  ELSIF p_type IN ('task_assigned', 'task_submitted', 'task_approved') THEN
    RETURN '/tasks';
  END IF;

  RETURN NULL;
END;
$$;

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
  INSERT INTO public.notifications(user_id, type, payload, target_url)
  VALUES (p_user_id, p_type, p_payload, public.notification_target_url(p_type, p_payload));
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_job_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_to_user_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.assigned_to_user_id IS DISTINCT FROM NEW.assigned_to_user_id) THEN
    PERFORM public.notify_user(
      NEW.assigned_to_user_id,
      'job_assigned',
      jsonb_build_object('jobId', NEW.id, 'propertyId', NEW.property_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_hr_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_via = 'hr_request'
     AND NEW.assigned_hr_company_id IS NOT NULL
     AND (
       TG_OP = 'INSERT'
       OR OLD.assigned_via IS DISTINCT FROM 'hr_request'
       OR OLD.assigned_hr_company_id IS DISTINCT FROM NEW.assigned_hr_company_id
     ) THEN
    PERFORM public.notify_user(
      NEW.assigned_hr_company_id,
      'hr_request',
      jsonb_build_object('jobId', NEW.id, 'propertyId', NEW.property_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_special_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
  v_group_id uuid;
BEGIN
  SELECT p.owner_group_id INTO v_group_id
  FROM public.properties p
  WHERE p.id = NEW.property_id;

  SELECT og.owner_user_id INTO v_owner_id
  FROM public.owner_groups og
  WHERE og.id = v_group_id;

  IF v_owner_id IS NOT NULL THEN
    PERFORM public.notify_user(
      v_owner_id,
      'special_request',
      jsonb_build_object('requestId', NEW.id, 'propertyId', NEW.property_id)
    );
  END IF;

  PERFORM public.notify_user(
    m.user_id,
    'special_request',
    jsonb_build_object('requestId', NEW.id, 'propertyId', NEW.property_id)
  )
  FROM public.memberships m
  WHERE m.owner_group_id = v_group_id
    AND m.role = 'worker'
    AND m.status = 'active';

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "hr reads affiliated ratings" ON public.cleaner_ratings;
CREATE POLICY "hr reads affiliated ratings" ON public.cleaner_ratings FOR SELECT TO authenticated
  USING (public.is_hr_affiliated(public.property_group(property_id)));

DROP POLICY IF EXISTS "hr roster profiles are visible" ON public.profiles;
CREATE POLICY "hr roster profiles are visible" ON public.profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.hr_company_roster r
      WHERE r.hr_company_user_id = auth.uid()
        AND r.cleaner_user_id = profiles.user_id
        AND r.status = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM public.hr_company_roster r
      WHERE r.cleaner_user_id = auth.uid()
        AND r.hr_company_user_id = profiles.user_id
        AND r.status = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM public.hr_affiliations h
      JOIN public.owner_groups g ON g.id = h.owner_group_id
      WHERE h.hr_company_user_id = auth.uid()
        AND g.owner_user_id = profiles.user_id
        AND h.status = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM public.hr_affiliations h
      JOIN public.owner_groups g ON g.id = h.owner_group_id
      WHERE g.owner_user_id = auth.uid()
        AND h.hr_company_user_id = profiles.user_id
        AND h.status = 'active'
    )
  );

REVOKE ALL ON FUNCTION public.notify_user(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_user(uuid, text, jsonb) TO authenticated;