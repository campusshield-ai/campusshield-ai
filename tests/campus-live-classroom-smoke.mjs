import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

const html = await read("index.html");
const app = await read("campusshield-app.js");
const backend = await read("campusshield-backend.js");
const ui = await read("campus-live-classroom.js");
const css = await read("campus-live-classroom.css");
const migration = await read("supabase/migrations/20261105022245_campus_live_classroom_sessions.sql");
const indexMigration = await read("supabase/migrations/20261105024500_index_live_class_session_creator.sql");
const adminMigration = await read("supabase/migrations/20261105102246_campus_admin_live_classroom_access.sql");
const adminScopeMigration = await read("supabase/migrations/20261105103142_campus_live_classroom_admin_only_scope.sql");
const adminCreateMigration = await read("supabase/migrations/20261105105004_campus_admin_classroom_creation.sql");
const staffScopeMigration = await read("supabase/migrations/20261111160000_live_classroom_multi_membership_controls.sql");
const tokenFunction = await read("supabase/functions/campus-live-class-token/index.ts");
const endFunction = await read("supabase/functions/campus-live-class-end/index.ts");

assert.match(html, /campus-live-classroom\.css/);
assert.match(html, /campus-live-classroom\.js/);
assert.match(html, /id="campus-live-classroom-root"/);
assert.match(html, /Online Classroom/);

assert.match(app, /\['student','teacher','admin'\]\.includes\(currentProfile\?\.role\)/);
assert.match(app, /\['student','teacher','admin'\]\.includes\(currentProfile\.role\)/);
assert.match(backend, /listCampusLiveClassrooms/);
assert.ok(adminCreateMigration.includes("create or replace function private.create_campus_classroom_impl("));
assert.ok(adminCreateMigration.includes("v_role = 'admin'"));
assert.ok(adminCreateMigration.includes("m.campus_role = 'admin'"));
assert.ok(adminCreateMigration.includes("u.is_active = true"));
assert.ok(adminCreateMigration.includes("v_role = 'teacher'"));
assert.ok(adminCreateMigration.includes("m.campus_role = 'teacher'"));
assert.doesNotMatch(adminCreateMigration, /create or replace function private\.can_access_classroom/);
assert.match(adminScopeMigration, /private\.can_access_live_classroom/);
assert.doesNotMatch(adminMigration, /create or replace function private\\.can_access_classroom/);
assert.ok(!adminScopeMigration.includes("create or replace function private.can_access_classroom("));
assert.match(adminScopeMigration, /public\.list_campus_live_classrooms/);
assert.match(adminScopeMigration, /private\.can_access_classroom\(p_classroom_id\)/);
assert.match(backend, /listCampusLiveClassSessions/);
assert.match(backend, /createCampusLiveClassSession/);
assert.match(backend, /startCampusLiveClassSession/);
assert.match(backend, /endCampusLiveClassSession/);
assert.match(backend, /requestCampusLiveClassToken/);

assert.match(app, /\['teacher','admin'\]\.includes\(currentProfile\?\.role\)/);
assert.match(html, /Verified teachers and campus administrators can create classes/);
assert.match(ui, /listCampusLiveClassSessions/);
assert.match(ui, /getCampusLiveClassroomCapabilities/);
assert.match(ui, /data-live-manager-controls="true"/);
assert.match(ui, /LECTURER &amp; CAMPUS ADMIN CONTROLS/);
assert.match(ui, /canManage && item.status === "scheduled"/);
assert.match(ui, /canManage && item.status === "live"/);
assert.match(ui, /canManage && item.status === "ended"/);
assert.match(staffScopeMigration, /m\.user_id = \(select auth\.uid\(\)\)/);
assert.match(staffScopeMigration, /m\.membership_status = 'active'/);
assert.match(staffScopeMigration, /m\.verification_status = 'verified'/);
assert.match(staffScopeMigration, /private\.can_access_live_classroom\(c\.id\)/);
assert.doesNotMatch(staffScopeMigration, /current_campus_university_id/);
assert.match(ui, /data-live-action="join"/);
assert.match(ui, /TrackSubscribed/);
assert.match(ui, /setMicrophoneEnabled/);
assert.match(ui, /setCameraEnabled/);
assert.match(ui, /https:\/\/cdn\.jsdelivr\.net\/npm\/livekit-client@2\.23\.0/);
assert.match(css, /@media\(max-width:720px\)/);

assert.match(migration, /create table if not exists public\.campus_live_class_sessions/i);
assert.match(migration, /enable row level security/i);
assert.match(migration, /revoke all on table public\.campus_live_class_sessions from public, anon, authenticated/i);
assert.match(migration, /private\.can_access_classroom\(p_classroom_id\)/i);
assert.match(migration, /private\.can_manage_class_attendance\(p_classroom_id\)/i);
assert.match(migration, /get_campus_live_class_token_context_impl/i);
assert.match(adminMigration, /private\.is_verified_campus_admin_for_classroom/);
assert.match(adminMigration, /private\.can_manage_campus_live_classroom/);
assert.match(adminMigration, /m\.campus_role = 'admin'/);
assert.match(adminMigration, /m\.university_id = c\.university_id/);
assert.match(migration, /revoke all on function public\.get_campus_live_class_token_context\(uuid\) from public, anon/i);
assert.match(migration, /grant execute on function public\.get_campus_live_class_token_context\(uuid\) to authenticated/i);

assert.match(indexMigration, /campus_live_class_sessions_created_by_idx/);
assert.match(tokenFunction, /client\.auth\.getUser\(\)/);
assert.match(tokenFunction, /get_campus_live_class_token_context/);
assert.match(tokenFunction, /LIVEKIT_API_SECRET/);
assert.match(tokenFunction, /token\.addGrant\(/);
assert.match(tokenFunction, /roomJoin: true/);
assert.match(tokenFunction, /\"admin\"/);
assert.doesNotMatch(tokenFunction, /SUPABASE_SERVICE_ROLE_KEY/);
assert.match(endFunction, /get_campus_live_class_token_context/);
assert.match(endFunction, /participant_role/);
assert.match(endFunction, /\"admin\"/);
assert.match(endFunction, /RoomServiceClient/);
assert.match(endFunction, /deleteRoom\(context\.room_name\)/);
assert.match(endFunction, /end_campus_live_class_session/);
assert.doesNotMatch(endFunction, /SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(ui + backend + html, /LIVEKIT_API_SECRET|LIVEKIT_API_KEY/);


const publicClassroomCreateDeclaration = adminCreateMigration
  .split("create or replace function public.create_campus_classroom(")[1]
  ?.split("as $function$")[0] || "";
assert.ok(adminCreateMigration.includes("create or replace function private.create_campus_classroom_impl("));
assert.match(publicClassroomCreateDeclaration, /security invoker/i);
assert.doesNotMatch(publicClassroomCreateDeclaration, /security definer/i);

console.log("Campus live-classroom smoke checks passed.");
