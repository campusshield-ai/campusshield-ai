CREATE OR REPLACE FUNCTION public.block_billing_request_status_change_after_invoice()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND EXISTS (
       SELECT 1
       FROM public.campus_institutional_invoices AS invoice
       WHERE invoice.billing_request_id = OLD.id
     ) THEN
    RAISE EXCEPTION 'A billing request cannot change status after an invoice has been issued. Use a separate controlled invoice correction process.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.block_billing_request_status_change_after_invoice()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS campus_billing_request_lock_after_invoice
  ON public.campus_institutional_billing_requests;
CREATE TRIGGER campus_billing_request_lock_after_invoice
BEFORE UPDATE OF status
ON public.campus_institutional_billing_requests
FOR EACH ROW
EXECUTE FUNCTION public.block_billing_request_status_change_after_invoice();
