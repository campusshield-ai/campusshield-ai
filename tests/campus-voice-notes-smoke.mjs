import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const html = read("index.html");
const app = read("campusshield-app.js");
const voice = read("campus-voice-notes.js");
const css = read("campus-voice-notes.css");
const migration = read("supabase/migrations/20261105205000_campus_chat_private_voice_notes.sql");

assert.match(html, /id="ideas-impact-nav"[^>]*data-ideas-impact-nav/);
assert.match(html, /campus-voice-notes\.js/);
assert.match(html, /campus-voice-notes\.css/);
assert.match(html, /id="campus-chat-voice-record"/);
assert.match(html, /id="campus-dm-voice-record"/);
assert.doesNotMatch(html, /id="campus-chat-input"[^>]*required/);
assert.doesNotMatch(html, /id="campus-dm-compose-input"[^>]*required/);
assert.match(app, /thread\.dataset\.conversationId = conversationId/);
assert.match(app, /card\.dataset\.status = String\(row\.status \|\| ""\)/);

assert.match(voice, /MediaRecorder/);
assert.match(voice, /getUserMedia/);
assert.match(voice, /MAX_SECONDS = 90/);
assert.match(voice, /MAX_BYTES = 8 \* 1024 \* 1024/);
assert.match(voice, /storage\.from\(BUCKET\)\.upload/);
assert.match(voice, /storage\.from\(BUCKET\)\.download/);
assert.match(voice, /sendCampusChatMessage/);
assert.match(voice, /sendCampusDirectMessage/);
assert.match(voice, /stopImmediatePropagation/);
assert.doesNotMatch(voice, /getPublicUrl|createSignedUrl|service_role|SUPABASE_SERVICE_ROLE/i);
assert.match(voice, /CAMPUSSHIELD_VOICE_V1/);
assert.match(css, /\.campus-voice-player/);

assert.match(migration, /public = false/);
assert.match(migration, /8388608/);
assert.match(migration, /campus_voice_notes_read_linked_messages/);
assert.match(migration, /campus_voice_notes_upload_sender/);
assert.match(migration, /campus_voice_notes_delete_unlinked_sender/);
assert.match(migration, /private\.can_read_campus_direct_message/);
assert.match(migration, /private\.current_user_has_verified_campus_access/);
assert.match(migration, /m\.status = 'published'/);
assert.doesNotMatch(migration, /to\s+anon/i);
console.log("CampusShield voice-note and Ideas & Impact navigation smoke checks passed.");