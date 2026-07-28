-- Complaints section + cleaning-company group access.
--
-- Two independent problems are fixed here.
--
-- 1. Cleaning company (hr_company) stays stuck on the invite-code gate.
--    `redeem_invite_code` correctly inserts into `hr_affiliations`, but the
--    client (`useMyGroups` in src/hooks/use-app.tsx) reads the group through
--    the embedded relation `hr_affiliations -> owner_groups(id, name)`.
--    `owner_groups` only had two SELECT policies: "owner manages group"
--    (owner_user_id = auth.uid()) and "members read group"
--    (public.is_group_member(id), which does NOT consider HR affiliations).
--    So for an affiliated cleaning company the embed resolved to NULL, the
--    group list stayed empty, `needsGroup` in app-shell.tsx stayed true, and
--    the invite-code screen never went away. Adding an HR SELECT policy makes
--    the affiliation readable end to end.
--
-- 2. Guest complaints (hygiene photos, amenity shortages, written notes) had
--    no owner-facing surface and no notification. The reviews page now has a
--    dedicated complaints section, so notifications must deep-link to it and
--    new complaint kinds must raise a notification.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Cleaning companies can read the owner groups they are affiliated with
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "hr reads affiliated groups" ON public.owner_groups;
CREATE POLICY "hr reads affiliated groups" ON public.owner_groups FOR SELECT TO authenticated
  USING (public.is_hr_affiliated(id));

-- The complaints section reads guest data. Owners already had access through
-- `is_group_member`; affiliated cleaning companies did not, which would render
-- the section permanently empty for them.

DROP POLICY IF EXISTS "hr reads room conditions" ON public.room_condition_submissions;
CREATE POLICY "hr reads room conditions" ON public.room_condition_submissions FOR SELECT TO authenticated
  USING (public.is_hr_affiliated(public.property_group(property_id)));

DROP POLICY IF EXISTS "hr reads room photos" ON public.room_condition_photos;
CREATE POLICY "hr reads room photos" ON public.room_condition_photos FOR SELECT TO authenticated
  USING (public.is_hr_affiliated(public.property_group(public.submission_property(submission_id))));

DROP POLICY IF EXISTS "hr reads checks" ON public.amenity_checks;
CREATE POLICY "hr reads checks" ON public.amenity_checks FOR SELECT TO authenticated
  USING (public.is_hr_affiliated(public.property_group(property_id)));

DROP POLICY IF EXISTS "hr reads amenities" ON public.amenity_definitions;
CREATE POLICY "hr reads amenities" ON public.amenity_definitions FOR SELECT TO authenticated
  USING (public.is_hr_affiliated(public.property_group(property_id)));

DROP POLICY IF EXISTS "hr reads sessions" ON public.customer_sessions;
CREATE POLICY "hr reads sessions" ON public.customer_sessions FOR SELECT TO authenticated
  USING (public.is_hr_affiliated(public.property_group(property_id)));

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Notifications deep-link to the complaints section
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
  -- Guest-reported problems all land in the reviews page complaints section.
  ELSIF p_type IN ('amenity_discrepancy', 'hygiene_complaint', 'low_rating') THEN
    RETURN '/reviews?section=complaints' || CASE WHEN v_property IS NOT NULL THEN '&property=' || v_property ELSE '' END;
  ELSIF p_type IN ('job_submitted') THEN
    RETURN '/cleaning?tab=jobs' || CASE WHEN v_property IS NOT NULL THEN '&property=' || v_property ELSE '' END;
  ELSIF p_type IN ('hr_request', 'hr_job_submitted', 'hr_job_reviewed') THEN
    RETURN '/inbox';
  ELSIF p_type IN ('job_assigned', 'job_reviewed') THEN
    RETURN '/jobs';
  ELSIF p_type IN ('task_assigned', 'task_submitted', 'task_approved') THEN
    RETURN '/tasks';
  ELSIF p_type IN ('review_received') THEN
    RETURN '/reviews';
  END IF;

  RETURN NULL;
END;
$$;

-- Re-point notifications that are still unread so existing badges land on the
-- new section instead of the cleaning tab.
UPDATE public.notifications
   SET target_url = public.notification_target_url(type, payload)
 WHERE read = false
   AND type = 'amenity_discrepancy';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. New notifications: hygiene complaints and low guest ratings
