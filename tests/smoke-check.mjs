import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const backend = await readFile(new URL("../campusshield-backend.js", import.meta.url), "utf8");
const planner = await readFile(new URL("../shieldmind-planner.js", import.meta.url), "utf8");
const timetable = await readFile(new URL("../campus-timetable.js", import.meta.url), "utf8");
const shieldmindFunction = await readFile(new URL("../supabase/functions/shieldmind-chat/index.ts", import.meta.url), "utf8");
const paystackWebhookFunction = await readFile(new URL("../supabase/functions/paystack-webhook/index.ts", import.meta.url), "utf8");
const paystackReconcileFunction = await readFile(new URL("../supabase/functions/paystack-reconcile/index.ts", import.meta.url), "utf8");
const shieldmindBillingCheckout = await readFile(new URL("../supabase/functions/shieldmind-billing-checkout/index.ts", import.meta.url), "utf8");
const shieldmindBillingReconcile = await readFile(new URL("../supabase/functions/shieldmind-billing-reconcile/index.ts", import.meta.url), "utf8");
const communityMigration = await readFile(new URL("../supabase/migrations/20261014230000_add_community_privacy_feed.sql", import.meta.url), "utf8");
const usernameSyncMigration = await readFile(new URL("../supabase/migrations/20261014233000_sync_community_username_snapshots.sql", import.meta.url), "utf8");
const usernameAvailabilityMigration = await readFile(new URL("../supabase/migrations/20261014234000_restrict_username_availability.sql", import.meta.url), "utf8");
const usernameLookupRemovalMigration = await readFile(new URL("../supabase/migrations/20261014235000_remove_username_availability_rpc.sql", import.meta.url), "utf8");
const staffProfileMigration = await readFile(new URL("../supabase/migrations/20261014240000_allow_verified_teachers_to_read_profiles.sql", import.meta.url), "utf8");
const campusLifeParityMigration = await readFile(new URL("../supabase/migrations/20261025113000_production_campus_life_parity.sql", import.meta.url), "utf8");
const institutionalBillingMigration = await readFile(new URL("../supabase/migrations/20261025153000_restrict_institutional_billing_to_admins.sql", import.meta.url), "utf8");
const staffIdentityParityMigration = await readFile(new URL("../supabase/migrations/20261025160000_restore_staff_identity_audit_and_platform_rpcs.sql", import.meta.url), "utf8");
const campusPushMigration = await readFile(new URL("../supabase/migrations/20261025203000_campus_push_notifications.sql", import.meta.url), "utf8");
const campusUserFeedbackMigration = await readFile(new URL("../supabase/migrations/20261026122000_add_campus_user_feedback.sql", import.meta.url), "utf8");
const passkeySetupGuide = await readFile(new URL("../docs/PASSKEY_SETUP.md", import.meta.url), "utf8");
const pushSubscriptionsFunction = await readFile(new URL("../supabase/functions/push-subscriptions/index.ts", import.meta.url), "utf8");
const pushDispatchFunction = await readFile(new URL("../supabase/functions/push-dispatch/index.ts", import.meta.url), "utf8");
const pushSecretSetup = await readFile(new URL("../scripts/configure-staging-push-secrets.ps1", import.meta.url), "utf8");
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
assert.doesNotThrow(() => new Function(timetable), "Campus timetable parses");
assert.match(html, /id="campus-timetable-export-calendar"/, "timetable has a calendar export action");
assert.match(timetable, /function downloadCalendar\(\)/, "calendar export handler exists");
assert.match(timetable, /BEGIN:VCALENDAR/);
assert.match(timetable, /END:VCALENDAR/);
assert.match(timetable, /CALENDAR_EXPORT_DAYS = 90/, "calendar export covers the next 90 days");
assert.match(timetable, /escapeCalendarText/);
assert.match(timetable, /foldCalendarLine/);
assert.match(timetable, /occurrence\?\.recurring/, "recurring class occurrences are expanded for calendar export");
assert.match(timetable, /campusEvents\.forEach/, "published campus events are included in the calendar export");
assert.match(html, /<script src="\.\/shieldmind-planner\.js"><\/script>/);
assert.doesNotMatch(html, /campusshield-backend-identity-addon\.js/);
assert.match(planner, /create_my_shieldmind_planner_item/);
assert.match(planner, /list_my_shieldmind_planner_items/);
assert.match(planner, /update_my_shieldmind_planner_item/);
assert.match(planner, /delete_my_shieldmind_planner_item/);

