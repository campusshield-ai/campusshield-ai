import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const html = read("index.html");
const app = read("campusshield-app.js");
const backend = read("campusshield-backend.js");
const voice = read("campus-voice-notes.js");
const css = read("campus-voice-notes.css");
const baseMigration = read("supabase/migrations/20261105205000_campus_chat_private_voice_notes.sql");
const hardening = read("supabase/migrations/20261106010000_campus_voice_notes_participant_read_hardening.sql");
const directMigration = read("supabase/migrations/20261025180000_university_private_messages.sql");

assert.match(html, /campus-voice-notes\.js/);
assert.match(html, /campus-voice-notes\.css/);
for (const id of [
  "campus-chat-voice-record", "campus-chat-voice-discard", "campus-chat-voice-preview", "campus-chat-voice-status",
  "campus-dm-voice-record", "campus-dm-voice-discard", "campus-dm-voice-preview", "campus-dm-voice-status"
]) assert.match(html, new RegExp('id="' + id + '"'));
assert.doesNotMatch(html, /id="campus-chat-input"[^>]*required/);
assert.doesNotMatch(html, /id="campus-dm-compose-input"[^>]*required/);
assert.match(backend, /async sendCampusChatMessage\(channel, body\)/);
assert.match(backend, /async sendCampusDirectMessage\(conversationId, body\)/);
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
assert.match(css, /\.campus-voice-player/);
assert.match(baseMigration, /values \([\s\S]*?'campus-chat-voice-notes'[\s\S]*?false[\s\S]*?8388608/);
assert.match(baseMigration, /campus_voice_notes_upload_sender/);
assert.match(baseMigration, /campus_voice_notes_delete_unlinked_sender/);
assert.match(baseMigration, /private\.current_user_has_verified_campus_access/);
assert.match(baseMigration, /private\.can_read_campus_direct_message/);
assert.match(hardening, /private\.can_read_campus_direct_message\(m\.conversation_id,m\.university_id,m\.sender_id\)/);
assert.match(hardening, /m\.status = 'published'/);
assert.match(directMigration, /create or replace function private\.can_read_campus_direct_message/i);
assert.match(directMigration, /c\.user_one_id = \(select auth\.uid\(\)\) or c\.user_two_id = \(select auth\.uid\(\)\)/);
assert.doesNotMatch(baseMigration + hardening, /to\s+anon/i);
console.log("CampusShield private voice-note syntax, storage privacy and participant access checks passed.");
