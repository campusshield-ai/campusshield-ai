-- Institutional invoice payment foundation and one-time Paystack reconciliation.
-- This migration is additive and safe to apply to both the richer staging schema
-- and production, where the invoice/subscription tables were previously absent.

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.campus_institutional_paystack_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL,
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
  review_status text NOT NULL DEFAULT 'received',
  matched_invoice_id uuid,
  reviewed_by uuid,
  reviewed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.campus_institutional_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL DEFAULT
    ('CSI-' || to_char(now(), 'YYYYMM') || '-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  billing_request_id uuid NOT NULL UNIQUE
    REFERENCES public.campus_institutional_billing_requests(id) ON DELETE RESTRICT,
  university_id uuid NOT NULL
    REFERENCES public.campus_universities(id) ON DELETE RESTRICT,
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  bill_to_name text NOT NULL,
  bill_to_email text NOT NULL,
  plan text NOT NULL,
  billing_period text NOT NULL,
  description text NOT NULL,
  subtotal_kobo bigint NOT NULL,
  tax_kobo bigint NOT NULL DEFAULT 0,
  total_kobo bigint GENERATED ALWAYS AS (subtotal_kobo + tax_kobo) STORED,
  currency text NOT NULL DEFAULT 'NGN',
  due_date date NOT NULL,
  payment_instructions text NOT NULL,
  status text NOT NULL DEFAULT 'issued',
  issued_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  paid_reference text,
  paid_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT campus_institutional_invoices_bill_to_email_check
    CHECK (char_length(btrim(bill_to_email)) BETWEEN 3 AND 254),
  CONSTRAINT campus_institutional_invoices_bill_to_name_check
    CHECK (char_length(btrim(bill_to_name)) BETWEEN 2 AND 180),
  CONSTRAINT campus_institutional_invoices_billing_period_check
    CHECK (billing_period IN ('monthly', 'yearly')),
  CONSTRAINT campus_institutional_invoices_currency_check CHECK (currency = 'NGN'),
  CONSTRAINT campus_institutional_invoices_description_check
    CHECK (char_length(btrim(description)) BETWEEN 3 AND 500),
  CONSTRAINT campus_institutional_invoices_payment_instructions_check
    CHECK (char_length(btrim(payment_instructions)) BETWEEN 8 AND 2000),
  CONSTRAINT campus_institutional_invoices_plan_check
    CHECK (plan IN ('university-starter', 'university-professional', 'university-enterprise')),
  CONSTRAINT campus_institutional_invoices_status_check CHECK (status IN ('issued', 'paid', 'void')),
  CONSTRAINT campus_institutional_invoices_subtotal_kobo_check CHECK (subtotal_kobo > 0),
  CONSTRAINT campus_institutional_invoices_tax_kobo_check CHECK (tax_kobo >= 0)
);

CREATE TABLE IF NOT EXISTS public.campus_institutional_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL REFERENCES public.campus_universities(id) ON DELETE RESTRICT,
  source_invoice_id uuid NOT NULL UNIQUE
    REFERENCES public.campus_institutional_invoices(id) ON DELETE RESTRICT,
  plan text NOT NULL,
  billing_period text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  provider text NOT NULL DEFAULT 'paystack',
  provider_reference text NOT NULL UNIQUE,
  provider_subscription_code text,
  amount_kobo bigint NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',
  renewal_status text NOT NULL DEFAULT 'unknown',
  started_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  last_payment_at timestamptz NOT NULL,
  activated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  provider_customer_code text,
  provider_plan_code text,
  next_payment_at timestamptz,
  last_failed_at timestamptz,
  cancel_requested_at timestamptz,
  cancelled_at timestamptz,
  last_provider_invoice_code text,
  CONSTRAINT campus_institutional_subscriptions_amount_kobo_check CHECK (amount_kobo > 0),
  CONSTRAINT campus_institutional_subscriptions_billing_period_check
    CHECK (billing_period IN ('monthly', 'yearly')),
  CONSTRAINT campus_institutional_subscriptions_check CHECK (expires_at > started_at),
  CONSTRAINT campus_institutional_subscriptions_currency_check CHECK (currency = 'NGN'),
  CONSTRAINT campus_institutional_subscriptions_plan_check
    CHECK (plan IN ('university-starter', 'university-professional', 'university-enterprise')),
  CONSTRAINT campus_institutional_subscriptions_provider_check
    CHECK (provider IN ('paystack', 'bank_transfer', 'manual')),
  CONSTRAINT campus_institutional_subscriptions_renewal_status_check
    CHECK (renewal_status IN ('active', 'not_renewing', 'attention', 'unknown')),
  CONSTRAINT campus_institutional_subscriptions_status_check
    CHECK (status IN ('active', 'past_due', 'cancelled', 'expired'))
);

