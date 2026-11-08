import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const html = read("../index.html");
const app = read("../campusshield-app.js");
const attendance = read("../campus-attendance.js");
const styles = read("../campus-attendance.css");

assert.doesNotThrow(() => new vm.Script(attendance), "Attendance module parses");
assert.match(html, /campus-attendance\.css/, "Attendance stylesheet is loaded");
assert.match(html, /campus-attendance\.js/, "Attendance module is loaded");
assert.match(app, /data-campus-attendance/, "Classroom detail includes the attendance mount point");
assert.match(app, /CampusShieldAttendance\?\.mount\(classroomId/, "Attendance module mounts after classroom detail loads");

for (const rpc of [
  "get_campus_class_attendance_capabilities",
  "create_campus_class_session",
  "issue_campus_class_attendance_qr_token",
  "check_in_campus_class_attendance",
  "list_campus_class_attendance_sessions",
  "list_campus_class_attendance_roster",
  "mark_campus_class_attendance",
  "close_campus_class_attendance_session"
]) {
  assert.ok(attendance.includes(rpc), "Attendance module uses the existing staging RPC: " + rpc);
}

assert.match(attendance, /cdnjs\.cloudflare\.com\/ajax\/libs\/qrcode-generator\/1\.4\.4/, "QR generator is pinned to a known version");
assert.match(attendance, /expires_at/, "QR display uses the server-issued expiry");
assert.match(attendance, /45 seconds/, "QR UI communicates the short token lifetime");
assert.match(attendance, /does not prove physical presence/, "UI does not overstate QR check-in assurance");
assert.match(attendance, /already_recorded/, "Duplicate scans receive an explicit idempotent result");
assert.match(attendance, /data-attendance-roster/, "Class staff can review the roster");
assert.match(attendance, /mark_campus_class_attendance/, "Class staff can correct attendance using the audited RPC");
assert.match(attendance, /close_campus_class_attendance_session/, "Class staff can close check-in");
assert.match(attendance, /get_campus_class_attendance_capabilities/, "UI asks the server for classroom capabilities");
assert.match(attendance, /profile-cleared/, "Private attendance UI clears when the profile is cleared");
assert.doesNotMatch(attendance, /localStorage|sessionStorage/, "QR tokens are not persisted in browser storage");
assert.doesNotMatch(attendance, /navigator\.geolocation|face.?recognition|selfie/i, "Attendance does not collect location, face or selfie data");
assert.match(attendance, /audio:\s*false/, "Camera scanning never requests microphone access");
assert.match(styles, /@media\(max-width:650px\)/, "Attendance layout supports phones");
assert.match(styles, /html\[data-theme="dark"\]/, "Attendance panel supports dark mode");

console.log("CampusShield QR attendance smoke checks passed.");
