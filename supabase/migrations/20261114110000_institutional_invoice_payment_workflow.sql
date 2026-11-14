-- Institutional CampusShield subscription invoices and Paystack reconciliation.
-- This migration is safe to apply after the existing finance-officer appointment migration.
-- It does not create, query, or expose student tuition / fee-payment records.

ALTER TABLE public.campus_institutional_billing_requests
  ADD COLUMN IF NOT EXISTS university_id uuid
  REFERENCES public.campus_universities(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS response_message text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.campus_institutional_billing_requests r
SET university_id = u.id
FROM public.campus_universities u
WHERE r.university_id IS NULL
  AND lower(btrim(r.institution_name)) = lower(btrim(u.name))
  AND (SELECT count(*) FROM public.campus_universities u2
       WHERE lower(btrim(u2.name)) = lower(btrim(r.institution_name))) = 1;

CREATE INDEX IF NOT EXISTS campus_institutional_billing_requests_university_requester_idx
  ON public.campus_institutional_billing_requests (university_id, requester_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.campus_institutional_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE DEFAULT (
    'CSI-' || to_char(now(), 'YYYYMM') || '-' || upper(substr(gen_random_uuid()::text, 1, 8))
  ),
  billing_request_id uuid NOT NULL UNIQUE
    REFERENCES public.campus_institutional_billing_requests(id) ON DELETE RESTRICT,
  university_id uuid NOT NULL REFERENCES public.campus_universities(id) ON DELETE RESTRICT,
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  bill_to_name text NOT NULL CHECK (char_length(btrim(bill_to_name)) BETWEEN 2 AND 180),
  bill_to_email text NOT NULL CHECK (char_length(btrim(bill_to_email)) BETWEEN 3 AND 254),
  plan text NOT NULL CHECK (plan IN ('university-starter','university-professional','university-enterprise')),
  billing_period text NOT NULL CHECK (billing_period IN ('monthly','yearly')),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 3 AND 500),
  subtotal_kobo bigint NOT NULL CHECK (subtotal_kobo > 0),
  tax_kobo bigint NOT NULL DEFAULT 0 CHECK (tax_kobo >= 0),
  total_kobo bigint GENERATED ALWAYS AS (subtotal_kobo + tax_kobo) STORED,
  currency text NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  due_date date NOT NULL,
  payment_instructions text NOT NULL CHECK (char_length(btrim(payment_instructions)) BETWEEN 8 AND 2000),
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','paid','void')),
  issued_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  paid_reference text,
  paid_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.campus_institutional_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL REFERENCES public.campus_universities(id) ON DELETE RESTRICT,
  source_invoice_id uuid NOT NULL UNIQUE
    REFERENCES public.campus_institutional_invoices(id) ON DELETE RESTRICT,
  plan text NOT NULL CHECK (plan IN ('university-starter','university-professional','university-enterprise')),
  billing_period text NOT NULL CHECK (billing_period IN ('monthly','yearly')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','past_due','cancelled','expired')),
  provider text NOT NULL DEFAULT 'paystack' CHECK (provider IN ('paystack','bank_transfer','manual')),
  provider_reference text NOT NULL UNIQUE,
  provider_subscription_code text,
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),
  currency text NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  renewal_status text NOT NULL DEFAULT 'unknown'
    CHECK (renewal_status IN ('active','not_renewing','attention','unknown')),
  started_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > started_at),
  next_payment_at timestamptz,
  last_payment_at timestamptz NOT NULL,
  last_failed_at timestamptz,
  cancel_requested_at timestamptz,
  cancelled_at timestamptz,
  provider_customer_code text,
  provider_plan_code text,
  last_provider_invoice_code text,
  activated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
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
  provider_domain text NOT NULL CHECK (provider_domain IN ('test','live')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','review_required','expired')),
  authorization_url text,
  provider_transaction_id text,
  provider_paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 days'),
  verified_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
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

CREATE TABLE IF NOT EXISTS private.campus_institutional_payment_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.campus_institutional_invoices(id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL REFERENCES public.campus_institutional_subscriptions(id) ON DELETE RESTRICT,
  event_id uuid REFERENCES private.campus_institutional_paystack_events(id) ON DELETE RESTRICT,
  university_id uuid NOT NULL REFERENCES public.campus_universities(id) ON DELETE RESTRICT,
  verified_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  provider text NOT NULL DEFAULT 'paystack' CHECK (provider = 'paystack'),
  provider_reference text NOT NULL UNIQUE,
  provider_transaction_id text NOT NULL,
  provider_domain text NOT NULL CHECK (provider_domain IN ('test','live')),
  customer_email text NOT NULL,
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),
  currency text NOT NULL CHECK (currency = 'NGN'),
  provider_paid_at timestamptz NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  payment_kind text NOT NULL DEFAULT 'initial' CHECK (payment_kind IN ('initial','renewal')),
  verified_source text NOT NULL DEFAULT 'finance' CHECK (verified_source IN ('finance','paystack_webhook')),
  provider_invoice_code text,
  period_start timestamptz,
  period_end timestamptz,
  receipt_number text NOT NULL UNIQUE DEFAULT (
    'CSR-' || to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 8))
  )
);

