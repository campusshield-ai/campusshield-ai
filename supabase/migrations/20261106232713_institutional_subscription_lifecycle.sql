-- Tie the first verified charge to an exact Paystack recurring subscription,
-- then reconcile future renewals and cancellation signals from signed webhooks.

ALTER TABLE public.campus_institutional_subscriptions
  ADD COLUMN IF NOT EXISTS provider_customer_code text,
  ADD COLUMN IF NOT EXISTS provider_plan_code text,
  ADD COLUMN IF NOT EXISTS next_payment_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_provider_invoice_code text;

CREATE UNIQUE INDEX IF NOT EXISTS campus_institutional_subscriptions_provider_code_uidx
  ON public.campus_institutional_subscriptions (provider_subscription_code)
  WHERE provider_subscription_code IS NOT NULL;

ALTER TABLE private.campus_institutional_payment_audit
  ALTER COLUMN verified_by DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS payment_kind text NOT NULL DEFAULT 'initial'
    CHECK (payment_kind IN ('initial','renewal')),
  ADD COLUMN IF NOT EXISTS verified_source text NOT NULL DEFAULT 'finance'
    CHECK (verified_source IN ('finance','paystack_webhook')),
  ADD COLUMN IF NOT EXISTS provider_invoice_code text,
  ADD COLUMN IF NOT EXISTS period_start timestamptz,
  ADD COLUMN IF NOT EXISTS period_end timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS campus_institutional_payment_audit_provider_invoice_uidx
  ON private.campus_institutional_payment_audit (provider_invoice_code)
  WHERE provider_invoice_code IS NOT NULL;

REVOKE ALL ON FUNCTION public.commit_campus_institutional_paystack_payment(
  uuid,uuid,text,text,bigint,text,text,text,timestamptz,text,uuid
) FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.commit_campus_institutional_paystack_payment(
  uuid,uuid,text,text,bigint,text,text,text,timestamptz,text,uuid
);

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
  p_subscription_code text,
  p_next_payment_at timestamptz,
  p_provider_plan_code text DEFAULT NULL,
  p_provider_customer_code text DEFAULT NULL,
  p_event_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_invoice public.campus_institutional_invoices%ROWTYPE;
  v_subscription_id uuid;
