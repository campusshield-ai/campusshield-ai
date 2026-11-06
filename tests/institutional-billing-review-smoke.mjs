import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const html = read('index.html');
const app = read('campusshield-app.js');
const migration = read('supabase/migrations/20261106215716_institutional_billing_review_controls.sql');
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
assert.match(app, /request approval is not payment confirmation or subscription activation/i,
  'The admin queue distinguishes request approval from a paid subscription');
assert.match(app, /Request approved · invoice and payment still pending/,
  'Requesters are told that an approved enquiry still requires invoice and payment');
assert.match(app, /response_message/,
  'The requester history displays reviewer responses');
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\\.campus_institutional_billing_requests/i,
  'The migration safely creates the request table when it is missing');
assert.match(migration, /CREATE POLICY campus_institutional_billing_requests_select_own[\\s\\S]*public\\.platform_is_admin\\(\\)/i,
  'The request SELECT policy preserves verified requester and trusted platform-admin access');
assert.match(migration, /CREATE POLICY campus_institutional_billing_requests_insert_own[\\s\\S]*status = 'pending'/i,
  'New requests remain pending and must be submitted by the authenticated requester');
assert.match(migration, /GRANT UPDATE \(status, response_message\)[\s\S]*TO authenticated/i,
  'Authenticated updates are limited to request status and response columns');
assert.match(migration, /CREATE POLICY campus_institutional_billing_requests_update_platform_admin[\s\S]*USING \(public\.platform_is_admin\(\)\)[\s\S]*WITH CHECK \(public\.platform_is_admin\(\)\)/i,
  'Only trusted platform admins can update institutional billing requests');
assert.match(migration, /NEW\.reviewed_at := pg_catalog\.now\(\)/,
  'The database records the review timestamp');
assert.match(migration, /NEW\.reviewed_by := auth\.uid\(\)/,
  'The database records the authenticated reviewer');
assert.doesNotMatch(migration, /SECURITY DEFINER/i,
  'Review metadata trigger does not introduce a SECURITY DEFINER function');
assert.doesNotMatch(app, /service[_-]?role/i,
  'No service-role credential is added to browser code');
assert.match(docs, /does not activate paid access/i,
  'The documentation describes the non-activation boundary');
console.log('Institutional billing review smoke checks passed.');
