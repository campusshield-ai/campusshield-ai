import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../supabase/migrations/20261017202242_classroom_opportunity_hub_security.sql", import.meta.url),
  "utf8"
);


const classroomSchema = await readFile(
  new URL("../supabase/migrations/20261017202216_campus_classrooms_assistant_attendance.sql", import.meta.url),
  "utf8"
);
const classroomAccess = await readFile(
  new URL("../supabase/migrations/20261017202224_enforce_active_campus_class_access.sql", import.meta.url),
  "utf8"
);
const readRpcs = await readFile(
  new URL("../supabase/migrations/20261017202616_classroom_opportunity_read_rpcs.sql", import.meta.url),
  "utf8"
);
const classroomJoinCode = await readFile(
  new URL("../supabase/migrations/20261017202236_private_classroom_join_code_rpc.sql", import.meta.url),
  "utf8"
);
assert.match(migration, /create table if not exists public\.campus_opportunities/i, "Opportunity Hub table is present");
assert.match(migration, /alter table public\.campus_opportunities enable row level security/i, "Opportunity Hub RLS is enabled");
assert.match(migration, /private\.current_campus_university_id\(\)/i, "Opportunity access is scoped to the authenticated campus");
assert.match(migration, /created_by = \(select auth\.uid\(\)\)/i, "Private drafts are owner-scoped");
assert.match(migration, /status = 'published' and \(deadline is null or deadline > now\(\)\)/i, "Expired opportunities are excluded from the ordinary published feed");
assert.match(migration, /review_notes text/i, "Review notes are stored separately from public listing fields");
assert.match(migration, /status = 'pending'[\s\S]*?private\.current_campus_role\(\) = any/i, "Campus reviewers can read pending submissions but not other users' private drafts");
assert.match(migration, /grant select \([\s\S]*?source_url, contact_url, deadline, status, is_official, created_at, updated_at\s*\)[\s\S]*?on table public\.campus_opportunities to authenticated/i, "Opportunity select grants omit internal author and review fields");
assert.match(migration, /revoke all on table public\.campus_opportunities from public, anon, authenticated/i, "Opportunity table has no broad default grants");
assert.match(migration, /revoke all on table public\.campus_classrooms from public, anon, authenticated/i, "Classroom table broad grants are removed");
assert.match(migration, /revoke all on table public\.campus_classroom_enrollments from public, anon, authenticated/i, "Enrollment table broad grants are removed");
assert.match(migration, /revoke all on table public\.campus_classroom_announcements from public, anon, authenticated/i, "Announcement table broad grants are removed");
assert.match(migration, /revoke all on table public\.campus_classroom_materials from public, anon, authenticated/i, "Materials table broad grants are removed");
assert.match(migration, /m\.verification_status = 'verified'/i, "Classroom access requires verified campus membership");
assert.match(migration, /m\.campus_role = 'teacher'/i, "Teacher actions require the campus-specific teacher role");
assert.match(migration, /m\.campus_role = 'student'/i, "Student access requires the campus-specific student role");
assert.match(readRpcs, /create or replace function public\.list_campus_opportunities/i, "Opportunity reads use an authenticated RPC without exposing the table endpoint");
assert.match(readRpcs, /create or replace function public\.list_my_campus_classrooms/i, "Classroom reads use an authenticated RPC");
assert.match(readRpcs, /revoke all on function public\.list_campus_opportunities\(\) from public, anon, authenticated/i, "Opportunity read RPC defaults are revoked");
assert.match(migration, /create or replace function public\.create_campus_classroom_announcement/i, "Announcement writes use a guarded RPC");
assert.match(migration, /create or replace function public\.create_campus_classroom_material/i, "Material writes use a guarded RPC");
assert.match(migration, /create or replace function public\.create_campus_opportunity/i, "Opportunity creation uses a guarded RPC");
assert.match(migration, /create or replace function public\.update_my_campus_opportunity/i, "Opportunity edits are owner-gated");
assert.match(migration, /create or replace function public\.submit_campus_opportunity/i, "Opportunity submissions use a guarded RPC");
assert.match(migration, /create or replace function public\.review_campus_opportunity/i, "Opportunity review uses a guarded RPC");
assert.match(migration, /is_official=false/i, "Ordinary moderation cannot falsely mark an opportunity as official");
assert.match(migration, /set search_path to ''/i, "Security-definer functions lock search_path");
assert.match(migration, /revoke all on function public\.review_campus_opportunity\(uuid,text,text\) from public, anon, authenticated/i, "Review RPC defaults are revoked before explicit grants");
assert.match(migration, /grant execute on function public\.review_campus_opportunity\(uuid,text,text\) to authenticated/i, "Review RPC is explicitly available only to authenticated callers");

assert.match(migration, /create or replace function public\.list_my_campus_opportunities/i, "Owners can safely retrieve only their own submissions");
assert.match(migration, /Only the verified teacher who owns this class can view its roster/i, "Student rosters are private to the class-owning teacher");
assert.match(migration, /revoke all on table public\.campus_class_attendance_audit from public, anon, authenticated/i, "Attendance audit grants are removed");
assert.match(migration, /create policy campus_class_attendance_select_authorized[\s\S]*?campus_class_attendance\.student_id = \(select auth\.uid\(\)\)/i, "Students can read only their own attendance; teachers can manage their class");
assert.match(migration, /grant select \(id, session_id, status, marked_at, updated_at\)[\s\S]*?on table public\.campus_class_attendance to authenticated/i, "Attendance SELECT grants omit student and marker IDs");
assert.match(classroomSchema, /create table if not exists public\.campus_classrooms/i, "Classroom base schema is idempotent for existing staging objects");
assert.match(classroomSchema, /alter table public\.campus_class_attendance_audit enable row level security/i, "Class attendance audit RLS is enabled");
assert.match(classroomAccess, /create or replace function private\.can_access_classroom/i, "Classroom access helper exists before hardening");
assert.match(classroomJoinCode, /private\.get_campus_classroom_join_code_impl/i, "Join codes are retrieved through a private implementation");
assert.match(migration, /create or replace function private\.can_manage_class_attendance/i, "Attendance management checks active verified membership");
assert.match(migration, /create or replace function public\.set_campus_class_assistant/i, "Class assistant assignment is guarded");
console.log("Classroom and Opportunity Hub migration smoke checks passed.");
