-- Scope institutional billing requests to the requester's verified campus admin membership.
-- The request itself remains a procurement enquiry only.
ALTER TABLE public.campus_institutional_billing_requests
  ADD COLUMN IF NOT EXISTS university_id uuid
  REFERENCES public.campus_universities(id) ON DELETE RESTRICT;

-- Cover the requester FK and requester-history filter/order in one index.
CREATE INDEX IF NOT EXISTS campus_institutional_billing_requests_requester_created_idx
  ON public.campus_institutional_billing_requests(requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS campus_institutional_billing_requests_reviewed_by_idx
  ON public.campus_institutional_billing_requests(reviewed_by);

DROP POLICY IF EXISTS campus_institutional_billing_requests_insert_own
  ON public.campus_institutional_billing_requests;
CREATE POLICY campus_institutional_billing_requests_insert_own
ON public.campus_institutional_billing_requests
FOR INSERT TO authenticated
WITH CHECK (
  requester_id = (SELECT auth.uid())
  AND status = 'pending'
  AND university_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    JOIN public.campus_memberships AS membership
      ON membership.user_id = profile.id
    JOIN public.campus_universities AS university
      ON university.id = membership.university_id
    WHERE profile.id = (SELECT auth.uid())
      AND profile.role = 'admin'
      AND profile.verification_status = 'verified'
      AND membership.campus_role = 'admin'
      AND membership.membership_status = 'active'
      AND membership.verification_status = 'verified'
      AND membership.university_id = campus_institutional_billing_requests.university_id
      AND lower(university.name) = lower(btrim(campus_institutional_billing_requests.institution_name))
  )
);
