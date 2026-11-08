const { test, expect } = require("@playwright/test");
const path = require("node:path");

const UUID_SESSION = "11111111-1111-4111-8111-111111111111";
const TOKEN = "a".repeat(64);

async function bootAttendance(page, capability, rpcOverrides = {}) {
  await page.setContent('<main><section class="panel campus-attendance-panel" data-campus-attendance></section></main>');
  await page.evaluate(({ capability, rpcOverrides }) => {
    window.__attendanceCalls = [];
    window.confirm = () => true;
    window.qrcode = function () {
      let payload = "";
      return {
        addData(value) { payload = value; },
        make() {},
        createDataURL() { return "data:image/png;base64," + btoa(payload); }
      };
    };
    window.CampusShieldBackend = {
      client: {
        async rpc(name, args) {
          window.__attendanceCalls.push({ name, args });
          if (Object.prototype.hasOwnProperty.call(rpcOverrides, name)) {
            const value = await rpcOverrides[name](args);
            return { data: value, error: null };
          }
          if (name === "get_campus_class_attendance_capabilities") {
            return { data: capability, error: null };
          }
          if (name === "list_campus_class_attendance_sessions") {
            return { data: [{
              session_id: "11111111-1111-4111-8111-111111111111",
              title: "CSC 301 — Monday lecture",
              session_date: "2026-11-08",
              created_at: new Date().toISOString(),
              attendance_window_ends_at: new Date(Date.now() + 3600000).toISOString(),
              attendance_closed_at: null,
              late_after_minutes: 15,
              checked_in_count: 1,
              present_count: 1,
              late_count: 0
            }], error: null };
          }
          if (name === "issue_campus_class_attendance_qr_token") {
            return { data: [{ qr_token: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", expires_at: new Date(Date.now() + 45000).toISOString() }], error: null };
          }
          if (name === "list_campus_class_attendance_roster") {
            return { data: [{ student_id: "22222222-2222-4222-8222-222222222222", display_name: "Ada Student", status: "present", marked_at: new Date().toISOString(), attendance_method: "qr" }], error: null };
          }
          if (name === "mark_campus_class_attendance") return { data: "attendance-row", error: null };
          if (name === "create_campus_class_session") return { data: "33333333-3333-4333-8333-333333333333", error: null };
          if (name === "close_campus_class_attendance_session") return { data: true, error: null };
          if (name === "check_in_campus_class_attendance") {
            return { data: [{
              attendance_id: "attendance-row",
              status: "present",
              marked_at: new Date().toISOString(),
              already_recorded: false,
              session_title: "CSC 301 — Monday lecture",
              classroom_title: "CSC 301"
            }], error: null };
          }
          return { data: null, error: { message: "Unexpected RPC: " + name } };
        }
      }
    };
  }, { capability, rpcOverrides });
  await page.addScriptTag({ path: path.resolve(__dirname, "../../campus-attendance.js") });
}

test("verified class staff can create sessions, rotate QR codes and review or correct the roster", async ({ page }) => {
  await bootAttendance(page, { can_access: true, can_manage: true });
  await page.evaluate(() => window.CampusShieldAttendance.mount("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "teacher"));

  const panel = page.locator("[data-campus-attendance]");
  await expect(panel).toContainText("QR attendance register");
  await expect(panel).toContainText("CSC 301 — Monday lecture");

  await panel.getByRole("button", { name: "Show / refresh QR" }).click();
  const qrImage = panel.locator("[data-attendance-qr-image]");
  await expect(qrImage).toHaveAttribute("src", /^data:image\/png;base64,/);
  await expect(panel).toContainText("45 seconds");
  await expect(panel).toContainText("does not prove physical presence");

  await panel.getByRole("button", { name: "View roster" }).click();
  await expect(panel).toContainText("Ada Student");
  await panel.locator('[data-attendance-status="22222222-2222-4222-8222-222222222222"]').selectOption("absent");
  await panel.getByRole("button", { name: "Save" }).click();
  await expect.poll(async () => page.evaluate(() =>
    window.__attendanceCalls.some(call =>
      call.name === "mark_campus_class_attendance" &&
      call.args.p_status === "absent"
    )
  )).toBe(true);

  await panel.locator("#campus-attendance-session-title").fill("CSC 301 revision session");
  await panel.getByRole("button", { name: "Start attendance session for today" }).click();
  await expect.poll(async () => page.evaluate(() =>
    window.__attendanceCalls.some(call => call.name === "create_campus_class_session")
  )).toBe(true);

  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0);
});

test("verified enrolled students can check in with a QR payload; invalid and duplicate scans are handled safely", async ({ page }) => {
  let alreadyRecorded = false;
  await bootAttendance(
    page,
    { can_access: true, can_manage: false },
    {
      check_in_campus_class_attendance: async () => [{
        attendance_id: "attendance-row",
        status: "present",
        marked_at: new Date().toISOString(),
        already_recorded: alreadyRecorded,
        session_title: "CSC 301 — Monday lecture",
        classroom_title: "CSC 301"
      }]
    }
  );
  await page.evaluate(() => window.CampusShieldAttendance.mount("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "student"));
  const panel = page.locator("[data-campus-attendance]");
  await expect(panel).toContainText("Check in to this class");

  const payload = JSON.stringify({
    type: "campusshield-class-attendance",
    v: 1,
    sessionId: UUID_SESSION,
    token: TOKEN
  });
  const input = panel.locator("#campus-attendance-qr-text");
  await input.fill(payload);
  await panel.getByRole("button", { name: "Submit check-in" }).click();
  await expect(panel.locator("[data-attendance-student-status]")).toContainText("Check-in recorded");
  expect(await page.evaluate(() => window.__attendanceCalls.filter(call => call.name === "check_in_campus_class_attendance").length)).toBe(1);

  alreadyRecorded = true;
  await input.fill(payload);
  await panel.getByRole("button", { name: "Submit check-in" }).click();
  await expect(panel.locator("[data-attendance-student-status]")).toContainText("already checked in");
  expect(await page.evaluate(() => window.__attendanceCalls.filter(call => call.name === "check_in_campus_class_attendance").length)).toBe(2);

  await input.fill("not a valid QR");
  await panel.getByRole("button", { name: "Submit check-in" }).click();
  await expect(panel.locator("[data-attendance-student-status]")).toContainText("not a CampusShield attendance code");
  expect(await page.evaluate(() => window.__attendanceCalls.filter(call => call.name === "check_in_campus_class_attendance").length)).toBe(2);
});

test("student scanner offers a paste-code fallback when built-in QR camera support is unavailable", async ({ page }) => {
  await bootAttendance(page, { can_access: true, can_manage: false });
  await page.evaluate(() => {
    delete window.BarcodeDetector;
    window.CampusShieldAttendance.mount("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "student");
  });
  const panel = page.locator("[data-campus-attendance]");
  await panel.getByRole("button", { name: "Open camera to scan QR" }).click();
  await expect(panel.locator("[data-attendance-camera-status]")).toContainText("does not support built-in QR scanning");
  await expect(panel.locator("#campus-attendance-qr-text")).toBeVisible();
});
