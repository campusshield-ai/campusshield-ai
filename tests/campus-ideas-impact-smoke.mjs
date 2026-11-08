import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const js = read("../campus-ideas-impact.js");
const css = read("../campus-ideas-impact.css");
const html = read("../index.html");
const sql = read("../supabase/migrations/20261105130000_campus_ideas_impact_mvp.sql");
const statusContextSql = read("../supabase/migrations/20261105131500_campus_idea_status_context_guard.sql");

new vm.Script(js, { filename: "campus-ideas-impact.js" });
assert.match(html, /campus-ideas-impact\.css/);
assert.match(html, /campus-ideas-impact\.js/);
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
assert.match(js, /function clearFilters\\(\\)/, "Clear filters resets the search and all selectors");
assert.match(js, /cii-problem-count/, "The problem statement has a live character counter");
assert.match(js, /cii-solution-count/, "The proposed solution has a live character counter");
assert.match(js, /cii-impact-count/, "The expected impact has a live character counter");
assert.match(js, /create\\("details","cii-idea-details"\\)/, "Idea descriptions are tucked into accessible detail disclosures");
assert.match(js, /select\\("id,user_id,university_id,creator_username/, "Idea rows include campus scope for staff-only campus moderation controls");
assert.match(js, /aria-pressed/, "Support state is exposed to assistive technology");
assert.match(css, /\\.cii-filter-row\\{[\\s\\S]*?grid-template-columns:repeat\\(3,minmax\\(0,1fr\\)\\)/, "Desktop filter controls use a readable three-column layout");
assert.match(css, /\\.cii-compose>summary/, "The proposal panel has a clear disclosure header");
assert.match(css, /\\.cii-idea-details>summary/, "Idea details have an accessible disclosure row");
assert.match(css, /@media\\(max-width:420px\\)/, "Filters simplify further on narrow phones");
assert.match(css, /\\.cii-loading-mark/, "Loading state has a dedicated visual indicator");
assert.match(js, /This proposal is visible only to its author and moderators at the originating university/,
  "Pending proposals remain private until campus approval");


assert.ok(js.includes("requireVerifiedCampus: false"),
  "Signed-in members must be able to browse without a verified campus membership");
assert.ok(!js.includes('.eq("university_id", state.campus.university_id)'),
  "The discovery feed must not filter ideas to the viewer's university");
assert.ok(js.includes("Across CampusShield"),
  "The Ideas & Impact board must identify the CampusShield-wide feed");
assert.ok(js.includes("state.canContribute"),
  "Submission, support and discussion actions must remain gated to verified campus members");
assert.ok(js.includes("state.staff && state.campus?.university_id === idea.university_id"),
  "Moderation controls must remain scoped to the staff member's own university");
assert.ok(js.includes("This proposal is visible only to its author and moderators at the originating university"),
  "Pending proposals must stay private until moderation approves them");
assert.match(js, /const PUBLIC_STATUSES = \["published", "planned", "in_progress", "implemented"\]/,
  "Only moderated public statuses should appear in the cross-campus discovery board");
console.log("CampusShield-wide Ideas & Impact visibility and privacy checks passed.");

console.log("Campus Ideas & Impact smoke checks passed.");

assert.match(statusContextSql, /create or replace function private\.prepare_campus_idea_status_update\(\)/i);
assert.match(statusContextSql, /new\.reviewer_id := \(select auth\.uid\(\)\)/i);
assert.match(statusContextSql, /new\.university_id := private\.current_campus_university_id\(\)/i);
assert.match(statusContextSql, /before insert on public\.campus_idea_status_updates/i);
assert.match(statusContextSql, /revoke all on function private\.prepare_campus_idea_status_update\(\) from public, anon, authenticated/i);
