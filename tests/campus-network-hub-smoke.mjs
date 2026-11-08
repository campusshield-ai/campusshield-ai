import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const html = read("../index.html");
const app = read("../campusshield-app.js");
const backend = read("../campusshield-backend.js");
const css = read("../campusshield-visual-refresh.css");
const migration = read("../supabase/migrations/20261108010000_campus_network_hub.sql");

new vm.Script(app, { filename: "campusshield-app.js" });
new vm.Script(backend, { filename: "campusshield-backend.js" });

// The new page must be a top-level destination between Opportunities and Incident Management.
const opportunitiesIndex = html.indexOf('<section class="page" id="page-opportunities">');
const networkIndex = html.indexOf('<section class="page" id="page-campus-network">');
const manageIndex = html.indexOf('<section class="page" id="page-manage">');
assert.ok(opportunitiesIndex >= 0 && networkIndex > opportunitiesIndex && manageIndex > networkIndex,
  "Campus Network must be a top-level page after Opportunities and before Incident Management");
assert.match(html.slice(opportunitiesIndex, networkIndex), /campus-opportunities-search/);
assert.match(html.slice(networkIndex, manageIndex), /campus-alumni-intro-requests/);
assert.match(html, /id="campus-network-nav"[^>]*data-page="campus-network"|data-page="campus-network"[^>]*id="campus-network-nav"/);
assert.match(html, /id="marketplace-nav"[^>]*data-page="marketplace"|data-page="marketplace"[^>]*id="marketplace-nav"/);

