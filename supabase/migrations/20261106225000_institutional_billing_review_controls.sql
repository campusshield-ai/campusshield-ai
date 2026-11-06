-- Institutional billing review controls.
-- This records procurement-request decisions only. It does not collect payment
-- or activate institutional entitlements.
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
