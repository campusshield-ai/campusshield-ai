CREATE INDEX IF NOT EXISTS campus_institutional_payment_audit_event_idx
  ON private.campus_institutional_payment_audit (event_id);
CREATE INDEX IF NOT EXISTS campus_institutional_payment_audit_invoice_idx
  ON private.campus_institutional_payment_audit (invoice_id);
CREATE INDEX IF NOT EXISTS campus_institutional_payment_audit_subscription_idx
  ON private.campus_institutional_payment_audit (subscription_id);
CREATE INDEX IF NOT EXISTS campus_institutional_payment_audit_university_idx
  ON private.campus_institutional_payment_audit (university_id);
CREATE INDEX IF NOT EXISTS campus_institutional_payment_audit_verified_by_idx
  ON private.campus_institutional_payment_audit (verified_by)
  WHERE verified_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS campus_institutional_paystack_events_matched_invoice_idx
  ON private.campus_institutional_paystack_events (matched_invoice_id)
  WHERE matched_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS campus_institutional_paystack_events_reviewed_by_idx
  ON private.campus_institutional_paystack_events (reviewed_by)
  WHERE reviewed_by IS NOT NULL;