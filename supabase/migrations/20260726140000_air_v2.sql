-- ============================================================================
-- Air v2: status colours, amenity templates, encrypted payment QR,
-- cleaning-job integrity + task mirroring for unassigned jobs.
-- ============================================================================

-- ---------------------------------------------------------------- statuses ---
ALTER TABLE public.property_statuses
  ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT 'slate';

ALTER TABLE public.property_statuses DROP CONSTRAINT IF EXISTS property_statuses_color_check;
ALTER TABLE public.property_statuses
  ADD CONSTRAINT property_statuses_color_check
  CHECK (color IN ('slate','blue','green','amber','rose','violet'));

-- -------------------------------------------------------- amenity templates ---
CREATE TABLE IF NOT EXISTS public.amenity_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_group_id uuid NOT NULL REFERENCES public.owner_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.amenity_templates TO authenticated;
GRANT ALL ON public.amenity_templates TO service_role;
ALTER TABLE public.amenity_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner manages amenity templates" ON public.amenity_templates;
CREATE POLICY "owner manages amenity templates" ON public.amenity_templates FOR ALL TO authenticated
  USING (public.is_group_owner(owner_group_id)) WITH CHECK (public.is_group_owner(owner_group_id));
DROP POLICY IF EXISTS "members read amenity templates" ON public.amenity_templates;
CREATE POLICY "members read amenity templates" ON public.amenity_templates FOR SELECT TO authenticated
  USING (public.is_group_member(owner_group_id));

