import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const js = read("../campuspulse-social.js");
const css = read("../campuspulse-social.css");
const html = read("../index.html");
const schema = read("../supabase/migrations/20261101173910_campuspulse_social_extensions_mvp.sql");
const eventGuard = read("../supabase/migrations/20261101174446_campuspulse_event_link_update_guard.sql");
const blockGuard = read("../supabase/migrations/20261101174607_campuspulse_peer_connections_respect_blocks.sql");

new vm.Script(js, { filename: "campuspulse-social.js" });
assert.match(html, /campuspulse-social\.css/);
assert.match(html, /campuspulse-social\.js/);

for (const feature of ["missions", "collab", "buddies", "clubs", "mentorship", "memories", "connections"]) {
  assert.ok(js.includes("data-cps-tab='" + feature + "'"), "Missing CampusPulse tab: " + feature);
}
assert.match(js, /getMyStudentRewards\(\)/, "Missions must reuse existing Rewards API");
assert.match(js, /createCampusGroup\([\s\S]*groupType:"society"/, "Club Hubs must reuse approved campus_groups");
assert.match(js, /listCampusGroups\(\)/, "Club Hubs must list existing campus groups");
assert.match(js, /listCampusEvents\(\)/, "Event Buddies must reuse published campus events");
assert.match(js, /campus_event_buddy_listings/, "Event Buddies must use their campus-scoped table");
assert.match(js, /createCampusDirectMessageRequest/, "Accepted connections must reuse existing private messaging");
assert.match(js, /campus_peer_connection_requests/, "Connection requests table is wired");
assert.match(js, /campus_mentorship_profiles/, "Mentorship profiles table is wired");
assert.match(js, /campus_memories/, "Memories table is wired");
assert.match(js, /campus_social_feature_reports/, "Moderation reporting is wired");
assert.match(js, /replaceChildren|textContent/, "Dynamic rendering must use safe DOM text APIs");
assert.doesNotMatch(js, /\.from\(["']profiles["']\)\.select\(["'][^"']*(email|phone|student_number)/i,
  "Campus social UI must not retrieve private profile contact or identity fields");
assert.doesNotMatch(js, /upload\(|storage\.from|campus-story-media-upload/,
  "Campus Memories must not bypass the unconfigured malware scanner");
assert.match(js, /await loadEvents\(\);[\s\S]*Promise\.allSettled/, "Events must load before Event Buddy listing reads");

for (const table of [
  "campus_collab_listings", "campus_event_buddy_listings", "campus_mentorship_profiles",
  "campus_memories", "campus_peer_connection_requests", "campus_social_feature_reports"
]) {
  assert.match(schema, new RegExp("create table public\\." + table));
  assert.match(schema, new RegExp("alter table public\\." + table + " enable row level security"));
}
assert.match(schema, /grant select,insert,update,delete on table[\s\S]*to authenticated/);
assert.match(schema, /revoke all on table[\s\S]*from anon/);
assert.match(schema, /security invoker set search_path = ''/);
assert.match(schema, /campus_memories_insert_own_pending/);
assert.match(schema, /campus_memories_staff_review/);
assert.match(schema, /campus_collab_read_same_campus/);
assert.match(schema, /campus_peer_connections_read_participants/);
assert.match(eventGuard, /new\.event_id is distinct from old\.event_id/);
assert.match(blockGuard, /private\.is_campus_member_blocked\(v_recipient,v_university\)/,
  "Connection requests must respect campus member blocks");

for (const token of ["campuspulse-social-tabs", "campuspulse-social-form", "campuspulse-social-grid",
  "#203d35", "#2a7e46", "#7fd98a", "prefers-reduced-motion"]) {
  assert.ok(css.includes(token), "Missing CampusPulse responsive/brand style: " + token);
}

console.log("CampusPulse social feature smoke checks passed.");
