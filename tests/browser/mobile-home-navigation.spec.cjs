const { test, expect } = require("@playwright/test");

const phoneWidths = [320, 360, 375, 390, 430, 540, 650];

async function revealWorkspace(page) {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.locator("#workspace .global-search-input").waitFor({ state: "attached" });
  await page.locator("#student-shortcuts").waitFor({ state: "attached" });
  await page.evaluate(() => {
    const login = document.querySelector("#login-screen");
    const workspace = document.querySelector("#workspace");
    if (login) login.style.display = "none";
    if (workspace) workspace.hidden = false;
  });
}

test("student home bento cards use existing destinations and an honest CampusMap preview", async ({ page }) => {
  await revealWorkspace(page);
  const section = page.locator("#student-shortcuts");
  await expect(section.locator(".campus-home-card")).toHaveCount(5);
  await expect(section.locator(".campus-home-map")).toContainText("In preparation");
  await expect(section.locator(".campus-home-map")).toContainText("unverified pins or invented paths");

  const destinations = await section.locator("button[data-page]").evaluateAll(buttons =>
    buttons.map(button => button.dataset.page)
  );
  expect(destinations.sort()).toEqual(["academics", "campus-network", "community", "marketplace", "noticeboard", "opportunities", "shieldmind"].sort());

  for (const route of destinations) {
    await expect(page.locator(`#page-${route}`), `The ${route} destination exists`).toHaveCount(1);
  }

  for (const width of phoneWidths) {
    await page.setViewportSize({ width, height: 844 });
    const data = await section.evaluate(el => {
      const grid = el.querySelector(".campus-home-bento-grid");
      const map = el.querySelector(".campus-home-map");
      const ai = el.querySelector(".campus-home-ai");
      const rect = element => {
        const r = element.getBoundingClientRect();
        return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height };
      };
      return {
        docWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        columns: getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
        map:rect(map),
        ai:rect(ai),
        cards:[...el.querySelectorAll(".campus-home-card")].map(rect),
        section:rect(el)
      };
    });
    expect(data.docWidth, `${width}px: no page horizontal overflow`).toBeLessThanOrEqual(width + 1);
    expect(data.bodyWidth, `${width}px: no body horizontal overflow`).toBeLessThanOrEqual(width + 1);
    expect(data.columns, `${width}px: home cards use a two-column grid`).toBe(2);
    expect(data.map.width, `${width}px: CampusMap preview spans the full card row`).toBeGreaterThan(width * .7);
    expect(data.ai.width, `${width}px: ShieldMind feature spans the full card row`).toBeGreaterThan(width * .7);
    for (const card of data.cards) {
      expect(card.left, `${width}px: card remains inside viewport`).toBeGreaterThanOrEqual(-1);
      expect(card.right, `${width}px: card remains inside viewport`).toBeLessThanOrEqual(width + 1);
    }
  }
});

test("floating mobile navigation has a raised Report action and five existing routes", async ({ page }) => {
  await revealWorkspace(page);
  const nav = page.locator(".mobile-bottom-nav");
  await expect(nav.locator("button")).toHaveCount(5);
  await expect(nav.locator('button[data-page="report"]')).toHaveClass(/mobile-nav-report/);
  const routes = await nav.locator("button").evaluateAll(buttons => buttons.map(button => button.dataset.page));
  expect(routes).toEqual(["dashboard", "community", "report", "timetable", "courses"]);

  for (const route of routes) {
    await expect(page.locator(`#page-${route}`), `Navigation target ${route} exists`).toHaveCount(1);
  }

  for (const width of phoneWidths) {
    await page.setViewportSize({ width, height: 844 });
    const data = await nav.evaluate(el => {
      const r = el.getBoundingClientRect();
      const report = el.querySelector(".mobile-nav-report").getBoundingClientRect();
      return {
        docWidth:document.documentElement.scrollWidth,
        navLeft:r.left, navRight:r.right, navBottom:r.bottom,
        reportWidth:report.width, reportHeight:report.height,
        visible:[...el.querySelectorAll("button")].every(button => button.getBoundingClientRect().width > 0)
      };
    });
    expect(data.docWidth, `${width}px: no horizontal overflow`).toBeLessThanOrEqual(width + 1);
    expect(data.navLeft, `${width}px: pill nav fits left`).toBeGreaterThanOrEqual(-1);
    expect(data.navRight, `${width}px: pill nav fits right`).toBeLessThanOrEqual(width + 1);
    expect(data.navBottom).toBeLessThanOrEqual(844);
    expect(data.reportWidth).toBeGreaterThanOrEqual(42);
    expect(data.reportHeight).toBeGreaterThanOrEqual(58);
    expect(data.visible).toBeTruthy();
  }
});

test("desktop sidebar keeps grouped icon-led and collapsible navigation", async ({ page }) => {
  await revealWorkspace(page);
  await page.setViewportSize({ width:1366, height:900 });
  const sidebar = page.locator("#app-sidebar");
  await expect(sidebar.locator(".nav-section-label").first()).toBeVisible();
  await expect(sidebar.locator(".nav button .nav-icon").first()).toBeVisible();
  const toggle = page.locator("#sidebar-collapse-toggle");
  await toggle.click();
  await expect(page.locator(".app")).toHaveClass(/sidebar-collapsed/);
  await toggle.click();
  await expect(page.locator(".app")).not.toHaveClass(/sidebar-collapsed/);
});
