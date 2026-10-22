# ShieldMind AI tiers — staging only

## Proposed monthly plans

| Plan | Monthly price | Requests/minute | Requests/day | Image allowance |
|---|---:|---:|---:|---:|
| Free | ₦0 | 5 | 80 | No paid allowance |
| Starter | ₦2,000 | 10 | 250 | 20/month |
| Plus | ₦5,000 | 15 | 700 | 60/month |
| Pro | ₦10,000 | 25 | 1,500 | 150/month |
| Ultra | ₦15,000 | 35 | 2,500 | 300/month |
| Max | ₦28,000 | 50 | 4,000 | 600/month |

**Billing model note (updated 2026-10-22):** The five supplied Paystack hosted pages are configured for recurring monthly charges (Starter is visually confirmed at ₦2,000/month). This supersedes the earlier no-auto-renewal proposal for those hosted pages, but recurring entitlements are not yet implemented. Until the recurring webhook path is complete and acceptance-tested, opening/returning from a hosted page must not activate, renew, or revoke Premium access. The other four link amounts still need visual confirmation. Pro is intended to unlock all standard ShieldMind features; higher plans primarily increase capacity and priority where available. Core campus safety and incident-reporting remain free.

## Session rules
- The server starts a session on the first accepted AI request.
- A session lasts at most eight hours from that start.
- After eight hours, the user must wait one hour before starting another session.
- Session state is stored server-side in private.shieldmind_session_windows, not in browser storage, so refreshing or changing the device clock cannot bypass it.
- Per-minute and per-UTC-day quotas apply in addition to the session window.

## Important feature status
The current ShieldMind chat endpoint accepts text questions only. The image allowances above are entitlement targets, not an active image-upload feature; image upload and processing must be implemented and connected to server-side allowance accounting before launch. Priority processing is also a product target, not yet a separate scheduling guarantee. Do not advertise these as working until tested.

## Staging-only setup
Project: hywcpnoqqhxvujnimhxl. Do not configure production as part of this work.

Add server-side Edge Function secrets in staging only:
- PAYSTACK_SECRET_KEY: Paystack test secret key (sk_test_...).
- Existing OPENAI_API_KEY and optional SHIELDMIND_MODEL remain server-side only.

Never put secret keys in HTML, browser config, GitHub, chat, or logs. Configure the Paystack webhook URL to the deployed staging paystack-webhook function. Use Paystack test mode and test credentials only.

## Security and acceptance checklist
- [x] Applied 20261019140000_shieldmind_tiered_entitlements.sql to staging only.
- [x] Deployed shieldmind-billing-checkout and paystack-webhook to staging; shieldmind-chat already calls the quota RPC. End-to-end session/payment tests remain pending.
- [ ] Configure Paystack test secret and webhook in the staging/test dashboard.
- [ ] Verify every price is enforced server-side: ₦2,000 / ₦5,000 / ₦10,000 / ₦15,000 / ₦28,000 monthly.
- [ ] Verify invalid signature, wrong amount, wrong currency, mismatched user/plan, duplicate webhook, and unknown reference do not grant access.
- [ ] Verify checkout requires verified campus account, active campus membership, and approved student identity for student accounts.
- [ ] Verify session starts once, ends after eight hours, imposes a one-hour cooldown, then allows a new session.
- [ ] Verify refreshes and device/browser clock changes do not bypass the session cooldown.
- [ ] Verify minute/day quotas by tier and expired subscriptions fall back to Free.
- [ ] Connect image uploads to server-side allowance tracking before representing image quotas as usable.
- [ ] Keep tests fictional and staging-only. Do not merge to main, publish, or change production until the owner reviews and approves.


## Hosted recurring page links — staging PR #35

| Plan | Intended price/month | Hosted page |
|---|---:|---|
| Starter | ₦2,000 | https://paystack.shop/pay/8d8uqv-424 |
| Plus | ₦5,000 | https://paystack.shop/pay/cw4e6yy3b2 |
| Pro | ₦10,000 | https://paystack.shop/pay/dqmxy-jpge |
| Ultra | ₦15,000 | https://paystack.shop/pay/er98helke2 |
| Max | ₦28,000 | https://paystack.shop/pay/lh62pcokf9 |

Starter's Paystack page screenshot confirms its name and NGN 2,000 monthly charge. The other prices are assigned based on the user's intended order and must be verified against the pages before launch.

## Recurring-billing launch blocker

The current `paystack-webhook` expects a pending `shieldmind_subscriptions` row created by `shieldmind-billing-checkout`, a one-time transaction reference, and a `charge.success` event; it then grants exactly 30 days. That path is not enough to manage Paystack hosted subscription lifecycle. Before paid entitlements are enabled, implement and test:
- subscription creation/enable/disable and association with an authenticated CampusShield user;
- invoice-payment success and failure events, renewal dates, cancellations, and downgrade/expiry behavior;
- signed webhook verification, API-side transaction/subscription verification, expected amount/currency, and customer/user reconciliation;
- duplicate/replayed event idempotency and correct handling of out-of-order events;
- a staging end-to-end test for success, failed renewal, cancellation, duplicate event, mismatched user/amount, and expiry.

No staging billing Edge Function was deployed or database migration applied by PR #35. Do not merge, publish, or touch production. A Paystack return URL alone is never proof of payment.
