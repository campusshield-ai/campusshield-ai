import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const readCandidate = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const mapSql = readCandidate("../supabase/production-candidates/20261104_campusmap_forward_candidate.sql");
const pulseSql = readCandidate("../supabase/production-candidates/20261104_campuspulse_phase2_forward_candidate.sql");
const pqSql = readCandidate("../supabase/production-candidates/20261104_past_questions_forward_candidate.sql");
const preflightSql = readCandidate("../supabase/production-candidates/20261104_production_preflight.sql");
const postflightSql = readCandidate("../supabase/production-candidates/20261104_production_postflight.sql");
const liveSql = readCandidate("../supabase/production-candidates/20261111_campus_live_classroom_forward_candidate.sql");
const livePreflightSql = readCandidate("../supabase/production-candidates/20261111_live_classroom_production_preflight.sql");
const livePostflightSql = readCandidate("../supabase/production-candidates/20261111_live_classroom_production_postflight.sql");
const liveContractSql = readCandidate("./production-live-classroom-contract.sql");
const allPhases = [mapSql, pulseSql, pqSql, liveSql];

for (const phase of allPhases) {
  assert.match(phase, /^-- PRODUCTION CANDIDATE ONLY/m);
  assert.match(phase, /\bbegin;/i);
  assert.match(phase, /\bcommit;/i);
  assert.doesNotMatch(phase, /\bdrop\s+table\b/i);
  assert.doesNotMatch(phase, /\bdrop\s+column\b/i);
  assert.doesNotMatch(phase, /\btruncate\b/i);
  assert.doesNotMatch(phase, /\bdelete\s+from\b/i);
}

for (const name of ["campus_map_features", "campus_map_campuses", "campus_map_buildings"]) {
  assert.match(mapSql, new RegExp("alter table public\\." + name + " enable row level security", "i"));
}
assert.match(mapSql, /add column if not exists university_id uuid/i);
assert.match(mapSql, /add column if not exists latitude double precision/i);
assert.match(mapSql, /add column if not exists longitude double precision/i);
assert.doesNotMatch(mapSql, /update\s+public\.incidents/i);
assert.doesNotMatch(mapSql, /update\s+public\.campus_universities\s+set\s+state/i);
assert.match(mapSql, /public\.can_read_campus_map_drafts\(p_university_id uuid\)/i);
assert.match(mapSql, /center_status = 'verified'/i);
assert.match(mapSql, /can_read_campus_map_drafts\(university_id\)/i);

for (const name of [
  "campus_member_blocks", "campus_collab_listings", "campus_event_buddy_listings",
  "campus_mentorship_profiles", "campus_memories", "campus_peer_connection_requests",
  "campus_social_feature_reports"
]) {
  assert.match(pulseSql, new RegExp("alter table public\\." + name + " enable row level security", "i"));
}
assert.match(pulseSql, /revoke all on public\.campus_member_blocks from public,anon,authenticated/i);
assert.match(pulseSql, /as restrictive\s+for all to anon,authenticated using \(false\)/i);
assert.match(pulseSql, /grant execute on function private\.is_campus_member_blocked\(uuid,uuid\) to authenticated/i);
assert.match(pulseSql, /Production Campus Network member-block table is required/i);
assert.doesNotMatch(pulseSql, /create table public\.campus_member_blocks/i, "CampusPulse must reuse the Production Campus Network block table");
assert.doesNotMatch(pulseSql, /create index campus_member_blocks_blocked_idx/i, "CampusPulse must reuse the existing Production block index");
assert.match(preflightSql, /member_block_dependency_preflight/i, "Preflight validates the existing Production reciprocal block helper before reuse");


for (const name of [
  "past_question_papers", "past_question_items", "past_question_answer_keys",
  "practice_attempts", "practice_answers"
]) {
  assert.match(pqSql, new RegExp("alter table public\\." + name + " enable row level security", "i"));
}
assert.match(pqSql, /past_question_answer_keys_reviewer_only/i);
assert.match(pqSql, /past_question_exam_prep_access/i);
assert.match(pqSql, /revoke execute on function public\.get_past_question_coverage\(\) from public, anon/i);
assert.match(pqSql, /grant execute on function public\.get_past_question_coverage\(\) to authenticated, service_role/i);
assert.match(pqSql, /on conflict \(id\) do nothing/i);
assert.doesNotMatch(pqSql, /on conflict \(id\) do update/i);

