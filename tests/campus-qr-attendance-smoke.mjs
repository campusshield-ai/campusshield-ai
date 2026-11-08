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
assert.match(attendance, /BarcodeDetector/);
assert.match(attendance, /getUserMedia/);
assert.match(attendance, /pendingDeepLinkStorageKey/);
assert.match(attendance, /sessionStorage.removeItem/);
assert.match(attendance, /replaceState/);
assert.match(attendance, /safe.replace/);
assert.doesNotMatch(attendance, /getCurrentPosition|FaceDetector|face-api|face recognition/i);
assert.doesNotMatch(attendance, /{s*onces*:s*trues*}/,
  "Attendance handlers must remain usable after their first action.");
assert.match(css, /.campus-attendance-form-grid/);
assert.match(css, /@media(max-width:760px)/);
assert.match(qrVendor, /Licensed under the MIT license/);
console.log("Campus QR attendance smoke checks passed.");
