import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const addon = await readFile(new URL('../campusshield-backend-identity-addon.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261015220432_student_identity_verification.sql', import.meta.url), 'utf8');
const identityGateMigration = await readFile(new URL('../supabase/migrations/20261016140000_identity_gate_and_resubmission.sql', import.meta.url), 'utf8');
const config = await readFile(new URL('../supabase-config.js', import.meta.url), 'utf8');
const communityReadGate = await readFile(new URL('../supabase/migrations/20261016150000_gate_community_read_rpcs.sql', import.meta.url), 'utf8');
const identityUploadRlsFix = await readFile(new URL('../supabase/migrations/20261020130000_fix_student_identity_upload_rls.sql', import.meta.url), 'utf8');

for (const required of [
  'id="studentIdentityForm"',
  'id="signup-student-identity-panel"',
  'id="student-identity-setup-button"',
  'id="identity-institution"',
  'id="identity-institution-search"',
  'id="identity-university-options"',
  'id="identityUniversityRequestForm"',
  'id="identity-request-university-name"',
  'Other / institution not listed',
  'https://enuc.nuc.edu.ng/nus',
  'id="identity-student-number"',
  'id="identity-document"',
  'id="identity-original-document-confirmation"',
  'AI-generated or edited identity images are not accepted.',
  'CampusShield creates the secure filename automatically.',
  'data-identity-review="approve"',
  'data-identity-review="reject"',
  'Your ID was rejected',
  'Correct the details or choose a clearer file and resubmit.',
  'p_rejection_reason: rejectionReason',
  'campus-roadmap-note',
  'Find your people. Grow your future.'
]) assert.ok(html.includes(required), 'index.html should contain ' + required);

assert.ok(html.includes('<script src="./campusshield-backend-identity-addon.js"></script>'), 'identity add-on must load before app code');
assert.match(html, /listCampusUniversities\(\)/, 'identity form options come from the existing Supabase university directory');
assert.match(html, /requestCampusUniversity\(\{[\s\S]*?name: \$\('identity-request-university-name'\)/, 'unlisted university uses the existing guarded listing-request RPC');
assert.match(html, /typedInstitution\.toLocaleLowerCase\(\) !== lockedInstitution\.toLocaleLowerCase\(\)/, 'identity submission rejects a university different from the locked campus');
assert.match(html, /institutionName: lockedInstitution/, 'identity upload uses the authenticated campus context');
assert.match(html, /attestOriginalDocument: \$\('identity-original-document-confirmation'\)\.checked/, 'identity upload passes the no-AI attestation');
assert.match(html, /async function submitStudentIdentityDocument\(\)[\s\S]*?backend\.uploadStudentIdentityDocument\(file/, 'secure ID upload remains wired');
assert.match(html, /async function handleSignUp\(\)[\s\S]*?backend\.uploadStudentIdentityDocument\(studentDocument/, 'signup attempts private upload only when authenticated');
assert.ok(!html.includes('id="page-identity-verification"'), 'no standalone identity workspace page remains');
assert.ok(!html.includes('data-page="identity-verification"'), 'no separate identity sidebar item remains');
assert.ok(html.includes('identityCompletionMode'), 'existing students can complete ID setup from the Create account view');
assert.ok(html.includes('ID files are not saved on this device.'), 'email confirmation flow does not persist ID files locally');
for (const method of ['getMyStudentIdentityVerification', 'uploadStudentIdentityDocument', 'createStudentIdentityDocumentUrl']) {
  assert.ok(addon.includes('backend.' + method + ' = async function'), 'identity add-on should define ' + method);
}
assert.ok(addon.includes('student-identity-documents'), 'uploads use the private identity bucket');
assert.ok(addon.includes('5 * 1024 * 1024'), 'uploads are limited to 5 MiB in the client');
assert.ok(addon.includes('globalThis.crypto?.randomUUID'), 'upload creates a UUID filename automatically');
assert.ok(addon.includes('user.id + "/" + globalThis.crypto.randomUUID() + "." + extension'), 'upload filename is generated inside the signed-in user folder');
assert.ok(addon.includes('details?.attestOriginalDocument !== true'), 'upload requires an explicit genuine-document attestation');
assert.ok(addon.includes('AI-generated or digitally altered'), 'upload rejects submissions without the no-AI/unaltered-document attestation');
assert.ok(addon.includes('p_institution_name: institutionName'), 'identity submission includes institution name');
assert.ok(addon.includes('existing?.status === "rejected"'), 'rejected identity can be resubmitted');
assert.ok(addon.includes('rejection_reason'), 'student identity status returns rejection reason');
assert.ok(identityGateMigration.includes('current_user_has_verified_campus_access'), 'database adds identity-aware verified access helper');
assert.ok(identityGateMigration.includes('enforce_verified_campus_access_for_interaction'), 'database trigger gates privileged RPC writes');
assert.ok(identityGateMigration.includes("where student_identity_verifications.status = 'rejected'"), 'only rejected identity submissions can be replaced');
assert.ok(identityGateMigration.includes('p_rejection_reason text default null'), 'identity rejection can record a resubmission reason');
assert.ok(identityGateMigration.includes('student_identity_delete_unsubmitted_or_rejected_own'), 'only unsubmitted or rejected own ID objects can be deleted');
assert.ok(config.includes('campusshield-ai.github.io') && config.includes('isProductionHost'), 'production hostname selects production while development uses staging');
assert.ok(identityUploadRlsFix.includes('student_identity_upload_own_pending'), 'follow-up migration fixes the student identity storage insert policy');
assert.ok(identityUploadRlsFix.includes('storage.foldername(name))[1]'), 'identity upload policy keeps uploads inside the signed-in user folder');
assert.ok(identityUploadRlsFix.includes("p.verification_status::text = 'pending'"), 'identity upload policy only permits pending students');
assert.ok(identityUploadRlsFix.includes("[.](jpg|png|pdf)$"), 'identity upload policy restricts UUID object names to safe document types');
assert.doesNotMatch(identityUploadRlsFix, /user_has_current_campus/, 'campus authorization remains enforced by the submission RPC rather than duplicating the storage gate');
assert.match(communityReadGate, /create or replace function public\.get_community_poll_data/i);
assert.match(communityReadGate, /create or replace function public\.get_community_post_social/i);
assert.equal((communityReadGate.match(/current_user_has_verified_campus_access\(\)/g) || []).length, 2,
  'both SECURITY DEFINER community read RPCs enforce approved campus access');
assert.doesNotMatch(config, /service_role|sb_secret_/i, 'browser config must not contain privileged keys');

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
