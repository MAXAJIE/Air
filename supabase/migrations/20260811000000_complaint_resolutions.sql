-- Owner-resolvable complaints.
--
-- The reviews page derives a complaint from three different guest artefacts
-- (a room-condition submission, a guest session with amenity shortages, or a
-- single orphan amenity check). There is no single "complaints" row to flag,
-- so resolution state is stored against the stable key the UI already builds
-- for each card: `<submissionId>`, `session-<sessionId>` or `check-<checkId>`.

CREATE TABLE IF NOT EXISTS public.complaint_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  complaint_key text NOT NULL,
  resolution_note text,
  resolved_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resolved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (complaint_key)
);

CREATE INDEX IF NOT EXISTS complaint_resolutions_property_idx
  ON public.complaint_resolutions (property_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaint_resolutions TO authenticated;
GRANT ALL ON public.complaint_resolutions TO service_role;

ALTER TABLE public.complaint_resolutions ENABLE ROW LEVEL SECURITY;

-- Only the group owner can resolve or reopen a complaint. `resolved_by` is
-- pinned to the caller so a row can never be attributed to somebody else.
DROP POLICY IF EXISTS "owner resolves complaints" ON public.complaint_resolutions;
CREATE POLICY "owner resolves complaints" ON public.complaint_resolutions FOR ALL TO authenticated
  USING (public.group_owner_id(public.property_group(property_id)) = auth.uid())
  WITH CHECK (
    public.group_owner_id(public.property_group(property_id)) = auth.uid()
    AND resolved_by = auth.uid()
  );

-- Everyone who can already see the complaint can see that it was handled.
DROP POLICY IF EXISTS "members read complaint resolutions" ON public.complaint_resolutions;
CREATE POLICY "members read complaint resolutions" ON public.complaint_resolutions FOR SELECT TO authenticated
  USING (public.is_group_member(public.property_group(property_id)));

DROP POLICY IF EXISTS "hr reads complaint resolutions" ON public.complaint_resolutions;
CREATE POLICY "hr reads complaint resolutions" ON public.complaint_resolutions FOR SELECT TO authenticated
  USING (public.is_hr_affiliated(public.property_group(property_id)));

-- Realtime so a resolution made in one tab updates the other.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.complaint_resolutions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
