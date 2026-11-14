-- Add the Premier Institutional Command tier without changing existing plan records.
-- This expands the accepted plan codes for requests, invoices and subscription records.

ALTER TABLE public.campus_institutional_billing_requests
  DROP CONSTRAINT IF EXISTS campus_institutional_billing_requests_requested_plan_check;
ALTER TABLE public.campus_institutional_billing_requests
  ADD CONSTRAINT campus_institutional_billing_requests_requested_plan_check
  CHECK (requested_plan IN (
    'university-starter',
    'university-professional',
    'university-enterprise',
    'university-premier'
  ));

ALTER TABLE public.campus_institutional_invoices
  DROP CONSTRAINT IF EXISTS campus_institutional_invoices_plan_check;
ALTER TABLE public.campus_institutional_invoices
  ADD CONSTRAINT campus_institutional_invoices_plan_check
  CHECK (plan IN (
    'university-starter',
    'university-professional',
    'university-enterprise',
    'university-premier'
  ));

ALTER TABLE public.campus_institutional_subscriptions
  DROP CONSTRAINT IF EXISTS campus_institutional_subscriptions_plan_check;
ALTER TABLE public.campus_institutional_subscriptions
  ADD CONSTRAINT campus_institutional_subscriptions_plan_check
  CHECK (plan IN (
    'university-starter',
    'university-professional',
    'university-enterprise',
    'university-premier'
  ));
