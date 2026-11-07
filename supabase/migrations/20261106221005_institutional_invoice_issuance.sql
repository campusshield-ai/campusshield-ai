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
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campus_institutional_invoices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.campus_institutional_invoices FROM anon, authenticated;
GRANT SELECT ON TABLE public.campus_institutional_invoices TO authenticated;
GRANT INSERT (
  billing_request_id,
  subtotal_kobo,
  tax_kobo,
  due_date,
  payment_instructions
) ON TABLE public.campus_institutional_invoices TO authenticated;

DROP POLICY IF EXISTS campus_institutional_invoices_select_requester_or_platform_admin
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
      FROM public.profiles AS profile
      JOIN public.campus_memberships AS membership
        ON membership.user_id = profile.id
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
ON public.campus_institutional_invoices
FOR INSERT TO authenticated
WITH CHECK (
  public.platform_is_admin()
  AND issued_by = (SELECT auth.uid())
  AND status = 'issued'
  AND currency = 'NGN'
);

CREATE INDEX IF NOT EXISTS campus_institutional_invoices_requester_issued_idx
  ON public.campus_institutional_invoices(requester_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS campus_institutional_invoices_university_idx
  ON public.campus_institutional_invoices(university_id);

CREATE OR REPLACE FUNCTION public.prepare_campus_institutional_invoice()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, auth
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.prepare_campus_institutional_invoice()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS campus_institutional_invoice_prepare
  ON public.campus_institutional_invoices;
CREATE TRIGGER campus_institutional_invoice_prepare
BEFORE INSERT ON public.campus_institutional_invoices
FOR EACH ROW
EXECUTE FUNCTION public.prepare_campus_institutional_invoice();
