-- UX overhaul support.
--   1. tasks.start_at  -> jobs are scheduled as a timeframe (start .. due).
--   2. cleaning_job_items.notes -> the template tip travels onto the job so the
--      cleaner sees the guidance while working the step.
--   3. guest_property_by_code -> room codes arrive from a URL, so match them
--      case-insensitively and ignore surrounding whitespace.

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS start_at timestamptz;
ALTER TABLE public.cleaning_job_items ADD COLUMN IF NOT EXISTS notes text;

CREATE OR REPLACE FUNCTION public.guest_property_by_code(_code text)
RETURNS TABLE (
  id uuid,
  name text,
  address text,
  place_name text,
  photo_path text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, p.address, p.place_name, p.photo_path
  FROM public.properties p
  WHERE lower(btrim(p.access_code)) = lower(btrim(_code))
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.guest_property_by_code(text) FROM public;
GRANT EXECUTE ON FUNCTION public.guest_property_by_code(text) TO anon, authenticated;
