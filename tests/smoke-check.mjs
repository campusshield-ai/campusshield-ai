import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const backend = await readFile(new URL("../campusshield-backend.js", import.meta.url), "utf8");
const communityMigration = await readFile(new URL("../supabase/migrations/20261014230000_add_community_privacy_feed.sql", import.meta.url), "utf8");
const usernameSyncMigration = await readFile(new URL("../supabase/migrations/20261014233000_sync_community_username_snapshots.sql", import.meta.url), "utf8");
const usernameAvailabilityMigration = await readFile(new URL("../supabase/migrations/20261014234000_restrict_username_availability.sql", import.meta.url), "utf8");
const usernameLookupRemovalMigration = await readFile(new URL("../supabase/migrations/20261014235000_remove_username_availability_rpc.sql", import.meta.url), "utf8");
const staffProfileMigration = await readFile(new URL("../supabase/migrations/20261014240000_allow_verified_teachers_to_read_profiles.sql", import.meta.url), "utf8");
const multiUniversityMigration = await readFile(new URL("../supabase/migrations/20261015000000_multi_university_foundation.sql", import.meta.url), "utf8");
const campusStaffMigration = await readFile(new URL("../supabase/migrations/20261015010000_campus_staff_membership_review.sql", import.meta.url), "utf8");
const campusSocialMigration = await readFile(new URL("../supabase/migrations/20261015020000_campus_social_actions.sql", import.meta.url), "utf8");
const privateCampusMediaMigration = await readFile(new URL("../supabase/migrations/20261015030000_private_campus_media.sql", import.meta.url), "utf8");
const campusGroupsEventsMarketplaceMigration = await readFile(new URL("../supabase/migrations/20261015040000_campus_groups_events_marketplace.sql", import.meta.url), "utf8");
const marketplaceReportingMigration = await readFile(new URL("../supabase/migrations/20261015050000_marketplace_reporting.sql", import.meta.url), "utf8");
const socialDirectoryMigration = await readFile(new URL("../supabase/migrations/20261015060000_social_directory_helpers.sql", import.meta.url), "utf8");
const campusRoleScopingMigration = await readFile(new URL("../supabase/migrations/20261015070000_campus_role_scoping.sql", import.meta.url), "utf8");
const rpcPermissionsMigration = await readFile(new URL("../supabase/migrations/20261015080000_harden_campus_rpc_permissions.sql", import.meta.url), "utf8");
const platformAdminProvisioningMigration = await readFile(new URL("../supabase/migrations/20261015090000_require_preprovisioned_platform_admin.sql", import.meta.url), "utf8");
const platformAdminConsoleMigration = await readFile(new URL("../supabase/migrations/20261015100000_platform_admin_console_rpcs.sql", import.meta.url), "utf8");
const nucDirectoryMigration = await readFile(new URL("../supabase/migrations/20261015110000_import_official_nuc_university_directory.sql", import.meta.url), "utf8");
const verifiedCampusAdminMigration = await readFile(new URL("../supabase/migrations/20261015120000_require_verified_campus_staff_for_admin.sql", import.meta.url), "utf8");
const legacyCampusBackfillMigration = await readFile(new URL("../supabase/migrations/20261015130000_backfill_legacy_content_after_campus_selection.sql", import.meta.url), "utf8");
const config = await readFile(new URL("../supabase-config.js", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../manifest.webmanifest", import.meta.url), "utf8"));
const serviceWorker = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");
const offlinePage = await readFile(new URL("../offline.html", import.meta.url), "utf8");
const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((match) => match[1]).filter((value) => value.trim());

for (const [index, source] of inlineScripts.entries()) {
  assert.doesNotThrow(() => new Function(source), `inline script ${index + 1} parses`);
}
assert.doesNotThrow(() => new Function(backend), "Supabase backend parses");
assert.doesNotThrow(() => new Function(config), "Supabase config parses");
assert.match(backend, /emailRedirectTo:\s*window\.location\.origin\s*\+\s*window\.location\.pathname/);
assert.doesNotMatch(backend, /emailRedirectTo:\s*["']https:\/\/campusshield-ai\.github\.io\/campusshield-ai\//);
assert.ok(
  html.includes(".in('verification_status', ['pending', 'rejected'])"),
  "account approvals query includes pending and rejected applications"
);
assert.ok(
  html.includes(".or('requested_role.in.(student,teacher),role.in.(student,teacher)')"),
  "account approvals query includes student/teacher applicants by requested or current role"
);
assert.ok(
  html.includes("row.verification_status === 'pending'"),
  "review actions are shown only for pending applications"
);
assert.ok(
  html.includes("Rejected — view only"),
  "rejected applications are displayed read-only"
);
assert.match(html, /<th scope="col">Status<\/th>/, "account approvals table includes a Status column");
assert.match(html, /row\.verification_status === 'rejected' \? 'high' : 'open'/, "approval status styling distinguishes rejected applications");
assert.match(html, /colspan="6"/, "account approvals placeholders span all six columns");
assert.doesNotMatch(
  html,
  /\.eq\('verification_status', 'pending'\)/,
  "no pending-only status filter remains in the approvals query"
);

assert.match(config, /window\.CAMPUSSHIELD_SUPABASE_CONFIG\s*=/);
assert.match(config, /https:\/\/fvgtnujjnvdkhzqqcaqe\.supabase\.co/);
const publicKey = config.match(/publishableKey:\s*"([^"]+)"/)?.[1];
assert.ok(publicKey?.startsWith("sb_publishable_"), "uses a publishable browser key");
assert.doesNotMatch(publicKey, /secret|service_role/i);

assert.match(backend, /from\("incidents"\)/);
assert.match(backend, /reporter_id:\s*user\.id/);
assert.match(backend, /client\.auth\.getUser\(\)/);
assert.match(backend, /update\(\{\s*status\s*\}/);
assert.match(html, /function canManageIncidents\(\)/);
assert.match(html, /\['security', 'admin'\]\.includes\(currentProfile\.role\)/);
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
assert.match(html, /temporarily limited confirmation emails/i, "signup/resend explains Supabase email rate limits");
assert.match(html, /repeated sign-up attempts will not speed this up/i, "rate-limit guidance discourages repeated signup retries");

// Campus community and public-identity privacy.
assert.match(html, /id="auth-username"/);
assert.match(html, /id="page-community"/);
assert.match(html, /function renderCommunityFeed\(posts, comments, socialRows, pollsByPost, mediaByPost\)/);
assert.match(html, /renderCommunityFeed\(posts, comments, socialRows, pollsByPost, mediaByPost\)/);
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
assert.match(backend, /listCampusUniversities/);
assert.match(backend, /get_my_campus_context/);
assert.match(backend, /set_my_campus_membership/);
assert.match(backend, /university_id: campus\.university_id/);
assert.match(html, /id="campusOnboardingForm"/);
assert.match(html, /id="campusUniversityRequestForm"/);
assert.match(html, /locked after joining/i);
assert.match(multiUniversityMigration, /private\.current_campus_university_id\(\)/i);
assert.match(multiUniversityMigration, /create policy community_posts_read_same_campus/i);
assert.match(multiUniversityMigration, /create policy incidents_read_own_or_same_campus_staff/i);
assert.match(multiUniversityMigration, /create or replace function public\.set_my_campus_membership/i);
assert.match(multiUniversityMigration, /Your university is locked to protect campus privacy/i);
assert.match(multiUniversityMigration, /create table if not exists public\.campus_groups/i);
assert.match(multiUniversityMigration, /create table if not exists public\.campus_events/i);
assert.match(multiUniversityMigration, /create table if not exists public\.campus_marketplace_listings/i);
assert.match(campusStaffMigration, /create or replace function public\.bootstrap_first_campus_admin/i);
assert.match(campusStaffMigration, /create or replace function public\.list_campus_staff_membership_reviews/i);
assert.match(campusStaffMigration, /create or replace function public\.review_campus_staff_membership/i);
assert.match(campusStaffMigration, /private\.current_campus_role\(\)/i);
assert.match(backend, /bootstrapFirstCampusAdmin/);
assert.match(backend, /listCampusStaffMembershipReviews/);
assert.match(backend, /reviewCampusStaffMembership/);
assert.match(html, /id="campus-membership-review-panel"/);
assert.match(html, /id="page-groups"/);
assert.match(html, /id="page-events"/);
assert.match(html, /id="page-marketplace"/);
assert.match(html, /id="campusGroupForm"/);
assert.match(html, /id="campusEventForm"/);
assert.match(html, /id="campusMarketplaceForm"/);
assert.match(html, /One university, one private community/i);
assert.match(html, /data-community-reaction/);
assert.match(html, /data-community-bookmark/);
assert.match(html, /data-community-repost/);
assert.match(html, /data-community-follow/);
assert.match(html, /data-community-poll-vote/);
assert.match(html, /data-campus-event-rsvp/);
assert.match(html, /data-marketplace-report/);
assert.match(backend, /listCampusGroups/);
assert.match(backend, /join_campus_group/);
assert.match(backend, /createCampusEvent/);
assert.match(backend, /createCampusMarketplaceListing/);
assert.match(backend, /report_campus_marketplace_listing/);
assert.match(backend, /list_campus_content_moderation/);
assert.match(campusSocialMigration, /create or replace function public\.toggle_community_reaction/i);
assert.match(campusSocialMigration, /create or replace function public\.create_community_poll/i);
assert.match(campusSocialMigration, /create or replace function public\.create_community_reply/i);
assert.match(campusSocialMigration, /You can only follow students from your own university/i);
assert.match(privateCampusMediaMigration, /values \([\s\S]*?'campus-community-media',[\s\S]*?false/i);
assert.match(privateCampusMediaMigration, /split_part\(name,'\/',1\)/i);
assert.match(campusGroupsEventsMarketplaceMigration, /create or replace function public\.review_campus_content/i);
assert.match(campusGroupsEventsMarketplaceMigration, /create policy campus_groups_create_same_campus/i);
assert.match(multiUniversityMigration, /create policy campus_events_create_same_campus/i);
assert.match(multiUniversityMigration, /create policy campus_marketplace_create_same_campus/i);
assert.match(marketplaceReportingMigration, /create or replace function public\.report_campus_marketplace_listing/i);
assert.match(marketplaceReportingMigration, /create or replace function public\.review_campus_marketplace_report/i);
assert.match(socialDirectoryMigration, /list_my_campus_marketplace_listings/i);
assert.match(campusRoleScopingMigration, /add column if not exists campus_role/i);
assert.match(campusRoleScopingMigration, /create table if not exists private\.platform_admins/i);
assert.match(campusRoleScopingMigration, /create or replace function private\.current_campus_role/i);
assert.match(campusRoleScopingMigration, /create or replace function public\.platform_assign_campus_admin/i);
assert.match(campusRoleScopingMigration, /campus_role='admin'/i);
assert.match(rpcPermissionsMigration, /revoke all on function public\.get_my_campus_context\(\) from public, anon/i);
assert.match(rpcPermissionsMigration, /grant execute on function public\.get_my_campus_context\(\) to authenticated/i);
assert.match(rpcPermissionsMigration, /revoke all on function public\.review_campus_account\(uuid,text\) from public, anon/i);
assert.match(rpcPermissionsMigration, /grant execute on function public\.review_campus_staff_membership\(uuid,text\) to authenticated/i);
assert.doesNotMatch(rpcPermissionsMigration, /grant execute on function public\.[^;]+ to anon/i, "campus RPCs are never granted to anon");
assert.match(platformAdminProvisioningMigration, /select 1 from private\.platform_admins pa where pa\.user_id=v_user_id/i);
assert.doesNotMatch(platformAdminProvisioningMigration, /insert into private\.platform_admins/i, "users cannot self-register as platform administrators");
assert.match(platformAdminConsoleMigration, /create or replace function public\.platform_is_admin/i);
assert.match(platformAdminConsoleMigration, /create or replace function public\.platform_list_campus_university_requests/i);
assert.match(platformAdminConsoleMigration, /create or replace function public\.platform_review_campus_university_request/i);
assert.match(platformAdminConsoleMigration, /from private\.platform_admins/i);
assert.match(platformAdminConsoleMigration, /grant execute on function public\.platform_review_campus_university_request\(uuid,text\) to authenticated/i);
assert.doesNotMatch(platformAdminConsoleMigration, /grant execute on function public\.platform_review_campus_university_request\(uuid,text\) to anon/i);
assert.match(nucDirectoryMigration, /Import the 328-entry NUC university roster/i);
assert.match(nucDirectoryMigration, /77 Federal, 69 State, 182 Private/i);
assert.match(nucDirectoryMigration, /https:\/\/enuc\.nuc\.edu\.ng\/nus/i);
assert.match(nucDirectoryMigration, /Kwara State University, Ilorin/i);
assert.match(nucDirectoryMigration, /Aliko Dangote University of Science & Technology, Wudil/i);
assert.match(nucDirectoryMigration, /on conflict \(slug\) do update/i);
assert.doesNotMatch(nucDirectoryMigration, /Pearl University[\s\S]{0,160}crutech\.edu\.ng/i, "do not assign another university's URL to Pearl University");
assert.match(html, /id="community-post-media-alt"/);
assert.match(html, /media\.media_kind === 'video'/);

assert.match(html, /id="platform-admin-nav"/);
assert.match(html, /id="page-platform-admin"/);
assert.match(html, /id="platform-admin-requests-table"/);
assert.match(html, /id="platform-admin-candidates-table"/);
assert.match(backend, /listPlatformUniversityRequests/);
assert.match(backend, /reviewPlatformUniversityRequest/);
assert.match(backend, /listPlatformCampusStaffCandidates/);
assert.match(backend, /assignCampusAdmin/);
assert.match(html, /id="community-post-media"/);
assert.match(backend, /uploadCommunityPostMedia/);
assert.match(backend, /createSignedUrl/);
assert.match(privateCampusMediaMigration, /create policy campus_media_read_same_campus/i);
assert.match(verifiedCampusAdminMigration, /cm\.verification_status='verified'/i);
assert.match(verifiedCampusAdminMigration, /Choose staff whose account and membership are verified/i);
assert.match(verifiedCampusAdminMigration, /grant execute on function public\.platform_assign_campus_admin\(uuid,uuid\) to authenticated/i);
assert.match(legacyCampusBackfillMigration, /where reporter_id = v_user_id\s+and university_id is null/i);
assert.match(legacyCampusBackfillMigration, /where author_id = v_user_id\s+and university_id is null/i);
assert.match(legacyCampusBackfillMigration, /Your university is locked to protect campus privacy/i);



assert.doesNotMatch(html, /national feed/i, "the app must not imply cross-university interaction");



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

console.log(`PASS ${inlineScripts.length} inline script(s), backend, and config parse`);
console.log("PASS browser config uses the Supabase project URL and publishable key only");
console.log("PASS incident reads, submissions, status updates, and dashboard metrics use Supabase data");
console.log("PASS incident data can be refreshed manually, on tab return, and every minute");
console.log("PASS resolve controls are shown only to verified security/admin users");
console.log("PASS emergency-services prototype warning remains visible");
console.log("PASS Android and iOS install metadata and guidance are present");
console.log("PASS Android and Apple launcher icons are valid PNGs at the required sizes");
console.log("PASS offline fallback stores no app, authentication, or incident responses");
