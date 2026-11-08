import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const html = read("../index.html");
const app = read("../campusshield-app.js");
const backend = read("../campusshield-backend.js");
const attendance = read("../campus-qr-attendance.js");
const qrVendor = read("../vendor/qrcode.js");
const css = read("../campus-qr-attendance.css");

for (const [source, filename] of [
  [app, "campusshield-app.js"],
  [backend, "campusshield-backend.js"],
  [attendance, "campus-qr-attendance.js"],
  [qrVendor, "vendor/qrcode.js"],
]) new vm.Script(source, { filename });

const backendTag = html.indexOf('./campusshield-backend.js');
const qrVendorTag = html.indexOf('./vendor/qrcode.js');
const attendanceTag = html.indexOf('./campus-qr-attendance.js');
const appTag = html.indexOf('./campusshield-app.js');
assert.ok(backendTag >= 0 && qrVendorTag > backendTag && attendanceTag > qrVendorTag && appTag > attendanceTag,
  "QR attendance dependencies must load after backend and before the app event producer.");
assert.match(html, /id="campus-attendance-panel"/);
assert.match(html, /id="campus-attendance-deep-link-message"/);
assert.match(html, /name="referrer" content="no-referrer"/);
assert.match(app, /campusshield:classroom-detail-loaded/);
assert.match(backend, /get_campus_class_attendance_capabilities/);
assert.match(backend, /create_campus_class_attendance_session/);
assert.match(backend, /issue_campus_class_attendance_qr_token/);
assert.match(backend, /check_in_campus_class_attendance/);
assert.match(backend, /get_my_campus_class_attendance/);
assert.match(attendance, /campusshield:classroom-detail-loaded/);
assert.match(attendance, /campusshield:profile-ready/);
assert.match(attendance, /campusshield:profile-cleared/);
assert.match(app, /campusshield:session-signed-out/);
assert.match(attendance, /campusshield:session-signed-out/);
assert.match(attendance, /sessionStorage\.removeItem\(pendingDeepLinkStorageKey\)/);
assert.match(attendance, /pendingDeepLinkInMemory = null/);
assert.match(app, /\['student','teacher','admin'\]\.includes\(currentProfile\?\.role\)/);
assert.match(app, /\['student','teacher','admin'\]\.includes\(currentProfile\.role\)/);

assert.match(attendance, /BarcodeDetector/);
assert.match(attendance, /getUserMedia/);
assert.match(attendance, /pendingDeepLinkStorageKey/);
assert.match(attendance, /sessionStorage.removeItem/);
assert.match(attendance, /replaceState/);
assert.match(attendance, /safe.replace/);
assert.doesNotMatch(attendance, /getCurrentPosition|FaceDetector|face-api|face recognition/i);
assert.ok(!attendance.includes("{ once: true }") && !attendance.includes("{once:true}"),
  "Attendance handlers must remain usable after their first action.");
assert.ok(css.includes(".campus-attendance-form-grid"));
assert.ok(css.includes("@media(max-width:760px)"));
assert.match(qrVendor, /Licensed under the MIT license/);

assert.match(app, /\['student','teacher','admin','admin'\]\.includes\(currentProfile\?\.role\)/,
  "Verified students, teachers and campus administrators must be able to open classrooms.");
assert.match(app, /\['student','teacher','admin','admin'\]\.includes\(currentProfile\.role\)/,
  "The classroom route must enforce the same verified role allowlist as navigation.");
assert.match(app, /const classroomCreateAccess = \['teacher','admin'\]/,
  "Only verified teachers and university administrators should see classroom creation.");
assert.match(html, /Join your classes, manage teaching spaces and track attendance/);
assert.match(html, /Verified teachers and university administrators can create classes/);

console.log("Campus QR attendance smoke checks passed.");
