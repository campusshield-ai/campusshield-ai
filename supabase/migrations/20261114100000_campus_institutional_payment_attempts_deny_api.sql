-- Explicitly deny all direct API roles on the private institutional payment-attempt ledger.
-- The Edge Functions use service_role, which bypasses RLS and remains limited by
-- the server-side university/finance checks and the explicit table grants.
DROP POLICY IF EXISTS campus_institutional_payment_attempts_deny_api
  ON private.campus_institutional_payment_attempts;
CREATE POLICY campus_institutional_payment_attempts_deny_api
ON private.campus_institutional_payment_attempts
FOR ALL TO anon, authenticated
USING (false)
WITH CHECK (false);
