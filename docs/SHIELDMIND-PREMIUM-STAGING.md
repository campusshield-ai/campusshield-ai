# ShieldMind Premium — staging only

## Pricing proposal
- Free: 5 requests/minute and 80 requests/day, subject to current server-side quota.
- Premium monthly access: NGN 2,000 for 30 days.
- Premium annual access: NGN 20,000 for 365 days.
- Payments are one-time prepaid access periods, not auto-renewing subscriptions. The user must renew manually.
- Core campus safety and incident-reporting features remain free.

Prices are a proposed pilot, not market-validated. Provider/API costs and affordability should be reviewed before public launch.

## Staging-only setup
Project: `hywcpnoqqhxvujnimhxl`. Never set these secrets in production as part of this work.
Add server-side Edge Function secrets in the staging project only:
- `PAYSTACK_SECRET_KEY`: Paystack **test** secret key (`sk_test_...`).
- The existing `OPENAI_API_KEY` and optional `SHIELDMIND_MODEL` remain server-side only.

Never put secret keys in HTML, browser config, GitHub, chat, or logs. Configure the Paystack webhook URL to the deployed staging `paystack-webhook` function. For test-mode acceptance, use Paystack's official test card and test credentials from the Paystack dashboard; do not use real card details.

## Security
- Checkout requires a verified signed-in user, active verified campus membership, and approved student identity for student accounts.
- The browser cannot grant itself Premium. Only a server-side verified Paystack transaction can activate entitlements.
- Webhook signature is HMAC SHA-512 checked, and each reference is independently verified against Paystack before activation.
- The subscriptions table has RLS and users can only select their own row. No client write policy exists.
- Safety/incident features are not paywalled. Do not treat the institution/role selector as authority; server-side profile and membership checks are authoritative.

## Acceptance checklist
- [ ] Configure Paystack test secret in staging Supabase Edge Function secrets.
- [ ] Deploy checkout and webhook functions to staging only; configure webhook in Paystack test dashboard.
- [ ] Test rejected requests for anonymous, pending, unverified, and unapproved student accounts.
- [ ] Verify checkout amount, currency, and period are enforced server-side.
- [ ] Verify cancelled checkout never grants Premium.
- [ ] Verify valid webhook + server-side transaction verification grants the exact 30/365-day entitlement.
- [ ] Verify invalid signature, wrong amount, wrong currency, duplicate webhook, and unknown reference do not grant Premium.
- [ ] Verify expired Premium falls back to Free; no automatic renewal.
- [ ] Verify Free and Premium AI quotas are enforced server-side and cannot be bypassed by changing the browser.
- [ ] Keep all tests fictional and staging-only.
- [ ] Do not merge to main or publish until the owner reviews and approves.