BEGIN
  IF p_invoice_id IS NULL OR p_actor_user_id IS NULL
     OR nullif(btrim(p_reference), '') IS NULL
     OR nullif(btrim(p_transaction_id), '') IS NULL
     OR p_amount_kobo IS NULL OR p_amount_kobo <= 0
     OR p_currency <> 'NGN'
     OR lower(btrim(coalesce(p_customer_email,''))) = ''
     OR p_paid_at IS NULL OR p_paid_at > now() + interval '10 minutes'
     OR p_provider_domain NOT IN ('test','live')
     OR p_subscription_code !~ '^SUB_[A-Za-z0-9_-]{6,120}$'
     OR p_next_payment_at IS NULL
     OR p_next_payment_at <= p_paid_at
     OR p_next_payment_at > p_paid_at + interval '45 days' THEN
    RAISE EXCEPTION 'Verified transaction and recurring subscription details are incomplete or invalid.';
  END IF;

  SELECT * INTO v_invoice
  FROM public.campus_institutional_invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'The selected invoice does not exist.'; END IF;

  IF v_invoice.status = 'paid' AND v_invoice.paid_reference = p_reference THEN
    SELECT id INTO v_subscription_id
    FROM public.campus_institutional_subscriptions
    WHERE source_invoice_id = p_invoice_id
      AND provider_subscription_code = p_subscription_code;
    IF v_subscription_id IS NOT NULL THEN RETURN v_subscription_id; END IF;
    RAISE EXCEPTION 'This invoice is paid but its subscription code does not match the recorded subscription.';
  END IF;

  IF v_invoice.status <> 'issued' THEN
    RAISE EXCEPTION 'Only an issued, unpaid invoice can be reconciled.';
  END IF;
  IF v_invoice.billing_period <> 'monthly' THEN
    RAISE EXCEPTION 'The linked Paystack pages are monthly recurring subscriptions.';
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

  IF EXISTS (SELECT 1 FROM private.campus_institutional_payment_audit WHERE provider_reference = p_reference) THEN
    RAISE EXCEPTION 'This Paystack transaction reference has already been reconciled.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.campus_institutional_subscriptions WHERE provider_subscription_code = p_subscription_code) THEN
    RAISE EXCEPTION 'This Paystack subscription code is already linked to an institution.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.campus_institutional_subscriptions
    WHERE university_id = v_invoice.university_id AND status IN ('active','past_due')
  ) THEN
    RAISE EXCEPTION 'This university already has an active institutional subscription. Use the renewal workflow.';
  END IF;

  INSERT INTO public.campus_institutional_subscriptions (
    university_id, source_invoice_id, plan, billing_period, status, provider,
    provider_reference, provider_subscription_code, provider_plan_code,
    provider_customer_code, amount_kobo, currency, renewal_status,
    started_at, expires_at, next_payment_at, last_payment_at, activated_by
  ) VALUES (
    v_invoice.university_id, v_invoice.id, v_invoice.plan, v_invoice.billing_period,
    'active', 'paystack', p_reference, p_subscription_code, p_provider_plan_code,
    p_provider_customer_code, p_amount_kobo, p_currency, 'active',
    p_paid_at, p_next_payment_at, p_next_payment_at, p_paid_at, p_actor_user_id
  )
  RETURNING id INTO v_subscription_id;

  UPDATE public.campus_institutional_invoices
  SET status = 'paid', paid_at = p_paid_at,
      paid_reference = p_reference, paid_by = p_actor_user_id
  WHERE id = p_invoice_id AND status = 'issued';
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice state changed before payment could be committed.'; END IF;

  INSERT INTO private.campus_institutional_payment_audit (
    invoice_id, subscription_id, event_id, university_id, verified_by,
    provider_reference, provider_transaction_id, provider_domain,
    customer_email, amount_kobo, currency, provider_paid_at,
    payment_kind, verified_source, period_start, period_end
  ) VALUES (
    v_invoice.id, v_subscription_id, p_event_id, v_invoice.university_id,
    p_actor_user_id, p_reference, p_transaction_id, p_provider_domain,
    lower(btrim(p_customer_email)), p_amount_kobo, p_currency, p_paid_at,
    'initial', 'finance', p_paid_at, p_next_payment_at
  );

  UPDATE private.campus_institutional_paystack_events
  SET review_status = 'reconciled', matched_invoice_id = v_invoice.id,
      reviewed_by = p_actor_user_id, reviewed_at = now()
  WHERE (p_event_id IS NOT NULL AND id = p_event_id)
     OR (p_event_id IS NULL AND provider_reference = p_reference AND event_type = 'charge.success');

  RETURN v_subscription_id;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_campus_institutional_paystack_payment(
  uuid,uuid,text,text,bigint,text,text,text,timestamptz,text,timestamptz,text,text,uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_campus_institutional_paystack_payment(
  uuid,uuid,text,text,bigint,text,text,text,timestamptz,text,timestamptz,text,text,uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.record_campus_institutional_paystack_renewal(
  p_subscription_code text,
  p_event_id uuid,
  p_reference text,
  p_transaction_id text,
  p_invoice_code text,
  p_amount_kobo bigint,
  p_currency text,
  p_customer_email text,
  p_provider_domain text,
  p_paid_at timestamptz,
  p_period_start timestamptz,
  p_access_through timestamptz,
  p_next_payment_at timestamptz DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_subscription public.campus_institutional_subscriptions%ROWTYPE;
  v_invoice public.campus_institutional_invoices%ROWTYPE;
  v_keeps_nonrenewing boolean;
BEGIN
  IF p_subscription_code IS NULL OR p_reference IS NULL OR p_transaction_id IS NULL
     OR p_invoice_code IS NULL OR p_amount_kobo <= 0 OR p_currency <> 'NGN'
     OR p_provider_domain NOT IN ('test','live') OR p_paid_at IS NULL
     OR p_period_start IS NULL OR p_access_through IS NULL
     OR p_access_through <= p_paid_at
     OR p_access_through > p_paid_at + interval '45 days' THEN
    RAISE EXCEPTION 'Verified recurring payment details are incomplete or invalid.';
  END IF;

  SELECT * INTO v_subscription
  FROM public.campus_institutional_subscriptions
  WHERE provider_subscription_code = p_subscription_code
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No CampusShield institution is linked to this Paystack subscription.'; END IF;

  SELECT * INTO v_invoice
  FROM public.campus_institutional_invoices
  WHERE id = v_subscription.source_invoice_id;
  IF lower(btrim(v_invoice.bill_to_email)) <> lower(btrim(p_customer_email))
     OR v_subscription.amount_kobo <> p_amount_kobo
     OR v_subscription.currency <> p_currency THEN
    RAISE EXCEPTION 'Recurring Paystack payment does not match the linked institution, email or amount.';
  END IF;

  IF EXISTS (SELECT 1 FROM private.campus_institutional_payment_audit WHERE provider_reference = p_reference)
     OR EXISTS (SELECT 1 FROM private.campus_institutional_payment_audit WHERE provider_invoice_code = p_invoice_code) THEN
    RETURN false;
  END IF;

  v_keeps_nonrenewing :=
    v_subscription.renewal_status = 'not_renewing'
    OR v_subscription.cancel_requested_at IS NOT NULL;

  UPDATE public.campus_institutional_subscriptions
  SET status = CASE WHEN p_access_through > now() THEN 'active' ELSE 'past_due' END,
      renewal_status = CASE WHEN v_keeps_nonrenewing THEN 'not_renewing' ELSE 'active' END,
      expires_at = GREATEST(expires_at, p_access_through),
      next_payment_at = CASE WHEN v_keeps_nonrenewing THEN NULL ELSE p_next_payment_at END,
      last_payment_at = p_paid_at,
      last_failed_at = NULL,
      last_provider_invoice_code = p_invoice_code,
      updated_at = now()
  WHERE id = v_subscription.id;

  INSERT INTO private.campus_institutional_payment_audit (
    invoice_id, subscription_id, event_id, university_id, verified_by,
    provider_reference, provider_transaction_id, provider_domain,
    customer_email, amount_kobo, currency, provider_paid_at,
    payment_kind, verified_source, provider_invoice_code, period_start, period_end
  ) VALUES (
    v_subscription.source_invoice_id, v_subscription.id, p_event_id,
    v_subscription.university_id, NULL, p_reference, p_transaction_id,
    p_provider_domain, lower(btrim(p_customer_email)), p_amount_kobo,
    p_currency, p_paid_at, 'renewal', 'paystack_webhook',
    p_invoice_code, p_period_start, p_access_through
  );

  UPDATE private.campus_institutional_paystack_events
  SET review_status = 'reconciled', matched_invoice_id = v_subscription.source_invoice_id,
      reviewed_by = NULL, reviewed_at = now()
  WHERE id = p_event_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.record_campus_institutional_paystack_renewal(
  text,uuid,text,text,text,bigint,text,text,text,timestamptz,timestamptz,timestamptz,timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_campus_institutional_paystack_renewal(
  text,uuid,text,text,text,bigint,text,text,text,timestamptz,timestamptz,timestamptz,timestamptz
) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_campus_institutional_paystack_renewal_failed(
  p_subscription_code text,
  p_event_id uuid,
  p_customer_email text,
  p_amount_kobo bigint,
  p_currency text,
  p_provider_domain text,
  p_failed_at timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_subscription public.campus_institutional_subscriptions%ROWTYPE;
  v_invoice public.campus_institutional_invoices%ROWTYPE;
BEGIN
  SELECT * INTO v_subscription
  FROM public.campus_institutional_subscriptions
  WHERE provider_subscription_code = p_subscription_code
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT * INTO v_invoice FROM public.campus_institutional_invoices
  WHERE id = v_subscription.source_invoice_id;
  IF lower(btrim(v_invoice.bill_to_email)) <> lower(btrim(p_customer_email))
     OR v_subscription.amount_kobo <> p_amount_kobo
     OR v_subscription.currency <> p_currency
     OR p_provider_domain NOT IN ('test','live') THEN
    RAISE EXCEPTION 'Failed renewal event does not match the linked subscription.';
  END IF;

  UPDATE public.campus_institutional_subscriptions
  SET status = CASE WHEN expires_at <= now() THEN 'past_due' ELSE status END,
      renewal_status = 'attention',
      last_failed_at = p_failed_at,
      updated_at = now()
  WHERE id = v_subscription.id;

  UPDATE private.campus_institutional_paystack_events
  SET review_status = 'review_required',
      matched_invoice_id = v_subscription.source_invoice_id,
      reviewed_at = now()
  WHERE id = p_event_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_campus_institutional_paystack_renewal_failed(
  text,uuid,text,bigint,text,text,timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_campus_institutional_paystack_renewal_failed(
  text,uuid,text,bigint,text,text,timestamptz
) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_campus_institutional_paystack_subscription_nonrenewing(
  p_subscription_code text,
  p_event_id uuid,
  p_event_type text,
  p_customer_email text,
  p_provider_domain text,
  p_event_at timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_subscription public.campus_institutional_subscriptions%ROWTYPE;
  v_invoice public.campus_institutional_invoices%ROWTYPE;
BEGIN
  IF p_event_type NOT IN ('subscription.not_renew','subscription.disable')
     OR p_provider_domain NOT IN ('test','live') THEN
    RAISE EXCEPTION 'Unsupported subscription lifecycle event.';
  END IF;

  SELECT * INTO v_subscription
  FROM public.campus_institutional_subscriptions
  WHERE provider_subscription_code = p_subscription_code
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT * INTO v_invoice FROM public.campus_institutional_invoices
  WHERE id = v_subscription.source_invoice_id;
  IF lower(btrim(v_invoice.bill_to_email)) <> lower(btrim(p_customer_email)) THEN
    RAISE EXCEPTION 'Paystack subscription lifecycle event does not match the linked institution.';
  END IF;

  UPDATE public.campus_institutional_subscriptions
  SET renewal_status = 'not_renewing',
      cancel_requested_at = COALESCE(cancel_requested_at, p_event_at),
      cancelled_at = CASE WHEN p_event_type = 'subscription.disable' THEN COALESCE(cancelled_at, p_event_at) ELSE cancelled_at END,
      next_payment_at = NULL,
      status = CASE WHEN expires_at <= now() THEN 'expired' ELSE 'active' END,
      updated_at = now()
  WHERE id = v_subscription.id;

  UPDATE private.campus_institutional_paystack_events
  SET review_status = 'reconciled',
      matched_invoice_id = v_subscription.source_invoice_id,
      reviewed_at = now()
  WHERE id = p_event_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_campus_institutional_paystack_subscription_nonrenewing(
  text,uuid,text,text,text,timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_campus_institutional_paystack_subscription_nonrenewing(
  text,uuid,text,text,text,timestamptz
) TO service_role;
