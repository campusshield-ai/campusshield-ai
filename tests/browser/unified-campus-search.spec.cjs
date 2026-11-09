const { test, expect } = require("@playwright/test");

test("unified search finds campus spaces and currently rendered campus content", async ({ page }) => {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const workspace = document.getElementById("workspace");
    if (workspace) { workspace.hidden = false; workspace.style.display = "block"; }
    const login = document.getElementById("login-screen");
    if (login) { login.hidden = true; login.style.display = "none"; }
  });

  const search = page.locator("#campus-global-search");
  const results = page.locator("#campus-global-search-results");
  await expect(search).toBeVisible();
  await expect(page.locator("#campus-marketplace-search")).toHaveCount(1);
  await expect(page.locator("#campus-opportunities-search")).toHaveCount(1);

  await search.fill("Marketplace");
  await expect(results).toContainText("Marketplace");
  await expect(page.locator("#campus-dashboard-quicklinks [data-page='marketplace']")).toHaveCount(1);

  await search.fill("Opportunity Hub");
  await expect(results).toContainText("Opportunity Hub");
  await expect(page.locator("#campus-dashboard-quicklinks [data-page='opportunities']")).toHaveCount(1);

  const hasNetwork = await page.locator("#page-campus-network").count();
  await search.fill("Campus Network");
  if (hasNetwork) {
    await expect(results).toContainText("Campus Network");
    await expect(page.locator("#campus-dashboard-quicklinks [data-page='campus-network']")).toHaveCount(1);
  } else {
    await expect(results).not.toContainText("Campus Network");
  }

  await page.evaluate(() => {
    const feed = document.getElementById("campus-marketplace-feed");
    const card = document.createElement("article");
    card.className = "community-post campus-marketplace-card campus-live-marketplace-card";
    card.dataset.status = "published";
    card.dataset.category = "books";
    card.dataset.price = "1500";
    card.dataset.createdAt = "2026-11-08T00:00:00Z";
    const heading = document.createElement("h3");
    heading.textContent = "Physics 101 revision workbook";
    const description = document.createElement("p");
    description.textContent = "Calculus and mechanics study notes for first year students.";
    card.append(heading, description);
    feed.replaceChildren(card);
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const searchBox = await search.boundingBox();
  expect(searchBox).not.toBeNull();
  expect(searchBox.x).toBeGreaterThanOrEqual(0);
  expect(searchBox.x + searchBox.width).toBeLessThanOrEqual(391);

  await search.fill("Physics 101 revision workbook");
  await expect(results).toContainText("Physics 101 revision workbook");
  await page.evaluate(() => {
    const nav = document.querySelector('[data-page="marketplace"]');
    nav?.addEventListener("click", () => {
      document.documentElement.dataset.marketplaceSearchActivated = "true";
    }, {capture:true, once:true});
  });
  await page.locator(".global-search-result").first().click();
  // This fixture deliberately has no signed-in Supabase session, so the app
  // shows its sign-in guard instead of switching pages. Confirm the search
  // correctly triggers the real Marketplace navigation control.
  await expect(page.locator("html")).toHaveAttribute("data-marketplace-search-activated", "true");
  await expect(results).toBeHidden();
});




test("global search finds verified campus notices and course resources", async ({ page }) => {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const workspace = document.getElementById("workspace");
    if (workspace) { workspace.hidden = false; workspace.style.display = "block"; }
    const login = document.getElementById("login-screen");
    if (login) { login.hidden = true; login.style.display = "none"; }
    const addCard = (feedId, title, body) => {
      const feed = document.getElementById(feedId);
      const card = document.createElement("article");
      const heading = document.createElement("h3");
      heading.textContent = title;
      const description = document.createElement("p");
      description.textContent = body;
      card.append(heading, description);
      feed?.replaceChildren(card);
    };
    addCard("campus-noticeboard-feed", "Registration closes Friday", "Verified Registrar notice: semester registration deadline is Friday.");
    addCard("campus-courses-feed", "Computer Architecture", "Approved course resources and lecture notes for second year students.");
    addCard("campus-course-resources-feed", "Intro to Java notes", "Approved programming resource for first year students.");
  });
  const search = page.locator("#campus-global-search");
  const results = page.locator("#campus-global-search-results");
  await expect(search).toBeVisible();
  await expect(page.locator("#campus-global-search")).toHaveCount(1);
  await expect(page.locator("#campus-global-search-results")).toHaveCount(1);
  await search.fill("registration closes friday");
  await expect(results).toContainText("Registration closes Friday");
  await search.fill("Computer Architecture lecture notes");
  await expect(results).toContainText("Computer Architecture");
  await search.fill("Intro to Java");
  await expect(results).toContainText("Intro to Java notes");
});

