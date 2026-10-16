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
const verifiedInteractionWriteOnly = await readFile(new URL('../supabase/migrations/20261016234000_limit_verified_interaction_policy_to_writes.sql', import.meta.url), 'utf8');
const verifiedStudentAccess = await readFile(new URL('../supabase/migrations/20261016235000_preserve_verified_student_interactions.sql', import.meta.url), 'utf8');
const verifiedSocialRpc = await readFile(new URL('../supabase/migrations/20261016228000_require_verified_account_for_social_rpc_actions.sql', import.meta.url), 'utf8');
const marketplaceSellerGuard = await readFile(new URL('../supabase/migrations/20261016230000_marketplace_seller_update_guard.sql', import.meta.url), 'utf8');
const profileSelfUpdateGuard = await readFile(new URL('../supabase/migrations/20261016231000_restrict_profile_self_update_columns.sql', import.meta.url), 'utf8');
const profileTablePrivileges = await readFile(new URL('../supabase/migrations/20261016236000_lock_profile_table_privileges.sql', import.meta.url), 'utf8');
const anonymousIncidentReadGuard = await readFile(new URL('../supabase/migrations/20261016238000_revoke_anon_incident_read.sql', import.meta.url), 'utf8');
const evidenceAudit = await readFile(new URL('../supabase/migrations/20261016232000_campus_identity_evidence_audit.sql', import.meta.url), 'utf8');
const evidenceAuditHistory = await readFile(new URL('../supabase/migrations/20261016233000_list_campus_identity_evidence_audit.sql', import.meta.url), 'utf8');

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
  'id="evidence-audit-rows"',
  'data-evidence-check',
  'Record evidence check',
  'authoritative source and reference.',
  'data-student-evidence-check',
  "evidenceType: 'student_id'",
  'id="platform-admin-admin-requests-table"',
  'Appoint campus admin',
  'requested_campus_admin',
  'Your title is reviewed and does not automatically grant administrator permissions.'
]) assert.ok(html.includes(expected), 'onboarding page must include ' + expected);

