-- ============ enum expansion ============
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'in_progress';
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'submitted';

-- ============ encryption key ============
-- pgcrypto lives in the "extensions" schema on Supabase and is NOT on the
-- default search_path, so gen_random_bytes/pgp_sym_* must be schema-qualified
-- (or the schema added to each function's search_path).
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'profile_pii_key') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'base64'), 'profile_pii_key', 'Symmetric key for profile PII encryption');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.pii_key()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, vault, extensions
AS $$ SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'profile_pii_key' LIMIT 1 $$;
REVOKE ALL ON FUNCTION public.pii_key() FROM PUBLIC, anon, authenticated;

-- ============ private profile table ============
CREATE TABLE IF NOT EXISTS public.profile_private (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name_enc bytea,
  id_number_enc bytea,
  phone_enc bytea,
  dob_enc bytea,
  address_enc bytea,
  emergency_name_enc bytea,
  emergency_phone_enc bytea,
  selfie_path text,
  id_number_last4 text,
  phone_last4 text,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.profile_private TO authenticated;
GRANT ALL ON public.profile_private TO service_role;
ALTER TABLE public.profile_private ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own ciphertext row" ON public.profile_private;
CREATE POLICY "own ciphertext row" ON public.profile_private
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS profile_private_touch ON public.profile_private;
CREATE TRIGGER profile_private_touch BEFORE UPDATE ON public.profile_private
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ who may decrypt ============
CREATE OR REPLACE FUNCTION public.can_view_pii(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() = _user
    OR EXISTS (
      SELECT 1 FROM public.owner_groups g
      JOIN public.memberships m ON m.owner_group_id = g.id
      WHERE g.owner_user_id = auth.uid() AND m.user_id = _user AND m.status = 'active')
    OR EXISTS (
      SELECT 1 FROM public.hr_company_roster r
      WHERE r.hr_company_user_id = auth.uid() AND r.cleaner_user_id = _user AND r.status = 'active')
$$;

-- ============ write ============
CREATE OR REPLACE FUNCTION public.save_my_pii(
  p_full_name text, p_id_number text, p_phone text, p_dob text,
  p_address text, p_emergency_name text, p_emergency_phone text, p_selfie_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE k text := public.pii_key(); u uuid := auth.uid();
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.profile_private AS pp (
    user_id, full_name_enc, id_number_enc, phone_enc, dob_enc, address_enc,
    emergency_name_enc, emergency_phone_enc, selfie_path,
    id_number_last4, phone_last4, completed)
  VALUES (
    u,
    CASE WHEN nullif(trim(p_full_name),'') IS NULL THEN NULL ELSE extensions.pgp_sym_encrypt(p_full_name, k) END,
    CASE WHEN nullif(trim(p_id_number),'') IS NULL THEN NULL ELSE extensions.pgp_sym_encrypt(p_id_number, k) END,
    CASE WHEN nullif(trim(p_phone),'') IS NULL THEN NULL ELSE extensions.pgp_sym_encrypt(p_phone, k) END,
    CASE WHEN nullif(trim(p_dob),'') IS NULL THEN NULL ELSE extensions.pgp_sym_encrypt(p_dob, k) END,
    CASE WHEN nullif(trim(p_address),'') IS NULL THEN NULL ELSE extensions.pgp_sym_encrypt(p_address, k) END,
    CASE WHEN nullif(trim(p_emergency_name),'') IS NULL THEN NULL ELSE extensions.pgp_sym_encrypt(p_emergency_name, k) END,
    CASE WHEN nullif(trim(p_emergency_phone),'') IS NULL THEN NULL ELSE extensions.pgp_sym_encrypt(p_emergency_phone, k) END,
    nullif(trim(p_selfie_path),''),
    right(regexp_replace(coalesce(p_id_number,''), '\s', '', 'g'), 4),
    right(regexp_replace(coalesce(p_phone,''), '\s', '', 'g'), 4),
    (nullif(trim(p_full_name),'') IS NOT NULL AND nullif(trim(p_id_number),'') IS NOT NULL
      AND nullif(trim(p_phone),'') IS NOT NULL AND nullif(trim(p_selfie_path),'') IS NOT NULL)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    full_name_enc = EXCLUDED.full_name_enc,
    id_number_enc = EXCLUDED.id_number_enc,
    phone_enc = EXCLUDED.phone_enc,
    dob_enc = EXCLUDED.dob_enc,
    address_enc = EXCLUDED.address_enc,
    emergency_name_enc = EXCLUDED.emergency_name_enc,
    emergency_phone_enc = EXCLUDED.emergency_phone_enc,
    selfie_path = COALESCE(EXCLUDED.selfie_path, pp.selfie_path),
    id_number_last4 = EXCLUDED.id_number_last4,
    phone_last4 = EXCLUDED.phone_last4,
    completed = EXCLUDED.completed;
END $$;
GRANT EXECUTE ON FUNCTION public.save_my_pii(text,text,text,text,text,text,text,text) TO authenticated;

-- ============ read ============
CREATE OR REPLACE FUNCTION public.get_pii(_user uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE k text; r public.profile_private%ROWTYPE; allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO r FROM public.profile_private WHERE user_id = _user;
  IF r.user_id IS NULL THEN
    RETURN jsonb_build_object('exists', false, 'can_view', public.can_view_pii(_user));
  END IF;
  allowed := public.can_view_pii(_user);
  IF NOT allowed THEN
    RETURN jsonb_build_object(
      'exists', true, 'can_view', false, 'completed', r.completed,
      'id_number_masked', CASE WHEN r.id_number_last4 IS NULL OR r.id_number_last4 = '' THEN NULL ELSE '••••' || r.id_number_last4 END,
      'phone_masked', CASE WHEN r.phone_last4 IS NULL OR r.phone_last4 = '' THEN NULL ELSE '••••' || r.phone_last4 END);
  END IF;
  k := public.pii_key();
  RETURN jsonb_build_object(
    'exists', true, 'can_view', true, 'completed', r.completed,
    'full_name', CASE WHEN r.full_name_enc IS NULL THEN NULL ELSE extensions.pgp_sym_decrypt(r.full_name_enc, k) END,
    'id_number', CASE WHEN r.id_number_enc IS NULL THEN NULL ELSE extensions.pgp_sym_decrypt(r.id_number_enc, k) END,
    'phone', CASE WHEN r.phone_enc IS NULL THEN NULL ELSE extensions.pgp_sym_decrypt(r.phone_enc, k) END,
    'dob', CASE WHEN r.dob_enc IS NULL THEN NULL ELSE extensions.pgp_sym_decrypt(r.dob_enc, k) END,
    'address', CASE WHEN r.address_enc IS NULL THEN NULL ELSE extensions.pgp_sym_decrypt(r.address_enc, k) END,
    'emergency_name', CASE WHEN r.emergency_name_enc IS NULL THEN NULL ELSE extensions.pgp_sym_decrypt(r.emergency_name_enc, k) END,
    'emergency_phone', CASE WHEN r.emergency_phone_enc IS NULL THEN NULL ELSE extensions.pgp_sym_decrypt(r.emergency_phone_enc, k) END,
    'selfie_path', r.selfie_path,
    'id_number_masked', CASE WHEN r.id_number_last4 IS NULL OR r.id_number_last4 = '' THEN NULL ELSE '••••' || r.id_number_last4 END,
    'phone_masked', CASE WHEN r.phone_last4 IS NULL OR r.phone_last4 = '' THEN NULL ELSE '••••' || r.phone_last4 END);
END $$;
GRANT EXECUTE ON FUNCTION public.get_pii(uuid) TO authenticated;

-- ============ new columns ============
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS photo_path text,
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS place_name text;

ALTER TABLE public.shopping_items
  ADD COLUMN IF NOT EXISTS photo_path text,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

ALTER TABLE public.cleaning_template_items
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS requires_photo boolean NOT NULL DEFAULT true;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS cleaning_job_id uuid REFERENCES public.cleaning_jobs(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS proof_photo_path text;

CREATE UNIQUE INDEX IF NOT EXISTS tasks_cleaning_job_uidx ON public.tasks(cleaning_job_id) WHERE cleaning_job_id IS NOT NULL;

-- ============ job <-> task mirroring ============
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
    created_by_user_id, status, due_at, cleaning_job_id, property_id, source, is_private)
  VALUES (NEW.owner_group_id, NEW.assigned_to_user_id,
    'Cleaning — ' || COALESCE(v_prop, 'property'), NULL,
    COALESCE(public.group_owner_id(NEW.owner_group_id), NEW.assigned_to_user_id),
    v_status, NEW.scheduled_at, NEW.id, NEW.property_id, 'cleaning', false)
  ON CONFLICT (cleaning_job_id) WHERE cleaning_job_id IS NOT NULL DO UPDATE SET
    assigned_to_user_id = EXCLUDED.assigned_to_user_id,
    status = EXCLUDED.status,
    due_at = EXCLUDED.due_at,
    title = EXCLUDED.title;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cleaning_jobs_sync_task ON public.cleaning_jobs;
CREATE TRIGGER cleaning_jobs_sync_task AFTER INSERT OR UPDATE ON public.cleaning_jobs
FOR EACH ROW EXECUTE FUNCTION public.sync_task_from_job();

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
  UPDATE public.cleaning_jobs SET status = v_job
   WHERE id = NEW.cleaning_job_id AND status IS DISTINCT FROM v_job;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tasks_sync_job ON public.tasks;
CREATE TRIGGER tasks_sync_job AFTER UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.sync_job_from_task();