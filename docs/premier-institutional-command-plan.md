# Premier Institutional Command — payment link setup

## Product and price

**Public title:** CampusShield AI — Premier Institutional Command Plan

**Monthly price:** NGN 1,200,000

**Annual price:** NGN 12,000,000, billed as one annual payment

The current CampusShield institutional billing model is prepaid and does not automatically renew. Create one-time fixed-amount Payment Pages rather than a recurring subscription page unless CampusShield formally changes its billing and reconciliation model.

## Recommended monthly Paystack Payment Page

In the Paystack Dashboard, open **Payment Pages → New Page → One-time Payment**.

Use these settings:

- **Page name:** CampusShield AI — Premier Institutional Command (Monthly)
- **Amount:** ₦1,200,000
- **Fixed amount:** On
- **Currency:** NGN
- **Custom link suggestion:** `campusshield-premier-monthly`
- **Collect customer email:** On (Paystack collects this by default)
- **Collect phone number:** On
- **SEO image:** Use the official CampusShield AI institutional logo/brand asset.

### Description to paste

CampusShield AI Premier Institutional Command is our flagship institutional programme for universities and multi-campus organisations requiring central oversight, stronger governance, structured campus administration and executive-level operational visibility.

The programme builds on the Foundation, Professional and Enterprise capabilities and adds a formally scoped institutional command model, advanced role and approval design, cross-campus oversight, governance reviews, priority implementation coordination and an institutional improvement roadmap.

This payment covers the approved monthly Premier Institutional Command service for the institution named in the accompanying invoice. CampusShield will confirm the institution, authorised representative, implementation scope and service schedule before provisioning. It does not pay student tuition or individual student fees, and it does not automatically grant access to student financial records.

### Suggested required additional fields

1. **Official institution name** — short text
2. **Institutional invoice number** — short text
3. **Authorised representative full name** — short text
4. **Official institutional email address** — email
5. **Official role / department** — short text
6. **Contact telephone number** — phone, if not already collected by Paystack

Avoid asking customers to enter student IDs, matriculation numbers, student bank/card information or other student financial details.

### Success message to paste

Thank you. Your Premier Institutional Command payment has been received by Paystack. CampusShield will verify the transaction against the institutional invoice and contact the authorised representative about confirmation and onboarding. Payment alone does not complete institution verification or activate unapproved access.

### Redirect after payment

Use the official CampusShield billing/confirmation page:

`https://campusshield-ai.github.io/campusshield-ai/`

A redirect is not proof of payment. Finance must verify the transaction and reconcile it to the correct invoice before activation.

## Annual Payment Page

Create a second **One-time Payment** page using:

- **Page name:** CampusShield AI — Premier Institutional Command (Annual)
- **Amount:** ₦12,000,000
- **Fixed amount:** On
- **Currency:** NGN
- **Custom link suggestion:** `campusshield-premier-annual`

Use the same description, required fields and success message, changing “monthly” to “annual”.

## Important payment integration warning

A standalone Paystack Payment Page is separate from the CampusShield server-created invoice checkout. A payment made through a manually created page will not automatically reconcile the CampusShield invoice or activate institutional access unless its payment reference is verified and manually matched by authorised finance staff.

For automatic invoice reconciliation, use the institutional invoice inside CampusShield. It creates a server-side Paystack checkout, verifies the transaction, processes the signed webhook and records the receipt. Keep the payment environment flag and live credentials under administrator control. Never put Paystack secret keys in the website, browser code, a payment-page description or chat.

Paystack's official guide distinguishes fixed one-time pages from recurring subscription pages. The one-time option lets the business set a fixed amount; subscription pages require a subscription plan and charge at the selected interval. See:
- https://support.paystack.com/en/articles/2132546
- https://paystack.com/docs/api/page/
