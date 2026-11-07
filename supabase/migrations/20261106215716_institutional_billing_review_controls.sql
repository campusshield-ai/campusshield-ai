-- Institutional billing request model and finance review controls.
-- This is idempotent against environments where the original request table
-- already exists. Request approval is NOT payment confirmation or activation.
CREATE TABLE IF NOT EXISTS public.campus_institutional_billing_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  institution_name text NOT NULL CHECK (char_length(btrim(institution_name)) BETWEEN 2 AND 180),
  requested_plan text NOT NULL CHECK (requested_plan IN ('university-starter','university-professional','university-enterprise')),
  billing_period text NOT NULL CHECK (billing_period IN ('monthly','yearly')),
  contact_email text NOT NULL CHECK (char_length(btrim(contact_email)) BETWEEN 3 AND 254),
  message text CHECK (message IS NULL OR char_length(message) <= 2000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','contacted','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campus_institutional_billing_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.campus_institutional_billing_requests FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.campus_institutional_billing_requests TO authenticated;

-- Reassert the same verified-campus-admin request boundary in either environment.
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

CREATE INDEX IF NOT EXISTS campus_institutional_billing_requests_created_idx
ON public.campus_institutional_billing_requests(created_at DESC);

ALTER TABLE public.campus_institutional_billing_requests
  ADD COLUMN IF NOT EXISTS response_message text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'campus_institutional_billing_requests_response_message_length'
      AND conrelid = 'public.campus_institutional_billing_requests'::regclass
  ) THEN
    ALTER TABLE public.campus_institutional_billing_requests
      ADD CONSTRAINT campus_institutional_billing_requests_response_message_length
      CHECK (response_message IS NULL OR char_length(response_message) <= 1000);
  END IF;
END
$$;

-- Keep updates unavailable to ordinary campus users. Trusted platform admins
-- receive only the two column privileges needed to record a request decision.
REVOKE UPDATE ON TABLE public.campus_institutional_billing_requests FROM anon, authenticated;
GRANT UPDATE (status, response_message)
  ON TABLE public.campus_institutional_billing_requests TO authenticated;

DROP POLICY IF EXISTS campus_institutional_billing_requests_update_platform_admin
  ON public.campus_institutional_billing_requests;
CREATE POLICY campus_institutional_billing_requests_update_platform_admin
ON public.campus_institutional_billing_requests
FOR UPDATE TO authenticated
USING (public.platform_is_admin())
WITH CHECK (public.platform_is_admin());

CREATE OR REPLACE FUNCTION public.set_campus_institutional_billing_review_metadata()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status
     OR OLD.response_message IS DISTINCT FROM NEW.response_message THEN
    NEW.reviewed_at := pg_catalog.now();
    NEW.reviewed_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_campus_institutional_billing_review_metadata()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS campus_institutional_billing_review_metadata
  ON public.campus_institutional_billing_requests;
CREATE TRIGGER campus_institutional_billing_review_metadata
BEFORE UPDATE OF status, response_message
ON public.campus_institutional_billing_requests
FOR EACH ROW
EXECUTE FUNCTION public.set_campus_institutional_billing_review_metadata();
