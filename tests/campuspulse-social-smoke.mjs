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
const privilegeHardening = read("../supabase/migrations/20261101190831_campuspulse_social_privilege_hardening.sql");

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
assert.match(js, /state\.allEvents=await state\.api\.listCampusEvents\(\)/, "Memories must load past as well as upcoming published events");
assert.match(js, /\["cps-buddy-event",state\.events/);
assert.match(js, /\["cps-memory-event",state\.allEvents/);
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
assert.match(js, /state\.profile\.verification_status!==["']verified["']/);
assert.match(js, /state\.campus\.membership_status!==["']active["']/);
assert.match(js, /state\.campus\.verification_status!==["']verified["']/);

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


assert.match(privilegeHardening, /revoke all on table[\s\S]*from anon, authenticated/,
  "New social tables must not inherit broad authenticated/anonymous table privileges");
assert.match(privilegeHardening, /grant select, insert, update, delete on table[\s\S]*campus_memories[\s\S]*to authenticated/,
  "User-owned social listings must retain only the RLS-governed row operations");
assert.match(privilegeHardening, /grant select, insert, update on table[\s\S]*campus_social_feature_reports[\s\S]*to authenticated/,
  "Connection requests and reports must not expose direct DELETE");
assert.doesNotMatch(privilegeHardening, /grant[^;]*\btruncate\b/i,
  "Authenticated users must never receive TRUNCATE on CampusPulse social tables");
assert.doesNotMatch(privilegeHardening, /grant[^;]*\breferences\b|grant[^;]*\btrigger\b/i,
  "Authenticated users must not receive REFERENCES or TRIGGER privileges on CampusPulse social tables");

console.log("CampusPulse social feature smoke checks passed.");

for (const feature of ["qna", "stories", "confessions"]) {
  assert.ok(js.includes("data-cps-tab='" + feature + "'"), "Missing CampusPulse feature tab: " + feature);
  assert.ok(js.includes("data-cps-panel='" + feature + "'"), "Missing CampusPulse feature panel: " + feature);
}
assert.match(js, /listCommunityPosts\(\)/, "Q&A must reuse the existing posts API");
assert.match(js, /createCommunityPost\(\{postType:"question"/, "Q&A must create questions through the moderated post API");
assert.match(js, /listCommunityComments\(ids\)/, "Q&A must reuse the existing comments API");
assert.match(js, /createCommunityComment\(/, "Q&A must submit answers through the existing comment API");
assert.match(js, /client\.rpc\("list_campus_stories"\)/, "Stories must use the protected list RPC");
assert.match(js, /client\.rpc\("create_campus_story"/, "Stories must use the protected create RPC");
assert.match(js, /client\.rpc\("list_campus_story_moderation"/, "Story moderation must use the protected RPC");
assert.match(js, /client\.rpc\("moderate_campus_story"/, "Story moderation must use the protected RPC");
assert.match(js, /client\.rpc\("list_campus_confessions"\)/, "Confessions must use the anonymous list RPC");
assert.match(js, /client\.rpc\("create_campus_confession"/, "Confessions must use the protected create RPC");
assert.match(js, /client\.rpc\("report_campus_confession"/, "Confessions must support protected reporting");
assert.match(js, /client\.rpc\("list_campus_confession_moderation"/, "Confession moderation must use the protected RPC");
assert.match(js, /client\.rpc\("moderate_campus_confession"/, "Confession decisions must use the protected RPC");
assert.doesNotMatch(js, /\.from\(["']campus_stories["']\)|\.from\(["']campus_confessions["']\)/, "Story/confession table access must remain RPC-only");
assert.doesNotMatch(js, /campus-story-media-upload|storage\.from|\.upload\(/, "Do not bypass malware scanning for story media");
assert.match(css, /campuspulse-social-qna-compose/, "Q&A answer composer must be responsive");
