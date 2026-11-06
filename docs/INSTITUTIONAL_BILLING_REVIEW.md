# Institutional subscription requests and finance review

## Purpose

CampusShield keeps essential student safety access free. University subscriptions fund institution-level administration, analytics, moderation, integrations and support. The institutional billing form is an enquiry and procurement workflow; it is not a checkout and it does not activate paid access.

## Request journey

1. A verified campus administrator selects Starter, Professional or Enterprise and a monthly or annual term.
2. The request is stored with the authenticated requester, institution name, contact email, requested plan and optional context.
3. A trusted CampusShield platform administrator reviews the request in **Platform administration → Institutional billing review**.
4. The reviewer can mark the enquiry pending, contacted, approved for further procurement, or not approved. A response message can be sent back to the requesting university.
5. An approved enquiry still requires a separate invoice, written agreement and confirmed payment.
6. Payment reconciliation and subscription activation remain separate controlled operations. This review queue never writes payment records or entitlements.

## Status meanings

- **Pending review** — no decision has been recorded yet.
- **Contacted** — CampusShield has begun the conversation with the institution.
- **Request approved** — the enquiry may proceed to procurement and invoice preparation; payment is still outstanding and no features are unlocked.
- **Not approved** — CampusShield is not proceeding with this request.

The public response message is visible only to the requester and trusted platform administrators.

## Security boundary

- Only verified campus administrators can submit and read their own institutional requests under the existing request policies.
- Only user IDs registered as trusted platform administrators by the database owner can read the global queue or update request status and response message.
- Authenticated update permission is column-scoped to `status` and `response_message`; ordinary users have no update policy.
- The database records the trusted reviewer and review timestamp when the status or response changes.
- No service-role credential is placed in browser code.
- The feature does not change student identity verification, university memberships, campus roles, or safety access.

## Billing terms shown in the UI

The currently published institutional prices are:

| Plan | Monthly | Annual |
|---|---:|---:|
| Starter · University | ₦100,000 | ₦1,000,000 |
| Professional · University | ₦250,000 | ₦2,500,000 |
| Enterprise | From ₦500,000 | From ₦5,000,000 |

The annual figures equal ten monthly payments (the equivalent of two monthly payments saved). Enterprise pricing remains a starting quote and must be confirmed on the invoice.

## Current scope and next phase

This change adds a safe review queue and requester-visible status updates only. It does **not** generate PDF invoices, record bank transfers, reconcile Paystack transactions, create subscriptions, renew or expire institution entitlements, or automatically switch on paid features. Those operations require a separately designed and tested payment/entitlement workflow.