assert.match(paystackWebhookFunction, /select\("id,user_id,plan,billing_period,amount_kobo,currency,status,paid_at"\)/);
assert.match(paystackReconcileFunction, /auth\.getUser\(token\)/, "payment reconciliation validates the caller's access token");
assert.match(paystackReconcileFunction, /\.eq\("user_id", user\.id\)/, "payment references can only be reconciled by their owner");
assert.match(paystackReconcileFunction, /api\.paystack\.co\/transaction\/verify\//, "reconciliation uses Paystack server verification");
assert.match(paystackReconcileFunction, /Number\(tx\?\.amount\) !== order\.amount_kobo/);
assert.match(paystackReconcileFunction, /tx\?\.currency !== order\.currency/);
assert.match(paystackReconcileFunction, /tx\?\.status !== "success"/);
assert.match(paystackReconcileFunction, /last_payment_reference === reference/, "duplicate verification does not extend a plan");
assert.match(paystackReconcileFunction, /expires_at: expiry\.toISOString\(\)/, "subscription expires from stable paid timestamp");
assert.match(html, /const reconcileFunction = stagingBilling \? 'shieldmind-billing-reconcile' : 'paystack-reconcile'/, "checkout return calls the environment-specific server-side reconciliation");
assert.match(html, /id="billing-reconcile-button"/, "users can retry payment verification safely");
assert.match(html, /isStrongPasswordBaseline\(password\)/, "signup and password reset use a stronger password baseline");
assert.match(backend, /Choose a 12\+ character password with uppercase, lowercase, a number, and a symbol/);
assert.match(backend, /function getAuthRedirectUrl\(\)/, "auth confirmation returns to the current app URL");
assert.match(backend, /Open CampusShield through HTTPS or localhost to complete sign-up/, "auth confirmation does not generate unusable file or insecure preview redirects");
assert.equal((backend.match(/emailRedirectTo: getAuthRedirectUrl\(\)/g) || []).length, 2, "signup and confirmation resend use the current app URL");
assert.doesNotMatch(backend, /AUTH_REDIRECT_URL/, "no hard-coded confirmation redirect remains");
assert.doesNotMatch(backend, /AUTH_REDIRECT_URL\s*=\s*["']https:\/\/campusshield-ai\.github\.io/, "staging confirmations must not be hard-coded to production");
assert.match(shieldmindBillingCheckout, /CAMPUSSHIELD_APP_ORIGIN/, "staging checkout supports an exact configured preview origin");
assert.match(shieldmindBillingCheckout, /if\(!isAllowed\)return json\(/, "rejected origins are not reflected in CORS responses");
assert.match(shieldmindBillingCheckout, /isLocalPreview/, "staging checkout supports localhost browser testing");
assert.match(shieldmindBillingCheckout, /sk_test_/, "staging checkout rejects live Paystack credentials");
assert.doesNotMatch(shieldmindBillingCheckout, /student_identity_verifications|membership_status!==\"active\"|verification_status!==\"verified\"/, "purchase eligibility does not depend on campus verification");
assert.match(shieldmindBillingCheckout, /monthly_prepaid/, "checkout identifies the plan as a prepaid monthly term");
assert.match(shieldmindBillingReconcile, /auth\.getUser\(token\)/, "staging reconciliation validates the signed-in owner");
assert.match(shieldmindBillingReconcile, /paystackKey\.startsWith\("sk_test_"\)/, "staging reconciliation rejects live Paystack keys");
assert.match(shieldmindBillingReconcile, /\.eq\("user_id", user\.id\)/, "staging reconciliation only checks the caller's own billing intent");
assert.match(shieldmindBillingReconcile, /api\.paystack\.co\/transaction\/verify\//, "staging reconciliation independently verifies the Paystack transaction");
assert.match(shieldmindBillingReconcile, /last_payment_reference === reference/, "staging reconciliation is idempotent for an activated reference");
assert.match(shieldmindBillingReconcile, /renewal_status: "not_renewing"/, "staging payment activates a prepaid term rather than automatic renewal");
assert.match(html, /stagingBilling \? 'shieldmind-billing-checkout' : 'paystack-initialize'/, "checkout routes to the correct environment function");
assert.match(html, /stagingBilling \? 'shieldmind-billing-reconcile' : 'paystack-reconcile'/, "payment return routes to the correct environment reconciliation function");
assert.match(html, /\^sm_\[a-f0-9\]\{32\}\$\/i/, "staging payment references use the sm_ format");
assert.match(html, /\^csa_\[a-f0-9\]\{32\}\$\/i/, "production payment references keep the csa_ format");

assert.doesNotMatch(paystackWebhookFunction, /if\(order\.status==="paid"\)return json\(\{received:true,duplicate:true\}\)/, "paid orders must reach the verified activation-repair path");
assert.match(paystackWebhookFunction, /\.in\("status",\["pending","failed"\]\)/, "verified success can reconcile an out-of-order failed event");
assert.match(paystackWebhookFunction, /last_payment_reference===reference/, "replayed success must not extend an already activated plan");
assert.match(paystackWebhookFunction, /currentStartedAt>paidAt\.getTime\(\)/, "stale webhooks cannot overwrite a newer subscription");
assert.match(paystackWebhookFunction, /expires_at:expiry\.toISOString\(\)/, "subscription expiry is computed from stable payment time");
assert.match(paystackWebhookFunction, /if\(subError\)return json\(\{error:"Payment verified but activation needs reconciliation"\},503\)/, "activation failures remain retryable");
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
assert.match(staffIdentityParityMigration, /CREATE TABLE IF NOT EXISTS public\.campus_staff_verifications/i);
assert.match(staffIdentityParityMigration, /CREATE TABLE IF NOT EXISTS public\.campus_identity_evidence_checks/i);
assert.match(staffIdentityParityMigration, /CREATE TABLE IF NOT EXISTS public\.student_identity_upload_scans/i);
assert.match(staffIdentityParityMigration, /CREATE OR REPLACE FUNCTION private\.can_read_campus_staff_document/i);
assert.match(staffIdentityParityMigration, /CREATE POLICY student_identity_quarantine_no_browser_access[\s\S]*?AND false/i);
assert.match(staffIdentityParityMigration, /CREATE OR REPLACE FUNCTION public\.submit_campus_staff_verification[\s\S]*?SECURITY INVOKER/i);
assert.match(staffIdentityParityMigration, /CREATE OR REPLACE FUNCTION public\.platform_assign_campus_admin[\s\S]*?SECURITY INVOKER/i);
const staffIdentityPublicWrappers = [...staffIdentityParityMigration.matchAll(/CREATE OR REPLACE FUNCTION public\.[\s\S]*?\$wrapper\$;/g)].map((match) => match[0]);
assert.ok(staffIdentityPublicWrappers.length >= 15, "staff identity migration includes the public RPC wrappers");
assert.ok(staffIdentityPublicWrappers.every((source) => !/SECURITY DEFINER/i.test(source)), "public staff identity RPCs stay invoker wrappers");

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

// Profile dashboard layout, private contact edits, and safely scoped helpdesk alerts.
assert.match(html, /id="profile-settings-contact-form"/);
assert.match(html, /id="profile-settings-contact-phone"/);
assert.match(html, /id="profile-settings-department"/);
assert.match(html, /id="profile-settings-alerts"/);
assert.match(html, /id="profile-settings-mark-all-read"/);
assert.match(html, /function loadProfileSettingsAlerts\(user, backend\)/);
assert.match(html, /currentProfile\?\.role === 'admin' && canModerateCommunity\(\)/);
assert.match(html, /replace\(\/\[\^a-z0-9-\]\+\/g, '-'\)/);
assert.match(html, /listCampusHelpdeskTicketUpdates\(mine\.map/);
assert.match(html, /campusshield\.profile-alerts\.v1\./);
assert.match(html, /auth\.updateUser\(\{ data: metadata \}\)/);
assert.doesNotMatch(html, /showToast\('Contact details saved\.'\)/);

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
assert.match(serviceWorker, /self\.addEventListener\("push"/, "service worker displays background push notifications");
assert.match(serviceWorker, /self\.addEventListener\("notificationclick"/, "notification clicks return to the app safely");
assert.match(backend, /async getPushVapidPublicKey\(\)/, "push public-key retrieval is exposed through the authenticated backend");
assert.match(backend, /async savePushSubscription\(subscription\)/, "device subscriptions are saved through the edge function");
assert.match(backend, /async removePushSubscription\(endpoint\)/, "device unsubscribe is server-side and owner-scoped");
assert.match(backend, /async sendPushTest\(\)/, "users can send a safe push test to their own devices");
const pushEnableHandlerStart = html.indexOf('if (action === "enable") {');
const pushPermissionRequestAt = html.indexOf("Notification.requestPermission()", pushEnableHandlerStart);
const pushKeyFetchAt = html.indexOf("backend.getPushVapidPublicKey()", pushEnableHandlerStart);
assert.ok(pushEnableHandlerStart >= 0 && pushPermissionRequestAt > pushEnableHandlerStart && pushKeyFetchAt > pushPermissionRequestAt, "push permission is requested before any network await so browser user activation is preserved");
for (const pushControl of ["profile-push-enable", "profile-push-test", "profile-push-disable", "profile-push-settings-status"]) {
  assert.ok(html.includes(pushControl), `push settings include ${pushControl}`);
}
assert.match(html, /pushAppUsesStaging\(\)/, "push controls remain hidden from production until configured and verified");
assert.match(html, /Notification\.requestPermission\(\)/, "push permissions are requested after user interaction");
assert.match(pushSubscriptionsFunction, /auth\.getUser\(token\)/, "push subscriptions validate the user session");
assert.match(pushSubscriptionsFunction, /validPushEndpoint/, "push endpoints are validated before storage");
assert.match(pushSubscriptionsFunction, /CAMPUSSHIELD_APP_ORIGIN/, "push subscription CORS uses an explicit preview origin when configured");
assert.match(pushDispatchFunction, /PUSH_DISPATCH_SECRET/, "internal push delivery requires a dispatch secret");
assert.match(pushDispatchFunction, /req\.method === "OPTIONS"/, "push dispatch answers browser CORS preflight");
assert.match(pushDispatchFunction, /CAMPUSSHIELD_APP_ORIGIN/, "push dispatch restricts browser requests to the configured origin");
assert.match(pushDispatchFunction, /const respond = \(body: Record<string, unknown>, status = 200\) => json\(body, status, origin \|\| DEFAULT_ORIGIN\)/, "push API success and error responses allow the request origin");
assert.match(pushDispatchFunction, /equalsConstantTime/, "internal dispatch secret comparison is constant-time");
assert.match(pushSecretSetup, /npx --yes web-push generate-vapid-keys --json/, "staging setup generates VAPID keys locally");
assert.match(pushSecretSetup, /supabase secrets set --project-ref \$projectRef --env-file \$tempEnv/, "staging setup uploads secrets directly to Supabase");
assert.match(pushSecretSetup, /PUSH_DISPATCH_SECRET=/, "setup creates an independent dispatch secret");
assert.match(pushSecretSetup, /CAMPUSSHIELD_APP_ORIGIN=/, "setup records the exact staging origin");
assert.ok(pushSecretSetup.includes("campusshield-ai.github.io"), "setup refuses to configure the production host as staging");
assert.match(pushSecretSetup, /Remove-Item -LiteralPath \$tempEnv -Force/, "temporary secret file is deleted on success or failure");
assert.doesNotMatch(pushSecretSetup, /Write-Host[^\n]*(?:VAPID_PRIVATE_KEY|PUSH_DISPATCH_SECRET|publicKey|privateKey)/i, "setup does not print generated secret values");
assert.match(pushDispatchFunction, /Only a recently sent message can trigger a background notification/, "direct-message push checks a message the caller recently sent");
assert.match(backend, /async sendCampusDirectMessage\(conversationId, body\)[\s\S]*?this\.callPushFunction\("delivery", \{ action: "message", message_id: data \}\)/, "direct-message push is attempted only after a successful staging message write");
assert.match(backend, /if \(isStaging && typeof data === "string"/, "production direct messages do not call staging push functions");
assert.match(pushDispatchFunction, /genericMessages/, "push payloads use generic notification copy rather than private message content");
assert.match(campusPushMigration, /enable row level security/i);
assert.match(campusPushMigration, /using \(false\) with check \(false\)/i, "push tables deny direct client access");
assert.match(campusPushMigration, /revoke all on table public\.campus_push_subscriptions from anon, authenticated/i);
assert.match(campusPushMigration, /revoke all on table public\.campus_push_delivery_events from anon, authenticated/i);
assert.match(campusPushMigration, /grant all on table public\.campus_push_subscriptions to service_role/i);
assert.match(campusPushMigration, /grant all on table public\.campus_push_delivery_events to service_role/i);
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
assert.match(shieldmindFunction, /ShieldMind usage quota check failed/,"usage RPC failures have a safe diagnostic log");
assert.match(shieldmindFunction, /ShieldMind provider billing or usage limit reached/,"provider quota errors are distinguishable in server logs");
assert.match(shieldmindFunction, /ShieldMind provider rate limit returned/,"provider rate limits are logged separately");
assert.match(shieldmindFunction, /ShieldMind provider returned a non-success response/,"provider server errors record status and structured code only");
assert.match(shieldmindFunction, /ShieldMind request failed unexpectedly/,"unexpected runtime failures are visible without logging prompts or secrets");
assert.doesNotMatch(shieldmindFunction, /console\.(?:log|warn|error)\([^\n]*(?:question|providerKey|Authorization|apiKey)/i,"diagnostics do not log prompt text or provider credentials");
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

// Regression: mobile drawer sections stay in a one-column stack, and fixed bottom tabs cannot overlap their labels.
assert.match(html, /The drawer is a single, readable vertical list/);
assert.match(html, /\.sidebar \.nav\{display:flex;flex:0 1 auto;flex-direction:column;align-items:stretch;gap:4px;width:100%;min-width:0;max-height:calc\(100dvh - 190px\);overflow-x:hidden;overflow-y:auto/);
assert.match(html, /\.sidebar \.nav button\{display:flex;flex:0 0 auto;[\s\S]*?width:100%;[\s\S]*?white-space:normal;overflow-wrap:anywhere/);
assert.match(html, /\.mobile-bottom-nav button small\{display:block;max-width:100%;font-size:clamp\(7px,2\.1vw,9px\);line-height:1\.15;white-space:normal;overflow-wrap:anywhere;text-align:center\}/);
console.log("PASS mobile drawer items stack vertically and bottom tabs wrap labels without overlap");

// Pre-launch dashboard improvements: safety actions, verified-alert routing, onboarding,
// CampusPulse entry points, and explicit incident-report confirmation/result messaging.
assert.match(html, /class="quick-action-bar" role="region" aria-label="Emergency and campus quick actions"/);
for (const action of ["Report Incident", "Request Help", "Campus Alerts", "Incident Status"]) {
  assert.ok(html.includes(action), `quick action is present: ${action}`);
}
assert.match(html, /data-quick-action="incident-status"/);
assert.match(html, /id="quick-campus-alerts" type="button" data-page="noticeboard"[^>]*hidden/);
assert.match(html, /class="campus-alerts-strip" aria-labelledby="campus-alerts-title"/);
assert.match(html, /id="campus-alerts-link" data-page="noticeboard" hidden/);
assert.match(html, /if \(\$\('campus-alerts-link'\)\) \$\('campus-alerts-link'\)\.hidden = !verified/);
assert.match(html, /id="campus-welcome-tour"/);
assert.match(html, /maybeShowCampusWelcomeTour\(\)/);
assert.match(html, /localStorage\.setItem\('campusshield-welcome-tour-v1', 'seen'\)/);
assert.match(html, /data-campus-tour-page="report"/);
assert.match(html, /data-campus-tour-page="community"/);
assert.match(html, /\['community','noticeboard'\]\.includes\(page\) && currentProfile\?\.verification_status !== 'verified'/, "first-time tour links keep verified-only routes gated");
assert.match(html, /data-campus-pulse-prompt="question"/);
assert.match(html, /data-campus-pulse-prompt="campus_update"/);
assert.match(html, /data-campus-pulse-prompt="lost_found"/);
assert.match(html, /const reportSummary = \[/);
assert.match(html, /if \(!window\.confirm\(reportSummary\)\)/, "incident submission requires explicit confirmation");
assert.match(html, /This saves a report for review\. It does NOT contact emergency services or dispatch help\./);
assert.match(html, /id="report-submit-status" class="message report-submit-status" role="status" aria-live="polite"/);
assert.match(html, /Report saved successfully to your CampusShield workspace/);
assert.match(html, /Submission cancelled\. Your report has not been sent\./);
assert.match(html, /Incident saved to Supabase\. Emergency services have not been contacted\./);
assert.match(html, /Recent reports &amp; incident status/);
console.log("PASS pre-launch quick actions, campus alerts, first-time tour, CampusPulse prompts, and incident confirmation/result UX");



// Help & Feedback: keep technical bug reports separate from safety incidents and feature ideas.
for (const page of ["feedback-problem","feedback-improvement","feedback-submissions","feedback-admin"]) {
  assert.match(html, new RegExp('id="page-' + page + '"'), `feedback route exists: ${page}`);
  assert.match(html, new RegExp('data-page="' + page + '"'), `feedback navigation exists: ${page}`);
}
assert.match(html, /HELP &amp; FEEDBACK/);
assert.match(html, /id="feedback-problem-nav"/);
assert.match(html, /id="feedback-improvement-nav"/);
assert.match(html, /id="feedback-submissions-nav"/, "My Submissions is available in the account navigation");
assert.match(html, /id="feedback-admin-nav" hidden/, "admin triage is hidden by default");
assert.match(html, /page === 'feedback-admin' && !verifiedAdmin/, "feedback triage route has a verified administrator guard");
assert.match(html, /id="campusProblemForm"/);
assert.match(html, /id="campusImprovementForm"/, "improvement suggestions use a separate form from bug reports");
assert.match(html, /id="campus-feedback-submissions-list"/);
assert.match(html, /id="campus-feedback-admin-queue"/);
assert.match(html, /Your reference number is /, "users receive a feedback reference number");
assert.match(html, /function feedbackElement\(/, "feedback submission text is rendered through DOM textContent");
assert.match(html, /function loadCampusFeedbackAdmin\(/);
assert.match(html, /data-feedback-admin-form/);
assert.match(html, /listCampusFeedbackAdminNotes/);
assert.match(html, /GitHub issue URL \(optional\)/);
assert.match(backend, /async submitCampusFeedback\(/);
assert.match(backend, /async listMyCampusFeedback\(/);
assert.match(backend, /async updateCampusFeedback\(/);
assert.match(backend, /async listCampusFeedbackAssignees\(/);
assert.match(campusUserFeedbackMigration, /CREATE TABLE IF NOT EXISTS public\.campus_user_feedback/i);
assert.match(campusUserFeedbackMigration, /ALTER TABLE public\.campus_user_feedback ENABLE ROW LEVEL SECURITY/i);
assert.match(campusUserFeedbackMigration, /CREATE POLICY campus_user_feedback_read_own_or_authorized_admin/i);
assert.match(campusUserFeedbackMigration, /Only a platform administrator can triage submissions without a campus/);
assert.match(campusUserFeedbackMigration, /CREATE TABLE IF NOT EXISTS public\.campus_user_feedback_admin_notes/i);
assert.match(campusUserFeedbackMigration, /REVOKE ALL ON TABLE public\.campus_user_feedback_admin_notes FROM public, anon, authenticated/i);
assert.match(campusUserFeedbackMigration, /admin_manage_campus_feedback/);
assert.match(campusUserFeedbackMigration, /list_campus_feedback_admin_notes/);
assert.match(campusUserFeedbackMigration, /https:\/\/github\[\.\]com/);
console.log("PASS Help & Feedback submission, reference tracking, campus-scoped admin triage, and GitHub issue validation");

// Responsive optimization regression checks: no page-level overflow and usable tablet controls.
assert.match(html, /id="responsive-optimization-final"/);
assert.match(html, /Responsive optimization: tablet and desktop widths, narrow viewport safety, and robust controls/);
assert.match(html, /@media \(min-width: 761px\) and \(max-width: 1024px\)/);
assert.match(html, /\.topbar-actions\{width:100%;max-width:100%;min-width:0;display:flex;flex-wrap:wrap/);
assert.match(html, /\.table-wrap table\{min-width:580px\}/);
console.log("PASS responsive layout hardening for desktop, tablets, narrow phones, forms, dropdowns, and scroll-contained tables");

// Notification regressions: ensure push taps open the intended screen, and do not churn a valid subscription on delivery failure.
assert.match(pushDispatchFunction, /const notificationUrls: Record<PushKind, string> = \{/);
for (const [kind, destination] of [
  ["timetable_reminder", "./?page=timetable"],
  ["new_message", "./?page=campus-messages"],
  ["campus_announcement", "./?page=noticeboard"],
  ["account_update", "./?page=profile-settings"],
  ["test", "./?page=profile-settings"]
]) {
  assert.ok(pushDispatchFunction.includes(kind + ': "' + destination + '"'), "notification route is defined for " + kind);
}
assert.match(pushDispatchFunction, /url: notificationUrls\[kind\]/, "push payload includes its relevant application route");
assert.doesNotMatch(pushDispatchFunction, /url:\s*"\.\/"\s*,/, "notifications do not all route back to the app root");
assert.match(pushDispatchFunction, /subscriptions_found: 0, no_subscription: true/);
assert.match(pushDispatchFunction, /subscriptions_found: subscriptions\.length, no_subscription: false/);
assert.match(html, /if \(delivered === 0 && result\?\.no_subscription === true\)/, "test repairs only a missing server subscription, not any generic delivery failure");
assert.match(html, /Push delivery was not confirmed\. The subscription was kept/);
assert.match(serviceWorker, /"\.\/?page=timetable"/);
assert.match(serviceWorker, /"\.\/?page=campus-messages"/);
assert.match(serviceWorker, /"\.\/?page=noticeboard"/);
assert.match(serviceWorker, /"\.\/?page=profile-settings"/);
console.log("PASS push destination routing, missing-subscription diagnosis, and non-destructive notification test retries");


// Optional WebAuthn passkeys: use Supabase Auth; no raw biometrics are handled by the app.
assert.match(backend, /experimental: \{ passkey: true \}/, "Supabase passkey APIs are explicitly opted into");
for (const method of ["registerMyPasskey","listMyPasskeys","deleteMyPasskey","signInWithPasskey"]) {
  assert.match(backend, new RegExp("async " + method + "\\("), `passkey backend helper exists: ${method}`);
}
assert.match(html, /id="passkey-signin-button"/);
assert.match(html, /id="profile-passkey-toggle"/);
assert.match(html, /id="profile-passkey-add"/);
assert.match(html, /raw biometric data|raw biometric material|biometric stays with the device/i);
assert.match(html, /Password sign-in remains available|password sign-in remains available|email and password/i);
assert.match(html, /Passkey authentication is not enabled in this Supabase project yet/);
assert.match(passkeySetupGuide, /stable HTTPS staging hostname/);
assert.match(passkeySetupGuide, /never store raw biometric data|must not request, upload, or store raw biometric data/i);
assert.match(passkeySetupGuide, /password fallback remains available/i);
console.log("PASS optional WebAuthn passkey controls, password fallback, and staged relying-party guidance");
