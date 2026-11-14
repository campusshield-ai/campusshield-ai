-- Align the already-existing Staging invoice foundation with the hardened
-- generated-total trigger and service-only payment commit semantics.

CREATE OR REPLACE FUNCTION public.prepare_campus_institutional_invoice()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  billing_request public.campus_institutional_billing_requests%ROWTYPE;
BEGIN
  SELECT *
  INTO billing_request
  FROM public.campus_institutional_billing_requests
  WHERE id = NEW.billing_request_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The billing request does not exist.';
  END IF;
  IF billing_request.status <> 'approved' THEN
    RAISE EXCEPTION 'Only an approved institutional billing request can receive an invoice.';
  END IF;
  IF NEW.due_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'The invoice due date must be today or later.';
  END IF;
  IF NEW.subtotal_kobo <= 0 OR NEW.tax_kobo < 0 THEN
    RAISE EXCEPTION 'Enter a valid positive invoice subtotal and non-negative tax amount.';
  END IF;

  NEW.university_id := billing_request.university_id;
  NEW.requester_id := billing_request.requester_id;
  NEW.bill_to_name := billing_request.institution_name;
  NEW.bill_to_email := billing_request.contact_email;
  NEW.plan := billing_request.requested_plan;
  NEW.billing_period := billing_request.billing_period;
  NEW.description := initcap(replace(billing_request.requested_plan, '-', ' '))
    || ' institutional subscription · ' || billing_request.billing_period;
  NEW.currency := 'NGN';
  NEW.status := 'issued';
  NEW.issued_by := auth.uid();
  NEW.issued_at := pg_catalog.now();
  RETURN NEW;
END;
$function$;


