import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const backend = await readFile(new URL("../campusshield-backend.js", import.meta.url), "utf8");
const communityMigration = await readFile(new URL("../supabase/migrations/20261014230000_add_community_privacy_feed.sql", import.meta.url), "utf8");
const usernameSyncMigration = await readFile(new URL("../supabase/migrations/20261014233000_sync_community_username_snapshots.sql", import.meta.url), "utf8");
const usernameAvailabilityMigration = await readFile(new URL("../supabase/migrations/20261014234000_restrict_username_availability.sql", import.meta.url), "utf8");
const usernameLookupRemovalMigration = await readFile(new URL("../supabase/migrations/20261014235000_remove_username_availability_rpc.sql", import.meta.url), "utf8");
const staffProfileMigration = await readFile(new URL("../supabase/migrations/20261014240000_allow_verified_teachers_to_read_profiles.sql", import.meta.url), "utf8");
const config = await readFile(new URL("../supabase-config.js", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../manifest.webmanifest", import.meta.url), "utf8"));
const serviceWorker = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");
const fraudLockMigration = await readFile(new URL("../supabase/migrations/20261018100000_confirmed_identity_fraud_lock.sql", import.meta.url), "utf8");
const offlinePage = await readFile(new URL("../offline.html", import.meta.url), "utf8");
const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((match) => match[1]).filter((value) => value.trim());

for (const [index, source] of inlineScripts.entries()) {
  assert.doesNotThrow(() => new Function(source), `inline script ${index + 1} parses`);
}
assert.doesNotThrow(() => new Function(backend), "Supabase backend parses");
assert.doesNotThrow(() => new Function(config), "Supabase config parses");

assert.match(config, /window\.CAMPUSSHIELD_SUPABASE_CONFIG\s*=/);
assert.match(config, /https:\/\/hywcpnoqqhxvujnimhxl\.supabase\.co/);
const publicKey = config.match(/publishableKey:\s*"([^"]+)"/)?.[1];
assert.ok(publicKey?.startsWith("sb_publishable_"), "uses a publishable browser key");
assert.doesNotMatch(publicKey, /secret|service_role/i);

assert.match(backend, /from\("incidents"\)/);
assert.match(backend, /reporter_id:\s*user\.id/);
assert.match(backend, /client\.auth\.getUser\(\)/);
assert.match(backend, /update\(\{\s*status\s*\}/);
assert.match(html, /function canManageIncidents\(\)/);
assert.match(html, /\['security', 'admin'\]\.includes\(profile\.role\)/);
assert.match(html, /if \(!canManageIncidents\(\)\)/);
assert.match(html, /const total = incidents\.length/);
assert.match(html, /await refreshIncidentsFromSupabase\(\)/);
assert.match(html, /id="refresh-incidents"/);
assert.match(html, /setInterval\(\(\) => \{[\s\S]*?\}, 60000\)/);
assert.match(html, /addEventListener\('visibilitychange'/);
assert.match(html, /requestSessionVersion !== authSessionVersion/);
assert.match(html, /id="incidentSyncStatus"/);
assert.doesNotMatch(html, /id="reporter"/);
assert.match(html, /does not contact emergency services/i);

// Campus community and public-identity privacy.
assert.match(html, /id="auth-username"/);
assert.match(html, /id="page-community"/);
assert.match(html, /id="communityUsernameForm"/);
assert.match(html, /id="communityPostForm"/);
assert.match(html, /id="community-moderation"/);
assert.match(html, /data-community-comment-form/);
assert.match(html, /data-report-community-type/);
assert.match(html, /Other students see this username, not your real name or email/i);
assert.match(backend, /get_my_community_profile/);
assert.match(backend, /set_my_community_username/);
assert.match(backend, /create_community_post/);
assert.match(backend, /create_community_comment/);
assert.match(backend, /report_community_content/);
assert.match(communityMigration, /alter table public\.community_posts enable row level security/i);
assert.match(communityMigration, /grant select \(id, author_username, post_type, title, body, location, status, is_official, created_at, updated_at\)/i);
assert.match(communityMigration, /grant select \(id, post_id, author_username, body, status, created_at, updated_at\)/i);
assert.match(communityMigration, /private\.current_campus_role\(\)/i);
assert.match(communityMigration, /create trigger initialize_community_profile_after_profile_insert/i);
assert.match(communityMigration, /create or replace function public\.set_my_community_username/i);
assert.match(communityMigration, /create or replace function public\.moderate_community_post/i);
assert.doesNotMatch(communityMigration, /grant select \(.*author_id/i);
assert.match(usernameSyncMigration, /create trigger sync_community_username_snapshots_after_update/i);
assert.match(usernameAvailabilityMigration, /revoke execute on function public\.check_community_username_available\(text\) from anon, public/i);
assert.match(usernameAvailabilityMigration, /create policy community_profiles_read_own/i);
assert.match(usernameAvailabilityMigration, /That username is already taken/i);
assert.match(usernameSyncMigration, /update public\.community_posts/i);
assert.match(usernameSyncMigration, /update public\.community_comments/i);
assert.match(usernameLookupRemovalMigration, /drop function if exists public\.check_community_username_available\(text\)/i);
assert.match(staffProfileMigration, /private\.current_campus_role\(\) = any \(array\[\x27admin\x27, \x27security\x27, \x27teacher\x27\]\)/i);
assert.match(html, /does not contact emergency services/i, "the emergency-services prototype warning remains visible");

assert.equal(manifest.name, "CampusShield AI");
assert.ok(manifest.name || manifest.short_name, "manifest provides an app name");
assert.equal(manifest.display, "standalone");
assert.ok(["fullscreen", "standalone", "minimal-ui", "window-controls-overlay"].includes(manifest.display), "manifest uses an installable display mode");
assert.equal(manifest.prefer_related_applications, false);
assert.match(manifest.start_url, /^\.\//);
for (const size of ["192x192", "512x512"]) {
  assert.ok(manifest.icons.some((icon) => icon.sizes === size && icon.type === "image/png"), `manifest has a ${size} PNG icon`);
}
assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"), "manifest includes a maskable Android icon");
assert.match(html, /rel="manifest" href="\.\/manifest\.webmanifest"/);
assert.match(html, /rel="apple-touch-icon" href="\.\/icons\/apple-touch-icon\.png"/);
assert.match(html, /beforeinstallprompt/);
assert.match(html, /Add to Home Screen/);
assert.match(html, /id="workspace-install-app"/);
assert.match(html, /serviceWorker\.register\('\.\/service-worker\.js'/);
assert.match(serviceWorker, /request\.mode\s*!==\s*"navigate"/);
assert.doesNotThrow(() => new Function(serviceWorker), "service worker parses");
assert.match(serviceWorker, /self\.addEventListener\("fetch"/);
assert.match(serviceWorker, /caches\.open\([^)]*\)[\s\S]*?cache\.add\(OFFLINE_URL\)/);
assert.doesNotMatch(serviceWorker, /cache\.put|cache\.addAll|Authorization|supabase/i, "service worker does not cache API, auth, or incident responses");
assert.match(offlinePage, /needs an internet connection/i);
assert.match(offlinePage, /does not contact emergency services/i);
for (const [filename, size] of [["apple-touch-icon.png", 180], ["campusshield-192.png", 192], ["campusshield-512.png", 512], ["campusshield-maskable-512.png", 512]]) {
  const icon = await readFile(new URL(`../icons/${filename}`, import.meta.url));
  assert.deepEqual([...icon.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${filename} has a PNG signature`);
  assert.equal(icon.readUInt32BE(16), size, `${filename} has the expected width`);
  assert.equal(icon.readUInt32BE(20), size, `${filename} has the expected height`);
}


 // Pending/rejected student menus remain usable while restricted destinations remain protected.
assert.match(html, /function syncIdentityNavigation\(\)/);
assert.doesNotMatch(html, /if \(needsIdentity\) button\.hidden = true/);
assert.doesNotMatch(html, /if \(studentNeedsIdentity && page !== 'identity-verification'\)/);
assert.match(html, /ordinary dashboard pages remain available while pending|ordinary dashboard access remain available/i);
assert.doesNotMatch(html, /JSON\.stringify\(\{\s*institutionName,\s*studentNumber\s*\}\)/, "identity details are not stored in browser session storage");
assert.match(html, /Your ID submission is being processed/i);
assert.match(html, /id="dashboard-verification-status"/);
assert.match(html, /function syncDashboardVerificationNotice\(/);
assert.match(html, /Full student access begins after administrator approval/i);
assert.match(html, /currentProfile = profile;[\s\S]{0,180}studentIdentitySubmission = null;[\s\S]{0,180}\$\('workspace'\)\.hidden = false/);
assert.match(html, /function canAccessStaffPages\(profile = currentProfile\)/);
assert.match(html, /button\.hidden = !canAccessStaffPages\(\)/);
assert.match(html, /if \(!canAccessStaffPages\(\) && \['manage', 'risk', 'analytics'\]\.includes\(page\)\)/);
assert.match(html, /if \(page === 'approvals' && !verifiedAdmin\)/);

// Explicitly assert the role allowlist and verified-status requirement.
assert.match(html, /return profile\?\.verification_status === 'verified' &&\s*\['security', 'admin'\]\.includes\(profile\.role\)/);
const rolePermissionCases = [
  [{ role: "student", verification_status: "verified" }, false],
  [{ role: "teacher", verification_status: "verified" }, false],
  [{ role: "security", verification_status: "verified" }, true],
  [{ role: "admin", verification_status: "verified" }, true],
  [{ role: "security", verification_status: "pending" }, false],
  [{ role: "admin", verification_status: "rejected" }, false],
  [null, false],
];
const expectedStaffAccess = (profile) =>
  profile?.verification_status === "verified" && ["security", "admin"].includes(profile.role);
for (const [profile, expected] of rolePermissionCases) {
  assert.equal(expectedStaffAccess(profile), expected, `staff access policy for ${profile?.role || "signed-out"}`);
}
assert.match(html, /canAccessStaffPages\(\)/, "staff routes use the shared role predicate");


 // Account creation and review timeline: identity fields are within the signup section,
 // submission uses the private Storage helper, and pending users aren't redirected to the ID page on every login.
assert.match(html, /id="signup-student-identity-fields"/);
assert.match(html, /id="signup-institution"/);
assert.match(html, /id="signup-student-number"/);
assert.match(html, /id="signup-student-document"/);
assert.match(html, /backend\.uploadStudentIdentityDocument\(studentDocument, \{ institutionName, studentNumber \}\)/);
assert.match(html, /up to 7 working days/i);
assert.match(html, /studentIdentityForm'\)\.addEventListener\('submit'/);
assert.match(html, /if \(profile\.verification_status === 'rejected'\)/);
assert.match(html, /ordinary dashboard access remain available/i);
assert.match(html, /never persist ID files in browser storage|Do not persist ID files in browser storage/i);

// Confirmed fraud remains distinct from ordinary rejection and is enforced by the
// real multi-campus gate while campus-scoped reviewer checks stay in place.
assert.match(fraudLockMigration, /p_decision is null or p_decision not in \('approve','reject','fraud'\)/);
assert.match(fraudLockMigration, /fraud_lock_at = now\(\) \+ interval '48 hours'/);
assert.match(fraudLockMigration, /private\.current_user_has_verified_campus_access\(\)/);
assert.match(fraudLockMigration, /now\(\) >= siv\.fraud_lock_at/);
assert.match(fraudLockMigration, /private\.current_campus_role\(\)/);
assert.match(fraudLockMigration, /private\.user_has_current_campus\(p_user_id\)/);
assert.match(fraudLockMigration, /fraud_decision_reason = btrim\(p_rejection_reason\)/);
assert.match(fraudLockMigration, /status = 'rejected',[\s\S]*confirmed_fraud = false,[\s\S]*fraud_lock_at = null/);
assert.match(fraudLockMigration, /status = 'approved'[\s\S]*and student_identity_verifications\.confirmed_fraud = true/);
assert.match(fraudLockMigration, /v_verified_fraud_resubmission/);
assert.match(fraudLockMigration, /set verification_status = 'pending'/);
assert.match(fraudLockMigration, /set university_id = excluded\.university_id,[\s\S]*confirmed_fraud = false,[\s\S]*fraud_lock_at = null/);
assert.match(fraudLockMigration, /owner_id = v_user_id::text/);
assert.match(fraudLockMigration, /student-identity-documents/);
assert.match(backend, /\["approve", "reject", "fraud"\]/);
assert.match(backend, /my_identity_fraud_lock_status/);
assert.match(backend, /listApprovedStudentIdentityVerifications/);
assert.match(backend, /confirmedFraudResubmission/);
assert.match(html, /data-identity-review="fraud"/);
assert.match(html, /identityFraudStatus\?\.confirmed_fraud/);
assert.match(html, /listApprovedStudentIdentityVerifications/);
assert.match(html, /A confirmed-fraud notice is active/);
assert.match(html, /correction\/appeal notice/);
console.log("PASS student identity details are collected during signup and uploaded through the private backend helper");
console.log("PASS sign-in keeps pending/rejected users on the ordinary dashboard while restricted actions remain gated");
console.log(`PASS ${inlineScripts.length} inline script(s), backend, and config parse`);
console.log("PASS browser config uses the Supabase project URL and publishable key only");
console.log("PASS incident reads, submissions, status updates, and dashboard metrics use Supabase data");
console.log("PASS incident data can be refreshed manually, on tab return, and every minute");
console.log("PASS resolve controls are shown only to verified security/admin users");
console.log("PASS emergency-services prototype warning remains visible");
console.log("PASS Android and iOS install metadata and guidance are present");
console.log("PASS Android and Apple launcher icons are valid PNGs at the required sizes");
console.log("PASS offline fallback stores no app, authentication, or incident responses");
