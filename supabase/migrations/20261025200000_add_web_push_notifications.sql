-- Private browser push endpoints. Clients manage them only through authenticated Edge Functions.
BEGIN;

CREATE TABLE IF NOT EXISTS public.campus_push_subscriptions (
  endpoint text PRIMARY KEY CHECK (endpoint ~ '^https://'),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  p256dh_key text NOT NULL CHECK (char_length(p256dh_key) BETWEEN 20 AND 200),
  auth_key text NOT NULL CHECK (char_length(auth_key) BETWEEN 8 AND 100),
  expiration_time timestamptz,
  user_agent text CHECK (user_agent IS NULL OR char_length(user_agent) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  failure_count integer NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  last_error_code integer
);

CREATE INDEX IF NOT EXISTS campus_push_subscriptions_user_updated_idx
  ON public.campus_push_subscriptions (user_id, updated_at DESC);

ALTER TABLE public.campus_push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.campus_push_subscriptions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.campus_push_subscriptions TO service_role;

DROP POLICY IF EXISTS campus_push_subscriptions_no_direct_client_access
  ON public.campus_push_subscriptions;
CREATE POLICY campus_push_subscriptions_no_direct_client_access
  ON public.campus_push_subscriptions
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

COMMIT;
