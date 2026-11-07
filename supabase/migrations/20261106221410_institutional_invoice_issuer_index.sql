CREATE INDEX IF NOT EXISTS campus_institutional_invoices_issued_by_idx
  ON public.campus_institutional_invoices(issued_by);
