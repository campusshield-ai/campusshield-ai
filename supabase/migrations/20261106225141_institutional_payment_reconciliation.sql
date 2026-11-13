-- Institutional Paystack reconciliation is separate from personal ShieldMind billing.
-- Webhook events are evidence for finance review; they never grant entitlements by themselves.

ALTER TABLE public.campus_institutional_invoices
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_reference text,
  ADD COLUMN IF NOT EXISTS paid_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS campus_institutional_invoices_paid_reference_uidx
  ON public.campus_institutional_invoices (paid_reference)
  WHERE paid_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.campus_institutional_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL REFERENCES public.campus_universities(id) ON DELETE RESTRICT,
  source_invoice_id uuid NOT NULL UNIQUE REFERENCES public.campus_institutional_invoices(id) ON DELETE RESTRICT,
  plan text NOT NULL CHECK (plan IN ('university-starter','university-professional','university-enterprise')),
  billing_period text NOT NULL CHECK (billing_period IN ('monthly','yearly')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','past_due','cancelled','expired')),
  provider text NOT NULL DEFAULT 'paystack' CHECK (provider IN ('paystack','bank_transfer','manual')),
  provider_reference text NOT NULL UNIQUE,
  provider_subscription_code text,
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),
  currency text NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  renewal_status text NOT NULL DEFAULT 'unknown' CHECK (renewal_status IN ('active','not_renewing','attention','unknown')),
  started_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  last_payment_at timestamptz NOT NULL,
  activated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > started_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS campus_institutional_subscriptions_one_active_per_university_uidx
  ON public.campus_institutional_subscriptions (university_id)
  WHERE status IN ('active','past_due');

CREATE INDEX IF NOT EXISTS campus_institutional_subscriptions_expires_idx
  ON public.campus_institutional_subscriptions (expires_at);

ALTER TABLE public.campus_institutional_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campus_institutional_subscriptions FROM anon, authenticated;
GRANT SELECT ON public.campus_institutional_subscriptions TO authenticated;
GRANT ALL ON public.campus_institutional_subscriptions TO service_role;

CREATE POLICY campus_institutional_subscriptions_select_platform_or_campus_admin
  ON public.campus_institutional_subscriptions
  FOR SELECT TO authenticated
  USING (
    public.platform_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      JOIN public.campus_memberships AS membership
        ON membership.user_id = profile.id
      WHERE profile.id = (SELECT auth.uid())
        AND profile.role = 'admin'
        AND profile.verification_status = 'verified'
        AND membership.university_id = campus_institutional_subscriptions.university_id
        AND membership.campus_role = 'admin'
        AND membership.membership_status = 'active'
        AND membership.verification_status = 'verified'
    )
  );

CREATE TABLE IF NOT EXISTS private.campus_institutional_paystack_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  event_type text NOT NULL,
  provider_reference text,
  provider_transaction_id text,
  provider_subscription_code text,
  provider_invoice_code text,
  customer_email text,
  plan_code text,
  amount_kobo bigint,
  currency text,
  provider_domain text,
  provider_status text,
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  review_status text NOT NULL DEFAULT 'received'
    CHECK (review_status IN ('received','reconciled','ignored','review_required')),
  matched_invoice_id uuid REFERENCES public.campus_institutional_invoices(id) ON DELETE RESTRICT,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS campus_institutional_paystack_events_reference_idx
  ON private.campus_institutional_paystack_events (provider_reference)
  WHERE provider_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS campus_institutional_paystack_events_subscription_idx
  ON private.campus_institutional_paystack_events (provider_subscription_code)
  WHERE provider_subscription_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS campus_institutional_paystack_events_received_idx
  ON private.campus_institutional_paystack_events (received_at DESC);

CREATE TABLE IF NOT EXISTS private.campus_institutional_payment_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.campus_institutional_invoices(id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL REFERENCES public.campus_institutional_subscriptions(id) ON DELETE RESTRICT,
  event_id uuid REFERENCES private.campus_institutional_paystack_events(id) ON DELETE RESTRICT,
  university_id uuid NOT NULL REFERENCES public.campus_universities(id) ON DELETE RESTRICT,
  verified_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  provider text NOT NULL DEFAULT 'paystack' CHECK (provider = 'paystack'),
  provider_reference text NOT NULL UNIQUE,
  provider_transaction_id text NOT NULL,
  provider_domain text NOT NULL CHECK (provider_domain IN ('test','live')),
  customer_email text NOT NULL,
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),
  currency text NOT NULL CHECK (currency = 'NGN'),
  provider_paid_at timestamptz NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

REVOKE ALL ON private.campus_institutional_paystack_events FROM anon, authenticated;
REVOKE ALL ON private.campus_institutional_payment_audit FROM anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT SELECT, INSERT, UPDATE ON private.campus_institutional_paystack_events TO service_role;
GRANT SELECT, INSERT ON private.campus_institutional_payment_audit TO service_role;

CREATE OR REPLACE FUNCTION private.prevent_institutional_payment_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Institutional payment audit entries are append-only.';
END;
$$;

DROP TRIGGER IF EXISTS campus_institutional_payment_audit_no_mutation
  ON private.campus_institutional_payment_audit;
CREATE TRIGGER campus_institutional_payment_audit_no_mutation
  BEFORE UPDATE OR DELETE ON private.campus_institutional_payment_audit
  FOR EACH ROW EXECUTE FUNCTION private.prevent_institutional_payment_audit_mutation();

