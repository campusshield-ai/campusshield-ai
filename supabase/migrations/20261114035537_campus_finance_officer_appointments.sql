-- Campus finance officers are a separately appointed capability, not an account role.
-- A verified Bursar/Finance employee must first have an approved staff record and
-- an active, verified campus membership. Only a verified campus administrator at
-- that same university may appoint or revoke the finance capability.

-- Production's billing-request table predates the campus university scope column.
-- Keep it nullable for historical requests; all new requests are required by RLS to include it.
ALTER TABLE public.campus_institutional_billing_requests
  ADD COLUMN IF NOT EXISTS university_id uuid
  REFERENCES public.campus_universities(id) ON DELETE RESTRICT;

UPDATE public.campus_institutional_billing_requests r
SET university_id = u.id
FROM public.campus_universities u
WHERE r.university_id IS NULL
  AND lower(btrim(r.institution_name)) = lower(btrim(u.name))
  AND (SELECT count(*) FROM public.campus_universities u2
       WHERE lower(btrim(u2.name)) = lower(btrim(r.institution_name))) = 1;

CREATE INDEX IF NOT EXISTS campus_institutional_billing_requests_university_requester_idx
  ON public.campus_institutional_billing_requests (university_id, requester_id, created_at DESC);

ALTER TABLE public.campus_staff_verifications
  ADD COLUMN IF NOT EXISTS finance_appointment_status text NOT NULL DEFAULT 'not_appointed',
  ADD COLUMN IF NOT EXISTS finance_appointed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS finance_appointed_at timestamptz,
  ADD COLUMN IF NOT EXISTS finance_revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS finance_revoked_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.campus_staff_verifications'::regclass
      AND conname = 'campus_staff_finance_appointment_status_check'
  ) THEN
    ALTER TABLE public.campus_staff_verifications
      ADD CONSTRAINT campus_staff_finance_appointment_status_check
      CHECK (finance_appointment_status IN ('not_appointed', 'active', 'revoked'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.campus_staff_verifications'::regclass
      AND conname = 'campus_staff_finance_appointment_state_check'
  ) THEN
    ALTER TABLE public.campus_staff_verifications
      ADD CONSTRAINT campus_staff_finance_appointment_state_check
      CHECK (
        (finance_appointment_status = 'not_appointed'
          AND finance_appointed_at IS NULL
          AND finance_revoked_at IS NULL
          AND finance_revoked_by IS NULL)
        OR
        (finance_appointment_status = 'active'
          AND finance_appointed_at IS NOT NULL
          AND finance_revoked_at IS NULL
          AND finance_revoked_by IS NULL)
        OR
        (finance_appointment_status = 'revoked'
          AND finance_appointed_at IS NOT NULL
          AND finance_revoked_at IS NOT NULL
          AND finance_revoked_by IS NOT NULL)
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS campus_staff_finance_appointment_scope_idx
  ON public.campus_staff_verifications (university_id, finance_appointment_status, user_id);

CREATE TABLE IF NOT EXISTS private.campus_finance_appointment_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL REFERENCES public.campus_universities(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('appointed', 'revoked')),
  position_title text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE private.campus_finance_appointment_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.campus_finance_appointment_audit FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.current_user_can_manage_institutional_billing(p_university_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND (SELECT private.account_lifecycle_is_active())
    AND p_university_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.campus_memberships cm ON cm.user_id = p.id
        WHERE p.id = (SELECT auth.uid())
          AND p.role::text = 'admin'
          AND p.verification_status::text = 'verified'
          AND cm.university_id = p_university_id
          AND cm.campus_role = 'admin'
          AND cm.membership_status = 'active'
          AND cm.verification_status = 'verified'
      )
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.campus_memberships cm ON cm.user_id = p.id
        JOIN public.campus_staff_verifications v
          ON v.user_id = p.id AND v.university_id = cm.university_id
        WHERE p.id = (SELECT auth.uid())
          AND p.role::text = 'teacher'
          AND p.verification_status::text = 'verified'
          AND cm.university_id = p_university_id
          AND cm.campus_role = 'teacher'
          AND cm.membership_status = 'active'
          AND cm.verification_status = 'verified'
          AND v.status = 'approved'
          AND v.finance_appointment_status = 'active'
          AND v.finance_appointed_at IS NOT NULL
          AND v.position_title ~* '(bursar|finance|accountant|accounts|treasurer)'
      )
    );
$function$;