CREATE TABLE IF NOT EXISTS private.campus_institutional_payment_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.campus_institutional_invoices(id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL REFERENCES public.campus_institutional_subscriptions(id) ON DELETE RESTRICT,
  event_id uuid,
  university_id uuid NOT NULL REFERENCES public.campus_universities(id) ON DELETE RESTRICT,
  verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'paystack',
  provider_reference text NOT NULL,
  provider_transaction_id text NOT NULL,
  provider_domain text NOT NULL,
  customer_email text NOT NULL,
  amount_kobo bigint NOT NULL,
  currency text NOT NULL,
  provider_paid_at timestamptz NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  payment_kind text NOT NULL DEFAULT 'initial',
  verified_source text NOT NULL DEFAULT 'finance',
  provider_invoice_code text,
  period_start timestamptz,
  period_end timestamptz
);

CREATE TABLE IF NOT EXISTS private.campus_institutional_payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL REFERENCES public.campus_universities(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL REFERENCES public.campus_institutional_invoices(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reference text NOT NULL UNIQUE,
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),
  currency text NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  customer_email text NOT NULL,
  provider_domain text NOT NULL CHECK (provider_domain IN ('test', 'live')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'review_required', 'expired')),
  authorization_url text,
  provider_transaction_id text,
  provider_paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 days'),
  verified_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE private.campus_institutional_payment_audit
  ADD COLUMN IF NOT EXISTS receipt_number text;

UPDATE private.campus_institutional_payment_audit
SET receipt_number = 'CSR-' || to_char(verified_at AT TIME ZONE 'UTC', 'YYYYMMDD')
  || '-' || upper(substr(gen_random_uuid()::text, 1, 8))
WHERE receipt_number IS NULL;