CREATE OR REPLACE FUNCTION public.commit_campus_institutional_paystack_payment(
  p_invoice_id uuid,
  p_actor_user_id uuid,
  p_reference text,
  p_transaction_id text,
  p_amount_kobo bigint,
  p_currency text,
  p_customer_email text,
  p_provider_domain text,
  p_paid_at timestamptz,
  p_subscription_code text DEFAULT NULL,
  p_event_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_invoice public.campus_institutional_invoices%ROWTYPE;
  v_subscription_id uuid;
  v_existing_invoice uuid;
BEGIN
  IF p_invoice_id IS NULL OR p_actor_user_id IS NULL
     OR nullif(btrim(p_reference), '') IS NULL
     OR nullif(btrim(p_transaction_id), '') IS NULL
     OR p_amount_kobo IS NULL OR p_amount_kobo <= 0
     OR p_currency <> 'NGN'
     OR lower(btrim(coalesce(p_customer_email,''))) = ''
     OR p_paid_at IS NULL
     OR p_paid_at > now() + interval '10 minutes'
     OR p_provider_domain NOT IN ('test','live') THEN
    RAISE EXCEPTION 'Verified payment details are incomplete or invalid.';
  END IF;

  SELECT * INTO v_invoice
  FROM public.campus_institutional_invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected invoice does not exist.';
  END IF;

  IF v_invoice.status = 'paid' AND v_invoice.paid_reference = p_reference THEN
    SELECT id INTO v_subscription_id
    FROM public.campus_institutional_subscriptions
    WHERE source_invoice_id = p_invoice_id;
    IF v_subscription_id IS NOT NULL THEN
      RETURN v_subscription_id;
    END IF;
    RAISE EXCEPTION 'Paid invoice has no matching institutional subscription record.';
  END IF;

  IF v_invoice.status <> 'issued' THEN
    RAISE EXCEPTION 'Only an issued, unpaid invoice can be reconciled.';
  END IF;
  IF v_invoice.billing_period <> 'monthly' THEN
    RAISE EXCEPTION 'This Paystack page is monthly. Annual invoices require a separately verified payment route.';
  END IF;
  IF v_invoice.total_kobo <> p_amount_kobo OR v_invoice.currency <> p_currency THEN
    RAISE EXCEPTION 'Verified Paystack amount does not match the invoice total.';
  END IF;
  IF lower(btrim(v_invoice.bill_to_email)) <> lower(btrim(p_customer_email)) THEN
    RAISE EXCEPTION 'Verified Paystack customer email does not match the invoice bill-to email.';
  END IF;
  IF (v_invoice.plan = 'university-starter' AND p_amount_kobo <> 10000000)
     OR (v_invoice.plan = 'university-professional' AND p_amount_kobo <> 25000000)
     OR (v_invoice.plan = 'university-enterprise' AND p_amount_kobo <> 50000000) THEN
    RAISE EXCEPTION 'Invoice does not match one of the fixed monthly institutional payment pages.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM private.campus_institutional_payment_audit
    WHERE provider_reference = p_reference
  ) THEN
    RAISE EXCEPTION 'This Paystack transaction reference has already been reconciled.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.campus_institutional_subscriptions
    WHERE university_id = v_invoice.university_id
      AND status IN ('active','past_due')
  ) THEN
    RAISE EXCEPTION 'This university already has an active institutional subscription. Renewal must use the controlled renewal workflow.';
  END IF;

  INSERT INTO public.campus_institutional_subscriptions (
    university_id, source_invoice_id, plan, billing_period, status, provider,
    provider_reference, provider_subscription_code, amount_kobo, currency,
    renewal_status, started_at, expires_at, last_payment_at, activated_by
  ) VALUES (
    v_invoice.university_id, v_invoice.id, v_invoice.plan, v_invoice.billing_period,
    'active', 'paystack', p_reference, nullif(btrim(p_subscription_code), ''),
    p_amount_kobo, p_currency, 'active', p_paid_at,
    p_paid_at + interval '1 month', p_paid_at, p_actor_user_id
  )
  RETURNING id INTO v_subscription_id;

  UPDATE public.campus_institutional_invoices
  SET status = 'paid',
      paid_at = p_paid_at,
      paid_reference = p_reference,
      paid_by = p_actor_user_id
  WHERE id = p_invoice_id AND status = 'issued';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice state changed before payment could be committed.';
  END IF;

  INSERT INTO private.campus_institutional_payment_audit (
    invoice_id, subscription_id, event_id, university_id, verified_by,
    provider_reference, provider_transaction_id, provider_domain,
    customer_email, amount_kobo, currency, provider_paid_at
  ) VALUES (
    v_invoice.id, v_subscription_id, p_event_id, v_invoice.university_id,
    p_actor_user_id, p_reference, p_transaction_id, p_provider_domain,
    lower(btrim(p_customer_email)), p_amount_kobo, p_currency, p_paid_at
  );

  IF p_event_id IS NOT NULL THEN
    UPDATE private.campus_institutional_paystack_events
    SET review_status = 'reconciled',
        matched_invoice_id = v_invoice.id,
        reviewed_by = p_actor_user_id,
        reviewed_at = now()
    WHERE id = p_event_id;
  ELSE
    UPDATE private.campus_institutional_paystack_events
    SET review_status = 'reconciled',
        matched_invoice_id = v_invoice.id,
        reviewed_by = p_actor_user_id,
        reviewed_at = now()
    WHERE provider_reference = p_reference
      AND event_type = 'charge.success';
  END IF;

  RETURN v_subscription_id;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_campus_institutional_paystack_payment(
  uuid,uuid,text,text,bigint,text,text,text,timestamptz,text,uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_campus_institutional_paystack_payment(
  uuid,uuid,text,text,bigint,text,text,text,timestamptz,text,uuid
) TO service_role;