CREATE OR REPLACE FUNCTION public.commit_campus_institutional_invoice_payment(
  p_attempt_id uuid,
  p_actor_user_id uuid,
  p_reference text,
  p_transaction_id text,
  p_amount_kobo bigint,
  p_currency text,
  p_customer_email text,
  p_provider_domain text,
  p_paid_at timestamptz,
  p_event_id uuid DEFAULT NULL,
  p_verified_source text DEFAULT 'finance'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_attempt private.campus_institutional_payment_attempts%ROWTYPE;
  v_invoice public.campus_institutional_invoices%ROWTYPE;
  v_subscription public.campus_institutional_subscriptions%ROWTYPE;
  v_subscription_id uuid;
  v_receipt_number text;
  v_expires_at timestamptz;
  v_payment_kind text := 'initial';
BEGIN
  IF p_attempt_id IS NULL OR p_actor_user_id IS NULL
     OR nullif(btrim(coalesce(p_reference, '')), '') IS NULL
     OR nullif(btrim(coalesce(p_transaction_id, '')), '') IS NULL
     OR p_amount_kobo IS NULL OR p_amount_kobo <= 0
     OR p_currency IS DISTINCT FROM 'NGN'
     OR nullif(btrim(coalesce(p_customer_email, '')), '') IS NULL
     OR p_provider_domain IS NULL OR p_provider_domain NOT IN ('test', 'live')
     OR p_paid_at IS NULL OR p_paid_at > now() + interval '10 minutes'
     OR p_verified_source IS NULL OR p_verified_source NOT IN ('finance', 'paystack_webhook') THEN
    RAISE EXCEPTION 'Verified institutional invoice payment details are incomplete or invalid.';
  END IF;

  SELECT * INTO v_attempt
  FROM private.campus_institutional_payment_attempts
  WHERE id = p_attempt_id AND reference = p_reference
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The payment attempt could not be matched to this reference.';
  END IF;
  IF v_attempt.actor_user_id IS DISTINCT FROM p_actor_user_id THEN
    RAISE EXCEPTION 'The payment actor does not match the user who initialized this invoice checkout.';
  END IF;
  IF p_paid_at > v_attempt.expires_at THEN
    RAISE EXCEPTION 'The verified transaction was paid after this invoice payment attempt expired.';
  END IF;

  SELECT * INTO v_invoice
  FROM public.campus_institutional_invoices
  WHERE id = v_attempt.invoice_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The invoice linked to this payment attempt no longer exists.';
  END IF;

  IF v_invoice.university_id <> v_attempt.university_id
     OR v_attempt.amount_kobo <> p_amount_kobo
     OR v_invoice.total_kobo <> p_amount_kobo
     OR v_attempt.currency <> p_currency
     OR v_attempt.provider_domain <> p_provider_domain
     OR lower(btrim(v_attempt.customer_email)) <> lower(btrim(p_customer_email))
     OR lower(btrim(v_invoice.bill_to_email)) <> lower(btrim(p_customer_email))
     OR v_attempt.created_at > p_paid_at + interval '10 minutes' THEN
    RAISE EXCEPTION 'The verified transaction does not exactly match the university invoice and payment attempt.';
  END IF;

  -- A manual finance reconciliation must still be authorised at verification time.
  -- A signed Paystack webhook may finish a previously authorised attempt after an
  -- appointment is revoked; the attempt is service-role-created only and its
  -- actor is bound above to prevent reassignment or cross-university use.
  IF p_verified_source = 'finance' AND NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.campus_memberships cm ON cm.user_id = p.id
    WHERE p.id = p_actor_user_id
      AND p.verification_status::text = 'verified'
      AND cm.university_id = v_invoice.university_id
      AND cm.membership_status = 'active'
      AND cm.verification_status = 'verified'
      AND (
        (p.role::text = 'admin' AND cm.campus_role = 'admin')
        OR (
          p.role::text = 'teacher'
          AND cm.campus_role = 'teacher'
          AND EXISTS (
            SELECT 1
            FROM public.campus_staff_verifications v
            WHERE v.user_id = p_actor_user_id
              AND v.university_id = v_invoice.university_id
              AND v.status = 'approved'
              AND v.finance_appointment_status = 'active'
              AND v.finance_appointed_at IS NOT NULL
              AND v.position_title ~* '(bursar|finance|accountant|accounts|treasurer)'
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'Only a currently verified campus administrator or appointed finance officer for this university can reconcile the invoice.';
  END IF;

  IF p_event_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM private.campus_institutional_paystack_events e
    WHERE e.id = p_event_id
      AND e.event_type = 'charge.success'
      AND e.provider_reference = p_reference
  ) THEN
    RAISE EXCEPTION 'The signed Paystack success event does not match this transaction reference.';
  END IF;

  IF v_attempt.status = 'paid' OR v_invoice.status = 'paid' THEN
    SELECT a.receipt_number, a.subscription_id
    INTO v_receipt_number, v_subscription_id
    FROM private.campus_institutional_payment_audit a
    WHERE a.provider_reference = p_reference
      AND a.invoice_id = v_invoice.id
    LIMIT 1;
    IF v_receipt_number IS NOT NULL AND v_subscription_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'verified', true, 'duplicate', true, 'invoice_id', v_invoice.id,
        'subscription_id', v_subscription_id, 'invoice_number', v_invoice.invoice_number,
        'receipt_number', v_receipt_number
      );
    END IF;
    RAISE EXCEPTION 'This invoice or payment attempt has already been reconciled with a different reference.';
  END IF;

  IF v_attempt.status NOT IN ('pending', 'review_required') THEN
    RAISE EXCEPTION 'This payment attempt is no longer eligible for reconciliation.';
  END IF;
  IF v_invoice.status <> 'issued' THEN
    RAISE EXCEPTION 'Only an issued, unpaid institutional invoice can be reconciled.';
  END IF;
  IF v_invoice.billing_period NOT IN ('monthly', 'yearly')
     OR v_invoice.total_kobo IS NULL OR v_invoice.total_kobo <= 0
     OR v_invoice.currency <> 'NGN' THEN
    RAISE EXCEPTION 'The institutional invoice total or billing period is invalid.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM private.campus_institutional_payment_audit a
    WHERE a.provider_reference = p_reference
  ) THEN
    RAISE EXCEPTION 'This Paystack reference has already been reconciled.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_invoice.university_id::text, 0)
  );

  SELECT * INTO v_subscription
  FROM public.campus_institutional_subscriptions
  WHERE university_id = v_invoice.university_id
    AND status IN ('active', 'past_due')
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    v_subscription_id := v_subscription.id;
    v_payment_kind := 'renewal';
    v_expires_at := GREATEST(v_subscription.expires_at, p_paid_at)
      + CASE WHEN v_invoice.billing_period = 'yearly'
        THEN interval '1 year' ELSE interval '1 month' END;

    UPDATE public.campus_institutional_subscriptions
    SET plan = v_invoice.plan,
        billing_period = v_invoice.billing_period,
        status = 'active',
        amount_kobo = p_amount_kobo,
        currency = p_currency,
        renewal_status = 'not_renewing',
        expires_at = v_expires_at,
        next_payment_at = NULL,
        last_payment_at = p_paid_at,
        last_failed_at = NULL,
        updated_at = now()
    WHERE id = v_subscription_id;
  ELSE
    v_expires_at := p_paid_at
      + CASE WHEN v_invoice.billing_period = 'yearly'
        THEN interval '1 year' ELSE interval '1 month' END;

    INSERT INTO public.campus_institutional_subscriptions (
      university_id, source_invoice_id, plan, billing_period, status, provider,
      provider_reference, provider_subscription_code, amount_kobo, currency,
      renewal_status, started_at, expires_at, next_payment_at, last_payment_at,
      activated_by
    ) VALUES (
      v_invoice.university_id, v_invoice.id, v_invoice.plan, v_invoice.billing_period,
      'active', 'paystack', p_reference, NULL, p_amount_kobo, p_currency,
      'not_renewing', p_paid_at, v_expires_at, NULL, p_paid_at, p_actor_user_id
    )
    RETURNING id INTO v_subscription_id;
  END IF;

  UPDATE public.campus_institutional_invoices
  SET status = 'paid', paid_at = p_paid_at, paid_reference = p_reference, paid_by = p_actor_user_id
  WHERE id = v_invoice.id AND status = 'issued';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice state changed before the payment could be committed.';
  END IF;

  INSERT INTO private.campus_institutional_payment_audit (
    invoice_id, subscription_id, event_id, university_id, verified_by,
    provider, provider_reference, provider_transaction_id, provider_domain,
    customer_email, amount_kobo, currency, provider_paid_at,
    payment_kind, verified_source, period_start, period_end
  ) VALUES (
    v_invoice.id, v_subscription_id, p_event_id, v_invoice.university_id,
    CASE WHEN p_verified_source = 'finance' THEN p_actor_user_id ELSE NULL END,
    'paystack', p_reference, p_transaction_id, p_provider_domain,
    lower(btrim(p_customer_email)), p_amount_kobo, p_currency, p_paid_at,
    v_payment_kind, p_verified_source, p_paid_at, v_expires_at
  )
  RETURNING receipt_number INTO v_receipt_number;

  UPDATE private.campus_institutional_payment_attempts
  SET status = 'paid',
      provider_transaction_id = p_transaction_id,
      provider_paid_at = p_paid_at,
      verified_at = now(),
      updated_at = now()
  WHERE id = v_attempt.id;

  IF p_event_id IS NOT NULL THEN
    UPDATE private.campus_institutional_paystack_events
    SET review_status = 'reconciled',
        matched_invoice_id = v_invoice.id,
        reviewed_by = p_actor_user_id,
        reviewed_at = now()
    WHERE id = p_event_id;
  END IF;

  RETURN jsonb_build_object(
    'verified', true, 'duplicate', false, 'invoice_id', v_invoice.id,
    'subscription_id', v_subscription_id, 'invoice_number', v_invoice.invoice_number,
    'receipt_number', v_receipt_number, 'expires_at', v_expires_at
  );
END;
$function$;


REVOKE ALL ON FUNCTION public.commit_campus_institutional_invoice_payment(
  uuid, uuid, text, text, bigint, text, text, text, timestamptz, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_campus_institutional_invoice_payment(
  uuid, uuid, text, text, bigint, text, text, text, timestamptz, uuid, text
) TO service_role;
