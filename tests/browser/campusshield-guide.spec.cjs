const { test, expect } = require("@playwright/test");

async function openGuide(page, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const login = document.querySelector("#login-screen");
    const workspace = document.querySelector("#workspace");
    if (login) login.hidden = true;
    if (workspace) workspace.hidden = false;
    document.querySelectorAll(".page").forEach((section) => {
      section.classList.toggle("active", section.id === "page-guide");
    });
  });
  await expect(page.locator("#page-guide")).toBeVisible();
}

test("CampusShield guide search and topic filters work accessibly", async ({ page }) => {
  await openGuide(page, 1366);
  const cards = page.locator("#page-guide [data-guide-card]");
  const total = await cards.count();
  expect(total).toBeGreaterThanOrEqual(10);

  const safety = page.locator('#page-guide [data-guide-filter="safety"]');
  await safety.click();
  await expect(safety).toHaveAttribute("aria-pressed", "true");
  const safetyVisible = await cards.evaluateAll((items) => items.filter((item) => !item.hidden).length);
  expect(safetyVisible).toBeGreaterThan(0);
  expect(safetyVisible).toBeLessThanOrEqual(total);

  const search = page.locator("#guide-search-input");
  await search.fill("a query that cannot match any CampusShield feature 748291");
  await expect(page.locator("#guide-no-results")).toBeVisible();
  await expect(page.locator("#guide-results")).toContainText("Showing 0 of");

  await search.fill("incident");
  const matching = await cards.evaluateAll((items) => items.filter((item) => !item.hidden).length);
  expect(matching).toBeGreaterThan(0);

  await page.locator('#page-guide [data-guide-filter="all"]').click();
  await search.fill("");
  const restored = await cards.evaluateAll((items) => items.filter((item) => !item.hidden).length);
  expect(restored).toBe(total);
});

test("CampusShield guide remains usable without horizontal overflow", async ({ page }) => {
  for (const width of [360, 390, 430, 768, 1024, 1366, 1920]) {
    await openGuide(page, width);
    const layout = await page.locator("#page-guide").evaluate((root) => ({
      client: root.clientWidth,
      scroll: root.scrollWidth,
      search: root.querySelector("#guide-search-input").getBoundingClientRect().width,
      cards: root.querySelector("#guide-card-grid").getBoundingClientRect().width
    }));
    expect(layout.client, "Guide should be laid out at " + width + "px").toBeGreaterThan(0);
    expect(layout.scroll, "Guide should not overflow at " + width + "px").toBeLessThanOrEqual(layout.client + 1);
    expect(layout.search).toBeGreaterThan(180);
    expect(layout.cards).toBeGreaterThan(0);
  }
});
