import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const js = read("../campus-ideas-impact.js");
const css = read("../campus-ideas-impact.css");
const html = read("../index.html");
const sql = read("../supabase/migrations/20261105130000_campus_ideas_impact_mvp.sql");
const statusGuard = read("../supabase/migrations/20261105131500_campus_idea_status_context_guard.sql");
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
