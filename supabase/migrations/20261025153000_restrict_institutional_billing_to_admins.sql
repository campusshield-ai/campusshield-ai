-- Institutional subscription controls and requests are for verified admins only.
-- Non-admins cannot submit or read even their own institutional billing requests.
-- Trusted platform administrators retain access for support/reconciliation.

DROP POLICY IF EXISTS campus_institutional_billing_requests_select_own
  ON public.campus_institutional_billing_requests;
CREATE POLICY campus_institutional_billing_requests_select_own
ON public.campus_institutional_billing_requests
FOR SELECT TO authenticated
USING (
  public.platform_is_admin()
  OR (
    requester_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      WHERE profile.id = (SELECT auth.uid())
        AND profile.role = 'admin'
        AND profile.verification_status = 'verified'
    )
  )
);

DROP POLICY IF EXISTS campus_institutional_billing_requests_insert_own
  ON public.campus_institutional_billing_requests;
CREATE POLICY campus_institutional_billing_requests_insert_own
ON public.campus_institutional_billing_requests
FOR INSERT TO authenticated
WITH CHECK (
  requester_id = (SELECT auth.uid())
  AND status = 'pending'
  AND (
    public.platform_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      WHERE profile.id = (SELECT auth.uid())
        AND profile.role = 'admin'
        AND profile.verification_status = 'verified'
    )
  )
);
