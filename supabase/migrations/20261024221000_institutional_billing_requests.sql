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
REVOKE ALL ON public.campus_institutional_billing_requests FROM anon, authenticated;
GRANT SELECT, INSERT ON public.campus_institutional_billing_requests TO authenticated;
DROP POLICY IF EXISTS campus_institutional_billing_requests_select_own ON public.campus_institutional_billing_requests;
CREATE POLICY campus_institutional_billing_requests_select_own
ON public.campus_institutional_billing_requests FOR SELECT TO authenticated
USING (requester_id = (SELECT auth.uid()) OR public.platform_is_admin());
DROP POLICY IF EXISTS campus_institutional_billing_requests_insert_own ON public.campus_institutional_billing_requests;
CREATE POLICY campus_institutional_billing_requests_insert_own
ON public.campus_institutional_billing_requests FOR INSERT TO authenticated
WITH CHECK (requester_id = (SELECT auth.uid()) AND status = 'pending');
CREATE INDEX IF NOT EXISTS campus_institutional_billing_requests_created_idx
ON public.campus_institutional_billing_requests(created_at DESC);
