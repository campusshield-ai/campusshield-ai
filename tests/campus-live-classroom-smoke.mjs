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
const tokenFunction = await read("supabase/functions/campus-live-class-token/index.ts");
const endFunction = await read("supabase/functions/campus-live-class-end/index.ts");

assert.match(html, /campus-live-classroom\.css/);
assert.match(html, /campus-live-classroom\.js/);
assert.match(html, /id="campus-live-classroom-root"/);
assert.match(html, /Online Classroom/);

assert.match(app, /\['admin','teacher','student'\]\.includes\(currentProfile\?\.role\)/);
assert.match(app, /\['admin','teacher','student'\]\.includes\(currentProfile\.role\)/);
assert.match(backend, /listCampusLiveClassrooms/);
assert.match(adminScopeMigration, /private\.can_access_live_classroom/);
assert.match(adminScopeMigration, /public\.list_campus_live_classrooms/);
assert.match(adminScopeMigration, /private\.can_access_classroom\(p_classroom_id\)/);
assert.match(backend, /listCampusLiveClassSessions/);
assert.match(backend, /createCampusLiveClassSession/);
assert.match(backend, /startCampusLiveClassSession/);
assert.match(backend, /endCampusLiveClassSession/);
assert.match(backend, /requestCampusLiveClassToken/);

assert.match(ui, /listCampusLiveClassSessions/);
assert.match(ui, /getCampusLiveClassroomCapabilities/);
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
assert.match(adminScopeMigration, /p\.role = 'teacher'/);
assert.match(adminScopeMigration, /p\.role = 'student'/);
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

console.log("Campus live-classroom smoke checks passed.");
