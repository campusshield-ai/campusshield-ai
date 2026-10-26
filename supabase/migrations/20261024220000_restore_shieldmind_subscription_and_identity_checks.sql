-- Keep production ShieldMind quota dependencies and identity fraud checks versioned.
ALTER TABLE public.student_identity_verifications
  ADD COLUMN IF NOT EXISTS confirmed_fraud boolean NOT NULL DEFAULT false;
ALTER TABLE public.student_identity_verifications
  ADD COLUMN IF NOT EXISTS fraud_lock_at timestamptz;
ALTER TABLE public.student_identity_verifications
  ADD COLUMN IF NOT EXISTS fraud_decision_reason text;
ALTER TABLE public.student_identity_verifications
  ADD COLUMN IF NOT EXISTS fraud_decided_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.student_identity_verifications
  ADD COLUMN IF NOT EXISTS fraud_decided_at timestamptz;
ALTER TABLE public.student_identity_verifications
  ADD COLUMN IF NOT EXISTS fraud_notice_at timestamptz;

CREATE TABLE IF NOT EXISTS public.shieldmind_subscriptions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free' CHECK(plan IN ('free','starter','plus','pro','ultra','max','premium')),
  status text NOT NULL DEFAULT 'free' CHECK(status IN ('free','pending','active','expired','failed')),
  billing_period text CHECK(billing_period IN ('monthly','annual')),
  provider text CHECK(provider='paystack'),
  provider_reference text UNIQUE,
  amount_kobo integer CHECK(amount_kobo IS NULL OR amount_kobo > 0),
  currency text NOT NULL DEFAULT 'NGN' CHECK(currency='NGN'),
  started_at timestamptz,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  image_upload_limit integer NOT NULL DEFAULT 0 CHECK(image_upload_limit >= 0),
  provider_subscription_code text,
  provider_customer_code text,
  renewal_status text NOT NULL DEFAULT 'unknown' CHECK(renewal_status IN ('unknown','active','non-renewing','attention','cancelled','completed')),
  last_payment_reference text,
  last_payment_at timestamptz,
  CONSTRAINT premium_has_period CHECK(plan <> 'premium' OR billing_period IS NOT NULL)
);

ALTER TABLE public.shieldmind_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shieldmind_subscription_read_own ON public.shieldmind_subscriptions;
CREATE POLICY shieldmind_subscription_read_own
  ON public.shieldmind_subscriptions
  FOR SELECT TO authenticated
  USING(user_id = (SELECT auth.uid()));
GRANT SELECT ON public.shieldmind_subscriptions TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.shieldmind_subscriptions FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS campus_knowledge_sources_university_id_idx
  ON public.campus_knowledge_sources(university_id);
CREATE INDEX IF NOT EXISTS campus_knowledge_pages_university_id_idx
  ON public.campus_knowledge_pages(university_id);
CREATE INDEX IF NOT EXISTS campus_knowledge_pages_source_id_idx
  ON public.campus_knowledge_pages(source_id);
CREATE INDEX IF NOT EXISTS campus_memberships_university_id_idx
  ON public.campus_memberships(university_id);
