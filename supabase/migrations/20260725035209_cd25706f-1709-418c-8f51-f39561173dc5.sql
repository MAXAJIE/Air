
CREATE TYPE public.app_role AS ENUM ('owner','cleaner','worker','hr_company');
CREATE TYPE public.membership_role AS ENUM ('owner','cleaner','worker');
CREATE TYPE public.membership_status AS ENUM ('active','removed');
CREATE TYPE public.job_status AS ENUM ('pending','in_progress','submitted','reviewed');
CREATE TYPE public.assigned_via AS ENUM ('direct','hr_request');
CREATE TYPE public.check_role AS ENUM ('owner','cleaner','customer');
CREATE TYPE public.order_status AS ENUM ('pending_payment','proof_submitted','verified','assigned','fulfilled');
CREATE TYPE public.request_status AS ENUM ('open','assigned','resolved');
CREATE TYPE public.task_status AS ENUM ('pending','done');

CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY,
  email text NOT NULL,
  username text NOT NULL UNIQUE,
  display_name text,
  primary_role public.app_role,
  locale text NOT NULL DEFAULT 'en',
  self_secondary_role public.membership_role,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.owner_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  name text NOT NULL,
  plan text NOT NULL DEFAULT 'pilot',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.owner_groups TO authenticated;
GRANT ALL ON public.owner_groups TO service_role;
ALTER TABLE public.owner_groups ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  owner_group_id uuid NOT NULL REFERENCES public.owner_groups(id) ON DELETE CASCADE,
  role public.membership_role NOT NULL,
  joined_via_invite_code_id uuid,
  status public.membership_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, owner_group_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.memberships TO authenticated;
