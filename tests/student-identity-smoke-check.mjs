import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const addon = await readFile(new URL('../campusshield-backend-identity-addon.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261015220432_student_identity_verification.sql', import.meta.url), 'utf8');

for (const required of [
  'id="studentIdentityForm"',
  'id="identity-institution"',
  'id="identity-student-number"',
  'id="identity-document"',
  'data-identity-review="approve"',
  'data-identity-review="reject"',
  'Rejected — view only',
  'campus-roadmap-note',
  'Find your people. Grow your future.'
]) assert.ok(html.includes(required), 'index.html should contain ' + required);

assert.ok(html.includes('<script src="./campusshield-backend-identity-addon.js"></script>'), 'identity add-on must load before app code');
for (const method of ['getMyStudentIdentityVerification', 'uploadStudentIdentityDocument', 'createStudentIdentityDocumentUrl']) {
  assert.ok(addon.includes('backend.' + method + ' = async function'), 'identity add-on should define ' + method);
}
assert.ok(addon.includes('student-identity-documents'), 'uploads use the private identity bucket');
assert.ok(addon.includes('5 * 1024 * 1024'), 'uploads are limited to 5 MiB in the client');
assert.ok(addon.includes('student-identity-document'), 'upload path uses the safe staging object name');

for (const requirement of [
  'enable row level security',
  'student_identity_read_owner_or_campus_admin',
  'student_identity_upload_own_pending',
  'student_identity_read_own_or_campus_admin',
  'student_identity_delete_unsubmitted_own',
  'submit_student_identity_verification',
  'review_student_identity_verification',
  'Approve the student identity document before approving this account.',
  'public = false'
]) assert.ok(migration.toLowerCase().includes(requirement.toLowerCase()), 'migration should contain ' + requirement);

// Parse JavaScript without running browser code or touching Supabase.
const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let parsedInlineScripts = 0;
for (const match of html.matchAll(scriptRe)) {
  if (/\bsrc\s*=/.test(match[1])) continue;
  vm.createScript(match[2], {filename:'index-inline-' + (++parsedInlineScripts) + '.js'});
}
vm.createScript(addon, {filename:'campusshield-backend-identity-addon.js'});

console.log('CampusShield identity static smoke check passed (' + parsedInlineScripts + ' inline scripts parsed).');
console.log('No database writes, identity uploads, or live account actions were performed.');
