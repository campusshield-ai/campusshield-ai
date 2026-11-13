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
  IF nullif(btrim(coalesce(p_subscription_code,'')), '') IS NULL
     OR p_event_id IS NULL
     OR nullif(btrim(coalesce(p_reference,'')), '') IS NULL
     OR nullif(btrim(coalesce(p_transaction_id,'')), '') IS NULL
     OR nullif(btrim(coalesce(p_invoice_code,'')), '') IS NULL
     OR p_amount_kobo IS NULL OR p_amount_kobo <= 0
     OR p_currency IS NULL OR p_currency <> 'NGN'
     OR nullif(btrim(coalesce(p_customer_email,'')), '') IS NULL
     OR p_provider_domain IS NULL OR p_provider_domain NOT IN ('test','live')
     OR p_paid_at IS NULL OR p_paid_at > now() + interval '10 minutes'
     OR p_period_start IS NULL OR p_access_through IS NULL
     OR p_period_start > p_access_through
     OR p_access_through <= p_paid_at
     OR p_access_through > p_paid_at + interval '45 days'
     OR (p_next_payment_at IS NOT NULL AND
         (p_next_payment_at <= p_paid_at OR p_next_payment_at > p_paid_at + interval '45 days')) THEN
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
  IF NOT FOUND OR lower(btrim(v_invoice.bill_to_email)) <> lower(btrim(p_customer_email))
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
  IF nullif(btrim(coalesce(p_subscription_code,'')), '') IS NULL
     OR p_event_id IS NULL
     OR nullif(btrim(coalesce(p_customer_email,'')), '') IS NULL
     OR p_amount_kobo IS NULL OR p_amount_kobo <= 0
     OR p_currency IS NULL OR p_currency <> 'NGN'
     OR p_provider_domain IS NULL OR p_provider_domain NOT IN ('test','live')
     OR p_failed_at IS NULL OR p_failed_at > now() + interval '10 minutes' THEN
    RAISE EXCEPTION 'Failed recurring payment details are incomplete or invalid.';
  END IF;

  SELECT * INTO v_subscription
  FROM public.campus_institutional_subscriptions
  WHERE provider_subscription_code = p_subscription_code
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT * INTO v_invoice FROM public.campus_institutional_invoices
  WHERE id = v_subscription.source_invoice_id;
  IF NOT FOUND OR lower(btrim(v_invoice.bill_to_email)) <> lower(btrim(p_customer_email))
     OR v_subscription.amount_kobo <> p_amount_kobo
     OR v_subscription.currency <> p_currency THEN
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
  IF nullif(btrim(coalesce(p_subscription_code,'')), '') IS NULL
     OR p_event_id IS NULL
     OR nullif(btrim(coalesce(p_customer_email,'')), '') IS NULL
     OR p_event_type IS NULL OR p_event_type NOT IN ('subscription.not_renew','subscription.disable')
     OR p_provider_domain IS NULL OR p_provider_domain NOT IN ('test','live')
     OR p_event_at IS NULL OR p_event_at > now() + interval '10 minutes' THEN
    RAISE EXCEPTION 'Subscription cancellation details are incomplete or invalid.';
  END IF;

  SELECT * INTO v_subscription
  FROM public.campus_institutional_subscriptions
  WHERE provider_subscription_code = p_subscription_code
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT * INTO v_invoice FROM public.campus_institutional_invoices
  WHERE id = v_subscription.source_invoice_id;
  IF NOT FOUND OR lower(btrim(v_invoice.bill_to_email)) <> lower(btrim(p_customer_email)) THEN
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