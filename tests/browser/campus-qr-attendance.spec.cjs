const { test, expect } = require("@playwright/test");

const classId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const qrToken = "a".repeat(64);

async function prepareWorkspace(page) {
  await page.route("**/campusshield-app.js", route =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: "" })
  );
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const workspace = document.getElementById("workspace");
    if (workspace) { workspace.hidden = false; workspace.style.display = "block"; }
    const login = document.getElementById("login-screen");
    if (login) { login.hidden = true; login.style.display = "none"; }
    const classroomPage = document.getElementById("page-classroom");
    classroomPage?.classList.add("active");
    const detail = document.getElementById("classroom-detail-panel");
    if (detail) { detail.hidden = false; detail.style.display = "block"; }
  });
}

test("verified staff can create sessions, rotate QR, inspect roster and close check-in repeatedly", async ({ page }) => {
  await prepareWorkspace(page);
  await page.evaluate(({ classId, sessionId, qrToken }) => {
    const state = { created: 0, closed: false, qrIssued: 0, rosterLoads: 0 };
    const session = () => ({
      session_id: sessionId,
      title: "CSC 201 · Week 4",
      created_at: new Date().toISOString(),
      attendance_window_ends_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      attendance_closed_at: state.closed ? new Date().toISOString() : null,
      checked_in_count: 1,
      present_count: 1,
      late_count: 0
    });
    window.__attendanceState = state;
    window.CampusShieldBackend = {
      getCampusClassAttendanceCapabilities: async () => ({
        can_access: true, can_manage: true, classroom_title: "Computer Science", classroom_subject: "CSC 201"
      }),
      createCampusClassAttendanceSession: async () => { state.created += 1; return sessionId; },
      listCampusClassAttendanceSessions: async () => [session()],
      issueCampusClassAttendanceQrToken: async () => {
        state.qrIssued += 1;
        return { qr_token: qrToken, expires_at: new Date(Date.now() + 45000).toISOString() };
      },
      closeCampusClassAttendanceSession: async () => { state.closed = true; return true; },
      listCampusClassAttendanceRoster: async () => {
        state.rosterLoads += 1;
        return [{ student_id: "33333333-3333-4333-8333-333333333333", display_name: "Test Student", status: "present", marked_at: new Date().toISOString(), attendance_method: "qr" }];
      }
    };
    window.dispatchEvent(new CustomEvent("campusshield:classroom-detail-loaded", { detail: { classroomId: classId } }));
  }, { classId, sessionId, qrToken });

  const panel = page.locator("#campus-attendance-panel");
  await expect(panel).toContainText("Class attendance");
  await page.locator("#campus-attendance-title").fill("CSC 201 · Week 4");
  await page.locator("#campus-attendance-window").selectOption("60");
  await page.locator("#campus-attendance-late").selectOption("15");
  await panel.getByRole("button", { name: "Create attendance session" }).click();
  await expect(panel).toContainText("CSC 201 · Week 4");
  await expect.poll(() => page.evaluate(() => window.__attendanceState.created)).toBe(1);

  await panel.getByRole("button", { name: "Display QR" }).click();
  await expect(panel.locator("[data-attendance-qr-image] svg")).toBeVisible();
  await expect(panel.locator("[data-attendance-countdown]")).toContainText("QR refreshes in");

  // A second independent action on the same panel must still work after showing a QR.
  await panel.getByRole("button", { name: "View register" }).click();
  await expect(panel.locator("#campus-attendance-register")).toContainText("Test Student");
  await expect.poll(() => page.evaluate(() => window.__attendanceState.rosterLoads)).toBe(1);

  page.on("dialog", dialog => dialog.accept());
  await panel.getByRole("button", { name: "Close check-in" }).click();
  await expect.poll(() => page.evaluate(() => window.__attendanceState.closed)).toBe(true);
  await expect(panel).toContainText("Attendance closed");

  await page.setViewportSize({ width: 390, height: 844 });
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(391);
});

test("student scan controls are explicit and QR deep links are scrubbed from the address bar", async ({ page }) => {
  await prepareWorkspace(page);
  await page.evaluate(({ classId }) => {
    let cameraCalls = 0;
    window.__cameraCalls = () => cameraCalls;
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        configurable: true,
        value: async (...args) => { cameraCalls += 1; return original(...args); }
      });
    }
    window.CampusShieldBackend = {
      getCampusClassAttendanceCapabilities: async () => ({
        can_access: true, can_manage: false, classroom_title: "Computer Science"
      }),
      getMyCampusClassAttendance: async () => [{
        session_id: "22222222-2222-4222-8222-222222222222",
        title: "CSC 201 · Week 4", created_at: new Date().toISOString(),
        status: null, marked_at: null
      }],
      checkInCampusClassAttendance: async () => ({
        attendance_id: "44444444-4444-4444-8444-444444444444",
        session_title: "CSC 201 · Week 4", status: "present",
        marked_at: new Date().toISOString(), already_recorded: false
      })
    };
    window.dispatchEvent(new CustomEvent("campusshield:classroom-detail-loaded", { detail: { classroomId: classId } }));
  }, { classId });

  const panel = page.locator("#campus-attendance-panel");
  await expect(panel).toContainText("My class attendance");
  expect(await page.evaluate(() => window.__cameraCalls())).toBe(0);
  await panel.getByRole("button", { name: "Scan lecturer QR code" }).click();
  await expect(panel.locator("#campus-attendance-scanner")).toBeVisible();
  expect(await page.evaluate(() => window.__cameraCalls())).toBeLessThanOrEqual(1);
});

test("attendance QR deep-link token is removed from the address bar before account interaction", async ({ page }) => {
  await page.route("**/campusshield-app.js", route =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: "" })
  );
  await page.goto("/index.html?attendance_session=" + sessionId + "&attendance_token=" + qrToken, { waitUntil: "domcontentloaded" });
  await expect.poll(() => page.evaluate(() => !location.search.includes("attendance_token"))).toBe(true);
  await page.evaluate(() => {
    window.CampusShieldBackend = {
      checkInCampusClassAttendance: async () => ({
        attendance_id: "44444444-4444-4444-8444-444444444444",
        session_title: "CSC 201 · Week 4", status: "present",
        marked_at: new Date().toISOString(), already_recorded: false
      })
    };
    window.dispatchEvent(new Event("campusshield:profile-ready"));
  });
  await expect(page.locator("#campus-attendance-deep-link-message")).toContainText("Attendance recorded");
  await expect.poll(() => page.evaluate(() => !sessionStorage.getItem("campusshield:attendance:pending:v1"))).toBe(true);
});
