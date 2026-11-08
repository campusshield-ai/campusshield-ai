const { test, expect } = require("@playwright/test");

test("lecturer can create a class attendance session and display a rotating QR", async ({ page }) => {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    document.getElementById("workspace").hidden = false;
    document.getElementById("workspace").style.display = "block";
    document.getElementById("login-screen").hidden = true;
    document.getElementById("login-screen").style.display = "none";
    document.querySelectorAll(".page").forEach(section => section.classList.toggle("active", section.id === "page-classroom"));
    document.querySelector("#page-classroom").style.display = "block";
    document.getElementById("classroom-detail-panel").hidden = false;
    document.getElementById("classroom-detail-content").innerHTML = '<section class="panel" id="campus-attendance-panel"></section>';

    window.__attendanceSessions = [];
    const classroomId = "11111111-1111-4111-8111-111111111111";
    window.CampusShieldBackend = {
      getCampusClassAttendanceCapabilities: async () => ({
        can_access: true, can_manage: true,
        classroom_title: "Engineering 101", classroom_subject: "ENG 101"
      }),
      listCampusClassAttendanceSessions: async () => window.__attendanceSessions,
      createCampusClassAttendanceSession: async (id, title, windowMinutes, lateAfter) => {
        window.__attendanceSessions = [{
          session_id: "22222222-2222-4222-8222-222222222222",
          title, created_at: new Date().toISOString(),
          attendance_window_ends_at: new Date(Date.now() + windowMinutes * 60000).toISOString(),
          attendance_closed_at: null, late_after_minutes: lateAfter,
          checked_in_count: 0, present_count: 0, late_count: 0
        }];
        return window.__attendanceSessions[0].session_id;
      },
      issueCampusClassAttendanceQrToken: async () => ({
        qr_token: "a".repeat(64),
        expires_at: new Date(Date.now() + 45000).toISOString()
      }),
      listCampusClassAttendanceRoster: async () => [{
        student_id: "33333333-3333-4333-8333-333333333333",
        display_name: "Test Student", status: "present",
        marked_at: new Date().toISOString(), attendance_method: "qr"
      }],
      closeCampusClassAttendanceSession: async () => true
    };
    window.dispatchEvent(new CustomEvent("campusshield:classroom-detail-loaded", {
      detail: { classroomId }
    }));
  });

  const panel = page.locator("#campus-attendance-panel");
  await expect(panel).toContainText("Create attendance session");
  await page.locator("#campus-attendance-title").fill("ENG 101 — Week 2");
  await page.getByRole("button", { name: "Create attendance session" }).click();
  await expect(panel).toContainText("ENG 101 — Week 2");

  await page.getByRole("button", { name: "Display QR" }).click();
  await expect(panel.locator("[data-attendance-qr-image] svg")).toHaveCount(1);
  await expect(panel.locator("[data-attendance-countdown]")).toContainText("QR refreshes in");
  await expect(panel).toContainText("45 seconds");

  await page.getByRole("button", { name: "View register" }).click();
  await expect(panel).toContainText("Test Student");
  await expect(panel).toContainText("present");

  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = await panel.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(391);
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(documentWidth).toBeLessThanOrEqual(391);
});

test("student sees their own register and browser scan fallback", async ({ page }) => {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    document.getElementById("workspace").hidden = false;
    document.getElementById("workspace").style.display = "block";
    document.getElementById("login-screen").hidden = true;
    document.getElementById("login-screen").style.display = "none";
    document.querySelectorAll(".page").forEach(section => section.classList.toggle("active", section.id === "page-classroom"));
    document.querySelector("#page-classroom").style.display = "block";
    document.getElementById("classroom-detail-panel").hidden = false;
    document.getElementById("classroom-detail-content").innerHTML = '<section class="panel" id="campus-attendance-panel"></section>';
    window.CampusShieldBackend = {
      getCampusClassAttendanceCapabilities: async () => ({
        can_access: true, can_manage: false,
        classroom_title: "Engineering 101", classroom_subject: "ENG 101"
      }),
      getMyCampusClassAttendance: async () => [{
        session_id: "22222222-2222-4222-8222-222222222222",
        title: "ENG 101 — Week 2", created_at: new Date().toISOString(),
        status: null, marked_at: null
      }]
    };
    window.dispatchEvent(new CustomEvent("campusshield:classroom-detail-loaded", {
      detail: { classroomId: "11111111-1111-4111-8111-111111111111" }
    }));
  });

  const panel = page.locator("#campus-attendance-panel");
  await expect(panel).toContainText("My class attendance");
  await expect(panel).toContainText("ENG 101 — Week 2");
  await page.getByRole("button", { name: "Scan lecturer QR code" }).click();
  await expect(page.locator("#campus-attendance-scanner")).toBeVisible();
  await expect(page.locator("[data-scan-support]")).not.toBeEmpty();
});

test("QR deep link removes the temporary credential from browser history after check-in", async ({ page }) => {
  const sessionId = "22222222-2222-4222-8222-222222222222";
  const token = "b".repeat(64);
  await page.goto("/index.html?attendance_session=" + sessionId + "&attendance_token=" + token, {
    waitUntil: "domcontentloaded"
  });
  await page.evaluate(() => {
    document.getElementById("workspace").hidden = false;
    document.getElementById("workspace").style.display = "block";
    document.getElementById("login-screen").hidden = true;
    document.getElementById("login-screen").style.display = "none";
    window.CampusShieldBackend = {
      checkInCampusClassAttendance: async () => ({
        attendance_id: "44444444-4444-4444-8444-444444444444",
        status: "present", marked_at: new Date().toISOString(),
        already_recorded: false, session_title: "ENG 101 — Week 2",
        classroom_title: "Engineering 101"
      })
    };
    window.dispatchEvent(new Event("campusshield:profile-ready"));
  });

  const receipt = page.locator("#campus-attendance-deep-link-message");
  await expect(receipt).toContainText("Attendance recorded for ENG 101 — Week 2");
  await expect(receipt).toBeVisible();
  await expect(page).not.toHaveURL(/attendance_token=/);
  await expect(page).not.toHaveURL(/attendance_session=/);
});
