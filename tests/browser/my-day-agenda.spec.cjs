const { test, expect } = require("@playwright/test");

async function openDashboard(page, width = 1366) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  const panel = page.locator("#campus-my-day");
  await expect(panel).toBeAttached({ timeout: 10000 });
  await page.evaluate(() => {
    const workspace = document.getElementById("workspace");
    if (workspace) {
      workspace.hidden = false;
      workspace.style.display = "block";
    }
    const login = document.getElementById("login-screen");
    if (login) {
      login.hidden = true;
      login.style.display = "none";
    }
    window.__campusMyDayFixture = { loaded: true, items: [] };
    window.CampusShieldTimetable = {
      getTodaySnapshot: () => window.__campusMyDayFixture
    };
  });
  return panel;
}

async function publishSnapshot(page, items) {
  await page.evaluate(fixtureItems => {
    window.__campusMyDayFixture = { loaded: true, items: fixtureItems };
    window.dispatchEvent(new Event("campusshield:timetable-updated"));
  }, items);
}

function item(title, minutesFromNow, options = {}) {
  const start = Date.now() + minutesFromNow * 60 * 1000;
  const end = options.endsInMinutes === undefined
    ? null
    : start + options.endsInMinutes * 60 * 1000;
  return {
    id: options.id || title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    title,
    kind: options.kind || "class",
    label: options.label || (options.kind === "event" ? "Campus event" : "Class"),
    courseCode: options.courseCode || "",
    location: options.location || "",
    startsAt: new Date(start).toISOString(),
    endsAt: end === null ? null : new Date(end).toISOString(),
    completed: Boolean(options.completed),
    source: options.source || "planner"
  };
}

test("My Day highlights the next private timetable item", async ({ page }) => {
  await openDashboard(page);
  await publishSnapshot(page, [
    item("Database Systems", 45, { endsInMinutes: 90, courseCode: "CSC 301", location: "LT 2" }),
    item("Campus Innovation Fair", 180, { kind: "event", label: "Campus event", location: "Main Hall" })
  ]);

  const focus = page.locator("#campus-my-day-focus");
  await expect(focus).toBeVisible();
  await expect(focus.locator(".campus-my-day-focus-kicker")).toHaveText("UP NEXT");
  await expect(focus.locator(".campus-my-day-focus-title")).toHaveText("Database Systems");
  await expect(focus.locator(".campus-my-day-focus-meta")).toContainText("Starts at");
  await expect(focus.locator(".campus-my-day-focus-meta")).toContainText("CSC 301");
  await expect(focus.locator(".campus-my-day-focus-meta")).toContainText("LT 2");
  await expect(focus.locator("button[data-page='timetable']")).toHaveText("View schedule");
});

test("My Day prioritizes an item that is currently underway", async ({ page }) => {
  await openDashboard(page);
  await publishSnapshot(page, [
    item("Current Programming Lab", -15, { endsInMinutes: 30, courseCode: "CSC 201" }),
    item("Later Mathematics Class", 90, { endsInMinutes: 60 })
  ]);

  const focus = page.locator("#campus-my-day-focus");
  await expect(focus.locator(".campus-my-day-focus-kicker")).toHaveText("HAPPENING NOW");
  await expect(focus.locator(".campus-my-day-focus-title")).toHaveText("Current Programming Lab");
  await expect(focus.locator(".campus-my-day-focus-meta")).toContainText("Ends");
});

test("My Day surfaces an outstanding task when no future class is scheduled", async ({ page }) => {
  await openDashboard(page);
  await publishSnapshot(page, [
    item("Submit database assignment", -35, { kind: "assignment", label: "Assignment" })
  ]);

  const focus = page.locator("#campus-my-day-focus");
  await expect(focus.locator(".campus-my-day-focus-kicker")).toHaveText("STILL TO DO");
  await expect(focus.locator(".campus-my-day-focus-title")).toHaveText("Submit database assignment");
  await expect(focus.locator(".campus-my-day-focus-meta")).toContainText("Scheduled at");
});

test("My Day confirms when every scheduled item is complete", async ({ page }) => {
  await openDashboard(page);
  await publishSnapshot(page, [
    item("Morning lecture", -180, { endsInMinutes: 60, completed: true }),
    item("Revision task", -90, { kind: "reminder", label: "Reminder", completed: true })
  ]);

  const focus = page.locator("#campus-my-day-focus");
  await expect(focus.locator(".campus-my-day-focus-kicker")).toHaveText("DAY COMPLETE");
  await expect(focus.locator(".campus-my-day-focus-title")).toHaveText("You're all caught up");
  await expect(page.locator("#campus-my-day-summary")).toContainText("2 completed");
});

for (const width of [320, 360, 390, 430, 768, 1024, 1366, 1920]) {
  test(`My Day focus fits a ${width}px screen`, async ({ page }) => {
    await openDashboard(page, width);
    await publishSnapshot(page, [
      item("Computer Networks and Distributed Systems", 25, {
        endsInMinutes: 75,
        courseCode: "CSC 407",
        location: "Faculty Lecture Theatre"
      })
    ]);

    const metrics = await page.locator("#campus-my-day-focus").evaluate(element => {
      const rect = element.getBoundingClientRect();
      const action = element.querySelector("button")?.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        width: rect.width,
        documentWidth: document.documentElement.scrollWidth,
        actionRight: action?.right ?? null
      };
    });
    expect(metrics.width).toBeGreaterThan(220);
    expect(metrics.left).toBeGreaterThanOrEqual(-1);
    expect(metrics.right).toBeLessThanOrEqual(width + 1);
    expect(metrics.documentWidth).toBeLessThanOrEqual(width + 1);
    if (metrics.actionRight !== null) expect(metrics.actionRight).toBeLessThanOrEqual(width + 1);
  });
}

test("My Day focus remains readable in dark mode", async ({ page }) => {
  await openDashboard(page, 390);
  await publishSnapshot(page, [item("Networks tutorial", 30, { endsInMinutes: 60 })]);
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });

  const focus = page.locator("#campus-my-day-focus");
  await expect(focus).toBeVisible();
  const colors = await focus.evaluate(element => ({
    background: getComputedStyle(element).backgroundColor,
    title: getComputedStyle(element.querySelector(".campus-my-day-focus-title")).color,
    action: getComputedStyle(element.querySelector("button")).color
  }));
  expect(colors.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(colors.title).toBe("rgb(229, 241, 238)");
  expect(colors.action).toBe("rgb(216, 246, 223)");
});
