const { test, expect } = require("@playwright/test");

async function openCampusPulse(page, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const login = document.querySelector("#login-screen");
    const workspace = document.querySelector("#workspace");
    if (login) login.hidden = true;
    if (workspace) workspace.hidden = false;
    document.querySelectorAll(".page").forEach((item) => {
      item.classList.toggle("active", item.id === "page-community");
    });
  });
  await expect(page.locator("#campus-ideas-impact")).toBeAttached();
  await expect(page.locator("#campus-ideas-impact")).toBeVisible();
}

test("Ideas & Impact prioritizes discovery and opens the proposal form on request", async ({ page }) => {
  await openCampusPulse(page, 1366);
  const root = page.locator("#campus-ideas-impact");
  const board = page.locator("#campus-ideas-impact .cii-board");
  const compose = page.locator("#cii-compose-details");

  await expect(page.locator("#cii-start-idea")).toBeVisible();
  await expect(board).toBeVisible();
  await expect(compose).toHaveJSProperty("open", false);
  const order = await root.evaluate((el) => {
    const boardIndex = [...el.children].indexOf(el.querySelector(".cii-board"));
    const formIndex = [...el.children].indexOf(el.querySelector("#cii-compose-details"));
    return { boardIndex, formIndex };
  });
  expect(order.boardIndex).toBeLessThan(order.formIndex);

  await page.locator("#cii-start-idea").click();
  await expect(compose).toHaveJSProperty("open", true);
  await expect(page.locator("#cii-title-input")).toBeFocused();

  await page.locator("#cii-problem").fill("Students need a safer and clearer way to access shared study resources.");
  await expect(page.locator("#cii-problem-count")).toHaveText(/\d+ \/ 1,800/);
  await page.locator("#cii-form").evaluate((form) => form.reset());
  await expect(page.locator("#cii-problem-count")).toHaveText("0 / 1,800");
});

test("Ideas & Impact filters can be cleared and remain usable on narrow screens", async ({ page }) => {
  await openCampusPulse(page, 390);
  const root = page.locator("#campus-ideas-impact");
  await page.locator("#cii-search").fill("recycling");
  await expect(page.locator("#cii-clear-filters")).toBeVisible();
  await page.locator("#cii-clear-filters").click();

  await expect(page.locator("#cii-search")).toHaveValue("");
  await expect(page.locator("#cii-category-filter")).toHaveValue("all");
  await expect(page.locator("#cii-status-filter")).toHaveValue("all");
  await expect(page.locator("#cii-sort")).toHaveValue("newest");

  const sizes = await root.evaluate((el) => ({
    client: el.clientWidth,
    scroll: el.scrollWidth,
    filterRows: new Set([...el.querySelectorAll(".cii-filter-control")].map((item) => Math.round(item.getBoundingClientRect().top))).size,
    search: el.querySelector("#cii-search").getBoundingClientRect().width
  }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.client + 1);
  expect(sizes.search).toBeGreaterThan(200);
  expect(sizes.filterRows).toBe(3);
});

test("Ideas & Impact filters reflow cleanly at tablet and desktop widths", async ({ page }) => {
  for (const width of [768, 1024, 1440]) {
    await openCampusPulse(page, width);
    const root = page.locator("#campus-ideas-impact");
    const sizes = await root.evaluate((el) => ({
      client: el.clientWidth,
      scroll: el.scrollWidth,
      filterColumns: getComputedStyle(el.querySelector(".cii-filter-row")).gridTemplateColumns.split(" ").length,
      searchWidth: el.querySelector("#cii-search").getBoundingClientRect().width,
      boardWidth: el.querySelector(".cii-board").getBoundingClientRect().width
    }));
    expect(sizes.scroll, "Ideas & Impact must not overflow horizontally at " + width + "px").toBeLessThanOrEqual(sizes.client + 1);
    expect(sizes.searchWidth).toBeGreaterThan(240);
    expect(sizes.boardWidth).toBeGreaterThan(320);
    expect(sizes.filterColumns).toBe(width > 900 ? 4 : 2);
  }
});
