CREATE INDEX IF NOT EXISTS campus_institutional_invoices_paid_by_idx
  ON public.campus_institutional_invoices (paid_by)
  WHERE paid_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS campus_institutional_subscriptions_activated_by_idx
  ON public.campus_institutional_subscriptions (activated_by);