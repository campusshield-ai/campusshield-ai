import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const html = read('index.html');
const app = read('campusshield-app.js');
const migration = read('supabase/migrations/20261106215716_institutional_billing_review_controls.sql');
const campusScopeMigration = read('supabase/migrations/20261106220002_institutional_billing_review_campus_scope.sql');
const universityIndexMigration = read('supabase/migrations/20261106220108_institutional_billing_review_university_index.sql');
const invoiceMigration = read('supabase/migrations/20261106221005_institutional_invoice_issuance.sql');
const invoiceLockMigration = read('supabase/migrations/20261106221257_institutional_invoice_request_status_lock.sql');
const invoiceIssuerIndexMigration = read('supabase/migrations/20261106221410_institutional_invoice_issuer_index.sql');
const docs = read('docs/INSTITUTIONAL_BILLING_REVIEW.md');

assert.match(html, /id="platform-admin-institutional-billing"/,
  'Trusted platform administration includes an institutional billing review panel');
assert.match(html, /id="platform-admin-billing-requests-table"/,
  'Platform billing review exposes an accessible request table');
assert.match(html, /does not confirm bank transfer[\s\S]*student safety access remains separate|does not confirm bank transfer/i,
  'Billing review UI makes clear that approval is not payment or campus activation');
assert.match(app, /async function loadInstitutionalBillingAdminRequests\(\)/,
  'Only the platform administration flow loads the global billing queue');
assert.match(app, /!await backend\.isPlatformAdmin\(\)/,
  'The browser rechecks trusted platform-admin authorization before reviewing requests');
assert.match(app, /\.update\(\{ status, response_message: responseMessage \|\| null \}\)/,
  'The review action changes only request status and the public response');
assert.match(app, /Only approved requests can receive an invoice; invoice issuance is not payment confirmation/i,
  'The admin queue distinguishes request approval from a paid subscription');
assert.match(app, /Request approved · invoice and payment still pending/,
  'Requesters are told that an approved enquiry still requires invoice and payment');
assert.match(app, /response_message/,
  'The requester history displays reviewer responses');
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.campus_institutional_billing_requests/i,
  'The migration safely creates the request table when it is missing');
assert.match(migration, /CREATE POLICY campus_institutional_billing_requests_select_own[\s\S]*public\.platform_is_admin\(\)/i,
  'The request SELECT policy preserves verified requester and trusted platform-admin access');
assert.match(migration, /CREATE POLICY campus_institutional_billing_requests_insert_own[\s\S]*status = 'pending'/i,
  'New requests remain pending and must be submitted by the authenticated requester');
assert.match(migration, /GRANT UPDATE \(status, response_message\)[\s\S]*TO authenticated/i,
  'Authenticated updates are limited to request status and response columns');
assert.match(migration, /CREATE POLICY campus_institutional_billing_requests_update_platform_admin[\s\S]*USING \(public\.platform_is_admin\(\)\)[\s\S]*WITH CHECK \(public\.platform_is_admin\(\)\)/i,
  'Only trusted platform admins can update institutional billing requests');
assert.match(migration, /NEW\.reviewed_at := pg_catalog\.now\(\)/,
  'The database records the review timestamp');
assert.match(campusScopeMigration, /ADD COLUMN IF NOT EXISTS university_id uuid/i,
  'Each new billing request is linked to its canonical university');
assert.match(campusScopeMigration, /membership\.campus_role = 'admin'[\s\S]*membership\.membership_status = 'active'[\s\S]*membership\.verification_status = 'verified'/i,
  'Only an active, verified campus-admin membership can submit an institutional billing request');
assert.match(campusScopeMigration, /university\.id = membership\.university_id[\s\S]*university\.name\) = lower\(btrim\(campus_institutional_billing_requests\.institution_name\)\)/i,
  "The requested institution must match the user's verified university");
assert.match(campusScopeMigration, /CREATE INDEX IF NOT EXISTS campus_institutional_billing_requests_requester_created_idx/i,
  'Requester history and requester foreign-key lookups are indexed');
