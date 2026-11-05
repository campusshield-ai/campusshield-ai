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
const tokenFunction = await read("supabase/functions/campus-live-class-token/index.ts");
const endFunction = await read("supabase/functions/campus-live-class-end/index.ts");

assert.match(html, /campus-live-classroom\.css/);
assert.match(html, /campus-live-classroom\.js/);
assert.match(html, /id="campus-live-classroom-root"/);
assert.match(html, /Online Classroom/);

assert.match(app, /\['teacher','student'\]\.includes\(currentProfile\?\.role\)/);
assert.match(app, /\['teacher','student'\]\.includes\(currentProfile\.role\)/);
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
assert.match(migration, /revoke all on function public\.get_campus_live_class_token_context\(uuid\) from public, anon/i);
assert.match(migration, /grant execute on function public\.get_campus_live_class_token_context\(uuid\) to authenticated/i);

assert.match(tokenFunction, /client\.auth\.getUser\(\)/);
assert.match(tokenFunction, /get_campus_live_class_token_context/);
assert.match(tokenFunction, /LIVEKIT_API_SECRET/);
assert.match(tokenFunction, /token\.addGrant\(/);
assert.match(tokenFunction, /roomJoin: true/);
assert.doesNotMatch(tokenFunction, /SUPABASE_SERVICE_ROLE_KEY/);
assert.match(endFunction, /get_campus_live_class_token_context/);
assert.match(endFunction, /participant_role/);
assert.match(endFunction, /RoomServiceClient/);
assert.match(endFunction, /deleteRoom\(context\.room_name\)/);
assert.match(endFunction, /end_campus_live_class_session/);
assert.doesNotMatch(endFunction, /SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(ui + backend + html, /LIVEKIT_API_SECRET|LIVEKIT_API_KEY/);

console.log("Campus live-classroom smoke checks passed.");
