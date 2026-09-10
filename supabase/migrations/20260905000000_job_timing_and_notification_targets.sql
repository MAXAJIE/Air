-- ────────────────────────────────────────────────────────────────────────────
-- 1. Record when a clean actually started and finished
--    The cleaner drives the flow from the tasks table (accept -> in_progress,
--    submit -> submitted). The mirrored cleaning_jobs row only had its status
--    updated, so started_at / completed_at stayed NULL and the performance
--    page had nothing to measure. Stamp them in the same trigger.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_job_from_task()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_job public.job_status;
BEGIN
  IF NEW.cleaning_job_id IS NULL OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  v_job := (CASE NEW.status
              WHEN 'done' THEN 'reviewed'
              WHEN 'submitted' THEN 'submitted'
              WHEN 'in_progress' THEN 'in_progress'
              ELSE 'pending' END)::public.job_status;
  UPDATE public.cleaning_jobs
     SET status = v_job,
         started_at = CASE
           WHEN v_job IN ('in_progress', 'submitted', 'reviewed') AND started_at IS NULL
             THEN now()
           ELSE started_at
         END,
         completed_at = CASE
           WHEN v_job IN ('submitted', 'reviewed') AND completed_at IS NULL THEN now()
           WHEN v_job IN ('pending', 'in_progress') THEN NULL
           ELSE completed_at
         END
   WHERE id = NEW.cleaning_job_id
     AND (status IS DISTINCT FROM v_job
          OR (v_job IN ('in_progress', 'submitted', 'reviewed') AND started_at IS NULL)
          OR (v_job IN ('submitted', 'reviewed') AND completed_at IS NULL));
  RETURN NEW;
END $$;

-- Jobs finished before this migration still deserve a duration: fall back to
-- the mirrored task timestamps so the performance page is not empty.
UPDATE public.cleaning_jobs j
   SET started_at = COALESCE(j.started_at, j.scheduled_at, j.created_at),
       completed_at = COALESCE(j.completed_at, t.created_at)
  FROM public.tasks t
 WHERE t.cleaning_job_id = j.id
   AND j.status = 'reviewed'
   AND (j.started_at IS NULL OR j.completed_at IS NULL);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Assignment notifications open "My jobs", not the owner task list
-- ────────────────────────────────────────────────────────────────────────────

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
  ELSIF p_type IN ('amenity_discrepancy', 'hygiene_complaint', 'low_rating') THEN
    RETURN '/reviews?section=complaints' || CASE WHEN v_property IS NOT NULL THEN '&property=' || v_property ELSE '' END;
  ELSIF p_type IN ('job_submitted') THEN
    RETURN '/cleaning?tab=jobs' || CASE WHEN v_property IS NOT NULL THEN '&property=' || v_property ELSE '' END;
  ELSIF p_type IN ('hr_request', 'hr_job_submitted', 'hr_job_reviewed') THEN
    RETURN '/inbox';
  -- Work assigned to (or approved for) the person doing it opens My jobs.
  ELSIF p_type IN ('job_assigned', 'job_reviewed', 'task_assigned', 'task_approved') THEN
    RETURN '/jobs';
  ELSIF p_type IN ('task_submitted') THEN
    RETURN '/tasks';
  ELSIF p_type IN ('review_received') THEN
    RETURN '/reviews';
  END IF;

  RETURN NULL;
END;
$$;

-- Re-point notifications the cleaner has not opened yet.
UPDATE public.notifications
   SET target_url = public.notification_target_url(type, payload)
 WHERE read = false
   AND type IN ('task_assigned', 'task_approved');

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Free-text note per amenity answer
--    The guest arrival checklist lets people say *why* something is missing
--    ("only 1 towel, no shampoo"). Optional, so existing rows stay valid.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.amenity_checks
  ADD COLUMN IF NOT EXISTS notes text;
