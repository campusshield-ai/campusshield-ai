-- Enforce the published Premier Institutional Command base price at invoice issuance.
-- Tax is retained as a separate invoice field and may be entered by the authorised
-- platform finance administrator where applicable.

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

  IF NEW.plan = 'university-premier' THEN
    IF NEW.billing_period = 'monthly' AND NEW.subtotal_kobo IS DISTINCT FROM 120000000 THEN
      RAISE EXCEPTION 'Premier Institutional Command has a fixed monthly base price of NGN 1,200,000 before applicable tax.';
    ELSIF NEW.billing_period = 'yearly' AND NEW.subtotal_kobo IS DISTINCT FROM 1200000000 THEN
      RAISE EXCEPTION 'Premier Institutional Command has a fixed annual base price of NGN 12,000,000 before applicable tax.';
    END IF;
  END IF;

  NEW.description := initcap(replace(billing_request.requested_plan, '-', ' '))
    || ' institutional subscription · ' || billing_request.billing_period;
  NEW.currency := 'NGN';
  NEW.status := 'issued';
  NEW.issued_by := auth.uid();
  NEW.issued_at := pg_catalog.now();
  RETURN NEW;
END;
$function$;