ALTER TABLE private.campus_institutional_payment_audit
  ALTER COLUMN receipt_number SET DEFAULT
    ('CSR-' || to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  ALTER COLUMN receipt_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS campus_institutional_invoices_invoice_number_key
  ON public.campus_institutional_invoices(invoice_number);
CREATE UNIQUE INDEX IF NOT EXISTS campus_institutional_invoices_paid_reference_uidx
  ON public.campus_institutional_invoices(paid_reference) WHERE paid_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS campus_institutional_invoices_university_idx
  ON public.campus_institutional_invoices(university_id);
CREATE INDEX IF NOT EXISTS campus_institutional_invoices_requester_issued_idx
  ON public.campus_institutional_invoices(requester_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS campus_institutional_invoices_issued_by_idx
  ON public.campus_institutional_invoices(issued_by);
CREATE INDEX IF NOT EXISTS campus_institutional_invoices_paid_by_idx
  ON public.campus_institutional_invoices(paid_by) WHERE paid_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS campus_institutional_subscriptions_expires_idx
  ON public.campus_institutional_subscriptions(expires_at);
CREATE INDEX IF NOT EXISTS campus_institutional_subscriptions_activated_by_idx
  ON public.campus_institutional_subscriptions(activated_by);
CREATE UNIQUE INDEX IF NOT EXISTS campus_institutional_subscriptions_provider_code_uidx
  ON public.campus_institutional_subscriptions(provider_subscription_code)
  WHERE provider_subscription_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS campus_institutional_subscriptions_one_active_per_university_ui
  ON public.campus_institutional_subscriptions(university_id)
  WHERE status IN ('active', 'past_due');
CREATE UNIQUE INDEX IF NOT EXISTS campus_institutional_paystack_events_event_key_uidx
  ON private.campus_institutional_paystack_events(event_key);
CREATE INDEX IF NOT EXISTS campus_institutional_paystack_events_reference_idx
  ON private.campus_institutional_paystack_events(provider_reference);
CREATE INDEX IF NOT EXISTS campus_institutional_paystack_events_review_status_idx
  ON private.campus_institutional_paystack_events(review_status, received_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS campus_institutional_payment_audit_reference_uidx
  ON private.campus_institutional_payment_audit(provider_reference);
CREATE UNIQUE INDEX IF NOT EXISTS campus_institutional_payment_audit_receipt_uidx
  ON private.campus_institutional_payment_audit(receipt_number);
CREATE INDEX IF NOT EXISTS campus_institutional_payment_audit_university_verified_idx
  ON private.campus_institutional_payment_audit(university_id, verified_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS campus_institutional_payment_attempts_pending_invoice_uidx
  ON private.campus_institutional_payment_attempts(invoice_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS campus_institutional_payment_attempts_university_created_idx
  ON private.campus_institutional_payment_attempts(university_id, created_at DESC);

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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.campus_institutional_invoices'::regclass
      AND tgname = 'campus_institutional_invoice_prepare'
      AND NOT tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER campus_institutional_invoice_prepare
      BEFORE INSERT ON public.campus_institutional_invoices
      FOR EACH ROW EXECUTE FUNCTION public.prepare_campus_institutional_invoice()';
  END IF;
END;
$$;

ALTER TABLE public.campus_institutional_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_institutional_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.campus_institutional_payment_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campus_institutional_invoices_select_requester_or_platform_admin
  ON public.campus_institutional_invoices;
DROP POLICY IF EXISTS campus_institutional_invoices_select_requester_or_platform_admi
  ON public.campus_institutional_invoices;
CREATE POLICY campus_institutional_invoices_select_requester_or_platform_admin
ON public.campus_institutional_invoices FOR SELECT TO authenticated
USING (
  public.platform_is_admin()
  OR (
    requester_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.profiles profile
      JOIN public.campus_memberships membership ON membership.user_id = profile.id
      WHERE profile.id = (SELECT auth.uid())
        AND profile.role = 'admin'
        AND profile.verification_status = 'verified'
        AND membership.university_id = campus_institutional_invoices.university_id
        AND membership.campus_role = 'admin'
        AND membership.membership_status = 'active'
        AND membership.verification_status = 'verified'
    )
  )
);

DROP POLICY IF EXISTS campus_institutional_invoices_insert_platform_admin
  ON public.campus_institutional_invoices;
CREATE POLICY campus_institutional_invoices_insert_platform_admin
ON public.campus_institutional_invoices FOR INSERT TO authenticated
WITH CHECK (
  public.platform_is_admin()
  AND issued_by = (SELECT auth.uid())
  AND status = 'issued'
  AND currency = 'NGN'
);

DROP POLICY IF EXISTS account_lifecycle_active_guard ON public.campus_institutional_invoices;
CREATE POLICY account_lifecycle_active_guard
ON public.campus_institutional_invoices AS RESTRICTIVE FOR ALL TO authenticated
USING ((SELECT private.account_lifecycle_is_active()))
WITH CHECK ((SELECT private.account_lifecycle_is_active()));

DROP POLICY IF EXISTS campus_institutional_subscriptions_select_platform_or_campus_admin
  ON public.campus_institutional_subscriptions;
DROP POLICY IF EXISTS campus_institutional_subscriptions_select_platform_or_campus_ad
  ON public.campus_institutional_subscriptions;
CREATE POLICY campus_institutional_subscriptions_select_platform_or_campus_admin
ON public.campus_institutional_subscriptions FOR SELECT TO authenticated
USING (
  public.platform_is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.profiles profile
    JOIN public.campus_memberships membership ON membership.user_id = profile.id
    WHERE profile.id = (SELECT auth.uid())
      AND profile.role = 'admin'
      AND profile.verification_status = 'verified'
      AND membership.university_id = campus_institutional_subscriptions.university_id
      AND membership.campus_role = 'admin'
      AND membership.membership_status = 'active'
      AND membership.verification_status = 'verified'
  )
);

DROP POLICY IF EXISTS account_lifecycle_active_guard ON public.campus_institutional_subscriptions;
CREATE POLICY account_lifecycle_active_guard
ON public.campus_institutional_subscriptions AS RESTRICTIVE FOR ALL TO authenticated
USING ((SELECT private.account_lifecycle_is_active()))
WITH CHECK ((SELECT private.account_lifecycle_is_active()));

REVOKE ALL ON TABLE private.campus_institutional_payment_attempts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.campus_institutional_payment_audit FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.campus_institutional_paystack_events FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE private.campus_institutional_payment_attempts TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE private.campus_institutional_payment_audit TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE private.campus_institutional_paystack_events TO service_role;
GRANT SELECT ON TABLE public.campus_institutional_invoices TO authenticated;
GRANT SELECT ON TABLE public.campus_institutional_subscriptions TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.campus_institutional_invoices FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.campus_institutional_subscriptions FROM authenticated;

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
