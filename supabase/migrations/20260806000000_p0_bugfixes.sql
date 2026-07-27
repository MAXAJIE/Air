-- P0 bugfixes bundle
--
--  1. Re-declare public.kick_hr_company idempotently. Some environments
--     missed the 20260728 migration; PostgREST then returns 404 when the
--     UI calls the RPC. Re-creating here is safe (CREATE OR REPLACE) and
--     matches the original signature exactly.
--  2. Auto-delete resolved special_requests. When a special request is
--     marked resolved, remove it from the board instead of leaving a
--     "Resolved" card lingering.
--
-- Both changes are idempotent — re-running this migration is a no-op.

-- ────────────────────────────────────────────────────────────────────────
-- 1. kick_hr_company (idempotent re-declare)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.kick_hr_company(p_group_id uuid, p_hr_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_group_owner(auth.uid(), p_group_id) THEN
    RAISE EXCEPTION 'Only the owner can remove cleaning companies';
  END IF;
  UPDATE public.hr_affiliations
     SET status = 'revoked'
   WHERE owner_group_id = p_group_id
     AND hr_company_user_id = p_hr_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.kick_hr_company(uuid, uuid) TO authenticated;

-- Nudge PostgREST to reload its schema cache so the RPC is visible
-- immediately on projects where it was previously missing.
NOTIFY pgrst, 'reload schema';

-- ────────────────────────────────────────────────────────────────────────
-- 2. Auto-delete resolved special requests
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_delete_resolved_special_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Fires AFTER UPDATE; deleting inside the trigger is safe because the
  -- UPDATE has already committed its row lock. This yields the UX the
  -- owner asked for: mark resolved → the card disappears.
  IF NEW.status = 'resolved'
     AND (OLD.status IS DISTINCT FROM 'resolved') THEN
    DELETE FROM public.special_requests WHERE id = NEW.id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_delete_resolved_special_request
  ON public.special_requests;
CREATE TRIGGER trg_auto_delete_resolved_special_request
  AFTER UPDATE OF status ON public.special_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_delete_resolved_special_request();