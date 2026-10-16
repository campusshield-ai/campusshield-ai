import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const backend = await readFile(new URL('../campusshield-backend.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261016220000_campus_staff_identity_and_governance.sql', import.meta.url), 'utf8');
const legacyGuard = await readFile(new URL('../supabase/migrations/20261016224000_guard_legacy_staff_membership_review.sql', import.meta.url), 'utf8');
const genericTeacherGuard = await readFile(new URL('../supabase/migrations/20261016225000_guard_generic_teacher_account_approval.sql', import.meta.url), 'utf8');
const adminAppointmentGuard = await readFile(new URL('../supabase/migrations/20261016225000_require_explicit_approved_campus_admin_request.sql', import.meta.url), 'utf8');

for (const expected of [
  'id="auth-role"',
  'id="auth-university"',
  'id="auth-faculty"',
  'id="auth-department"',
  'id="auth-course"',
  'id="auth-year-of-study"',
  'id="auth-staff-position"',
  'id="auth-official-email"',
  'id="page-staff-verification"',
  'id="page-staff-review"',
  'id="campusStaffVerificationForm"',
  'id="campus-staff-verification-queue"',
  'id="platform-admin-admin-requests-table"',
  'Appoint campus admin',
  'requested_campus_admin',
  'Your title is reviewed and does not automatically grant administrator permissions.'
]) assert.ok(html.includes(expected), 'onboarding page must include ' + expected);

for (const method of [
  'submitCampusStaffVerification',
  'getMyCampusStaffVerification',
  'listCampusStaffVerificationReviews',
  'reviewCampusStaffVerification',
  'createCampusStaffDocumentUrl',
  'listPlatformCampusAdminRequests'
]) assert.ok(backend.includes('async ' + method + '('), 'backend must expose ' + method);

assert.match(migration, /create table if not exists public\.campus_staff_verifications/i);
assert.match(migration, /public\.submit_campus_staff_verification/i);
assert.match(migration, /public\.list_campus_staff_verification_reviews/i);
assert.match(migration, /public\.review_campus_staff_verification/i);
assert.match(migration, /public = false|values \('campus-staff-documents',[\s\S]{0,80}false/i);
assert.match(migration, /private\.current_campus_role\(\)[\s\S]{0,80}'admin'/i);
assert.ok(migration.includes('requested_campus_admin'), 'admin consideration is recorded as a request, not a granted role');
assert.ok(migration.includes('separate decisions'), 'staff review separates identity approval from campus administrator appointment');
assert.doesNotMatch(migration, /grant execute on function public\.review_campus_staff_verification\([^;]+ to anon/i);
assert.match(legacyGuard, /v_requested_role\s*=\s*'teacher'\s+or\s+v_role\s*=\s*'teacher'[\s\S]*campus_staff_verifications[\s\S]*v\.status\s*=\s*'approved'/i, 'legacy membership review must require approved staff verification for teacher applicants');
assert.match(legacyGuard, /revoke all on function public\.review_campus_staff_membership\(uuid,text\) from public, anon/i);
assert.match(genericTeacherGuard, /v_requested_role\s*=\s*'teacher'[\s\S]*campus_staff_verifications[\s\S]*csv\.status\s*=\s*'approved'/i, 'generic account approval must require approved staff verification for teachers');
assert.match(genericTeacherGuard, /student_identity_verifications[\s\S]*siv\.status\s*=\s*'approved'/i, 'generic account approval must retain student identity approval gate');
assert.ok(adminAppointmentGuard.includes("v.status='approved'"), 'campus-admin appointment requires approved staff verification');
assert.ok(adminAppointmentGuard.includes('v.requested_campus_admin=true'), 'campus-admin appointment requires explicit request');
assert.ok(adminAppointmentGuard.includes("p.role::text='teacher'"), 'campus-admin appointment requires verified teacher role');
assert.doesNotMatch(backend, /service_role|sb_secret_/i, 'browser code must not contain privileged keys');

const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let parsed = 0;
for (const match of html.matchAll(scriptRe)) {
  if (/\bsrc\s*=/.test(match[1])) continue;
  vm.createScript(match[2], { filename: 'index-inline-' + (++parsed) + '.js' });
}
vm.createScript(backend, { filename: 'campusshield-backend.js' });
console.log('Staff onboarding and campus governance smoke checks passed (' + parsed + ' inline scripts parsed).');
console.log('No Supabase writes or identity uploads were performed.');
