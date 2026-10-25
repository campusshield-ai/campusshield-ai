-- Idempotency ledger for server-issued push events. No client-side access.
BEGIN;
CREATE TABLE IF NOT EXISTS public.campus_push_delivery_events (
  event_key text PRIMARY KEY CHECK (char_length(event_key) BETWEEN 10 AND 220),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('timetable_reminder','new_message','campus_announcement','account_update','test')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','no_subscription','failed')),
  delivered_count integer NOT NULL DEFAULT 0 CHECK (delivered_count >= 0),
  expired_count integer NOT NULL DEFAULT 0 CHECK (expired_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campus_push_delivery_events_user_created_idx
  ON public.campus_push_delivery_events (user_id, created_at DESC);
ALTER TABLE public.campus_push_delivery_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.campus_push_delivery_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.campus_push_delivery_events TO service_role;
DROP POLICY IF EXISTS campus_push_delivery_events_no_direct_client_access
  ON public.campus_push_delivery_events;
CREATE POLICY campus_push_delivery_events_no_direct_client_access
  ON public.campus_push_delivery_events
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);
COMMIT;
