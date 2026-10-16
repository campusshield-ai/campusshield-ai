import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const backend = await readFile(new URL('../campusshield-backend.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261016220000_campus_staff_identity_and_governance.sql', import.meta.url), 'utf8');
const legacyGuard = await readFile(new URL('../supabase/migrations/20261016224000_guard_legacy_staff_membership_review.sql', import.meta.url), 'utf8');
const genericTeacherGuard = await readFile(new URL('../supabase/migrations/20261016225000_guard_generic_teacher_account_approval.sql', import.meta.url), 'utf8');
const adminAppointmentGuard = await readFile(new URL('../supabase/migrations/20261016225500_require_explicit_approved_campus_admin_request.sql', import.meta.url), 'utf8');
const verifiedSocialGuard = await readFile(new URL('../supabase/migrations/20261016226000_require_verified_account_for_social_interactions.sql', import.meta.url), 'utf8');
const verifiedInteractionsRls = await readFile(new URL('../supabase/migrations/20261016227000_require_verified_campus_interactions.sql', import.meta.url), 'utf8');
const verifiedSocialRpc = await readFile(new URL('../supabase/migrations/20261016228000_require_verified_account_for_social_rpc_actions.sql', import.meta.url), 'utf8');
const marketplaceSellerGuard = await readFile(new URL('../supabase/migrations/20261016230000_marketplace_seller_update_guard.sql', import.meta.url), 'utf8');
const profileSelfUpdateGuard = await readFile(new URL('../supabase/migrations/20261016231000_restrict_profile_self_update_columns.sql', import.meta.url), 'utf8');

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
assert.match(verifiedSocialGuard, /create or replace function public\.create_community_comment[\s\S]*v_verification_status is distinct from 'verified'/i, 'only verified accounts may publish comments');
assert.match(verifiedSocialGuard, /create or replace function public\.create_community_reply[\s\S]*v_status is distinct from 'verified'/i, 'only verified accounts may publish replies');
assert.match(verifiedSocialGuard, /create or replace function public\.join_campus_group[\s\S]*current_campus_account_status\(\) is distinct from 'verified'/i, 'only verified accounts may join campus groups');
assert.match(verifiedSocialGuard, /revoke all on function public\.create_community_comment\(uuid,text\) from public, anon/i);
assert.match(verifiedInteractionsRls, /create policy[\s\S]*as restrictive for all to authenticated using \(private\.current_user_has_verified_campus_access\(\)\) with check \(private\.current_user_has_verified_campus_access\(\)\)/i, 'direct writes to social and campus-interaction tables must require verified campus access');
for (const table of ['campus_event_rsvps', 'campus_follows', 'campus_group_members', 'community_poll_votes', 'community_post_bookmarks', 'community_post_reactions']) assert.ok(verifiedInteractionsRls.includes("'" + table + "'"), 'verified interaction policy must cover ' + table);
for (const fn of ['toggle_community_reaction', 'toggle_community_bookmark', 'vote_community_poll', 'repost_community_post', 'toggle_campus_follow', 'toggle_campus_follow_post_author']) {
  const start = verifiedSocialRpc.indexOf('create or replace function public.' + fn);
  assert.ok(start >= 0, 'verified social RPC migration must redefine ' + fn);
  const next = verifiedSocialRpc.indexOf('create or replace function public.', start + 1);
  const body = verifiedSocialRpc.slice(start, next < 0 ? verifiedSocialRpc.length : next);
  assert.match(body, /current_campus_account_status\(\) is distinct from 'verified'/i, fn + ' must require verified campus status');
  assert.match(body, /current_campus_role\(\)/i, fn + ' must require an active verified campus role');
}
assert.match(verifiedSocialRpc, /revoke all on function public\.toggle_campus_follow_post_author\(uuid,boolean\) from public, anon/i, 'social RPCs must not be executable by anon');
assert.match(marketplaceSellerGuard, /using \([\s\S]*seller_id = \(select auth\.uid\(\)\)[\s\S]*status = 'published'[\s\S]*\)\s*with check \([\s\S]*status = 'sold'/i, 'sellers may only transition their own published same-campus listing to sold');
assert.match(marketplaceSellerGuard, /revoke update \(category, title, description, price_ngn, contact_instructions\)[\s\S]*from authenticated/i, 'sellers must not directly rewrite listing details');
assert.match(marketplaceSellerGuard, /grant update \(status, updated_at\)[\s\S]*to authenticated/i, 'seller update grant must be limited to status and timestamp');
assert.ok(marketplaceSellerGuard.includes('drop policy if exists campus_marketplace_update_own_same_campus'), 'old permissive marketplace update policy must be removed');
assert.match(profileSelfUpdateGuard, /revoke update \(id, role, verification_status, created_at, last_profile_edit_at\)[\s\S]*from authenticated/i, 'profile identity, role, verification state and server timestamps must not be user-updatable');
assert.match(profileSelfUpdateGuard, /grant update \(display_name, requested_role\)[\s\S]*to authenticated/i, 'self-service profile updates must be limited to display name and requested role');
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