// Marketplace discovery and the seller's own listing status are visible and wired.
for (const id of [
  "campus-marketplace-search", "campus-marketplace-category-filter",
  "campus-marketplace-status-filter", "campus-marketplace-sort",
  "campus-marketplace-results", "campus-marketplace-my-listings",
  "campus-my-listings-status"
]) assert.match(html, new RegExp('id="' + id + '"'), "Missing Marketplace control: " + id);
assert.match(app, /function renderCampusMarketplaceDiscovery/);
assert.match(app, /function loadCampusMarketplacePage/);
assert.match(app, /renderCampusMarketplaceDiscovery\(\)/);
assert.match(app, /listMyCampusMarketplaceListings\(\)/);
assert.match(backend, /async listMyCampusMarketplaceListings\(\)/);
assert.match(backend, /eq\("seller_id", user\.id\)/);
assert.match(app, /data-marketplace-sold/);
assert.match(app, /data-marketplace-report/);
assert.match(app, /scam_suspicion/);
assert.match(app, /unsafe_item/);
assert.match(app, /misleading_listing/);
assert.match(app, /reportCampusListing\(report\.dataset\.marketplaceReport,chosen/);


// Opportunity Hub is searchable, filterable and sortable without replacing its moderated flow.
for (const id of [
  "campus-opportunities-search", "campus-opportunities-category-filter",
  "campus-opportunities-sort", "campus-opportunities-results"
]) assert.match(html, new RegExp('id="' + id + '"'), "Missing Opportunity filter: " + id);
assert.match(app, /function renderCampusOpportunitiesDiscovery/);
assert.match(app, /campusOpportunitySavedIds/);
assert.match(app, /reviewCampusOpportunity/);
assert.match(app, /createCampusOpportunity/);

// Campus Network feature panels and form controls.
for (const tab of ["volunteers", "startups", "alumni"]) {
  assert.match(html, new RegExp('data-network-tab="' + tab + '"'), "Missing Campus Network tab: " + tab);
  assert.match(html, new RegExp('data-network-panel="' + tab + '"'), "Missing Campus Network panel: " + tab);
}
for (const id of [
  "campus-volunteer-form", "campus-volunteer-search", "campus-volunteer-scope",
  "campus-startup-form", "campus-startup-search", "campus-startup-scope",
  "campus-alumni-form", "campus-alumni-search", "campus-alumni-scope",
  "campus-alumni-review-panel", "campus-alumni-intro-requests", "campus-alumni-intro-refresh"
]) assert.match(html, new RegExp('id="' + id + '"'), "Missing Campus Network control: " + id);

// UI calls the protected RPCs; it must not select the RPC-only tables directly.
for (const rpc of [
  "list_campus_network_posts", "create_campus_network_post", "apply_to_campus_network_post",
  "list_campus_network_post_applications", "respond_to_campus_network_application",
  "close_my_campus_network_post", "list_campus_alumni_directory",
  "submit_campus_alumni_profile", "list_campus_alumni_review_queue",
  "review_campus_alumni_profile", "request_campus_alumni_intro_by_username",
  "list_my_campus_alumni_intro_requests", "respond_to_campus_alumni_intro"
]) assert.ok(app.includes(rpc), "Missing Campus Network RPC integration: " + rpc);
assert.doesNotMatch(app, /\.from\(["']campus_(network_posts|network_applications|alumni_profiles|alumni_intro_requests)["']\)/,
  "Campus Network private tables must not be queried directly from the browser");
assert.match(app, /campusNetworkVerified/);
assert.match(app, /visibility==='network'/);
assert.match(app, /p_visibility:\$\(prefix\+'-visibility'\)\.value/);
assert.match(app, /p_scope:scope/);
assert.match(app, /page === 'campus-network'\) loadCampusNetworkPage/);
assert.match(app, /'campus-network':'Campus Network'/);

// SQL quote integrity: every PL/pgSQL body must have matching paired dollar delimiters.
assert.doesNotMatch(migration, /^as $/m, "PL/pgSQL functions must use paired dollar-quote delimiters");
assert.equal((migration.match(/^as $$/gm) || []).length, (migration.match(/^$;$/gm) || []).length,
  "Each PL/pgSQL function must open and close its dollar-quoted body");

// Production must have the block lookup used by discovery and intro privacy checks.
assert.match(migration, /create table if not exists public\.campus_member_blocks/);
assert.match(migration, /create policy campus_member_blocks_deny_direct_access/);
assert.match(migration, /create or replace function private\.is_campus_member_blocked/);
assert.match(migration, /auth\.uid\(\)\) is null then true/);
// Database: four private tables, RLS, direct-access-deny policies and explicit RPC grants.
for (const table of [
  "campus_network_posts", "campus_network_applications",
  "campus_alumni_profiles", "campus_alumni_intro_requests"
]) {
  assert.match(migration, new RegExp("create table if not exists public\\." + table));
  assert.match(migration, new RegExp("alter table public\\." + table + " enable row level security"));
  assert.match(migration, new RegExp("create policy " + table + "_rpc_only"));
}
assert.match(migration, /revoke all on table[\s\S]*from anon, authenticated/);
assert.match(migration, /grant execute on function public\.list_campus_network_posts/);
assert.match(migration, /grant execute on function public\.list_campus_alumni_directory/);
assert.match(app, /list_my_campus_network_posts/);
assert.match(app, /function renderCampusNetworkMyPosts/);
assert.match(migration, /create or replace function public\.list_my_campus_network_posts/);
assert.match(migration, /grant execute on function public\.list_my_campus_network_posts/);
for (const id of ["campus-volunteer-my-posts", "campus-startup-my-posts"]) {
  assert.match(html, new RegExp('id="' + id + '"'), "Missing own-post tracker: " + id);
}
assert.match(migration, /owner_profile\.verification_status='verified'/);
assert.match(migration, /cm\.membership_status='active' and cm\.verification_status='verified'/);
assert.match(migration, /p_scope='network' and n\.visibility='network'/);
assert.match(migration, /a\.status='verified'/);
assert.match(migration, /p_scope='network' and a\.visibility='network'/);
assert.match(migration, /auth\.uid\(\)\) is null then[\s\S]*Sign in to request an alumni introduction/);
assert.match(migration, /limit 12/);
assert.match(migration, /expires_at timestamptz not null default \(now\(\) \+ interval '45 days'\)/);

// Responsive, keyboard-visible controls and dark-mode coverage are present.
for (const token of [
  "campus-discovery-toolbar", "campus-network-tabs", "campus-network-card-grid",
  "campus-network-browse-tools", "focus-visible", "max-width:620px",
  'html[data-theme="dark"] .campus-network-card'
]) assert.ok(css.includes(token), "Missing Campus Network / discovery styling: " + token);

console.log("Campus Network and campus discovery smoke checks passed.");
