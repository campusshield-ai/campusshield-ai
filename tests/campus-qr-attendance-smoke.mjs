import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const html = read("../index.html");
const app = read("../campusshield-app.js");
const backend = read("../campusshield-backend.js");
const attendance = read("../campus-qr-attendance.js");
const qr = read("../vendor/qrcode.js");
const qrLicense = read("../vendor/QRCODE-GENERATOR-LICENSE.txt");
const schema = read("../supabase/migrations/20261108115155_campus_class_qr_attendance.sql");
const privacy = read("../supabase/migrations/20261108115319_deny_direct_access_to_private_attendance_qr_tokens.sql");
const controls = read("../supabase/migrations/20261108120238_campus_class_attendance_session_controls.sql");

for (const [name, source] of [
  ["campusshield-app.js", app],
  ["campusshield-backend.js", backend],
  ["campus-qr-attendance.js", attendance],
  ["vendor/qrcode.js", qr]
]) new vm.Script(source, { filename: name });

assert.match(html, /vendor\/qrcode\.js/);
assert.match(html, /campus-qr-attendance\.js/);
assert.match(html, /id="campus-attendance-deep-link-message"/);
assert.match(app, /campusshield:classroom-detail-loaded/);

for (const rpc of [
  "get_campus_class_attendance_capabilities",
  "create_campus_class_attendance_session",
  "list_campus_class_attendance_sessions",
  "issue_campus_class_attendance_qr_token",
  "close_campus_class_attendance_session",
  "list_campus_class_attendance_roster",
  "get_my_campus_class_attendance",
  "check_in_campus_class_attendance"
]) assert.ok(backend.includes('"' + rpc + '"'), "Missing guarded RPC client: " + rpc);

assert.match(schema, /private\.campus_class_attendance_qr_tokens/);
assert.match(schema, /token_hash bytea NOT NULL/);
assert.match(schema, /extensions\.digest\(convert_to\(v_token, 'UTF8'\), 'sha256'\)/);
assert.match(schema, /interval '45 seconds'/);
assert.match(schema, /FOR SHARE OF s/);
assert.match(schema, /ON CONFLICT \(session_id, student_id\) DO NOTHING/);
assert.match(schema, /p\.role = 'student'/);
assert.match(schema, /m\.verification_status = 'verified'/);
assert.match(privacy, /USING \(false\)/);
assert.match(privacy, /WITH CHECK \(false\)/);
assert.match(controls, /create_campus_class_attendance_session/);
assert.match(controls, /get_my_campus_class_attendance/);

assert.match(attendance, /setInterval\(refresh, 35000\)/);
assert.match(attendance, /BarcodeDetector/);
assert.match(attendance, /attendance_session/);
assert.match(attendance, /attendance_token/);
assert.match(attendance, /history\.replaceState/);
assert.match(attendance, /Export CSV/);
assert.match(attendance, /does not independently prove physical presence/);
assert.doesNotMatch(attendance, /localStorage|sessionStorage/);
assert.match(qrLicense, /MIT License/);
assert.match(qr, /Copyright \(c\) 2009 Kazuhiko Arase/);

console.log("CampusShield QR attendance smoke checks passed.");