assert.match(preflightSql, /^-- READ-ONLY/m);
assert.match(preflightSql, /function_collision_preflight/i);
assert.match(preflightSql, /storage_policy_preflight/i);
assert.match(preflightSql, /explicit bucket_id scope/i);
assert.match(postflightSql, /Every storage\.objects RLS policy must include an explicit bucket_id scope/i);
assert.ok(preflightSql.includes("public.manage_campus_map_feature("), "Preflight guards CampusMap RPC collisions");
assert.ok(preflightSql.includes("public.get_past_question_coverage()"), "Preflight guards Past Questions RPC collisions");
assert.ok(preflightSql.includes("private.import_campus_map_building_candidates_impl(uuid,jsonb)"), "Preflight guards CampusMap import implementation collisions");
assert.ok(preflightSql.includes("private.import_campus_map_building_candidates_legacy(uuid,jsonb)"), "Preflight guards the shortened legacy CampusMap import helper");
assert.match(mapSql, /rename to import_campus_map_building_candidates_legacy/i);
assert.doesNotMatch(mapSql, /import_campus_map_building_candidates_impl_unverified_centre_legacy/i);
assert.ok(preflightSql.includes("public.import_campus_map_building_candidates(uuid,jsonb)"), "Preflight guards CampusMap import RPC collisions");
assert.ok(preflightSql.includes("private.review_campus_map_building_impl(uuid,text,text,boolean)"), "Preflight guards CampusMap review implementation collisions");
assert.ok(preflightSql.includes("public.review_campus_map_building(uuid,text,text,boolean)"), "Preflight guards CampusMap review RPC collisions");
assert.ok(preflightSql.includes("private.prepare_campuspulse_social_item()"), "Preflight guards CampusPulse trigger function collisions");
assert.ok(preflightSql.includes("public.add_past_question_item_with_answer_key(uuid,integer,text,text,jsonb,text,numeric,text,text,text)"), "Preflight guards Past Questions item RPC collisions");
assert.ok(preflightSql.includes("private.manage_campus_map_feature_with_metadata_impl(uuid,text,text,text,text,text,double precision,double precision,text,boolean,boolean,jsonb)"), "Preflight guards CampusMap Passport implementation collisions");
assert.doesNotMatch(preflightSql, /\b(insert into|update\s+|delete\s+from|alter table|drop table|truncate|create table)\b/i);
assert.match(postflightSql, /campus_member_blocks must not be directly selectable/i);
assert.match(postflightSql, /Production-only billing\/payment table is missing/i);
assert.match(pqSql, /grant select, insert, delete on public\.past_question_papers to service_role/i);
assert.match(pqSql, /grant select, insert on public\.past_question_items to service_role/i);
assert.match(pqSql, /grant select, insert on public\.past_question_answer_keys to service_role/i);
assert.match(pqSql, /grant select, update on public\.practice_attempts to service_role/i);
assert.match(pqSql, /grant insert on public\.practice_answers to service_role/i);
assert.match(postflightSql, /CampusMap Data API read grants are missing/i);
assert.match(postflightSql, /Past Questions service_role table grants do not cover/i);

assert.match(liveSql, /alter table public\.campus_live_class_sessions enable row level security/i);
assert.match(liveSql, /revoke all on table public\.campus_live_class_sessions from public, anon, authenticated/i);
assert.match(liveSql, /create or replace function public\.create_campus_classroom/i);
assert.match(liveSql, /security invoker/i);
assert.match(liveSql, /private\.can_access_live_classroom/i);
assert.doesNotMatch(liveSql, /create or replace function private\.can_access_classroom/i, "Live Classroom must preserve the shared classroom access helper");
assert.match(livePreflightSql, /^-- READ-ONLY/m);
assert.doesNotMatch(livePreflightSql, /\b(insert into|update\s+|delete\s+from|alter table|drop table|truncate|create table)\b/i);
assert.match(livePostflightSql, /Live Classroom sessions table must have RLS enabled/i);
assert.match(livePostflightSql, /Public RPC must remain SECURITY INVOKER/i);
assert.match(livePostflightSql, /Private implementation must be SECURITY DEFINER with empty search_path/i);
assert.match(liveContractSql, /Synthetic Live Classroom A/i);
assert.match(liveContractSql, /participant_role/i);
assert.match(liveContractSql, /Cross-campus student was allowed/i);
assert.match(liveContractSql, /Teacher creation remains supported/i);
console.log("Production migration candidate static checks passed.");
