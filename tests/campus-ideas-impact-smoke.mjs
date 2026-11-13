import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const js = read("../campus-ideas-impact.js");
const css = read("../campus-ideas-impact.css");
const html = read("../index.html");
const featureLoader = read("../campusshield-feature-loader.js");
const sql = read("../supabase/migrations/20261105130000_campus_ideas_impact_mvp.sql");
const statusGuard = read("../supabase/migrations/20261105131500_campus_idea_status_context_guard.sql");
const statusContextSql = read("../supabase/migrations/20261105131500_campus_idea_status_context_guard.sql");
const globalAccessSql = read("../supabase/migrations/20261105221500_global_ideas_voice_access_sidebar_fix.sql");

new vm.Script(js, { filename: "campus-ideas-impact.js" });
assert.match(html, /campus-ideas-impact\.css/);
assert.match(featureLoader, /"community":[\s\S]*campus-ideas-impact\.js/);
for (const token of ["Ideas &amp; Impact","problem_statement","proposed_solution","expected_impact","impact_scope"]) {
  assert.ok(js.includes(token) || html.includes(token), "Missing Ideas & Impact contract: " + token);
}
for (const table of ["campus_ideas","campus_idea_supports","campus_idea_comments","campus_idea_status_updates"]) {
  assert.match(sql, new RegExp("create table public\\." + table));
  assert.match(sql, new RegExp("alter table public\\." + table + " enable row level security"));
}
for (const policy of [
  "campus_ideas_read_verified_campus",
  "campus_ideas_insert_own_pending",
  "campus_ideas_update_own_pending",
  "campus_ideas_delete_own_pending",
  "campus_idea_supports_insert_other_published",
  "campus_idea_comments_insert_published_ideas",
  "campus_idea_status_updates_insert_verified_staff"
]) assert.ok(sql.includes(policy), "Missing RLS policy: " + policy);

assert.match(sql, /private\.current_user_has_verified_campus_access\(\)/);
assert.match(sql, /private\.current_campus_university_id\(\)/);
assert.match(sql, /private\.current_campus_role\(\) in \('admin','security','teacher'\)/i);
assert.match(sql, /revoke all on table[\s\S]*from public, anon, authenticated/i);
assert.match(sql, /grant update \(title, category, impact_scope, problem_statement, proposed_solution, expected_impact\)/i);
assert.doesNotMatch(sql, /grant update[^;]*\bstatus\b/i, "Students must not directly update idea status");
assert.match(sql, /private\.adjust_campus_idea_support_count\(\)/);
assert.match(sql, /security definer[\s\S]*set search_path = ''/i);
assert.match(sql, /revoke all on function private\.adjust_campus_idea_support_count\(\) from public, anon, authenticated/i);
assert.match(sql, /revoke all on function private\.apply_campus_idea_status_update\(\) from public, anon, authenticated/i);

