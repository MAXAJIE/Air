-- Air v3: single-use invites, no HR pilot cap, and richer property-status CRUD hooks.
--
-- Behaviour changes:
--  * redeem_invite_code / redeem_hr_invite_code now revoke the code after a
--    successful redemption (single-use). The People page filters codes by
--    revoked_at IS NULL, so used codes disappear on their own — no extra UI.
--  * The "pilot" cap that blocked a cleaning company from joining a second
--    owner (or re-joining after leaving) is removed; joining an owner group is
--    now genuinely optional.
--  * kick_hr_company lets the owner remove a cleaning company from their
--    group the same way workers/cleaners are removed.

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
   WHERE upper(code) = upper(trim(p_code)) AND active = true AND revoked_at IS NULL
   FOR UPDATE;
  IF v_invite.id IS NULL THEN RAISE EXCEPTION 'Invalid or revoked invite code'; END IF;
  IF v_invite.role <> v_role THEN RAISE EXCEPTION 'This code is not for your role'; END IF;

  IF v_role = 'hr_company' THEN
    -- Cleaning companies can join any number of owner groups now.
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

  -- Single-use: once someone successfully joins, the code cannot be reused.
  UPDATE public.invite_codes
     SET active = false, revoked_at = now()
   WHERE id = v_invite.id;

  RETURN jsonb_build_object('owner_group_id', v_invite.owner_group_id, 'role', v_role);
END; $$;

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
   WHERE upper(code) = upper(trim(p_code)) AND active = true AND revoked_at IS NULL
   FOR UPDATE;
  IF v_invite.id IS NULL THEN RAISE EXCEPTION 'Invalid or revoked invite code'; END IF;
  INSERT INTO public.hr_company_roster(hr_company_user_id, cleaner_user_id)
  VALUES (v_invite.hr_company_user_id, v_uid)
  ON CONFLICT (hr_company_user_id, cleaner_user_id) DO UPDATE SET status='active';
  UPDATE public.hr_invite_codes SET active = false, revoked_at = now() WHERE id = v_invite.id;
  RETURN jsonb_build_object('hr_company_user_id', v_invite.hr_company_user_id);
END; $$;

-- Owner can kick a cleaning company from their group.
CREATE OR REPLACE FUNCTION public.kick_hr_company(p_group_id uuid, p_hr_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_group_owner(auth.uid(), p_group_id) THEN
    RAISE EXCEPTION 'Only the owner can remove cleaning companies';
  END IF;
  UPDATE public.hr_affiliations
     SET status = 'revoked'
   WHERE owner_group_id = p_group_id
     AND hr_company_user_id = p_hr_user_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.kick_hr_company(uuid, uuid) TO authenticated;
