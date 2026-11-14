# Premier Institutional Command — monthly subscription setup

## Product and recurring price

**Public title:** CampusShield AI — Premier Institutional Command  
**Billing:** Monthly recurring subscription  
**Amount:** NGN 1,200,000 per month  
**Currency:** NGN

The Paystack Payment Page supplied by CampusShield is configured as an active **Subscription** page. It is the monthly recurring checkout for this package:

https://paystack.shop/pay/-yix8599da

Do not describe this page as a one-time payment. The customer authorises recurring monthly charges under the subscription terms shown by Paystack.

## Website integration

The Premier Institutional Command card links directly to the active Paystack subscription page. The separate **Request Premier Command / onboarding** action remains available for institutions that want to submit their details and agree the implementation scope before subscribing.

The displayed Premier price remains ₦1,200,000 per month. The previous ₦12,000,000 yearly comparison is not presented as a second checkout option through this monthly link.

## Required payment and activation safeguards

A Paystack hosted subscription page is external to the CampusShield invoice checkout. A successful redirect or a Paystack subscription-created event alone is not proof that the first charge has been settled, that the correct institution has been matched, or that CampusShield access should be activated.

Until the hosted-page subscription is explicitly linked to an approved institutional billing request/invoice and its initial transaction is verified server-side:
- Record incoming Paystack subscription and charge events for finance review.
- Match the institution, authorised representative, monthly amount, customer email, subscription code and transaction reference against an approved institutional record.
- Verify each successful charge with Paystack's transaction verification API and validate NGN amount, status, environment and subscription identity.
- Record the initial payment and every renewal in the institutional payment audit trail, issuing the corresponding receipt.
- Activate or extend the institution's service period only after the verified payment is reconciled.
- Mark failed renewals for finance attention and apply the documented grace/suspension policy.
- Honour Paystack cancellation/non-renewal events and keep the cancellation state visible to authorised finance staff.

Never expose Paystack secret keys in browser code, repository files, payment-page descriptions or chat. Keep the webhook signature validation, environment separation, idempotency and service-role database writes on the server.

The current institutional invoice workflow already verifies invoice-based payments and records receipts. The external recurring page does not automatically create or reconcile one of those invoice attempts. Do not silently treat an external subscription as a paid invoice. Full automatic activation for this hosted-page subscription requires the matching server-side subscription-to-invoice reconciliation workflow and a verified webhook test.

## Suggested customer-facing description

CampusShield AI Premier Institutional Command is our flagship monthly institutional subscription for universities and multi-campus organisations requiring central oversight, stronger governance, structured campus administration and executive-level operational visibility.

The programme builds on the Foundation, Professional and Enterprise capabilities and adds a formally scoped institutional command model, advanced role and approval design, cross-campus oversight, governance reviews, priority implementation coordination and an institutional improvement roadmap.

Subscription price: ₦1,200,000 monthly. CampusShield will confirm the institution, authorised representative, implementation scope and service schedule before provisioning. This subscription does not pay student tuition or individual student fees and does not automatically grant access to student financial records.

## Suggested required fields

1. Official institution name
2. Institutional invoice or approved request number
3. Authorised representative full name
4. Official institutional email address
5. Official role / department
6. Contact telephone number

Avoid collecting student IDs, matriculation numbers, student bank/card information or other student financial details.

## Success message

Thank you. Your Premier Institutional Command monthly subscription request has been received by Paystack. CampusShield will verify the initial charge and match the subscription to the approved institutional record before confirming onboarding and service activation. Subsequent monthly renewals will be reconciled against the same subscription record.

## Redirect

The hosted payment page may redirect customers to the official CampusShield website. A redirect is not proof of payment. CampusShield verifies the transaction and subscription server-side before activation.