REVOKE ALL ON FUNCTION private.current_user_can_manage_institutional_billing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.current_user_can_manage_institutional_billing(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.get_my_campus_finance_access_impl()
RETURNS TABLE (
  university_id uuid,
  university_name text,
  position_title text,
  appointed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT u.id, u.name, v.position_title, v.finance_appointed_at
  FROM public.campus_staff_verifications v
  JOIN public.profiles p ON p.id = v.user_id
  JOIN public.campus_memberships cm
    ON cm.user_id = v.user_id AND cm.university_id = v.university_id
  JOIN public.campus_universities u ON u.id = v.university_id
  WHERE v.user_id = (SELECT auth.uid())
    AND (SELECT private.account_lifecycle_is_active())
    AND p.role::text = 'teacher'
    AND p.verification_status::text = 'verified'
    AND cm.campus_role = 'teacher'
    AND cm.membership_status = 'active'
    AND cm.verification_status = 'verified'
    AND v.status = 'approved'
    AND v.finance_appointment_status = 'active'
    AND v.finance_appointed_at IS NOT NULL
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION private.get_my_campus_finance_access_impl() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_my_campus_finance_access_impl() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_campus_finance_access()
RETURNS TABLE (
  university_id uuid,
  university_name text,
  position_title text,
  appointed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $wrapper$
  SELECT * FROM private.get_my_campus_finance_access_impl();
$wrapper$;

REVOKE ALL ON FUNCTION public.get_my_campus_finance_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_campus_finance_access() TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_institutional_billing()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $wrapper$
  SELECT COALESCE(
    private.current_user_can_manage_institutional_billing(
      (SELECT private.current_campus_university_id())
    ),
    false
  );
$wrapper$;

REVOKE ALL ON FUNCTION public.can_manage_institutional_billing() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_institutional_billing() TO authenticated;

CREATE OR REPLACE FUNCTION private.list_campus_finance_staff_impl()
RETURNS TABLE (
  user_id uuid,
  username text,
  position_title text,
  appointment_status text,
  appointed_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_university_id uuid := (SELECT private.current_campus_university_id());
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL OR NOT (SELECT private.account_lifecycle_is_active()) THEN
    RAISE EXCEPTION 'Sign in with an active campus account.';
  END IF;

  IF v_university_id IS NULL
     OR (SELECT private.current_campus_role()) IS DISTINCT FROM 'admin'
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.id = v_actor
         AND p.role::text = 'admin'
         AND p.verification_status::text = 'verified'
     ) THEN
    RAISE EXCEPTION 'A verified campus administrator for this university is required.';
  END IF;

  RETURN QUERY
    SELECT p.id,
           COALESCE(cp.username, p.display_name, 'verified staff'),
           v.position_title,
           v.finance_appointment_status,
           v.finance_appointed_at
    FROM public.campus_staff_verifications v
    JOIN public.profiles p ON p.id = v.user_id
    JOIN public.campus_memberships cm
      ON cm.user_id = v.user_id AND cm.university_id = v.university_id
    LEFT JOIN public.community_profiles cp ON cp.user_id = p.id
    WHERE v.university_id = v_university_id
      AND v.status = 'approved'
      AND v.position_title ~* '(bursar|finance|accountant|accounts|treasurer)'
      AND p.role::text = 'teacher'
      AND p.verification_status::text = 'verified'
      AND cm.campus_role = 'teacher'
      AND cm.membership_status = 'active'
      AND cm.verification_status = 'verified'
    ORDER BY v.position_title, COALESCE(cp.username, p.display_name);
END;
$function$;

REVOKE ALL ON FUNCTION private.list_campus_finance_staff_impl() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.list_campus_finance_staff_impl() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_campus_finance_staff()
RETURNS TABLE (
  user_id uuid,
  username text,
  position_title text,
  appointment_status text,
  appointed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $wrapper$
  SELECT * FROM private.list_campus_finance_staff_impl();
$wrapper$;

REVOKE ALL ON FUNCTION public.list_campus_finance_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_campus_finance_staff() TO authenticated;

CREATE OR REPLACE FUNCTION private.appoint_campus_finance_officer_impl(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_university_id uuid := (SELECT private.current_campus_university_id());
  v_position_title text;
BEGIN
  IF v_actor IS NULL OR NOT (SELECT private.account_lifecycle_is_active()) THEN
    RAISE EXCEPTION 'Sign in with an active campus account.';
  END IF;

  IF v_university_id IS NULL
     OR (SELECT private.current_campus_role()) IS DISTINCT FROM 'admin'
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.id = v_actor
         AND p.role::text = 'admin'
         AND p.verification_status::text = 'verified'
     ) THEN
    RAISE EXCEPTION 'Only a verified administrator of this university may appoint a finance officer.';
  END IF;

  IF p_user_id IS NULL OR p_user_id = v_actor THEN
    RAISE EXCEPTION 'Choose a different, verified staff member.';
  END IF;

  SELECT v.position_title INTO v_position_title
  FROM public.campus_staff_verifications v
  JOIN public.profiles p ON p.id = v.user_id
  JOIN public.campus_memberships cm
    ON cm.user_id = v.user_id AND cm.university_id = v.university_id
  WHERE v.user_id = p_user_id
    AND v.university_id = v_university_id
    AND v.status = 'approved'
    AND v.position_title ~* '(bursar|finance|accountant|accounts|treasurer)'
    AND p.role::text = 'teacher'
    AND p.verification_status::text = 'verified'
    AND cm.campus_role = 'teacher'
    AND cm.membership_status = 'active'
    AND cm.verification_status = 'verified';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The employee must have an approved finance-related staff position and verified membership at your university.';
  END IF;

  UPDATE public.campus_staff_verifications
  SET finance_appointment_status = 'active',
      finance_appointed_by = v_actor,
      finance_appointed_at = now(),
      finance_revoked_by = NULL,
      finance_revoked_at = NULL,
      updated_at = now()
  WHERE user_id = p_user_id AND university_id = v_university_id;

  INSERT INTO private.campus_finance_appointment_audit
    (university_id, user_id, actor_id, action, position_title)
  VALUES (v_university_id, p_user_id, v_actor, 'appointed', v_position_title);
END;
$function$;

REVOKE ALL ON FUNCTION private.appoint_campus_finance_officer_impl(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.appoint_campus_finance_officer_impl(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.appoint_campus_finance_officer(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $wrapper$
  SELECT private.appoint_campus_finance_officer_impl(p_user_id);
$wrapper$;

REVOKE ALL ON FUNCTION public.appoint_campus_finance_officer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.appoint_campus_finance_officer(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.revoke_campus_finance_officer_impl(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_university_id uuid := (SELECT private.current_campus_university_id());
  v_position_title text;
BEGIN
  IF v_actor IS NULL OR NOT (SELECT private.account_lifecycle_is_active()) THEN
    RAISE EXCEPTION 'Sign in with an active campus account.';
  END IF;

  IF v_university_id IS NULL
     OR (SELECT private.current_campus_role()) IS DISTINCT FROM 'admin'
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.id = v_actor
         AND p.role::text = 'admin'
         AND p.verification_status::text = 'verified'
     ) THEN
    RAISE EXCEPTION 'Only a verified administrator of this university may revoke a finance appointment.';
  END IF;

  UPDATE public.campus_staff_verifications
  SET finance_appointment_status = 'revoked',
      finance_revoked_by = v_actor,
      finance_revoked_at = now(),
      updated_at = now()
  WHERE user_id = p_user_id
    AND university_id = v_university_id
    AND status = 'approved'
    AND finance_appointment_status = 'active'
  RETURNING position_title INTO v_position_title;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active finance appointment was found for this staff member at your university.';
  END IF;

  INSERT INTO private.campus_finance_appointment_audit
    (university_id, user_id, actor_id, action, position_title)
  VALUES (v_university_id, p_user_id, v_actor, 'revoked', v_position_title);
END;
$function$;

REVOKE ALL ON FUNCTION private.revoke_campus_finance_officer_impl(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.revoke_campus_finance_officer_impl(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_campus_finance_officer(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $wrapper$
  SELECT private.revoke_campus_finance_officer_impl(p_user_id);
$wrapper$;

REVOKE ALL ON FUNCTION public.revoke_campus_finance_officer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_campus_finance_officer(uuid) TO authenticated;

-- Billing requests remain own-requester visible; only a campus administrator or
-- separately appointed finance officer for the exact university can submit them.
DROP POLICY IF EXISTS campus_institutional_billing_requests_insert_own
  ON public.campus_institutional_billing_requests;
CREATE POLICY campus_institutional_billing_requests_insert_own
ON public.campus_institutional_billing_requests
FOR INSERT TO authenticated
WITH CHECK (
  requester_id = (SELECT auth.uid())
  AND status = 'pending'
  AND university_id IS NOT NULL
  AND private.current_user_can_manage_institutional_billing(university_id)
  AND EXISTS (
    SELECT 1 FROM public.campus_universities u
    WHERE u.id = campus_institutional_billing_requests.university_id
      AND lower(u.name) = lower(btrim(campus_institutional_billing_requests.institution_name))
  )
);

DROP POLICY IF EXISTS campus_institutional_billing_requests_select_own
  ON public.campus_institutional_billing_requests;
CREATE POLICY campus_institutional_billing_requests_select_own
ON public.campus_institutional_billing_requests
FOR SELECT TO authenticated
USING (
  public.platform_is_admin()
  OR (
    requester_id = (SELECT auth.uid())
    AND (
      university_id IS NULL -- preserve visibility of any historical request owned by this user
      OR private.current_user_can_manage_institutional_billing(university_id)
    )
  )
);

COMMENT ON FUNCTION public.get_my_campus_finance_access() IS
  'Returns the current user’s separately appointed finance access for their verified campus; staff job titles alone do not grant access.';
COMMENT ON FUNCTION public.can_manage_institutional_billing() IS
  'Server-authoritative institutional billing capability for the current user and current verified campus.';
