import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const htmlMarkup = await readFile(new URL("../index.html", import.meta.url), "utf8");
const appScript = await readFile(new URL("../campusshield-app.js", import.meta.url), "utf8");
const html = htmlMarkup + "\\n" + appScript;
const dashboardUpgradeCss = await readFile(new URL("../campus-dashboard-upgrade.css", import.meta.url), "utf8");
const css = dashboardUpgradeCss;
const dashboardUpgradeJs = await readFile(new URL("../campus-dashboard-upgrade.js", import.meta.url), "utf8");
const i18nScript = await readFile(new URL("../campusshield-i18n.js", import.meta.url), "utf8");
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
const pushSubscriptionsFunction = await readFile(new URL("../supabase/functions/push-subscriptions/index.ts", import.meta.url), "utf8");
const pushDispatchFunction = await readFile(new URL("../supabase/functions/push-dispatch/index.ts", import.meta.url), "utf8");
const pushSecretSetup = await readFile(new URL("../scripts/configure-staging-push-secrets.ps1", import.meta.url), "utf8");
const config = await readFile(new URL("../supabase-config.js", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../manifest.webmanifest", import.meta.url), "utf8"));
const serviceWorker = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");
const campusServiceDirectory = await readFile(new URL("../campus-service-directory.js", import.meta.url), "utf8");
const campusServiceCrawler = await readFile(new URL("../supabase/functions/campus-service-directory-crawler/index.ts", import.meta.url), "utf8");
const campusServiceDirectoryMigration = await readFile(new URL("../supabase/migrations/20261026210000_campus_university_service_directory.sql", import.meta.url), "utf8");
const profileIdentityMigration = await readFile(new URL("../supabase/migrations/20261026223000_profile_identity_owner_only_crawler.sql", import.meta.url), "utf8");
const profileAvatarStorageMigration = await readFile(new URL("../supabase/migrations/20261026230000_fix_profile_avatar_storage_policy_permissions.sql", import.meta.url), "utf8");
const profileAvatar20MbMigration = await readFile(new URL("../supabase/migrations/20261027001000_profile_avatar_20mb.sql", import.meta.url), "utf8");
const profileAvatarPathFixMigration = await readFile(new URL("../supabase/migrations/20261027030000_fix_profile_avatar_path_validation.sql", import.meta.url), "utf8");
const profileAvatarRlsFixMigration = await readFile(new URL("../supabase/migrations/20261027032000_fix_profile_avatar_upload_rls_size_check.sql", import.meta.url), "utf8");
const studentIdentityPathFixMigration = await readFile(new URL("../supabase/migrations/20261027052000_fix_student_identity_uuid_path_regex.sql", import.meta.url), "utf8");
const requestedRoleRpcMigration = await readFile(new URL("../supabase/migrations/20261027062000_add_save_my_requested_role_rpc.sql", import.meta.url), "utf8");
const pastQuestionMigration = await readFile(new URL("../supabase/migrations/20261027230000_past_questions_exam_prep.sql", import.meta.url), "utf8");
const pastQuestionFunction = await readFile(new URL("../supabase/functions/past-question-practice/index.ts", import.meta.url), "utf8");
const pastQuestionScript = await readFile(new URL("../past-question-practice.js", import.meta.url), "utf8");
const pastQuestionCoverageMigration = await readFile(new URL("../supabase/migrations/20261028023527_past_question_nationwide_coverage.sql", import.meta.url), "utf8");
const offlinePage = await readFile(new URL("../offline.html", import.meta.url), "utf8");
const privacyPage = await readFile(new URL("../privacy.html", import.meta.url), "utf8");
const termsPage = await readFile(new URL("../terms.html", import.meta.url), "utf8");
const contactPage = await readFile(new URL("../contact.html", import.meta.url), "utf8");
const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((match) => match[1]).filter((value) => value.trim());

assert.ok(html.includes('href="./campus-dashboard-upgrade.css"'), "dashboard upgrade stylesheet is loaded");
assert.ok(html.includes('src="./campus-dashboard-upgrade.js" defer'), "dashboard upgrade behavior is loaded after the workspace markup");
assert.match(dashboardUpgradeCss, /data-theme="dark"/, "dashboard supports an explicit dark theme");
assert.match(dashboardUpgradeCss, /prefers-reduced-motion:reduce/, "dashboard respects reduced-motion preferences");
assert.match(dashboardUpgradeJs, /campusshield_theme/, "theme preference is persisted per device");
assert.match(dashboardUpgradeJs, /campus-global-search/, "global campus search is wired");
assert.match(dashboardUpgradeJs, /student-shortcuts/, "student dashboard shortcuts are wired");
assert.doesNotThrow(() => new Function(dashboardUpgradeJs), "dashboard upgrade script parses");
assert.match(html, /id="login-features"/, "landing navigation has a Features destination");
assert.match(html, /id="login-about"/, "landing navigation has an About destination");
assert.match(html, /id="auth-helper"/, "landing Help navigation has a destination");
assert.match(html, /class="login-footer-links"[\s\S]*?href="\.\/privacy\.html"/, "landing footer links to Privacy");
assert.match(html, /class="login-footer-links"[\s\S]*?href="\.\/terms\.html"/, "landing footer links to Terms");
assert.match(html, /class="login-footer-links"[\s\S]*?href="\.\/contact\.html"/, "landing footer links to Contact");
assert.match(privacyPage, /<title>Privacy Policy \| CampusShield AI<\/title>/, "privacy policy page exists and is titled");
assert.match(privacyPage, /Development-stage notice/, "privacy page warns against using real sensitive data in previews");
assert.match(termsPage, /<title>Terms of Use \| CampusShield AI<\/title>/, "terms page exists and is titled");
assert.match(termsPage, /does not automatically contact or dispatch emergency services/i, "terms page states the emergency limitation");
assert.match(contactPage, /mailto:campusshieldaitechnologies@gmail\.com/, "contact page provides the configured support email");
assert.match(contactPage, /https:\/\/x\.com\/CampusShieldAI/, "contact page links the configured X profile");
assert.match(contactPage, /https:\/\/www\.instagram\.com\/campusshieldai\//, "contact page links the configured Instagram profile");
assert.match(contactPage, /https:\/\/www\.linkedin\.com\/in\/campusshield-ai-technologies-857b83446/, "contact page links the configured LinkedIn profile");
assert.doesNotMatch(contactPage, /href=["'][^"']*(?:tiktok\.com|youtube\.com)[^"']*["']/i, "Contact page does not link nonexistent TikTok or YouTube accounts");
assert.doesNotMatch(html, /href=["'][^"']*(?:tiktok\.com|youtube\.com)[^"']*["']/i, "Landing page does not link nonexistent TikTok or YouTube accounts");
assert.match(contactPage, /does not currently maintain official TikTok or YouTube pages/i, "Contact page accurately states that TikTok and YouTube pages do not exist");
assert.ok(html.includes('<select id="campusshield-language"'), "language picker is a selectable control");
assert.ok(html.includes('<option value="yo" lang="yo">Yorùbá</option>'), "language picker includes Yoruba");
assert.ok(html.includes('<option value="ha" lang="ha">Hausa</option>'), "language picker includes Hausa");
assert.ok(html.includes('<option value="ig" lang="ig">Igbo</option>'), "language picker includes Igbo");
assert.match(htmlMarkup, /<script src="\\.\\/campusshield-i18n\\.js" defer><\\/script>/, "language bundle is deferred in dependency order");
assert.doesNotThrow(() => new Function(i18nScript), "multilingual UI bundle parses");
assert.ok(i18nScript.includes('localStorage.setItem("campusshield_language", locale)'), "language choice is saved on this device");
assert.match(i18nScript, /"fr"/, "French is available");
assert.match(i18nScript, /"es"/, "Spanish is available");
assert.match(i18nScript, /"pt"/, "Portuguese is available");
assert.match(i18nScript, /"sw"/, "Swahili is available");
assert.match(i18nScript, /"ar"/, "Arabic is available");
assert.match(i18nScript, /"zh"/, "Simplified Chinese is available");
assert.match(privacyPage, /registered legal entity name/, "privacy page discloses that the legal entity name is not verified");
assert.match(privacyPage, /Nigeria Data Protection Act 2023/, "privacy policy references applicable Nigerian data-protection law without claiming compliance");
assert.ok(privacyPage.includes("https://ndpc.gov.ng/ndp-act-2023/"), "privacy policy links to the official NDPC Act resource");
assert.ok(html.includes('class="app-legal-footer"') && html.includes('href="./privacy.html">Privacy Policy</a>'), "signed-in workspace footer links to the canonical Privacy Policy page");
assert.ok(html.includes('href="./terms.html">Terms of Use</a>'), "signed-in workspace footer links to the canonical Terms page");
assert.ok(html.includes('href="./contact.html">Contact support</a>'), "signed-in workspace footer links to the canonical Contact page");
assert.match(contactPage, /on-site form is not connected/i, "contact page does not pretend a web form sends messages");
assert.match(contactPage, /press Send/, "contact page explains that the user must send the drafted email themselves");
assert.match(privacyPage, /No fixed, time-based retention schedule was verified/, "privacy page avoids making up retention periods");
assert.match(privacyPage, /GitHub Pages and Vercel/, "privacy page identifies hosting providers present in the deployment");
assert.match(privacyPage, /Supabase/, "privacy page identifies the database/auth/storage provider");
assert.match(privacyPage, /OpenAI/, "privacy page identifies the configured ShieldMind AI provider");
assert.match(privacyPage, /Paystack/, "privacy page identifies the optional payment provider");
assert.match(termsPage, /public-facing project name should not be treated as proof of company registration/, "terms page does not falsely assert a registered legal entity");

assert.match(html, /id="signup-verification-guidance"/, "signup explains role-specific identity verification");
assert.match(html, /This upload step is for student accounts|Make verification simple: enter your matric number/, "student identity upload is clearly student-specific");
assert.match(html, /Matriculation \/ student number \*/, "student identity form clearly requires the matriculation number");
assert.match(html, /Student ID card photo or PDF \*/, "student identity form requires a student ID image or PDF");
assert.match(html, /id="identity-fee-receipt"[^>]*accept="image\/jpeg,image\/png,application\/pdf,\.jpg,\.jpeg,\.png,\.pdf"[^>]*>/, "school-fee receipt field accepts only supported evidence formats");
assert.match(html, /School-fee receipt \(optional\)/, "school-fee receipt is optional rather than a signup blocker");
assert.match(html, /cover bank\/card details and unrelated information on receipts/, "receipt guidance protects unrelated financial information");

assert.match(html, /id="campusStaffVerificationForm"/, "staff have a separate identity evidence form");
assert.match(html, /Staff identity verification/, "staff verification workflow is named for non-student applicants");
assert.match(html, /campusshield-verification-responsive-fix/, "responsive verification layout override is present");
assert.ok(html.includes('#login-screen .signup-student-identity-panel>.heading{') && html.includes('display:block!important'), "identity heading is stacked instead of inheriting the workspace's side-by-side heading");
assert.ok(html.includes('@media(max-width:820px)') && html.includes('#studentIdentityForm{grid-template-columns:minmax(0,1fr)'), "identity fields stack before phone/tablet content becomes cramped");
assert.ok(i18nScript.includes('EXTRA_TRANSLATIONS[currentLocale()]'), "additional language translations are available");
assert.match(i18nScript, /studentVerificationGuide/, "student verification guidance is translated");
assert.match(i18nScript, /staffVerificationGuide/, "staff verification guidance is translated");
assert.ok(i18nScript.includes('["ar","fa","ur"].includes(locale)'), "right-to-left language direction is configured");
assert.equal((html.match(/<option value="(?:en|yo|ha|ig|fr|es|pt|sw|ar|zh|de|hi|ja|ko|ru|bn|id|it|nl|tr|ur|vi|th|fil|fa|pl)"/g)||[]).length, 26, "language menu contains 26 distinct language options");
assert.ok(i18nScript.includes('["de","Deutsch","Deutsch"]'), "German is selectable");
assert.ok(i18nScript.includes('["hi","हिन्दी","हिन्दी"]'), "Hindi is selectable");
assert.ok(i18nScript.includes('["ja","日本語","日本語"]'), "Japanese is selectable");
assert.ok(i18nScript.includes('["ur","اردو","اردو"]'), "Urdu is selectable");



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
assert.match(backend, /emailRedirectTo: getAuthRedirectUrl\(\)/, "signup and resend use the current app URL for confirmation");
assert.match(html, /const metadataRequestedRole = String\(user\.user_metadata\?\.requested_role \|\| ''\)\.trim\(\)\.toLowerCase\(\)/, "confirmation return restores requested role from the authenticated account metadata");
assert.match(html, /const pendingRole = \['student', 'teacher'\]\.includes\(metadataRequestedRole\)[\s\S]*?\? metadataRequestedRole[\s\S]*?: storedRequestedRole/, "account metadata takes precedence over stale role state in browser storage");
assert.match(html, /const user = await backend\.getCurrentUser\(\);[\s\S]*?const metadataRequestedRole/, "sign-in resolves the authenticated account before restoring its requested role");
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
assert.match(html, /id="campus-dashboard-hero-title">Welcome back,<br><span id="campus-dashboard-welcome-name">CampusShield<\/span>/, "dashboard welcome heading has a safely updated profile-name target");
assert.match(html, /function updateDashboardWelcomeName\(value\)/, "dashboard welcome can be updated from the saved profile name");
assert.match(html, /updateDashboardWelcomeName\(currentProfile\.display_name\)/, "saving a profile refreshes the dashboard welcome name");
assert.match(html, /async function syncDashboardProfileIdentity\(\)/, "dashboard identity sync loads the saved profile identity");
assert.match(html, /syncDashboardProfileIdentity\(\)\.catch\(\s*\(\)\s*=>\s*\{\}\s*\)/, "workspace entry refreshes the saved avatar and welcome name");
assert.match(html, /await renderProfileAvatar\(backend, saved\.avatar_path\)/, "dashboard avatar uses a private signed URL for the saved profile photo");
assert.match(html, /bucket\.download\(String\(avatarPath\)\)/, "private avatar renderer tries authenticated Storage download first");
assert.match(html, /createSignedUrl\(String\(avatarPath\), 3600\)/, "private avatar renderer retains a signed URL fallback");
assert.match(html, /profileAvatarRenderTokens/, "avatar rendering guards against stale asynchronous image responses");
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
assert.match(html, /function getWorkspaceAccountType\(profile = currentProfile\)/, "workspace classification is explicit");
assert.match(html, /if \(\['admin','security','teacher'\]\.includes\(actualRole\)\) return actualRole/, "assigned elevated roles override requested onboarding metadata");
assert.match(html, /function renderRoleAccessSummary\(metadata = \{\}\)/, "signed-in users receive a role and verification access summary");
assert.match(html, /function updateStaffPositionAccessPreview\(\)/, "staff position chooser previews post-approval access");
assert.match(html, /Security staff: this title alone does not unlock incident management/, "security job title does not grant the security console");
assert.match(html, /this title and the campus-admin request checkbox do not grant campus administrator powers/, "leadership titles and admin requests do not self-grant admin permissions");
assert.match(html, /role==='security' && campusOk/, "security operations require the assigned security role and verified campus membership");
assert.match(html, /role==='teacher' && campusOk/, "staff workspace requires the assigned teacher role and verified campus membership");
assert.ok((html.match(/\$\('staff-verification-nav'\)\.hidden = !isTeacherAccount\(\);/g) || []).length >= 2, "pending staff applicants can reach their own verification page");
for (const position of ["Vice-Chancellor","Deputy Vice-Chancellor","Registrar","Bursar","University Librarian","Dean","Head of Department","Professor","Lecturer","Administrative staff","Security staff","Other university employee"]) {
  assert.ok(html.includes("<option>" + position + "</option>"), "staff position option is present: " + position);
}

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
assert.match(html, /id="past-questions-nav"/, "Past Questions & Exam Prep has a dedicated campus navigation entry");
assert.match(html, /!window\.PastQuestionPractice\?\.isEnabled\?\.\(\)/, "production navigation blocks the staging-only feature until production schema is approved");
assert.match(pastQuestionScript, /STAGING_PROJECT_REF = "hywcpnoqqhxvujnimhxl"/, "new feature is gated to the staging Supabase project");
assert.match(pastQuestionScript, /window\.PastQuestionPractice = \{ load, isEnabled \}/, "navigation can verify feature environment before routing");
assert.match(html, /id="pq-source-guide"/, "past-question page explains how authentic papers are sourced");
assert.match(html, /id="pq-university-directory"/, "past-question page has a nationwide university directory");
assert.match(html, /https:\/\/enuc\.nuc\.edu\.ng\/nus/, "students can verify institutions through the official NUC directory");
assert.match(html, /id="pq-university-search"/, "nationwide directory supports fast university search");
assert.match(html, /id="pq-university-ownership"/, "nationwide directory filters federal, state and private universities");
assert.match(html, /id="pq-university-state"/, "nationwide directory filters by state");
assert.match(html, /pq-nationwide-responsive/, "responsive layout hardening is included");
assert.match(pastQuestionScript, /listCampusUniversities\(\)/, "directory uses the active campus institution registry");
assert.match(pastQuestionScript, /get_past_question_coverage/, "directory reads aggregate approved-paper coverage");
assert.match(pastQuestionScript, /data-pq-directory-more/, "directory incrementally renders results for performance");
assert.match(pastQuestionScript, /verified campus membership/, "university selection cannot bypass campus access controls");
assert.match(pastQuestionCoverageMigration, /security definer/i, "coverage function executes as a controlled aggregate");
assert.match(pastQuestionCoverageMigration, /rights_confirmed is true/i, "coverage only counts permission-confirmed papers");
assert.match(pastQuestionCoverageMigration, /p\.status = 'approved'/i, "coverage only counts approved papers");
assert.match(pastQuestionCoverageMigration, /p\.source_type <> 'ai_generated'/i, "coverage excludes AI-generated questions");
assert.match(pastQuestionCoverageMigration, /grant execute on function public\.get_past_question_coverage\(\) to anon, authenticated/i, "only aggregate coverage is public to app clients");
assert.match(html, /https:\/\/legacy\.babcock\.edu\.ng\/library/, "past-question page links to Babcock's official library");
assert.match(html, /https:\/\/elibrary\.babcock\.edu\.ng\//, "past-question page links to Babcock's official e-library");
assert.match(html, /authorized campus reviewer approves them/, "past-question submissions remain private until review");
assert.match(html, /AI practice set is not an authentic past paper/, "AI practice is clearly distinguished from authentic papers");
assert.match(pastQuestionScript, /No reviewed past papers yet/, "empty library explains the initial zero-paper state");
assert.match(pastQuestionScript, /data-pq-empty-contribute/, "empty library offers an actionable contribution path");
assert.match(pastQuestionScript, /data-pq-empty-practice/, "empty library offers an AI-practice path");
assert.match(html, /id="page-past-questions"/, "Past Questions & Exam Prep page is included");
assert.match(html, /Babcock-first pilot/i, "Babcock University is retained as an early pilot while the directory is nationwide");
assert.match(html, /data-page="past-questions"/, "past-question navigation is role-workspace navigation");
assert.match(html, /id="pq-ai-form"/, "students can request AI-generated practice questions");
assert.match(html, /id="pq-submit-form"/, "students can submit permitted past papers for review");
assert.match(html, /id="pq-quiz-form"/, "the exam simulator has an answer submission form");
assert.match(html, /id="pq-reviewer-tools" hidden/, "review and marking-key tools are hidden by default");
assert.match(html, /id="pq-topic-weaknesses"/, "practice results include topic-level revision suggestions");
assert.match(html, /<script src="\.\/past-question-practice\.js"><\/script>/, "past-question UI logic is loaded");
assert.doesNotThrow(() => new Function(pastQuestionScript), "past-question UI script parses");
assert.match(pastQuestionMigration, /create table if not exists public\.past_question_papers/i);
assert.match(pastQuestionMigration, /create table if not exists public\.past_question_items/i);
assert.match(pastQuestionMigration, /create table if not exists public\.past_question_answer_keys/i);
assert.match(pastQuestionMigration, /create table if not exists public\.practice_attempts/i);
assert.match(pastQuestionMigration, /create table if not exists public\.practice_answers/i);
assert.match(pastQuestionMigration, /private\.current_user_has_verified_campus_access\(\)/i, "library and attempt access require verified campus access");
assert.match(pastQuestionMigration, /public\.past_question_exam_prep_access\(\)/i, "Edge Functions can enforce the database's full verified-access rule");
assert.match(pastQuestionFunction, /rpc\("past_question_exam_prep_access"\)/, "AI-generated content requires the database eligibility check");
assert.doesNotMatch(pastQuestionFunction, /profile\.university_id|profile\.department/, "Edge Function uses the actual profile and membership schema");
assert.match(pastQuestionMigration, /past_question_answer_keys_reviewer_only/i, "answer keys are reviewer-protected");
assert.match(pastQuestionMigration, /grant select on public\.practice_answers to authenticated/i, "students can read only their RLS-filtered results");
assert.doesNotMatch(pastQuestionMigration, /grant select on public\.past_question_answer_keys to anon/i, "answer keys are never public");
assert.match(pastQuestionMigration, /values \('past-question-files','past-question-files',false,10485760/i, "paper files use a private 10 MiB bucket");
assert.match(pastQuestionMigration, /add_past_question_item_with_answer_key/i, "reviewers save questions and answer keys atomically");
assert.match(pastQuestionFunction, /auth\.getUser\(\)/, "exam-prep Edge Function validates the signed-in user");
assert.match(pastQuestionFunction, /membership_status.*active/i, "exam-prep Edge Function checks active campus membership");
assert.match(pastQuestionFunction, /OPENAI_API_KEY/, "AI practice uses the configured ShieldMind provider on the server");
assert.match(pastQuestionFunction, /source_type: "ai_generated"/, "generated questions are stored as explicitly AI-generated");
assert.match(pastQuestionFunction, /past_question_answer_keys/, "server-side marking accesses protected answer keys");
assert.match(pastQuestionFunction, /marking_status: "needs_review"/, "unavailable written marking is flagged, not fabricated");
assert.doesNotMatch(pastQuestionScript, /from\(["']past_question_answer_keys["']\)/, "browser code never queries protected answer keys");
assert.match(pastQuestionScript, /functions\.invoke\("past-question-practice"/, "AI generation and marking use the authenticated Edge Function");
assert.match(pastQuestionScript, /rights_confirmed: true/, "paper sharing requires an explicit permission attestation");

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
assert.match(html, /function pushAppSupportsConfiguredProject\(\)/, "push controls are enabled only for explicitly configured CampusShield environments");
assert.match(html, /hostname === "fvgtnujjnvdkhzqqcaqe\.supabase\.co"/, "production Supabase project is recognized for push notifications");
assert.match(html, /hostname === "hywcpnoqqhxvujnimhxl\.supabase\.co"/, "staging Supabase project is recognized for push notifications");
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
assert.match(shieldmindFunction, /ShieldMind image quota check failed/, "image quota failures are attributed without logging user content");
assert.match(shieldmindFunction, /errorName: _error instanceof Error/, "unexpected runtime diagnostics record only an error class");
assert.doesNotMatch(shieldmindFunction, /console\.(?:log|warn|error)\([^\n]*(?:question|messages|providerKey|Authorization|data_base64)/i, "diagnostic logs exclude prompts, secrets, and uploaded-image payloads");
assert.match(shieldmindFunction, /ShieldMind provider billing or usage limit reached/,"provider quota errors are distinguishable in server logs");
assert.match(shieldmindFunction, /ShieldMind provider rate limit returned/,"provider rate limits are logged separately");
assert.match(shieldmindFunction, /ShieldMind provider returned a non-success response/,"provider server errors record status and structured code only");
assert.match(shieldmindFunction, /ShieldMind request failed unexpectedly/,"unexpected runtime failures are visible without logging prompts or secrets");
assert.doesNotMatch(shieldmindFunction, /console\.(?:log|warn|error)\([^\n]*(?:question|providerKey|Authorization|apiKey)/i,"diagnostics do not log prompt text or provider credentials");
assert.match(shieldmindFunction, /your ShieldMind account limit has not been reached/i);
console.log("PASS ShieldMind surfaces safe provider rate-limit and billing errors");


// Mobile workspace layout: protect narrow screens from horizontal overflow and cramped controls.
assert.match(html, /Mobile-first layout hardening: prevent clipped headers, horizontal overflow, and cramped controls/);
assert.match(htmlMarkup, /<script src="\\.\\/campusshield-app\\.js" defer><\\/script>/, "large app code is external and deferred instead of parser-blocking inline JS");
assert.doesNotThrow(() => new Function(appScript), "externalized main application bundle parses");
assert.match(appScript, /function canManageIncidents\\(\\)/, "external application bundle retains role-gated incident controls");
assert.match(css, /CampusShield cross-device layout guardrails and responsive fit pass/, "global cross-device layout guardrails are loaded");
assert.match(css, /@media \\(max-width: 420px\\)/, "small-phone layout has dedicated responsive rules");
assert.match(css, /@media \\(min-width: 1441px\\)/, "wide desktop layout has dedicated responsive rules");
assert.doesNotMatch(htmlMarkup, /<script src="[^"]+"(?:\\s+[^>]*)?><\\/script>/, "no local or vendor script is left parser-blocking");
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



// Notification regressions: route taps to the relevant screen and preserve good subscriptions on delivery errors.
assert.ok(pushDispatchFunction.includes("const notificationUrls: Record<PushKind, string> = {"));
for (const [kind, destination] of [
  ["timetable_reminder", "./?page=timetable"],
  ["new_message", "./?page=campus-messages"],
  ["campus_announcement", "./?page=noticeboard"],
  ["account_update", "./?page=profile-settings"],
  ["test", "./?page=profile-settings"]
]) {
  assert.ok(pushDispatchFunction.includes(kind + ': "' + destination + '"'), "notification route is defined for " + kind);
}
assert.ok(pushDispatchFunction.includes("url: notificationUrls[kind]"), "push payload includes its relevant application route");
assert.ok(!pushDispatchFunction.includes('url: "./",'), "notifications do not all route back to the app root");
assert.ok(pushDispatchFunction.includes("subscriptions_found: 0, no_subscription: true"));
assert.ok(pushDispatchFunction.includes("subscriptions_found: subscriptions.length, no_subscription: false"));
assert.ok(html.includes("if (delivered === 0 && result?.no_subscription === true)"), "repair only runs when server reports no subscription");
assert.ok(html.includes("Push delivery was not confirmed. The subscription was kept"));
assert.ok(html.includes("const notificationDestinationPages = new Set(['timetable', 'campus-messages', 'noticeboard', 'profile-settings']);"));
assert.ok(html.includes("if (page === 'dashboard' && pendingNotificationPage)"), "startup navigation preserves the requested notification destination");
assert.ok(html.includes("['campus-messages', 'noticeboard'].includes(target)") &&
  html.includes("currentProfile.verification_status !== 'verified'"), "verified-only routes remain gated");
assert.ok(html.includes("document.addEventListener('click', function(event)"));
assert.ok(html.includes("if (!event.isTrusted || !event.target?.closest?.('#workspace')) return;"));
for (const destination of ['timetable', 'campus-messages', 'noticeboard', 'profile-settings']) {
  assert.ok(serviceWorker.includes('"./?page=' + destination + '"'), "service worker allows notification destination " + destination);
}
console.log("PASS notification routing, missing-subscription diagnosis, and non-destructive test retries");


// National university services directory and source-restricted crawler.
assert.match(html, /id="campus-service-directory-panel"/, "contacts page contains the searchable national directory");
assert.match(html, /id="campus-service-directory-search"/, "directory supports university/state search");
assert.match(html, /id="campus-service-directory-ownership"/, "directory can filter federal, state and private universities");
assert.match(html, /id="platform-service-directory-crawler"/, "trusted platform admin has crawler controls");
assert.match(html, /functions\.invoke\('campus-service-directory-crawler'/, "admin UI invokes the service crawler");
assert.match(campusServiceDirectory, /from\("campus_university_service_directory"\)/, "directory loads official service records");
assert.match(campusServiceDirectory, /source_directory_url/, "directory links to an official source or NUC fallback");
assert.match(campusServiceCrawler, /rpc\("platform_is_admin"\)/, "crawler requires the trusted platform-admin registry");
assert.match(campusServiceCrawler, /SUPABASE_SERVICE_ROLE_KEY/, "privileged database writes use a server-side key");
assert.match(campusServiceCrawler, /robotsRules\(/, "crawler checks robots.txt before fetching pages");
assert.match(campusServiceCrawler, /redirect: "manual"/, "crawler does not automatically follow redirects");
assert.match(campusServiceCrawler, /link\.hostname\.toLowerCase\(\) !== host/, "crawler stays on each registered official host");
assert.match(campusServiceCrawler, /MAX_PAGES_PER_UNIVERSITY = 5/, "crawler has a strict per-site page cap");
assert.match(campusServiceCrawler, /MAX_HTML_BYTES = 750_000/, "crawler bounds downloaded HTML size");
assert.match(campusServiceCrawler, /Only public HTTPS HTML on each registered university host/, "crawler describes its source and transport constraints");
assert.doesNotMatch(campusServiceCrawler, /Access-Control-Allow-Origin"\]\s*=\s*"\*"/, "crawler does not enable wildcard CORS");
assert.match(campusServiceCrawler, /last_crawl_error/, "crawler records safe crawl status for diagnosis");
assert.match(campusServiceDirectoryMigration, /CREATE TABLE IF NOT EXISTS public\.campus_university_service_directory/i);
assert.match(campusServiceDirectoryMigration, /ENABLE ROW LEVEL SECURITY/i, "university service directory enables RLS");
assert.match(campusServiceDirectoryMigration, /last_crawl_at timestamptz/i, "migration tracks crawler progress");
assert.match(campusServiceDirectoryMigration, /campus_service_directory_crawl_by_idx/, "crawler audit foreign key has a covering index");
assert.match(campusServiceDirectoryMigration, /campus_universities_read_active|campus_service_directory_read_active/i, "active-university reads are scoped to active directory entries");

assert.match(html, /id="profile-settings-identity-form"/, "profile settings allow display name and picture editing");
assert.match(html, /id="profile-settings-display-name"/, "profile settings include an editable display name");
assert.match(html, /id="profile-settings-avatar-file"/, "profile settings accept a selected avatar image");
assert.match(html, /id="profile-settings-avatar-trigger"/, "avatar is the control that opens profile editing");
assert.match(html, /id="profile-settings-identity-dialog"/, "profile editing opens in a dialog instead of staying inline");
assert.match(html, /showModal\(\)/, "profile dialog uses the accessible native modal API");
assert.match(html, /id="profile-settings-avatar-preview"/, "avatar changes preview inside the dialog");
assert.ok(html.includes("#profile-settings-avatar-preview[hidden],#profile-settings-avatar-preview-fallback[hidden]{display:none!important}"), "profile preview hides the image and fallback mutually exclusively");

assert.match(html, /campus-profile-avatars/, "profile photo uses private per-user Storage");
assert.match(html, /Maximum 20 MB\./, "profile avatar UI advertises a 20 MB maximum");
assert.match(html, /PROFILE_AVATAR_INPUT_LIMIT = 20 \* 1024 \* 1024/, "client image validation accepts source images up to 20 MiB");
assert.match(html, /PROFILE_AVATAR_OUTPUT_LIMIT = 2\.7 \* 1024 \* 1024/, "profile images are compressed to fit the private bucket");
assert.match(html, /prepareProfileAvatar\(file\)/, "selected images are validated and prepared before upload");
assert.match(html, /file\.slice\(0, 16\)\.arrayBuffer\(\)/, "client checks the actual file signature");
assert.match(html, /createImageBitmap\(file\)/, "client verifies the image can be decoded");
assert.match(html, /canvas\.toBlob\(resolve, 'image\/webp', quality\)/, "large images are resized and compressed to WebP");
assert.match(html, /contentType: 'image\/webp'/, "compressed avatar upload uses the correct MIME type");
assert.doesNotMatch(html, /3 MB|3 \* 1024 \* 1024/, "no stale 3 MB profile avatar limit remains");
assert.match(profileAvatar20MbMigration, /file_size_limit = 20971520/i, "private storage bucket is configured for 20 MiB");
assert.match(profileAvatar20MbMigration, /metadata ->> 'size'.*20971520/s, "storage RLS caps an avatar at 20 MiB");

assert.match(html, /rpc\('update_my_profile_identity'/, "profile identity saves through the database-enforced self-update RPC");
assert.match(profileIdentityMigration, /add column if not exists avatar_path text/i, "profile table stores avatar object path");
assert.match(profileIdentityMigration, /create or replace function public\.update_my_profile_identity/i, "profile identity RPC exists");
assert.match(profileAvatarPathFixMigration, /\[\.\]\(jpg\|png\|webp\)/, "avatar path validation accepts generated UUID filenames with supported image extensions");
assert.match(profileAvatarRlsFixMigration, /file_size_limit|Storage enforces the bucket/i, "avatar upload size is enforced by the private bucket limit");
assert.doesNotMatch(profileAvatarRlsFixMigration, /metadata ->> 'size'/, "avatar upload RLS does not reject files when Storage size metadata is absent");
assert.match(profileAvatarRlsFixMigration, /storage\.foldername\(name\).*auth\.uid/s, "avatar uploads remain restricted to the owner folder");
assert.match(profileAvatarRlsFixMigration, /image\/jpeg.*image\/png.*image\/webp/s, "avatar uploads remain restricted to supported image MIME types");
assert.match(studentIdentityPathFixMigration, /\[\.\]\(jpg\|jpeg\|png\|pdf\)/, "student identity validation accepts UUID filenames with supported document extensions");
assert.match(studentIdentityPathFixMigration, /p\.role='student' and p\.requested_role='student'/, "student identity submission remains limited to student accounts");
assert.ok(studentIdentityPathFixMigration.includes("'^' || v_user_id::text || '/"), "student identity path remains scoped to the authenticated user");
assert.match(backend, /rpc\("save_my_requested_role"/, "requested-role persistence uses the dedicated Supabase RPC");
assert.match(requestedRoleRpcMigration, /create or replace function public\.save_my_requested_role\(p_requested_role text\)/i, "requested-role RPC is defined in a migration");
assert.match(requestedRoleRpcMigration, /p_requested_role not in \('student', 'teacher'\)/, "requested-role RPC rejects elevated roles");
assert.match(requestedRoleRpcMigration, /v_profile_role = 'student' and v_verification_status = 'pending'/, "requested-role RPC only updates pending base accounts");
assert.doesNotMatch(requestedRoleRpcMigration, /set role\s*=|set verification_status\s*=/i, "requested-role RPC cannot grant roles or approve accounts");
assert.match(requestedRoleRpcMigration, /revoke all on function public\.save_my_requested_role\(text\) from anon/i, "anonymous users cannot call requested-role RPC");
assert.match(requestedRoleRpcMigration, /grant execute on function public\.save_my_requested_role\(text\) to authenticated/i, "requested-role RPC is granted to authenticated users only");
assert.match(profileIdentityMigration, /security definer/i, "profile identity update RPC is database-owned");
assert.match(profileIdentityMigration, /grant execute on function public\.update_my_profile_identity\(text,text,boolean\) to authenticated/i, "profile identity RPC is granted only to signed-in users");
assert.match(profileIdentityMigration, /campus_profile_avatar_upload_own/, "avatar upload is scoped to the current user's folder");
assert.match(profileIdentityMigration, /campus_profile_avatar_read_own/, "private avatar reads are scoped to the current user");
assert.match(profileAvatarStorageMigration, /grant select on public\.community_posts, public\.community_post_media to authenticated/i, "storage policy table checks receive SELECT while remaining RLS-protected");
assert.match(profileAvatarStorageMigration, /RLS must be enabled on public\.community_posts/i, "migration refuses to grant reads unless community RLS is enabled");

assert.match(campusServiceCrawler, /campusshieldaitechnologies@gmail\.com/, "crawler endpoint is restricted to its designated owner email");
assert.ok(html.includes('<button data-page="community" id="lost-found-nav" data-lost-found-shortcut="true">'), "Lost & Found has a dedicated campus navigation shortcut");
const lostFoundHandlerStart = html.indexOf("if (button.hasAttribute('data-lost-found-shortcut'))");
const lostFoundHandlerEnd = html.indexOf("if (button.dataset.page === 'groups')", lostFoundHandlerStart);
assert.ok(lostFoundHandlerStart >= 0 && lostFoundHandlerEnd > lostFoundHandlerStart, "Lost & Found shortcut has a dedicated click handler");
const lostFoundHandler = html.slice(lostFoundHandlerStart, lostFoundHandlerEnd);
assert.ok(lostFoundHandler.includes("postType.value = 'lost_found'"), "shortcut preselects the Lost & Found post type");
assert.ok(lostFoundHandler.includes("communityPostForm"), "shortcut targets the community composer");
assert.ok(lostFoundHandler.includes("scrollIntoView({behavior: 'smooth', block: 'start'})"), "shortcut scrolls to the composer");
assert.ok(lostFoundHandler.includes("Do not post private contact details or sensitive personal information"), "shortcut includes privacy guidance");
assert.match(html, /crawlerPanel\.hidden = !isCrawlerOwner/, "crawler panel is hidden for all other platform administrators");
assert.match(html, /This crawler is restricted to its designated owner\./, "crawler UI repeats the owner-only guard");
console.log("PASS self-service profile editing, private avatar storage, and owner-only crawler authorization");

console.log("PASS searchable national service directory, verified-source crawler restrictions, admin gate, and crawl status migration");