test("My Day renders the real private timetable snapshot, clears on sign-out and fits mobile", async ({ page }) => {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const workspace = document.getElementById("workspace");
    if (workspace) { workspace.hidden = false; workspace.style.display = "block"; }
    const login = document.getElementById("login-screen");
    if (login) { login.hidden = true; login.style.display = "none"; }

    const todayAt = hour => new Date(
      new Date().getFullYear(), new Date().getMonth(), new Date().getDate(), hour, 0, 0
    ).toISOString();
    window.CampusShieldBackend = {
      isConfigured: true,
      getMyCampusContext: async () => ({ university_id: "university-fixture" }),
      listMyTimetableItems: async () => [
        { id: "class-1", title: "Applied Mathematics", kind: "class", course_code: "MTH 201", location: "Lecture Hall A", starts_at: todayAt(9), ends_at: todayAt(10), completed: false },
        { id: "task-1", title: "Submit lab report", kind: "assignment", course_code: "CSC 204", starts_at: todayAt(10), ends_at: null, completed: false }
      ],
      listCampusCourses: async () => [],
      listCampusEvents: async () => [
        { id: "event-1", title: "Faculty seminar", starts_at: todayAt(11), location: "Main Auditorium" }
      ]
    };
    window.dispatchEvent(new CustomEvent("campusshield:profile-ready", {
      detail: { role: "student" }
    }));
  });

  const panel = page.locator("#campus-my-day");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Applied Mathematics");
  await expect(panel).toContainText("MTH 201");
  await expect(panel).toContainText("Submit lab report");
  await expect(panel).toContainText("Faculty seminar");
  await expect(page.locator("#campus-my-day-summary")).toContainText("1 class");
  await expect(page.locator("#campus-my-day-summary")).toContainText("1 task");
  await expect(page.locator("#campus-my-day-summary")).toContainText("1 campus event");
  await expect(panel.locator("[data-page='timetable']")).toHaveText("Open timetable");

  await page.evaluate(() => window.dispatchEvent(new Event("campusshield:profile-cleared")));
  await expect(panel).not.toContainText("Applied Mathematics");
  await expect(panel).toContainText("Sign in to sync your day");

  await page.evaluate(() => {
    window.CampusShieldBackend.listMyTimetableItems = () => new Promise(resolve => {
      window.__resolveStaleTimetable = resolve;
    });
    window.__staleTimetableLoad = window.CampusShieldTimetable.load();
  });
  await page.waitForFunction(() => typeof window.__resolveStaleTimetable === "function");
  await page.evaluate(() => {
    window.dispatchEvent(new Event("campusshield:profile-cleared"));
    window.__resolveStaleTimetable([
      { id: "stale-1", title: "Previous account private class", kind: "class", course_code: "OLD 100", starts_at: new Date().toISOString() }
    ]);
  });
  await page.evaluate(async () => { await window.__staleTimetableLoad; });
  const clearedSnapshot = await page.evaluate(() => window.CampusShieldTimetable.getTodaySnapshot());
  expect(clearedSnapshot.loaded).toBe(false);
  expect(clearedSnapshot.items).toHaveLength(0);
  await expect(panel).not.toContainText("Previous account private class");
  await expect(panel).toContainText("Sign in to sync your day");

  await page.setViewportSize({ width: 390, height: 844 });
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(391);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(391);
});