GRANT ALL ON public.memberships TO service_role;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_group_owner(_group uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.owner_groups g WHERE g.id = _group AND g.owner_user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.is_group_member(_group uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.owner_group_id = _group AND m.user_id = auth.uid() AND m.status = 'active'
  ) OR EXISTS (SELECT 1 FROM public.owner_groups g WHERE g.id = _group AND g.owner_user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.shares_group_with(_other uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships a JOIN public.memberships b ON a.owner_group_id = b.owner_group_id
    WHERE a.user_id = auth.uid() AND b.user_id = _other AND a.status='active' AND b.status='active'
  ) OR EXISTS (
    SELECT 1 FROM public.owner_groups g JOIN public.memberships m ON m.owner_group_id = g.id
    WHERE (g.owner_user_id = auth.uid() AND m.user_id = _other AND m.status='active')
       OR (g.owner_user_id = _other AND m.user_id = auth.uid() AND m.status='active')
  );
$$;

CREATE OR REPLACE FUNCTION public.group_owner_id(_group uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT owner_user_id FROM public.owner_groups WHERE id = _group;
$$;

CREATE POLICY "read own profile" ON public.profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "read teammate profiles" ON public.profiles FOR SELECT TO authenticated USING (public.shares_group_with(user_id));
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "owner manages group" ON public.owner_groups FOR ALL TO authenticated
  USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY "members read group" ON public.owner_groups FOR SELECT TO authenticated USING (public.is_group_member(id));

CREATE POLICY "owner manages memberships" ON public.memberships FOR ALL TO authenticated
  USING (public.is_group_owner(owner_group_id)) WITH CHECK (public.is_group_owner(owner_group_id));
CREATE POLICY "read own memberships" ON public.memberships FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_group_id uuid NOT NULL REFERENCES public.owner_groups(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  code text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invite_codes TO authenticated;
GRANT ALL ON public.invite_codes TO service_role;
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages invite codes" ON public.invite_codes FOR ALL TO authenticated
  USING (public.is_group_owner(owner_group_id)) WITH CHECK (public.is_group_owner(owner_group_id));

CREATE TABLE public.hr_affiliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_group_id uuid NOT NULL REFERENCES public.owner_groups(id) ON DELETE CASCADE,
  hr_company_user_id uuid NOT NULL,
  status public.membership_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_group_id, hr_company_user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_affiliations TO authenticated;
GRANT ALL ON public.hr_affiliations TO service_role;
ALTER TABLE public.hr_affiliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages hr affiliations" ON public.hr_affiliations FOR ALL TO authenticated
  USING (public.is_group_owner(owner_group_id)) WITH CHECK (public.is_group_owner(owner_group_id));
CREATE POLICY "hr reads own affiliations" ON public.hr_affiliations FOR SELECT TO authenticated
  USING (hr_company_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_hr_affiliated(_group uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.hr_affiliations h
    WHERE h.owner_group_id = _group AND h.hr_company_user_id = auth.uid() AND h.status='active');
$$;

CREATE TABLE public.hr_invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_company_user_id uuid NOT NULL,
  code text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_invite_codes TO authenticated;
GRANT ALL ON public.hr_invite_codes TO service_role;
ALTER TABLE public.hr_invite_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr manages own codes" ON public.hr_invite_codes FOR ALL TO authenticated
  USING (hr_company_user_id = auth.uid()) WITH CHECK (hr_company_user_id = auth.uid());

CREATE TABLE public.hr_company_roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_company_user_id uuid NOT NULL,
  cleaner_user_id uuid NOT NULL,
  status public.membership_status NOT NULL DEFAULT 'active',
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hr_company_user_id, cleaner_user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_company_roster TO authenticated;
GRANT ALL ON public.hr_company_roster TO service_role;
ALTER TABLE public.hr_company_roster ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr manages roster" ON public.hr_company_roster FOR ALL TO authenticated
  USING (hr_company_user_id = auth.uid()) WITH CHECK (hr_company_user_id = auth.uid());
CREATE POLICY "cleaner reads own roster rows" ON public.hr_company_roster FOR SELECT TO authenticated
  USING (cleaner_user_id = auth.uid());

CREATE TABLE public.property_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_group_id uuid NOT NULL REFERENCES public.owner_groups(id) ON DELETE CASCADE,
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_statuses TO authenticated;
GRANT ALL ON public.property_statuses TO service_role;
ALTER TABLE public.property_statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages statuses" ON public.property_statuses FOR ALL TO authenticated
  USING (public.is_group_owner(owner_group_id)) WITH CHECK (public.is_group_owner(owner_group_id));
CREATE POLICY "members read statuses" ON public.property_statuses FOR SELECT TO authenticated
  USING (public.is_group_member(owner_group_id) OR public.is_hr_affiliated(owner_group_id));

CREATE TABLE public.cleaning_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_group_id uuid NOT NULL REFERENCES public.owner_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cleaning_templates TO authenticated;
GRANT ALL ON public.cleaning_templates TO service_role;
ALTER TABLE public.cleaning_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages templates" ON public.cleaning_templates FOR ALL TO authenticated
  USING (public.is_group_owner(owner_group_id)) WITH CHECK (public.is_group_owner(owner_group_id));
CREATE POLICY "members read templates" ON public.cleaning_templates FOR SELECT TO authenticated
  USING (public.is_group_member(owner_group_id));

CREATE OR REPLACE FUNCTION public.template_group(_tpl uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT owner_group_id FROM public.cleaning_templates WHERE id = _tpl;
$$;

CREATE TABLE public.cleaning_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.cleaning_templates(id) ON DELETE CASCADE,
  description text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cleaning_template_items TO authenticated;
GRANT ALL ON public.cleaning_template_items TO service_role;
ALTER TABLE public.cleaning_template_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages template items" ON public.cleaning_template_items FOR ALL TO authenticated
  USING (public.is_group_owner(public.template_group(template_id)))
  WITH CHECK (public.is_group_owner(public.template_group(template_id)));
CREATE POLICY "members read template items" ON public.cleaning_template_items FOR SELECT TO authenticated
  USING (public.is_group_member(public.template_group(template_id)));

CREATE TABLE public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_group_id uuid NOT NULL REFERENCES public.owner_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  status_id uuid REFERENCES public.property_statuses(id) ON DELETE SET NULL,
  default_template_id uuid REFERENCES public.cleaning_templates(id) ON DELETE SET NULL,
  access_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated;
GRANT ALL ON public.properties TO service_role;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages properties" ON public.properties FOR ALL TO authenticated
  USING (public.is_group_owner(owner_group_id)) WITH CHECK (public.is_group_owner(owner_group_id));
CREATE POLICY "members read properties" ON public.properties FOR SELECT TO authenticated
  USING (public.is_group_member(owner_group_id) OR public.is_hr_affiliated(owner_group_id));

CREATE OR REPLACE FUNCTION public.property_group(_property uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT owner_group_id FROM public.properties WHERE id = _property;
$$;

CREATE TABLE public.cleaning_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  owner_group_id uuid NOT NULL REFERENCES public.owner_groups(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.cleaning_templates(id) ON DELETE SET NULL,
  assigned_to_user_id uuid,
  assigned_via public.assigned_via NOT NULL DEFAULT 'direct',
  assigned_hr_company_id uuid,
  status public.job_status NOT NULL DEFAULT 'pending',
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cleaning_jobs TO authenticated;
GRANT ALL ON public.cleaning_jobs TO service_role;
ALTER TABLE public.cleaning_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages jobs" ON public.cleaning_jobs FOR ALL TO authenticated
  USING (public.is_group_owner(owner_group_id)) WITH CHECK (public.is_group_owner(owner_group_id));
CREATE POLICY "cleaner reads assigned jobs" ON public.cleaning_jobs FOR SELECT TO authenticated
  USING (assigned_to_user_id = auth.uid());
CREATE POLICY "cleaner updates assigned jobs" ON public.cleaning_jobs FOR UPDATE TO authenticated
  USING (assigned_to_user_id = auth.uid()) WITH CHECK (assigned_to_user_id = auth.uid());
CREATE POLICY "hr reads requested jobs" ON public.cleaning_jobs FOR SELECT TO authenticated
  USING (assigned_hr_company_id = auth.uid());
CREATE POLICY "hr assigns requested jobs" ON public.cleaning_jobs FOR UPDATE TO authenticated
  USING (assigned_hr_company_id = auth.uid()) WITH CHECK (assigned_hr_company_id = auth.uid());

CREATE OR REPLACE FUNCTION public.job_group(_job uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT owner_group_id FROM public.cleaning_jobs WHERE id = _job;
$$;
CREATE OR REPLACE FUNCTION public.job_assignee(_job uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT assigned_to_user_id FROM public.cleaning_jobs WHERE id = _job;
$$;

CREATE TABLE public.cleaning_job_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cleaning_job_id uuid NOT NULL REFERENCES public.cleaning_jobs(id) ON DELETE CASCADE,
  description text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_checked boolean NOT NULL DEFAULT false,
  photo_url text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cleaning_job_items TO authenticated;
GRANT ALL ON public.cleaning_job_items TO service_role;
ALTER TABLE public.cleaning_job_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages job items" ON public.cleaning_job_items FOR ALL TO authenticated
  USING (public.is_group_owner(public.job_group(cleaning_job_id)))
  WITH CHECK (public.is_group_owner(public.job_group(cleaning_job_id)));
CREATE POLICY "cleaner reads job items" ON public.cleaning_job_items FOR SELECT TO authenticated
  USING (public.job_assignee(cleaning_job_id) = auth.uid());
CREATE POLICY "cleaner updates job items" ON public.cleaning_job_items FOR UPDATE TO authenticated
  USING (public.job_assignee(cleaning_job_id) = auth.uid())
  WITH CHECK (public.job_assignee(cleaning_job_id) = auth.uid());

CREATE TABLE public.amenity_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name text NOT NULL,
  expected_qty int NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.amenity_definitions TO authenticated;
GRANT ALL ON public.amenity_definitions TO service_role;
ALTER TABLE public.amenity_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages amenities" ON public.amenity_definitions FOR ALL TO authenticated
  USING (public.is_group_owner(public.property_group(property_id)))
  WITH CHECK (public.is_group_owner(public.property_group(property_id)));
CREATE POLICY "members read amenities" ON public.amenity_definitions FOR SELECT TO authenticated
  USING (public.is_group_member(public.property_group(property_id)));

CREATE TABLE public.customer_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  room_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);
GRANT SELECT ON public.customer_sessions TO authenticated;
GRANT ALL ON public.customer_sessions TO service_role;
ALTER TABLE public.customer_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read sessions" ON public.customer_sessions FOR SELECT TO authenticated
  USING (public.is_group_member(public.property_group(property_id)));

CREATE TABLE public.amenity_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amenity_definition_id uuid NOT NULL REFERENCES public.amenity_definitions(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  role public.check_role NOT NULL,
  checked_by_user_id uuid,
  customer_session_id uuid REFERENCES public.customer_sessions(id) ON DELETE SET NULL,
  actual_qty int NOT NULL,
  expected_qty_snapshot int NOT NULL DEFAULT 0,
  is_discrepancy boolean NOT NULL DEFAULT false,
  photo_url text,
  cleaning_job_id uuid REFERENCES public.cleaning_jobs(id) ON DELETE SET NULL,
  checked_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.amenity_checks TO authenticated;
GRANT ALL ON public.amenity_checks TO service_role;
ALTER TABLE public.amenity_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read checks" ON public.amenity_checks FOR SELECT TO authenticated
  USING (public.is_group_member(public.property_group(property_id)));
CREATE POLICY "members insert checks" ON public.amenity_checks FOR INSERT TO authenticated
  WITH CHECK (
    public.is_group_member(public.property_group(property_id))
    AND checked_by_user_id = auth.uid()
    AND (role <> 'cleaner' OR photo_url IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION public.flag_amenity_discrepancy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE exp int;
BEGIN
  SELECT expected_qty INTO exp FROM public.amenity_definitions WHERE id = NEW.amenity_definition_id;
  NEW.expected_qty_snapshot := COALESCE(exp, 0);
  NEW.is_discrepancy := (NEW.actual_qty IS DISTINCT FROM COALESCE(exp, 0));
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_flag_amenity_discrepancy BEFORE INSERT ON public.amenity_checks
  FOR EACH ROW EXECUTE FUNCTION public.flag_amenity_discrepancy();

CREATE TABLE public.room_condition_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  customer_session_id uuid REFERENCES public.customer_sessions(id) ON DELETE SET NULL,
  overall_rating int,
  notes text,
  submitted_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.room_condition_submissions TO authenticated;
GRANT ALL ON public.room_condition_submissions TO service_role;
ALTER TABLE public.room_condition_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read room conditions" ON public.room_condition_submissions FOR SELECT TO authenticated
  USING (public.is_group_member(public.property_group(property_id)));

CREATE OR REPLACE FUNCTION public.submission_property(_sub uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT property_id FROM public.room_condition_submissions WHERE id = _sub;
$$;

CREATE TABLE public.room_condition_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.room_condition_submissions(id) ON DELETE CASCADE,
  photo_url text NOT NULL
);
GRANT SELECT ON public.room_condition_photos TO authenticated;
GRANT ALL ON public.room_condition_photos TO service_role;
ALTER TABLE public.room_condition_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read room photos" ON public.room_condition_photos FOR SELECT TO authenticated
  USING (public.is_group_member(public.property_group(public.submission_property(submission_id))));

CREATE TABLE public.cleaner_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cleaning_job_id uuid REFERENCES public.cleaning_jobs(id) ON DELETE SET NULL,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  customer_session_id uuid REFERENCES public.customer_sessions(id) ON DELETE SET NULL,
  cleaner_user_id uuid NOT NULL,
  rating int NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cleaner_ratings TO authenticated;
GRANT ALL ON public.cleaner_ratings TO service_role;
ALTER TABLE public.cleaner_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read ratings" ON public.cleaner_ratings FOR SELECT TO authenticated
  USING (public.is_group_member(public.property_group(property_id)) OR cleaner_user_id = auth.uid());

CREATE TABLE public.shopping_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_group_id uuid NOT NULL REFERENCES public.owner_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric(10,2) NOT NULL DEFAULT 0,
  description text,
  active boolean NOT NULL DEFAULT true
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_items TO authenticated;
GRANT ALL ON public.shopping_items TO service_role;
ALTER TABLE public.shopping_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages shopping items" ON public.shopping_items FOR ALL TO authenticated
  USING (public.is_group_owner(owner_group_id)) WITH CHECK (public.is_group_owner(owner_group_id));
CREATE POLICY "members read shopping items" ON public.shopping_items FOR SELECT TO authenticated
  USING (public.is_group_member(owner_group_id));

CREATE TABLE public.payment_qr_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_group_id uuid NOT NULL REFERENCES public.owner_groups(id) ON DELETE CASCADE,
  qr_image_url text NOT NULL,
  label text,
  active boolean NOT NULL DEFAULT true
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_qr_codes TO authenticated;
GRANT ALL ON public.payment_qr_codes TO service_role;
ALTER TABLE public.payment_qr_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages qr" ON public.payment_qr_codes FOR ALL TO authenticated
  USING (public.is_group_owner(owner_group_id)) WITH CHECK (public.is_group_owner(owner_group_id));

CREATE TABLE public.shopping_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  customer_session_id uuid REFERENCES public.customer_sessions(id) ON DELETE SET NULL,
  total_amount numeric(10,2) NOT NULL DEFAULT 0,
  status public.order_status NOT NULL DEFAULT 'pending_payment',
  payment_proof_photo_url text,
  payment_proof_amount_entered numeric(10,2),
  assigned_worker_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz
);
GRANT SELECT, UPDATE ON public.shopping_orders TO authenticated;
GRANT ALL ON public.shopping_orders TO service_role;
ALTER TABLE public.shopping_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages orders" ON public.shopping_orders FOR ALL TO authenticated
  USING (public.is_group_owner(public.property_group(property_id)))
  WITH CHECK (public.is_group_owner(public.property_group(property_id)));
CREATE POLICY "worker reads assigned orders" ON public.shopping_orders FOR SELECT TO authenticated
  USING (assigned_worker_id = auth.uid());
CREATE POLICY "worker updates assigned orders" ON public.shopping_orders FOR UPDATE TO authenticated
  USING (assigned_worker_id = auth.uid()) WITH CHECK (assigned_worker_id = auth.uid());

CREATE OR REPLACE FUNCTION public.order_property(_order uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT property_id FROM public.shopping_orders WHERE id = _order;
$$;
CREATE OR REPLACE FUNCTION public.order_worker(_order uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT assigned_worker_id FROM public.shopping_orders WHERE id = _order;
$$;

CREATE TABLE public.shopping_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.shopping_orders(id) ON DELETE CASCADE,
  shopping_item_id uuid REFERENCES public.shopping_items(id) ON DELETE SET NULL,
  name_snapshot text NOT NULL,
  quantity int NOT NULL DEFAULT 1,
  unit_price_snapshot numeric(10,2) NOT NULL DEFAULT 0
);
GRANT SELECT ON public.shopping_order_items TO authenticated;
GRANT ALL ON public.shopping_order_items TO service_role;
ALTER TABLE public.shopping_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read order items" ON public.shopping_order_items FOR SELECT TO authenticated
  USING (public.is_group_owner(public.property_group(public.order_property(order_id)))
         OR public.order_worker(order_id) = auth.uid());

CREATE TABLE public.special_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  customer_session_id uuid REFERENCES public.customer_sessions(id) ON DELETE SET NULL,
  description text NOT NULL,
  status public.request_status NOT NULL DEFAULT 'open',
  assigned_to_user_id uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.special_requests TO authenticated;
GRANT ALL ON public.special_requests TO service_role;
ALTER TABLE public.special_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages requests" ON public.special_requests FOR ALL TO authenticated
  USING (public.is_group_owner(public.property_group(property_id)))
  WITH CHECK (public.is_group_owner(public.property_group(property_id)));
CREATE POLICY "assignee reads requests" ON public.special_requests FOR SELECT TO authenticated
  USING (assigned_to_user_id = auth.uid());
CREATE POLICY "assignee updates requests" ON public.special_requests FOR UPDATE TO authenticated
  USING (assigned_to_user_id = auth.uid()) WITH CHECK (assigned_to_user_id = auth.uid());

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_group_id uuid REFERENCES public.owner_groups(id) ON DELETE CASCADE,
  assigned_to_user_id uuid,
  title text NOT NULL,
  description text,
  is_private boolean NOT NULL DEFAULT false,
  created_by_user_id uuid NOT NULL,
  status public.task_status NOT NULL DEFAULT 'pending',
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages non private tasks" ON public.tasks FOR ALL TO authenticated
  USING (is_private = false AND owner_group_id IS NOT NULL AND public.is_group_owner(owner_group_id))
  WITH CHECK (is_private = false AND owner_group_id IS NOT NULL AND public.is_group_owner(owner_group_id));
CREATE POLICY "assignee reads own tasks" ON public.tasks FOR SELECT TO authenticated
  USING (assigned_to_user_id = auth.uid());
CREATE POLICY "assignee updates own tasks" ON public.tasks FOR UPDATE TO authenticated
  USING (assigned_to_user_id = auth.uid()) WITH CHECK (assigned_to_user_id = auth.uid());
CREATE POLICY "worker creates private tasks" ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (created_by_user_id = auth.uid() AND assigned_to_user_id = auth.uid() AND is_private = true);
CREATE POLICY "worker deletes own private tasks" ON public.tasks FOR DELETE TO authenticated
  USING (created_by_user_id = auth.uid() AND is_private = true);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own notifications" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "update own notifications" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.notify_job_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'submitted' AND OLD.status <> 'submitted' THEN
    INSERT INTO public.notifications(user_id, type, payload)
    VALUES (public.group_owner_id(NEW.owner_group_id), 'job_submitted',
            jsonb_build_object('job_id', NEW.id, 'property_id', NEW.property_id));
  END IF;
  IF NEW.assigned_to_user_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.assigned_to_user_id IS DISTINCT FROM OLD.assigned_to_user_id) THEN
    INSERT INTO public.notifications(user_id, type, payload)
    VALUES (NEW.assigned_to_user_id, 'job_assigned',
            jsonb_build_object('job_id', NEW.id, 'property_id', NEW.property_id));
  END IF;
  IF NEW.assigned_hr_company_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.assigned_hr_company_id IS DISTINCT FROM OLD.assigned_hr_company_id) THEN
    INSERT INTO public.notifications(user_id, type, payload)
    VALUES (NEW.assigned_hr_company_id, 'hr_request',
            jsonb_build_object('job_id', NEW.id, 'property_id', NEW.property_id));
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_jobs AFTER INSERT OR UPDATE ON public.cleaning_jobs
  FOR EACH ROW EXECUTE FUNCTION public.notify_job_events();

CREATE OR REPLACE FUNCTION public.notify_discrepancy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_discrepancy THEN
    INSERT INTO public.notifications(user_id, type, payload)
    VALUES (public.group_owner_id(public.property_group(NEW.property_id)), 'amenity_discrepancy',
            jsonb_build_object('check_id', NEW.id, 'property_id', NEW.property_id, 'role', NEW.role));
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_discrepancy AFTER INSERT ON public.amenity_checks
  FOR EACH ROW EXECUTE FUNCTION public.notify_discrepancy();

CREATE OR REPLACE FUNCTION public.notify_special_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications(user_id, type, payload)
  VALUES (public.group_owner_id(public.property_group(NEW.property_id)), 'special_request',
          jsonb_build_object('request_id', NEW.id, 'property_id', NEW.property_id));
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_special_request AFTER INSERT ON public.special_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_special_request();

CREATE OR REPLACE FUNCTION public.notify_order_proof()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'proof_submitted' AND OLD.status <> 'proof_submitted' THEN
    INSERT INTO public.notifications(user_id, type, payload)
    VALUES (public.group_owner_id(public.property_group(NEW.property_id)), 'payment_proof',
            jsonb_build_object('order_id', NEW.id, 'property_id', NEW.property_id));
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_notify_order_proof AFTER UPDATE ON public.shopping_orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_order_proof();

CREATE OR REPLACE FUNCTION public.seed_group_defaults()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.property_statuses(owner_group_id, label, sort_order) VALUES
    (NEW.id, 'Vacant', 1), (NEW.id, 'Occupied', 2), (NEW.id, 'Cleaning Needed', 3),
    (NEW.id, 'Cleaning In Progress', 4), (NEW.id, 'Ready', 5), (NEW.id, 'Under Maintenance', 6);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_seed_group_defaults AFTER INSERT ON public.owner_groups
  FOR EACH ROW EXECUTE FUNCTION public.seed_group_defaults();

CREATE OR REPLACE FUNCTION public.redeem_invite_code(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role public.app_role;
  v_invite public.invite_codes%ROWTYPE;
  v_count int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT primary_role INTO v_role FROM public.profiles WHERE user_id = v_uid;
  IF v_role IS NULL THEN RAISE EXCEPTION 'Pick your role first'; END IF;

  SELECT * INTO v_invite FROM public.invite_codes
   WHERE upper(code) = upper(trim(p_code)) AND active = true AND revoked_at IS NULL;
  IF v_invite.id IS NULL THEN RAISE EXCEPTION 'Invalid or revoked invite code'; END IF;
  IF v_invite.role <> v_role THEN RAISE EXCEPTION 'This code is not for your role'; END IF;

  IF v_role = 'hr_company' THEN
    SELECT count(*) INTO v_count FROM public.hr_affiliations
      WHERE owner_group_id = v_invite.owner_group_id AND status='active'
        AND hr_company_user_id <> v_uid;
    IF v_count >= 1 THEN
      RAISE EXCEPTION 'This group already has an HR company (pilot limit)';
    END IF;
    INSERT INTO public.hr_affiliations(owner_group_id, hr_company_user_id)
    VALUES (v_invite.owner_group_id, v_uid)
    ON CONFLICT (owner_group_id, hr_company_user_id) DO UPDATE SET status='active';
  ELSE
    SELECT count(*) INTO v_count FROM public.memberships
      WHERE owner_group_id = v_invite.owner_group_id AND role = v_role::text::public.membership_role
        AND status='active' AND user_id <> v_uid;
    IF (v_role = 'cleaner' AND v_count >= 3) OR (v_role = 'worker' AND v_count >= 2) THEN
      RAISE EXCEPTION 'This group has reached its pilot team limit for your role';
    END IF;
    INSERT INTO public.memberships(user_id, owner_group_id, role, joined_via_invite_code_id)
    VALUES (v_uid, v_invite.owner_group_id, v_role::text::public.membership_role, v_invite.id)
    ON CONFLICT (user_id, owner_group_id, role) DO UPDATE SET status='active';
  END IF;

  RETURN jsonb_build_object('owner_group_id', v_invite.owner_group_id, 'role', v_role);
END; $$;
GRANT EXECUTE ON FUNCTION public.redeem_invite_code(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.redeem_hr_invite_code(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role public.app_role;
  v_invite public.hr_invite_codes%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT primary_role INTO v_role FROM public.profiles WHERE user_id = v_uid;
  IF v_role IS DISTINCT FROM 'cleaner' THEN RAISE EXCEPTION 'Only cleaners can join an HR company roster'; END IF;
  SELECT * INTO v_invite FROM public.hr_invite_codes
   WHERE upper(code) = upper(trim(p_code)) AND active = true AND revoked_at IS NULL;
  IF v_invite.id IS NULL THEN RAISE EXCEPTION 'Invalid or revoked invite code'; END IF;
  INSERT INTO public.hr_company_roster(hr_company_user_id, cleaner_user_id)
  VALUES (v_invite.hr_company_user_id, v_uid)
  ON CONFLICT (hr_company_user_id, cleaner_user_id) DO UPDATE SET status='active';
  RETURN jsonb_build_object('hr_company_user_id', v_invite.hr_company_user_id);
END; $$;
GRANT EXECUTE ON FUNCTION public.redeem_hr_invite_code(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.username_available(p_username text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(trim(p_username)));
$$;
GRANT EXECUTE ON FUNCTION public.username_available(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles(user_id, email, username, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'username',''), split_part(COALESCE(NEW.email,'user'), '@', 1) || '_' || substr(NEW.id::text,1,6)),
    NULLIF(NEW.raw_user_meta_data->>'display_name','')
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cleaning_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.special_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_orders;