-- ────────────────────────────────────────────────────────────────────────────

-- Fired when the guest submits the room-condition step. A submission counts as
-- a complaint when the guest wrote notes; a rating of 3 or less raises a
-- separate low-rating alert. Photos are inserted after the submission row, so
-- they are handled by their own trigger below.
CREATE OR REPLACE FUNCTION public.notify_room_condition_complaint()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  v_owner := public.group_owner_id(public.property_group(NEW.property_id));
  IF v_owner IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.notes IS NOT NULL AND btrim(NEW.notes) <> '' THEN
    PERFORM public.notify_user(
      v_owner,
      'hygiene_complaint',
      jsonb_build_object('propertyId', NEW.property_id, 'submissionId', NEW.id)
    );
  END IF;

  IF NEW.overall_rating IS NOT NULL AND NEW.overall_rating <= 3 THEN
    PERFORM public.notify_user(
      v_owner,
      'low_rating',
      jsonb_build_object(
        'propertyId', NEW.property_id,
        'submissionId', NEW.id,
        'rating', NEW.overall_rating
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_room_condition_complaint ON public.room_condition_submissions;
CREATE TRIGGER trg_notify_room_condition_complaint
  AFTER INSERT ON public.room_condition_submissions
  FOR EACH ROW EXECUTE FUNCTION public.notify_room_condition_complaint();

-- Hygiene photos are inserted one row at a time. Only the first photo of a
-- submission raises a notification, so a five-photo complaint is one alert.
CREATE OR REPLACE FUNCTION public.notify_hygiene_photo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_property uuid;
  v_owner uuid;
  v_existing int;
BEGIN
  SELECT count(*) INTO v_existing
    FROM public.room_condition_photos
   WHERE submission_id = NEW.submission_id
     AND id <> NEW.id;
  IF v_existing > 0 THEN
    RETURN NEW;
  END IF;

  v_property := public.submission_property(NEW.submission_id);
  v_owner := public.group_owner_id(public.property_group(v_property));
  IF v_owner IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.notify_user(
    v_owner,
    'hygiene_complaint',
    jsonb_build_object('propertyId', v_property, 'submissionId', NEW.submission_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_hygiene_photo ON public.room_condition_photos;
CREATE TRIGGER trg_notify_hygiene_photo
  AFTER INSERT ON public.room_condition_photos
  FOR EACH ROW EXECUTE FUNCTION public.notify_hygiene_photo();

-- Guests can also leave a low rating on the cleaner directly.
CREATE OR REPLACE FUNCTION public.notify_low_cleaner_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF NEW.rating > 3 THEN
    RETURN NEW;
  END IF;

  v_owner := public.group_owner_id(public.property_group(NEW.property_id));
  IF v_owner IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.notify_user(
    v_owner,
    'low_rating',
    jsonb_build_object(
      'propertyId', NEW.property_id,
      'ratingId', NEW.id,
      'rating', NEW.rating,
      'cleanerUserId', NEW.cleaner_user_id
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_low_cleaner_rating ON public.cleaner_ratings;
CREATE TRIGGER trg_notify_low_cleaner_rating
  AFTER INSERT ON public.cleaner_ratings
  FOR EACH ROW EXECUTE FUNCTION public.notify_low_cleaner_rating();

-- Realtime so the complaints section updates without a reload.
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.room_condition_photos; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.amenity_checks; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- The original amenity-discrepancy trigger still INSERTed straight into
-- notifications, so those rows had a NULL target_url and the bell had nothing
-- to link to. Route it through notify_user (which fills target_url) and use
-- the camelCase payload key the rest of the app expects.
CREATE OR REPLACE FUNCTION public.notify_discrepancy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF NOT NEW.is_discrepancy THEN
    RETURN NEW;
  END IF;

  v_owner := public.group_owner_id(public.property_group(NEW.property_id));
  IF v_owner IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.notify_user(
    v_owner,
    'amenity_discrepancy',
    jsonb_build_object(
      'checkId', NEW.id,
      'propertyId', NEW.property_id,
      'role', NEW.role
    )
  );
  RETURN NEW;
END;
$$;