assert.match(js, /from\("campus_ideas"\)/);
assert.match(js, /from\("campus_idea_supports"\)/);
assert.match(js, /from\("campus_idea_comments"\)/);
assert.match(js, /from\("campus_idea_status_updates"\)/);
assert.match(js, /await prepare\(\)/);
assert.match(js, /replaceChildren|textContent/);
assert.doesNotMatch(js, /service_role|SUPABASE_SERVICE_ROLE|\.from\(["']profiles["']\)\.select\(["'][^"']*(email|phone|student_number)/i,
  "Ideas & Impact must not expose service credentials or private identity fields");
assert.match(css, /@media\(max-width:680px\)/);
assert.match(css, /prefers-reduced-motion:reduce/);
assert.match(css, /data-theme=\"dark\"/);

assert.match(js, /id="cii-start-idea"/, "The hero includes a clear Share an idea action");
assert.ok(js.indexOf('<section class="cii-board"') < js.indexOf('<details class="cii-compose"'),
  "Idea discovery must appear before the optional proposal form");
assert.match(js, /id="cii-compose-details"/, "The proposal form is collapsible by default");
assert.match(js, /id="cii-clear-filters"/, "The board provides a clear filters action");
assert.match(js, /id="cii-results-count"/, "The board announces how many ideas are currently shown");
assert.match(js, /function clearFilters\(\)/, "Clear filters resets the search and all selectors");
assert.match(js, /cii-problem-count/, "The problem statement has a live character counter");
assert.match(js, /cii-solution-count/, "The proposed solution has a live character counter");
assert.match(js, /cii-impact-count/, "The expected impact has a live character counter");
assert.match(js, /create\("details","cii-idea-details"\)/, "Idea descriptions are tucked into accessible detail disclosures");
assert.match(js, /select\("id,user_id,university_id,creator_username/, "Idea rows include campus scope for staff-only campus moderation controls");
assert.match(js, /aria-pressed/, "Support state is exposed to assistive technology");
assert.match(css, /\.cii-filter-row\{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/, "Desktop filter controls use a readable three-column layout");
assert.match(css, /\.cii-compose>summary/, "The proposal panel has a clear disclosure header");
assert.match(css, /\.cii-idea-details>summary/, "Idea details have an accessible disclosure row");
assert.match(css, /@media\(max-width:420px\)/, "Filters simplify further on narrow phones");
assert.match(css, /\.cii-loading-mark/, "Loading state has a dedicated visual indicator");
assert.match(js, /This proposal is visible only to its author and moderators at the originating university/,
  "Pending proposals remain private until campus approval");

console.log("Campus Ideas & Impact smoke checks passed.");

assert.ok(statusContextSql.toLowerCase().includes("create or replace function private.prepare_campus_idea_status_update()"));
assert.ok(statusContextSql.includes("new.reviewer_id := (select auth.uid())"));
assert.ok(statusContextSql.includes("new.university_id := private.current_campus_university_id()"));
assert.ok(statusContextSql.toLowerCase().includes("before insert on public.campus_idea_status_updates"));
assert.ok(statusContextSql.toLowerCase().includes("revoke all on function private.prepare_campus_idea_status_update() from public, anon, authenticated"));


assert.ok(statusGuard.includes("create or replace function private.prepare_campus_idea_status_update()"));
assert.ok(statusGuard.includes("security invoker"));
assert.ok(statusGuard.includes("set search_path = ''"));
assert.ok(statusGuard.includes("private.current_user_has_verified_campus_access()"));
assert.ok(statusGuard.includes("private.current_campus_role() not in ('admin','security','teacher')"));
assert.ok(statusGuard.includes("new.reviewer_id := (select auth.uid())"));
assert.ok(statusGuard.includes("new.university_id := private.current_campus_university_id()"));
assert.ok(statusGuard.includes("revoke all on function private.prepare_campus_idea_status_update() from public, anon, authenticated"));

assert.ok(globalAccessSql.includes("campus_ideas_read_global_published"));
assert.ok(globalAccessSql.includes("campus_idea_comments_read_global_published"));
assert.ok(globalAccessSql.includes("campus_idea_supports_insert_global_published"));
assert.ok(globalAccessSql.includes("private.prepare_campus_idea_comment_global()"));
assert.ok(globalAccessSql.includes("private.current_user_has_verified_campus_access()"));
assert.ok(globalAccessSql.includes("private.can_read_campus_direct_message("));
assert.ok(js.includes("requireVerifiedCampus: false"));
assert.ok(!js.includes('.eq("university_id", state.campus.university_id)'));
assert.ok(js.includes("Showing ideas you can access across CampusShield"), "Explore continues to include approved ideas across CampusShield");
assert.ok(js.includes("state.canContribute"));
assert.ok(js.includes("state.campus?.university_id === idea.university_id"));
console.log("Global Ideas & Impact cross-campus access checks passed.");

assert.match(js, /view: "explore"/, "Ideas & Impact has a default Explore collection");
assert.match(js, /data-idea-view="mine"/, "Students can switch to their own proposals");
assert.match(js, /data-idea-view="supported"/, "Students can revisit ideas they supported");
assert.match(js, /request\.eq\("user_id", state\.user\.id\)/, "My proposals are queried by the authenticated user id");
assert.match(js, /from\("campus_idea_supports"\)[\s\S]*?\.select\("idea_id"\)[\s\S]*?\.eq\("user_id", state\.user\.id\)/, "Supported ideas are derived from the signed-in user's own support rows");
assert.match(js, /request\.order\("updated_at", \{ ascending: false \}\)/, "The board can sort by recently updated ideas");
assert.match(js, /cii-progress-history/, "Ideas expose expandable progress history");
assert.match(js, /cii-progress-list/, "Progress history uses a dedicated chronological list");
assert.match(css, /\.cii-view-tabs/, "Personal collections have responsive navigation styles");
assert.match(css, /\.cii-progress-history/, "Progress history has its own visual treatment");
assert.match(css, /data-theme="dark"/, "Personal collections and progress history support dark mode");

assert.match(js, /cii-good-thoughts/, "Ideas & Impact has a positive reflection section");
assert.match(js, /Challenge the problem, not the person/, "The message space reinforces respectful disagreement");
assert.match(js, /Share a constructive idea/, "Positive reflection links directly to proposal creation");
assert.match(js, /original CampusShield reminders/, "Positive statements are clearly labelled as original platform copy");
assert.match(css, /\.cii-thought-grid/, "Positive messages use a dedicated card grid");
assert.match(css, /@media\(max-width:460px\)/, "Positive messages reflow on narrow phones");
assert.match(css, /\.cii-thought-featured/, "Featured positive message has a clear visual hierarchy");
