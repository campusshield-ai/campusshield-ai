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


test("My Day renders a private timetable snapshot and remains usable on mobile", async ({ page }) => {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const workspace = document.getElementById("workspace");
    if (workspace) { workspace.hidden = false; workspace.style.display = "block"; }
    const login = document.getElementById("login-screen");
    if (login) { login.hidden = true; login.style.display = "none"; }
    const now = new Date();
    const later = new Date(now.getTime() + 60 * 60 * 1000);
    window.CampusShieldTimetable = {
      getTodaySnapshot: () => ({
        date: now.toISOString().slice(0, 10),
        loaded: true,
        items: [
          { id: "class-1", title: "Applied Mathematics", kind: "class", label: "Class", courseCode: "MTH 201", location: "Lecture Hall A", startsAt: now.toISOString(), endsAt: later.toISOString(), completed: false },
          { id: "task-1", title: "Submit lab report", kind: "assignment", label: "Assignment", courseCode: "CSC 204", location: "", startsAt: later.toISOString(), endsAt: null, completed: false },
          { id: "event-1", title: "Faculty seminar", kind: "event", label: "Campus event", courseCode: "", location: "Main Auditorium", startsAt: new Date(later.getTime() + 60 * 60 * 1000).toISOString(), endsAt: null, completed: false }
        ]
      })
    };
    window.dispatchEvent(new Event("campusshield:timetable-updated"));
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
  await page.setViewportSize({ width: 390, height: 844 });
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(391);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(391);
});