CREATE OR REPLACE FUNCTION public.amenity_template_group(_tpl uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT owner_group_id FROM public.amenity_templates WHERE id = _tpl;
$$;

CREATE TABLE IF NOT EXISTS public.amenity_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.amenity_templates(id) ON DELETE CASCADE,
  name text NOT NULL,
  expected_qty int NOT NULL DEFAULT 0,
  notes text,
  image_path text,
  sort_order int NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.amenity_template_items TO authenticated;
GRANT ALL ON public.amenity_template_items TO service_role;
ALTER TABLE public.amenity_template_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner manages amenity template items" ON public.amenity_template_items;
CREATE POLICY "owner manages amenity template items" ON public.amenity_template_items FOR ALL TO authenticated
  USING (public.is_group_owner(public.amenity_template_group(template_id)))
  WITH CHECK (public.is_group_owner(public.amenity_template_group(template_id)));
DROP POLICY IF EXISTS "members read amenity template items" ON public.amenity_template_items;
CREATE POLICY "members read amenity template items" ON public.amenity_template_items FOR SELECT TO authenticated
  USING (public.is_group_member(public.amenity_template_group(template_id)));

-- Property amenity rows gain the same fields so a template can be copied over.
ALTER TABLE public.amenity_definitions
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS image_path text,
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.amenity_templates(id) ON DELETE SET NULL;

/**
 * Copy a template's items onto a property's amenity checklist.
 * p_replace = true wipes the property's current list first (the default, so the
 * property mirrors the template exactly); false appends.
 */
CREATE OR REPLACE FUNCTION public.apply_amenity_template(
  p_template uuid,
  p_property uuid,
  p_replace boolean DEFAULT true
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_group uuid; v_count integer;
BEGIN
  v_group := public.amenity_template_group(p_template);
  IF v_group IS NULL THEN RAISE EXCEPTION 'Template not found'; END IF;
  IF v_group IS DISTINCT FROM public.property_group(p_property) THEN
    RAISE EXCEPTION 'Template and property belong to different groups';
  END IF;
  IF NOT public.is_group_owner(v_group) THEN RAISE EXCEPTION 'Not allowed'; END IF;

  IF p_replace THEN
    DELETE FROM public.amenity_definitions WHERE property_id = p_property;
  END IF;

  INSERT INTO public.amenity_definitions (property_id, name, expected_qty, notes, image_path, template_id)
  SELECT p_property, i.name, i.expected_qty, i.notes, i.image_path, p_template
    FROM public.amenity_template_items i
   WHERE i.template_id = p_template
   ORDER BY i.sort_order, i.name;

  SELECT count(*) INTO v_count FROM public.amenity_template_items WHERE template_id = p_template;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.apply_amenity_template(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_amenity_template(uuid, uuid, boolean) TO authenticated, service_role;

-- ------------------------------------------------------- encrypted qr codes ---
ALTER TABLE public.payment_qr_codes
  ADD COLUMN IF NOT EXISTS qr_image_enc bytea,
  ADD COLUMN IF NOT EXISTS content_type text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
-- The image now lives in the database, so the legacy storage path is optional.
ALTER TABLE public.payment_qr_codes ALTER COLUMN qr_image_url DROP NOT NULL;

-- A group may already have several rows flagged active (the old schema allowed
-- it). Keep only the most recent one active per group so the unique index below
-- can be created; the others are retained but deactivated.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY owner_group_id
           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
         ) AS rn
    FROM public.payment_qr_codes
   WHERE active
)
UPDATE public.payment_qr_codes q
   SET active = false
  FROM ranked r
 WHERE q.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS payment_qr_active_uidx
  ON public.payment_qr_codes(owner_group_id) WHERE active;

-- Encrypted bytes are never selected directly by clients; the RPCs below are the
-- only read/write path.
REVOKE SELECT ON public.payment_qr_codes FROM authenticated;
GRANT SELECT (id, owner_group_id, label, active, content_type, created_at, updated_at)
  ON public.payment_qr_codes TO authenticated;

/** Owner-only: store (or replace) the group's QR image, encrypted at rest. */
CREATE OR REPLACE FUNCTION public.save_payment_qr(
  p_group uuid,
  p_data_base64 text,
  p_content_type text,
  p_label text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE k text; v_id uuid;
BEGIN
  IF NOT public.is_group_owner(p_group) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF nullif(trim(p_data_base64), '') IS NULL THEN RAISE EXCEPTION 'Empty image'; END IF;
  k := public.pii_key();

  UPDATE public.payment_qr_codes
     SET qr_image_enc = extensions.pgp_sym_encrypt(p_data_base64, k),
         content_type = COALESCE(nullif(trim(p_content_type), ''), 'image/png'),
         label = p_label,
         qr_image_url = NULL,
         updated_at = now()
   WHERE owner_group_id = p_group AND active
   RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    INSERT INTO public.payment_qr_codes (owner_group_id, qr_image_enc, content_type, label, active)
    VALUES (p_group, extensions.pgp_sym_encrypt(p_data_base64, k),
            COALESCE(nullif(trim(p_content_type), ''), 'image/png'), p_label, true)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.save_payment_qr(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_payment_qr(uuid, text, text, text) TO authenticated, service_role;

/**
 * Decrypt the group's QR for display. Group members read it in the app; the
 * service role reads it for the public guest page.
 */
CREATE OR REPLACE FUNCTION public.get_payment_qr(p_group uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE k text; r record;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (public.is_group_member(p_group) OR public.is_group_owner(p_group)) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  SELECT * INTO r FROM public.payment_qr_codes
   WHERE owner_group_id = p_group AND active
   ORDER BY updated_at DESC LIMIT 1;
  IF r IS NULL THEN RETURN NULL; END IF;
  k := public.pii_key();
  RETURN jsonb_build_object(
    'id', r.id,
    'label', r.label,
    'content_type', COALESCE(r.content_type, 'image/png'),
    'legacy_path', r.qr_image_url,
    'updated_at', r.updated_at,
    'data_base64', CASE WHEN r.qr_image_enc IS NULL THEN NULL
                        ELSE extensions.pgp_sym_decrypt(r.qr_image_enc, k) END
  );
END $$;
REVOKE ALL ON FUNCTION public.get_payment_qr(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_payment_qr(uuid) TO authenticated, service_role;

/** Owner-only: forget the stored QR entirely. */
CREATE OR REPLACE FUNCTION public.delete_payment_qr(p_group uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_group_owner(p_group) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  DELETE FROM public.payment_qr_codes WHERE owner_group_id = p_group;
END $$;
REVOKE ALL ON FUNCTION public.delete_payment_qr(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_payment_qr(uuid) TO authenticated, service_role;

-- ------------------------------------------------ cleaning job constraints ---
/** A clean needs property + template + schedule + assignee before it exists. */
CREATE OR REPLACE FUNCTION public.cleaning_jobs_require_complete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.property_id IS NULL THEN RAISE EXCEPTION 'A property is required'; END IF;
  IF NEW.template_id IS NULL THEN RAISE EXCEPTION 'A cleaning template is required'; END IF;
  IF NEW.scheduled_at IS NULL THEN RAISE EXCEPTION 'A scheduled time is required'; END IF;
  IF NEW.assigned_to_user_id IS NULL AND NEW.assigned_hr_company_id IS NULL THEN
    RAISE EXCEPTION 'A cleaner is required';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cleaning_jobs_require_complete ON public.cleaning_jobs;
CREATE TRIGGER cleaning_jobs_require_complete BEFORE INSERT ON public.cleaning_jobs
FOR EACH ROW EXECUTE FUNCTION public.cleaning_jobs_require_complete();

/** Once work has started the schedule is frozen; only the status may move on. */
CREATE OR REPLACE FUNCTION public.cleaning_jobs_lock_started()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'Only pending cleans can be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'pending' AND (
       NEW.property_id IS DISTINCT FROM OLD.property_id
    OR NEW.template_id IS DISTINCT FROM OLD.template_id
    OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
    OR NEW.assigned_to_user_id IS DISTINCT FROM OLD.assigned_to_user_id
  ) THEN
    RAISE EXCEPTION 'Only pending cleans can be edited';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cleaning_jobs_lock_started ON public.cleaning_jobs;
CREATE TRIGGER cleaning_jobs_lock_started BEFORE UPDATE OR DELETE ON public.cleaning_jobs
FOR EACH ROW EXECUTE FUNCTION public.cleaning_jobs_lock_started();

-- --------------------------------------------------- task mirroring update ---
/**
 * Every scheduled clean shows up in Tasks tagged as cleaning work, including
 * jobs that are still waiting on an assignee.
 */
CREATE OR REPLACE FUNCTION public.sync_task_from_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_prop text; v_status public.task_status;
BEGIN
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