CREATE INDEX IF NOT EXISTS campus_institutional_invoices_university_idx
  ON public.campus_institutional_invoices (university_id);
CREATE INDEX IF NOT EXISTS campus_institutional_invoices_requester_issued_idx
  ON public.campus_institutional_invoices (requester_id, issued_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS campus_institutional_invoices_paid_reference_uidx
  ON public.campus_institutional_invoices (paid_reference) WHERE paid_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS campus_institutional_subscriptions_university_status_idx
  ON public.campus_institutional_subscriptions (university_id, status, expires_at DESC);
CREATE INDEX IF NOT EXISTS campus_institutional_payment_attempts_university_created_idx
  ON private.campus_institutional_payment_attempts (university_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS campus_institutional_payment_attempts_pending_invoice_uidx
  ON private.campus_institutional_payment_attempts (invoice_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS campus_institutional_payment_audit_university_verified_idx
  ON private.campus_institutional_payment_audit (university_id, verified_at DESC);
CREATE INDEX IF NOT EXISTS campus_institutional_payment_audit_invoice_idx
  ON private.campus_institutional_payment_audit (invoice_id);
CREATE INDEX IF NOT EXISTS campus_institutional_paystack_events_review_status_idx
  ON private.campus_institutional_paystack_events (review_status, received_at DESC);
CREATE INDEX IF NOT EXISTS campus_institutional_paystack_events_reference_idx
  ON private.campus_institutional_paystack_events (provider_reference)
  WHERE provider_reference IS NOT NULL;

ALTER TABLE public.campus_institutional_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_institutional_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.campus_institutional_payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.campus_institutional_payment_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.campus_institutional_paystack_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.campus_institutional_payment_attempts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.campus_institutional_payment_audit FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.campus_institutional_paystack_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE private.campus_institutional_payment_attempts TO service_role;
GRANT SELECT, INSERT ON TABLE private.campus_institutional_payment_audit TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE private.campus_institutional_paystack_events TO service_role;
GRANT SELECT, INSERT ON TABLE public.campus_institutional_invoices TO authenticated;
GRANT SELECT ON TABLE public.campus_institutional_subscriptions TO authenticated;
GRANT ALL ON TABLE public.campus_institutional_invoices TO service_role;
GRANT ALL ON TABLE public.campus_institutional_subscriptions TO service_role;
GRANT USAGE ON SCHEMA private TO service_role;
REVOKE UPDATE, DELETE ON TABLE public.campus_institutional_invoices FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.campus_institutional_subscriptions FROM authenticated;

DROP POLICY IF EXISTS campus_institutional_invoices_insert_platform_admin
  ON public.campus_institutional_invoices;
CREATE POLICY campus_institutional_invoices_insert_platform_admin
ON public.campus_institutional_invoices
FOR INSERT TO authenticated
WITH CHECK (
  public.platform_is_admin()
  AND issued_by = (SELECT auth.uid())
  AND status = 'issued'
  AND currency = 'NGN'
);

DROP POLICY IF EXISTS campus_institutional_invoices_select_requester_or_platform_admin
  ON public.campus_institutional_invoices;
DROP POLICY IF EXISTS campus_institutional_invoices_select_requester_or_platform_admi
  ON public.campus_institutional_invoices;
CREATE POLICY campus_institutional_invoices_select_requester_or_platform_admin
ON public.campus_institutional_invoices
FOR SELECT TO authenticated
USING (
  public.platform_is_admin()
  OR (
    requester_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.profiles profile
      JOIN public.campus_memberships membership ON membership.user_id = profile.id
      WHERE profile.id = (SELECT auth.uid())
        AND profile.role::text = 'admin'
        AND profile.verification_status::text = 'verified'
        AND membership.university_id = campus_institutional_invoices.university_id
        AND membership.campus_role = 'admin'
        AND membership.membership_status = 'active'
        AND membership.verification_status = 'verified'
    )
  )
);

DROP POLICY IF EXISTS campus_institutional_subscriptions_select_platform_or_campus_ad
  ON public.campus_institutional_subscriptions;
CREATE POLICY campus_institutional_subscriptions_select_platform_or_campus_admin
ON public.campus_institutional_subscriptions
FOR SELECT TO authenticated
USING (
  public.platform_is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.profiles profile
    JOIN public.campus_memberships membership ON membership.user_id = profile.id
    WHERE profile.id = (SELECT auth.uid())
      AND profile.role::text = 'admin'
      AND profile.verification_status::text = 'verified'
      AND membership.university_id = campus_institutional_subscriptions.university_id
      AND membership.campus_role = 'admin'
      AND membership.membership_status = 'active'
      AND membership.verification_status = 'verified'
  )
);

DROP POLICY IF EXISTS campus_institutional_billing_requests_select_own
  ON public.campus_institutional_billing_requests;
CREATE POLICY campus_institutional_billing_requests_select_own
ON public.campus_institutional_billing_requests
FOR SELECT TO authenticated
USING (
  public.platform_is_admin()
  OR (
    requester_id = (SELECT auth.uid())
    AND (
      university_id IS NULL
      OR private.current_user_can_manage_institutional_billing(university_id)
    )
  )
);

CREATE OR REPLACE FUNCTION public.prepare_campus_institutional_invoice()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  billing_request public.campus_institutional_billing_requests%ROWTYPE;
BEGIN
  SELECT * INTO billing_request
  FROM public.campus_institutional_billing_requests
  WHERE id = NEW.billing_request_id
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The billing request does not exist.'; END IF;
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

DROP TRIGGER IF EXISTS campus_institutional_invoice_prepare
  ON public.campus_institutional_invoices;
CREATE TRIGGER campus_institutional_invoice_prepare
BEFORE INSERT ON public.campus_institutional_invoices
FOR EACH ROW EXECUTE FUNCTION public.prepare_campus_institutional_invoice();

CREATE OR REPLACE FUNCTION public.set_campus_institutional_billing_review_metadata()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status
     OR OLD.response_message IS DISTINCT FROM NEW.response_message THEN
    NEW.reviewed_at := pg_catalog.now();
    NEW.reviewed_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.block_billing_request_status_change_after_invoice()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND EXISTS (
       SELECT 1 FROM public.campus_institutional_invoices invoice
       WHERE invoice.billing_request_id = OLD.id
     ) THEN
    RAISE EXCEPTION 'A billing request cannot change status after an invoice has been issued.';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS campus_institutional_billing_review_metadata
  ON public.campus_institutional_billing_requests;
CREATE TRIGGER campus_institutional_billing_review_metadata
BEFORE UPDATE OF status, response_message
ON public.campus_institutional_billing_requests
FOR EACH ROW EXECUTE FUNCTION public.set_campus_institutional_billing_review_metadata();

DROP TRIGGER IF EXISTS campus_billing_request_lock_after_invoice
  ON public.campus_institutional_billing_requests;
CREATE TRIGGER campus_billing_request_lock_after_invoice
BEFORE UPDATE OF status ON public.campus_institutional_billing_requests
FOR EACH ROW EXECUTE FUNCTION public.block_billing_request_status_change_after_invoice();

CREATE OR REPLACE FUNCTION private.prevent_institutional_payment_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  RAISE EXCEPTION 'Institutional payment audit entries are append-only.';
END;
$function$;

DROP TRIGGER IF EXISTS campus_institutional_payment_audit_no_update
  ON private.campus_institutional_payment_audit;
CREATE TRIGGER campus_institutional_payment_audit_no_update
BEFORE UPDATE OR DELETE ON private.campus_institutional_payment_audit
FOR EACH ROW EXECUTE FUNCTION private.prevent_institutional_payment_audit_mutation();

CREATE OR REPLACE FUNCTION private.issue_campus_institutional_invoice_impl(
  p_billing_request_id uuid,
  p_subtotal_kobo bigint,
  p_tax_kobo bigint,
  p_due_date date,
  p_payment_instructions text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_request public.campus_institutional_billing_requests%ROWTYPE;
  v_invoice public.campus_institutional_invoices%ROWTYPE;
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL
     OR NOT (SELECT private.account_lifecycle_is_active())
     OR NOT (SELECT public.platform_is_admin()) THEN
    RAISE EXCEPTION 'Only a trusted, active CampusShield platform administrator may issue an institutional invoice.';
  END IF;
  IF p_billing_request_id IS NULL
     OR p_subtotal_kobo IS NULL OR p_subtotal_kobo <= 0
     OR p_tax_kobo IS NULL OR p_tax_kobo < 0
     OR p_due_date IS NULL OR p_due_date < CURRENT_DATE
     OR char_length(btrim(coalesce(p_payment_instructions, ''))) NOT BETWEEN 8 AND 2000 THEN
    RAISE EXCEPTION 'Enter a valid invoice amount, due date and payment instructions.';
  END IF;

  SELECT * INTO v_request
  FROM public.campus_institutional_billing_requests
  WHERE id = p_billing_request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The institutional billing request was not found.';
  END IF;
  IF v_request.status NOT IN ('pending','contacted') OR v_request.university_id IS NULL THEN
    RAISE EXCEPTION 'Only an eligible, university-scoped billing request can receive an invoice.';
  END IF;

  UPDATE public.campus_institutional_billing_requests
  SET status = 'approved',
      response_message = 'Approved and issued as an institutional CampusShield invoice.',
      updated_at = now()
  WHERE id = v_request.id;

  INSERT INTO public.campus_institutional_invoices (
    billing_request_id, subtotal_kobo, tax_kobo, due_date, payment_instructions
  ) VALUES (
    v_request.id, p_subtotal_kobo, p_tax_kobo, p_due_date, btrim(p_payment_instructions)
  )
  RETURNING * INTO v_invoice;

  RETURN jsonb_build_object(
    'invoice_id', v_invoice.id,
    'invoice_number', v_invoice.invoice_number,
    'university_id', v_invoice.university_id,
    'total_kobo', v_invoice.total_kobo,
    'currency', v_invoice.currency,
    'status', v_invoice.status
  );
END;
$function$;

REVOKE ALL ON FUNCTION private.issue_campus_institutional_invoice_impl(uuid,bigint,bigint,date,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.issue_campus_institutional_invoice_impl(uuid,bigint,bigint,date,text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.issue_campus_institutional_invoice(
  p_billing_request_id uuid,
  p_subtotal_kobo bigint,
  p_tax_kobo bigint,
  p_due_date date,
  p_payment_instructions text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $wrapper$
  SELECT private.issue_campus_institutional_invoice_impl(
    p_billing_request_id, p_subtotal_kobo, p_tax_kobo, p_due_date, p_payment_instructions
  );
$wrapper$;

REVOKE ALL ON FUNCTION public.issue_campus_institutional_invoice(uuid,bigint,bigint,date,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_campus_institutional_invoice(uuid,bigint,bigint,date,text)
  TO authenticated;

DROP FUNCTION IF EXISTS public.commit_campus_institutional_invoice_payment(uuid,uuid,text,text,bigint,text,text,text,timestamptz,uuid,text);
CREATE FUNCTION public.commit_campus_institutional_invoice_payment(
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
  p_verified_source text DEFAULT 'finance',
  p_verified_by_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
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
     OR p_verified_source IS NULL OR p_verified_source NOT IN ('finance', 'paystack_webhook')
     OR (p_verified_source = 'finance' AND p_verified_by_user_id IS NULL)
     OR (p_verified_source = 'paystack_webhook' AND p_verified_by_user_id IS NOT NULL) THEN
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

  IF p_verified_source = 'finance' AND NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.campus_memberships cm ON cm.user_id = p.id
    WHERE p.id = p_verified_by_user_id
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
    WHERE a.provider_reference = p_reference AND a.invoice_id = v_invoice.id
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
    CASE WHEN p_verified_source = 'finance' THEN p_verified_by_user_id ELSE NULL END,
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
        reviewed_by = p_verified_by_user_id,
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

REVOKE ALL ON FUNCTION public.commit_campus_institutional_invoice_payment(uuid,uuid,text,text,bigint,text,text,text,timestamptz,uuid,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_campus_institutional_invoice_payment(uuid,uuid,text,text,bigint,text,text,text,timestamptz,uuid,text,uuid)
  TO service_role;

COMMENT ON TABLE public.campus_institutional_invoices IS
  'CampusShield university subscription invoices only; this table does not contain student tuition or fee-payment records.';
COMMENT ON TABLE private.campus_institutional_payment_audit IS
  'Append-only private audit of verified payments for CampusShield institutional invoices.';
COMMENT ON FUNCTION public.issue_campus_institutional_invoice(uuid,bigint,bigint,date,text) IS
  'Atomically approves an eligible institutional billing request and issues its university subscription invoice; trusted platform administrators only.';
COMMENT ON FUNCTION public.commit_campus_institutional_invoice_payment(uuid,uuid,text,text,bigint,text,text,text,timestamptz,uuid,text,uuid) IS
  'Service-role-only atomic reconciliation of a server-verified Paystack transaction against an issued university subscription invoice.';
