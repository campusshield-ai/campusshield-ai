-- Browser subscriptions are private capabilities; only server-side functions may access them.
BEGIN;
CREATE TABLE IF NOT EXISTS public.campus_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campus_push_endpoint_https CHECK (endpoint ~ '^https://[^[:space:]]+$' AND char_length(endpoint) <= 2048),
  CONSTRAINT campus_push_p256dh_length CHECK (char_length(p256dh) BETWEEN 16 AND 256),
  CONSTRAINT campus_push_auth_length CHECK (char_length(auth) BETWEEN 8 AND 128),
  CONSTRAINT campus_push_user_agent_length CHECK (user_agent IS NULL OR char_length(user_agent) <= 300)
);
CREATE INDEX IF NOT EXISTS campus_push_subscriptions_user_updated_idx
  ON public.campus_push_subscriptions (user_id, updated_at DESC);
ALTER TABLE public.campus_push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.campus_push_subscriptions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.campus_push_subscriptions TO service_role;
COMMIT;