for (const method of [
  'submitCampusStaffVerification',
  'getMyCampusStaffVerification',
  'listCampusStaffVerificationReviews',
  'recordCampusIdentityEvidenceCheck',
  'listCampusIdentityEvidenceChecks',
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
assert.ok(verifiedInteractionWriteOnly.includes("'verified_account_required_for_interactions'"), 'follow-up migration must remove the broad restrictive policy');
assert.ok(verifiedInteractionWriteOnly.includes('as restrictive for insert to authenticated with check (private.current_user_has_verified_campus_access())'), 'direct inserts must require verified campus access');
assert.ok(verifiedInteractionWriteOnly.includes('as restrictive for update to authenticated using (private.current_user_has_verified_campus_access()) with check (private.current_user_has_verified_campus_access())'), 'direct updates must require verified campus access');
assert.ok(verifiedInteractionWriteOnly.includes('as restrictive for delete to authenticated using (private.current_user_has_verified_campus_access())'), 'direct deletes must require verified campus access');
assert.doesNotMatch(verifiedInteractionWriteOnly, /as restrictive for all to authenticated/i, 'verified-only write guard must not block SELECT queries');
assert.ok(verifiedStudentAccess.includes("coalesce((select private.current_campus_role()), '') = 'student'"), 'verified student interactions require an active verified student campus role');
assert.ok(verifiedStudentAccess.includes("p.verification_status = 'verified'"), 'legacy student interaction access still requires verified profile status');
assert.doesNotMatch(verifiedStudentAccess, /student_identity_verifications/i, 'legacy verified student access does not require a duplicate identity row');
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
assert.match(profileSelfUpdateGuard, /revoke update on public\.profiles from authenticated/i, 'table-level profile update must be revoked before safe column grants');
assert.match(profileSelfUpdateGuard, /grant update \(display_name, requested_role\)[\s\S]*to authenticated/i, 'self-service profile updates must be limited to display name and requested role');
assert.match(profileTablePrivileges, /revoke all privileges on table public\.profiles from anon, authenticated/i, 'broad profile table privileges must be revoked from client roles');
assert.match(profileTablePrivileges, /grant select on table public\.profiles to authenticated/i, 'authenticated clients retain required profile reads');
assert.match(profileTablePrivileges, /grant update \(display_name, requested_role\) on table public\.profiles to authenticated/i, 'only approved self-service profile columns are granted back');
assert.ok(evidenceAudit.includes('create table if not exists public.campus_identity_evidence_checks'), 'evidence checks must be recorded in an audit table');
assert.ok(evidenceAudit.includes('alter table public.campus_identity_evidence_checks enable row level security'), 'evidence audit table must enforce RLS');
assert.ok(evidenceAudit.includes('revoke all on table public.campus_identity_evidence_checks from public, anon, authenticated'), 'clients must not read or write audit records directly');
assert.ok(evidenceAudit.includes("outcome <> 'institution_confirmed'") && evidenceAudit.includes("source_kind in ('official_university_email','university_registry','direct_institution_contact','official_payment_portal')") && evidenceAudit.includes('source_reference'), 'institution confirmation must require an authoritative source and reference');
assert.ok(evidenceAudit.includes("private.current_campus_role()) is distinct from 'admin'"), 'evidence audit RPC must require campus admin');
assert.ok(evidenceAudit.includes('private.user_has_current_campus(p_subject_user_id)'), 'evidence audit RPC must be campus scoped');
assert.ok(evidenceAudit.includes('security invoker') && evidenceAudit.includes('private.record_campus_identity_evidence_check'), 'public audit RPC must use an invoker wrapper');
assert.ok(evidenceAudit.includes("set search_path = ''"), 'private evidence recorder must use a locked search path');
assert.ok(evidenceAudit.includes('grant execute on function private.record_campus_identity_evidence_check(uuid,text,text,text,text,text) to authenticated, service_role'), 'private evidence recorder must be executable only through explicitly granted trusted roles');
assert.ok(evidenceAudit.includes('revoke all on function private.record_campus_identity_evidence_check(uuid,text,text,text,text,text) from public, anon'), 'anonymous execution of the private evidence recorder must be revoked');
assert.ok(evidenceAudit.includes('grant execute on function public.record_campus_identity_evidence_check(uuid,text,text,text,text,text) to authenticated, service_role'), 'public evidence wrapper must be granted to authenticated users only after explicit revocation');
assert.ok(evidenceAudit.includes('revoke all on function public.record_campus_identity_evidence_check(uuid,text,text,text,text,text) from public, anon'), 'anonymous callers must not execute evidence audit RPC');
assert.ok(evidenceAuditHistory.includes('create or replace function public.list_campus_identity_evidence_checks'), 'evidence history must be exposed through a guarded RPC');
assert.ok(evidenceAuditHistory.includes("private.current_campus_role()) is distinct from 'admin'"), 'evidence history RPC must require campus admin');
assert.ok(evidenceAuditHistory.includes('limit 200'), 'evidence history must be bounded');
assert.ok(evidenceAuditHistory.includes('where c.university_id=v_university_id'), 'evidence history must be restricted to the reviewer campus');
assert.ok(evidenceAuditHistory.includes("private.current_campus_role()) is distinct from 'admin'") && evidenceAuditHistory.includes("p.verification_status::text='verified'"), 'evidence history must require a verified campus administrator');
assert.ok(evidenceAuditHistory.includes('set search_path = \'\''), 'evidence history SECURITY DEFINER function must use a locked search path');
assert.ok(evidenceAuditHistory.includes('revoke all on function public.list_campus_identity_evidence_checks(uuid) from public, anon'), 'anonymous access to evidence history must be revoked');
assert.ok(html.includes('listCampusIdentityEvidenceChecks()'), 'evidence history UI must load the guarded RPC');
assert.ok(html.includes('recordCampusIdentityEvidenceCheck({ userId, evidenceType, outcome, sourceKind'), 'evidence review UI must save the audit record');
assert.ok(html.includes("evidenceType: 'student_id'"), 'student identity review must record student ID evidence checks');
assert.ok(html.includes('data-student-evidence-check'), 'student identity queue must expose the evidence audit action');
assert.doesNotMatch(backend, /service_role|sb_secret_/i, 'browser code must not contain privileged keys');
assert.ok(backend.includes('file.type === "application/pdf" ? "pdf" : file.type === "image/jpeg" ? "jpg" : "png"'), 'staff upload extension must be derived from validated MIME type');
assert.ok(backend.includes('cleanedBase + "." + extension'), 'staff upload object name must end with the MIME-matched extension');
assert.match(anonymousIncidentReadGuard, /revoke select on table public\\.incidents from anon/i, 'anonymous clients must not have table-level access to sensitive incident reports');

const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let parsed = 0;
for (const match of html.matchAll(scriptRe)) {
  if (/\bsrc\s*=/.test(match[1])) continue;
  vm.createScript(match[2], { filename: 'index-inline-' + (++parsed) + '.js' });
}
vm.createScript(backend, { filename: 'campusshield-backend.js' });
console.log('Staff onboarding and campus governance smoke checks passed (' + parsed + ' inline scripts parsed).');
console.log('No Supabase writes or identity uploads were performed.');