assert.match(universityIndexMigration, /CREATE INDEX IF NOT EXISTS campus_institutional_billing_requests_university_idx/i,
  'University foreign-key lookups are indexed');
assert.match(campusScopeMigration, /CREATE INDEX IF NOT EXISTS campus_institutional_billing_requests_reviewed_by_idx/i,
  'Reviewer foreign-key lookups are indexed');
assert.match(migration, /NEW\.reviewed_by := auth\.uid\(\)/,
  'The database records the authenticated reviewer');
assert.match(html, /id="platform-admin-invoice-form"/,
  'The platform admin console includes an invoice issuance form');
assert.match(html, /id="institutional-billing-invoices"/,
  'Verified campus admins have a dedicated invoice history area');
assert.match(app, /async function loadInstitutionalBillingInvoices\(\)/,
  'The requester can load their own institutional invoices');
assert.match(app, /function printInstitutionalInvoice\(invoice\)/,
  'Issued invoices have a printable invoice view that can be saved as PDF');
assert.match(app, /PRO FORMA · AWAITING PAYMENT/,
  'The printed document is clearly labelled as a pro forma invoice');
assert.match(app, /not a receipt or proof of payment/,
  'The printed pro forma invoice cannot be mistaken for a payment receipt');
assert.match(app, /from\('campus_institutional_invoices'\)/,
  'The finance queue and requester history use the dedicated invoice table');
assert.match(app, /amountPattern = \/\^\\d\{1,10\}/,
  'Finance invoice amounts are validated before conversion to kobo');
assert.match(invoiceMigration, /total_kobo bigint GENERATED ALWAYS AS \(subtotal_kobo \+ tax_kobo\) STORED/i,
  'The database calculates invoice totals from subtotal and tax');
assert.match(invoiceMigration, /GRANT INSERT \([\s\S]*payment_instructions\)[\s\S]*TO authenticated/i,
  'Invoice insertion is column-limited; invoice number and paid status are not client-writable');
assert.match(invoiceMigration, /CREATE POLICY campus_institutional_invoices_insert_platform_admin[\s\S]*public\.platform_is_admin\(\)/i,
  'Only trusted platform administrators can issue invoices');
assert.match(invoiceMigration, /billing_request\.status <> 'approved'/,
  'The database rejects invoices for requests that are not approved');
assert.match(invoiceMigration, /NEW\.status := 'issued'/,
  'The database always creates invoices in issued status');
assert.match(invoiceMigration, /NEW\.issued_by := auth\.uid\(\)/,
  'The database records the authenticated invoice issuer');
assert.match(invoiceMigration, /CREATE POLICY campus_institutional_invoices_select_requester_or_platform_admin/i,
  'Only the requesting verified campus representative and trusted platform admins can read invoices');
assert.doesNotMatch(invoiceMigration, /GRANT UPDATE|GRANT DELETE/i,
  'Authenticated users cannot update or delete issued invoices');
assert.doesNotMatch(invoiceMigration, /SECURITY DEFINER/i,
  'Invoice creation trigger does not introduce a SECURITY DEFINER function');
assert.match(invoiceIssuerIndexMigration, /CREATE INDEX IF NOT EXISTS campus_institutional_invoices_issued_by_idx/i,
  'Invoice issuer foreign-key lookups are indexed');
assert.match(invoiceLockMigration, /campus_billing_request_lock_after_invoice/i,
  'The database locks billing request status after an invoice is issued');
assert.match(invoiceLockMigration, /billing_request_status_change_after_invoice/i,
  'The immutable invoice status trigger is present');
assert.doesNotMatch(migration, /SECURITY DEFINER/i,
  'Review metadata trigger does not introduce a SECURITY DEFINER function');
assert.doesNotMatch(app, /service[_-]?role/i,
  'No service-role credential is added to browser code');
assert.match(docs, /does not activate paid access/i,
  'The documentation describes the non-activation boundary');
console.log('Institutional billing review smoke checks passed.');
