const backendTag = html.indexOf('./campusshield-backend.js');
const qrVendorTag = html.indexOf('./vendor/qrcode.js');
const attendanceTag = html.indexOf('./campus-qr-attendance.js');
const appTag = html.indexOf('./campusshield-app.js');
assert.ok(backendTag >= 0 && attendanceTag > backendTag && appTag > attendanceTag && qrVendorTag < 0,
  "QR deep-link capture stays after the backend and before app events; the QR image renderer is not downloaded at startup.");
assert.match(attendance, /function ensureQrCodeLibrary\(\)/,
  "lecturer QR creation has a guarded first-use loader.");
assert.match(attendance, /new URL\("\.\/vendor\/qrcode\.js", document\.baseURI\)/,
  "the QR generator resolves from the current app base URL when required.");
assert.match(attendance, /Promise\.all\(\[[\s\S]*?ensureQrCodeLibrary\(\)[\s\S]*?issueCampusClassAttendanceQrToken/,
  "QR code rendering loads concurrently with the server-issued attendance token.");
