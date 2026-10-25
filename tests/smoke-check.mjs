import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const backend = await readFile(new URL("../campusshield-backend.js", import.meta.url), "utf8");
const planner = await readFile(new URL("../shieldmind-planner.js", import.meta.url), "utf8");
const shieldmindFunction = await readFile(new URL("../supabase/functions/shieldmind-chat/index.ts", import.meta.url), "utf8");
const communityMigration = await readFile(new URL("../supabase/migrations/20261014230000_add_community_privacy_feed.sql", import.meta.url), "utf8");
const usernameSyncMigration = await readFile(new URL("../supabase/migrations/20261014233000_sync_community_username_snapshots.sql", import.meta.url), "utf8");
const usernameAvailabilityMigration = await readFile(new URL("../supabase/migrations/20261014234000_restrict_username_availability.sql", import.meta.url), "utf8");
const usernameLookupRemovalMigration = await readFile(new URL("../supabase/migrations/20261014235000_remove_username_availability_rpc.sql", import.meta.url), "utf8");
const staffProfileMigration = await readFile(new URL("../supabase/migrations/20261014240000_allow_verified_teachers_to_read_profiles.sql", import.meta.url), "utf8");
const campusLifeParityMigration = await readFile(new URL("../supabase/migrations/20261025113000_production_campus_life_parity.sql", import.meta.url), "utf8");
const institutionalBillingMigration = await readFile(new URL("../supabase/migrations/20261025153000_restrict_institutional_billing_to_admins.sql", import.meta.url), "utf8");
const config = await readFile(new URL("../supabase-config.js", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../manifest.webmanifest", import.meta.url), "utf8"));
const serviceWorker = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");
const offlinePage = await readFile(new URL("../offline.html", import.meta.url), "utf8");
const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((match) => match[1]).filter((value) => value.trim());

for (const [index, source] of inlineScripts.entries()) {
  assert.doesNotThrow(() => new Function(source), `inline script ${index + 1} parses`);
}
assert.doesNotThrow(() => new Function(backend), "Supabase backend parses");
assert.doesNotThrow(() => new Function(planner), "ShieldMind planner parses");
assert.match(html, /<script src="\.\/shieldmind-planner\.js"><\/script>/);
assert.doesNotMatch(html, /campusshield-backend-identity-addon\.js/);
assert.match(planner, /create_my_shieldmind_planner_item/);
assert.match(planner, /list_my_shieldmind_planner_items/);
assert.match(planner, /update_my_shieldmind_planner_item/);
assert.match(planner, /delete_my_shieldmind_planner_item/);
console.log("PASS referenced local scripts exist and ShieldMind timetable actions are wired");
assert.match(html, /class="campus-dashboard-hero" aria-labelledby="campus-dashboard-hero-title"/);
assert.match(html, /id="campus-dashboard-hero-title">Welcome back,<br>CampusShield/);
assert.match(html, /data-page="report"><svg[\s\S]*?Report an incident/);
assert.match(html, /data-page="shieldmind"><svg[\s\S]*?Ask the assistant/);
assert.match(html, /Emergency guidance/);
assert.match(html, /Campus service contacts/);
assert.match(html, /\.campus-dashboard-hero\{[\s\S]*?background:[\s\S]*?linear-gradient/);
assert.match(html, /@media\(max-width:700px\)\{\.campus-dashboard-hero\{grid-template-columns:minmax\(0,1fr\)/);
assert.match(html, /id="page-dashboard"/);
assert.match(html, /id="totalStat"/);
assert.match(html, /id="page-campus-contacts"/, "campus contacts destination exists");
assert.match(html, /data-page="campus-contacts"/, "dashboard contacts link points to a supported route");
assert.match(html, /id="campus-contacts-campus-name"/, "contacts page shows selected institution");
assert.match(html, /id="campus-contacts-official-link"/, "contacts page supports official institution website");
assert.match(html, /async function loadCampusContactsPage\(\)/, "contacts destination loads verified directory details");
assert.match(html, /from\('campus_universities'\)[\s\S]*?select\('name,official_website'\)/, "contacts page sources websites from the university directory");
assert.match(html, /if \(button\.tagName === 'A'\) e\.preventDefault\(\)/, "route links do not trigger unwanted hash navigation");
const routeIds = new Set([...html.matchAll(/id="page-([^"]+)"/g)].map((match) => match[1]));
const routeTargets = new Set([...html.matchAll(/data-page="([^"]+)"/g)].map((match) => match[1]));
for (const target of routeTargets) assert.ok(routeIds.has(target), `data-page route ${target} has a matching page`);


assert.doesNotThrow(() => new Function(config), "Supabase config parses");

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

// Campus community and public-identity privacy.
assert.match(html, /id="auth-username"/);

assert.match(html, /id="page-courses"/);
for (const label of [
  'Overview',
  'Academic Life',
  'Courses &amp; Study Resources',
  'CampusPulse &amp; Groups',
  'Events &amp; Campus Services',
  'Opportunities &amp; Scholarships',
  'Safety &amp; Report Incident',
  'ShieldMind AI',
  'Subscriptions &amp; Billing',
  'My Profile &amp; Settings'
]) assert.ok(html.includes(label), `student navigation contains ${label}`);
assert.match(html, /id="page-profile-settings"/);
assert.match(html, /id="profile-settings-email"/);
assert.match(html, /id="nav-staff-heading" hidden/);
assert.match(html, /el\.id === 'community-nav' && page === 'groups'/);
assert.match(html, /el\.id === 'events-services-nav' && \['noticeboard','helpdesk','marketplace'\]/);
assert.match(html, /id="nav-admin-heading" hidden/);
assert.match(html, /function syncNavSectionHeadings\(\)/);
assert.match(html, /!canManageIncidents\(\)/);
assert.match(html, /\['teacher','security','admin'\]\.includes\(currentProfile\?\.role\)/);
assert.match(html, /Teacher Classroom requires a verified campus staff account/);
assert.doesNotMatch(html, /Campus Map &amp; Lost and Found/i);
assert.match(html, /data-page="groups">Explore groups<\/button>/);
assert.match(html, /data-page="noticeboard">Noticeboard<\/button>/);
assert.match(html, /data-page="helpdesk">Helpdesk<\/button>/);
assert.match(html, /data-page="marketplace">Marketplace<\/button>/);
// Individual plan prices and payment actions live only on Subscriptions & billing.
// The ShieldMind AI page keeps plan status and a navigation link, without a duplicate price grid.
const shieldmindPageStart = html.indexOf('<section class="page" id="page-shieldmind">');
const billingPageStart = html.indexOf('<section class="page" id="page-billing">');
assert.ok(shieldmindPageStart >= 0 && billingPageStart > shieldmindPageStart, "ShieldMind and billing pages exist in order");
const shieldmindPageMarkup = html.slice(shieldmindPageStart, billingPageStart);
assert.match(shieldmindPageMarkup, /id="shieldmind-plan-status"/);
assert.match(shieldmindPageMarkup, /data-page="billing">View plans &amp; subscriptions<\/button>/);
assert.doesNotMatch(shieldmindPageMarkup, /data-shieldmind-buy=/, "AI page has no separate purchase actions");
assert.doesNotMatch(shieldmindPageMarkup, /<div class="shieldmind-prices">/, "AI page has no duplicate price grid");
assert.match(html.slice(billingPageStart), /ShieldMind AI · Individual plans/);
assert.match(html.slice(billingPageStart), /data-billing-plan="starter"/);
assert.match(html.slice(billingPageStart), /id="institutional-billing-panel" hidden/);
assert.match(html, /id="institutional-billing-panel" hidden/);
assert.match(html, /function canManageInstitutionalBilling\(\)/);
assert.match(html, /if \(kind === 'institution' && !canManageInstitutionalBilling\(\)\)/);
assert.match(html, /if \(!canManageInstitutionalBilling\(\)\)/);
assert.match(institutionalBillingMigration, /DROP POLICY IF EXISTS campus_institutional_billing_requests_select_own/i);
assert.match(institutionalBillingMigration, /profile\.role = 'admin'/i);
assert.match(institutionalBillingMigration, /profile\.verification_status = 'verified'/i);
assert.match(institutionalBillingMigration, /requester_id = \(SELECT auth\.uid\(\)\)/i);
assert.match(institutionalBillingMigration, /public\.platform_is_admin\(\)/i);
assert.match(html, /id="campus-course-form"/);
assert.match(html, /id="campus-resource-form"/);
assert.match(html, /data-opportunity-bookmark/);
assert.match(html, /loadCampusCoursesPage\(\)/);
assert.match(backend, /async listCampusCourses\(\)/);
assert.match(backend, /async suggestCampusCourse\(input\)/);
assert.match(backend, /async listCampusCourseResources\(\)/);
assert.match(backend, /async suggestCampusCourseResource\(input\)/);
assert.match(backend, /async listOpportunityBookmarks\(\)/);
assert.match(backend, /async saveCampusOpportunity\(opportunityId\)/);
assert.match(campusLifeParityMigration, /create table if not exists public\.campus_courses/i);
assert.match(campusLifeParityMigration, /create table if not exists public\.campus_course_resources/i);
assert.match(campusLifeParityMigration, /create table if not exists public\.campus_opportunity_bookmarks/i);
assert.match(campusLifeParityMigration, /alter table public\.community_posts add column if not exists university_id/i);
assert.match(campusLifeParityMigration, /community_posts_read_same_campus/i);
assert.match(campusLifeParityMigration, /verified_account_required_for_interactions/i);
assert.match(campusLifeParityMigration, /revoke all on table public\.shieldmind_planner_items from public, anon, authenticated/i);
assert.match(campusLifeParityMigration, /security invoker/i);
assert.match(campusLifeParityMigration, /private\.current_user_has_verified_campus_access\(\)/i);
assert.doesNotMatch(campusLifeParityMigration, /grant select, insert, update, delete on table public\.campus_classrooms to authenticated/i);

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

console.log(`PASS ${inlineScripts.length} inline script(s), backend, and config parse`);
console.log("PASS browser config uses the Supabase project URL and publishable key only");
console.log("PASS campus course/resource directory, opportunity bookmarks, and campus-scoped migration contracts");
console.log("PASS incident reads, submissions, status updates, and dashboard metrics use Supabase data");
console.log("PASS incident data can be refreshed manually, on tab return, and every minute");
console.log("PASS resolve controls are shown only to verified security/admin users");
console.log("PASS emergency-services prototype warning remains visible");
console.log("PASS Android and iOS install metadata and guidance are present");
console.log("PASS Android and Apple launcher icons are valid PNGs at the required sizes");
console.log("PASS offline fallback stores no app, authentication, or incident responses");

// Academic Life hub: reuse the existing access-controlled campus features.
assert.match(html, /id="page-academics"/);
assert.match(html, /data-page="academics"/);
assert.match(html, /academics:'Academic Life'/);
assert.match(html, /TIMETABLE &amp; DEADLINES/);
assert.match(html, /data-academic-focus="planner"/);
assert.match(html, /button\.dataset\.academicFocus === 'planner'/);
assert.match(html, /shieldmind-planner-panel/);
assert.match(html, /scrollIntoView/);
assert.match(html, /prefers-reduced-motion: reduce/);
assert.match(html, /id="campus-dashboard-helpdesk"/);
assert.match(html, /id="campus-dashboard-helpdesk-count"/);
assert.match(html, /backend\.listCampusHelpdeskTickets\(\)\.catch\(\(\) => null\)/);
assert.match(html, /row\.created_by === results\[4\]\.id/);
assert.match(html, /Helpdesk status is temporarily unavailable/);


assert.match(html, /data-page="classroom"/);
assert.match(html, /data-page="groups"/);
assert.match(html, /data-page="noticeboard"/);
assert.match(html, /data-page="events"/);
assert.match(html, /data-page="opportunities"/);
assert.match(html, /data-page="helpdesk"/);
assert.match(html, /data-page="community"/);
assert.match(html, /data-page="marketplace"/);

// ShieldMind: provider 429/billing errors should be actionable rather than hidden
// behind the generic chat failure message.
assert.match(backend, /responseMessage = ""/);
assert.match(backend, /response\.clone\(\)\.json\(\)/);
assert.match(html, /const friendlyMessage=detail/);
for (const providerQuotaCode of [
  "insufficient_quota",
  "billing_hard_limit_reached",
  "credit_balance_exhausted",
  "organization_usage_limit_exceeded",
  "organization_spend_limit_exceeded",
  "project_spend_limit_exceeded"
]) assert.ok(shieldmindFunction.includes(`"${providerQuotaCode}"`), `ShieldMind classifies ${providerQuotaCode}`);
assert.match(shieldmindFunction, /"Retry-After": retryAfter/);
assert.match(shieldmindFunction, /your ShieldMind account limit has not been reached/i);
console.log("PASS ShieldMind surfaces safe provider rate-limit and billing errors");


// Mobile workspace layout: protect narrow screens from horizontal overflow and cramped controls.
assert.match(html, /Mobile-first layout hardening: prevent clipped headers, horizontal overflow, and cramped controls/);
assert.match(html, /html,body\{min-width:320px\}/);
assert.match(html, /\.topbar-actions\{flex:1 1 100%;width:100%;justify-content:flex-start;gap:7px\}/);
assert.match(html, /\.field input,\.field select,\.field textarea,\.institution-picker-field input\[list\]\{width:100%;min-height:46px;padding:11px 12px;font-size:16px\}/);
assert.match(html, /env\(safe-area-inset-bottom\)/);
assert.match(html, /\.table-wrap\{max-width:100%;overflow-x:auto\}/);
console.log("PASS mobile workspace, forms, navigation header, tables, and safe-area layout safeguards");


// Mobile drawer must use a vertical, full-width navigation list rather than a horizontal strip.
assert.match(html, /Mobile drawer correction: navigation is a vertical list, never a horizontal strip/);
assert.match(html, /\.sidebar \.nav\{\s*display:flex!important;\s*flex:0 0 auto;\s*flex-direction:column!important/);
assert.match(html, /\.sidebar \.nav button,\s*\.app\.sidebar-collapsed \.sidebar \.nav button\{[\s\S]*?width:100%;[\s\S]*?white-space:normal/);
assert.match(html, /\.sidebar-toggle\{display:none!important\}/);
console.log("PASS mobile drawer navigation remains vertical and full width");
