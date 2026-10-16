import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const backend = await readFile(new URL("../campusshield-backend.js", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20261016120000_campus_life_helpdesk_noticeboard.sql", import.meta.url), "utf8");
const wrappers = await readFile(new URL("../supabase/migrations/20261016123000_harden_campus_life_rpc_wrappers.sql", import.meta.url), "utf8");
const noticeAudience = await readFile(new URL("../supabase/migrations/20261016130000_secure_noticeboard_audience_rls.sql", import.meta.url), "utf8");
const identityGate = await readFile(new URL("../supabase/migrations/20261016140000_identity_gate_and_resubmission.sql", import.meta.url), "utf8");
const verifiedNoticeReadGate = await readFile(new URL("../supabase/migrations/20261016240000_require_verified_campus_notice_reads.sql", import.meta.url), "utf8");

assert.match(html, /data-page="noticeboard"/);
assert.match(html, /id="forgot-password-button"/, "login retains Forgot password");
assert.match(html, /resetPasswordForEmail|requestPasswordReset/);
assert.match(html, /event === 'PASSWORD_RECOVERY'/);
assert.match(html, /id="confirm-new-password"/);
assert.match(html, /href="https:\/\/x\.com\/CampusShieldAI"/, "official X profile is clickable");
assert.match(html, /THE OFFICIAL CAMPUSSHIELD HUB/);
assert.match(html, /SHIELD NOTES/);
assert.match(html, /CAMPUS VOICES/);
assert.match(html, /BUILD LAB/);
assert.equal((html.match(/class="campus-hub"/g) || []).length, 1, "hub appears once");
assert.doesNotMatch(html, /<div class="workspace-social">/, "hub is not displayed after sign-in");
assert.match(html, /data-page="helpdesk"/);
assert.match(html, /id="campusNoticeForm"/);
assert.match(html, /id="campusHelpdeskForm"/);
assert.match(html, /id="campus-helpdesk-staff-queue"/);
assert.match(html, /id="campus-noticeboard-feed"/);
assert.match(html, /Not an emergency channel/i);
assert.match(html, /loadCampusNoticeboardPage/);
assert.match(html, /loadCampusHelpdeskPage/);
assert.match(html, /verified campus notice/i);
assert.match(html, /campus-ticket-timeline/);
assert.doesNotThrow(() => new Function(backend), "backend JavaScript parses");

for (const method of [
  'rpc("submit_campus_helpdesk_ticket"',
  'from("campus_helpdesk_tickets")',
  'from("campus_helpdesk_ticket_updates")',
  'rpc("update_campus_helpdesk_ticket"',
  'from("campus_notices")',
  'rpc("publish_campus_notice"',
  'rpc("archive_campus_notice"'
]) assert.ok(backend.includes(method), "backend includes " + method);

for (const table of [
  "campus_helpdesk_tickets",
  "campus_helpdesk_ticket_updates",
  "campus_notices"
]) {
  assert.match(migration, new RegExp("alter table public\\." + table + " enable row level security", "i"));
}
assert.match(migration, /current_campus_university_id/);
assert.match(migration, /current_campus_role/);
assert.match(migration, /campus_helpdesk_tickets_read_owner_or_verified_campus_staff/);
assert.match(migration, /campus_helpdesk_updates_read_ticket_owner_or_staff/);
assert.match(migration, /campus_notices_read_published_for_campus_audience/);
assert.match(migration, /revoke all on public\.campus_helpdesk_tickets from anon, authenticated/i);
assert.match(migration, /revoke all on public\.campus_helpdesk_ticket_updates from anon, authenticated/i);
assert.match(migration, /revoke all on public\.campus_notices from anon, authenticated/i);
assert.match(migration, /revoke all on function public\.publish_campus_notice[\s\S]*?from public, anon/i);
assert.match(migration, /set search_path = ''/i);
assert.match(wrappers, /security invoker/i);
assert.match(wrappers, /alter function public\.submit_campus_helpdesk_ticket[\s\S]*?set schema private/i);
assert.match(wrappers, /create or replace function public\.publish_campus_notice[\s\S]*?security invoker/i);
assert.match(noticeAudience, /private\.current_user_matches_notice_audience/i);
assert.match(noticeAudience, /campus_notices_read_published_for_campus_audience/i);
assert.match(verifiedNoticeReadGate, /create policy campus_notices_require_verified_campus_access[\s\S]*?as restrictive[\s\S]*?for select[\s\S]*?to authenticated/i);
assert.match(verifiedNoticeReadGate, /current_user_has_verified_campus_access/i);
assert.match(identityGate, /current_user_has_verified_campus_access/i);
assert.match(identityGate, /enforce_verified_campus_access_for_interaction/i);
assert.match(identityGate, /campus_identity_verified_read_gate/i);
assert.match(identityGate, /student_identity_delete_unsubmitted_or_rejected_own/i);
assert.match(identityGate, /status = 'rejected'/i);
assert.match(identityGate, /p_rejection_reason text default null/i);
assert.match(identityGate, /Verify your student identity and wait for account approval/i);
assert.match(identityGate, /revoke all on function public\.submit_student_identity_verification/i);
assert.match(identityGate, /revoke all on function public\.review_student_identity_verification/i);
assert.doesNotMatch(backend, /service_role|sb_secret_/i);

console.log("PASS CampusShield Helpdesk and verified noticeboard UI wiring");
console.log("PASS password recovery and login-only official social hub remain integrated");
console.log("PASS backend RPC and data methods exist");
console.log("PASS ticket, activity-history and notice tables enable RLS");
console.log("PASS ticket owner/staff and campus-audience policies are present");
console.log("PASS direct client writes are revoked; controlled RPCs enforce privileged changes");
console.log("PASS frontend uses browser-safe client only and does not include privileged keys");
console.log("PASS public RPCs use invoker wrappers with private implementations and scoped notice audience helper");
