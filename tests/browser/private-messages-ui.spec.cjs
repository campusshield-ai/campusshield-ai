const { test, expect } = require("@playwright/test");

async function openPrivateMessages(page, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const login = document.querySelector("#login-screen");
    const workspace = document.querySelector("#workspace");
    if (login) login.hidden = true;
    if (workspace) workspace.hidden = false;
    document.querySelectorAll(".page").forEach((item) => {
      item.classList.toggle("active", item.id === "page-campus-messages");
    });
  });
  await expect(page.locator("#page-campus-messages")).toBeVisible();
}

test("Private Messages exposes clear, access-gated inbox discovery controls", async ({ page }) => {
  await openPrivateMessages(page, 1366);
  const search = page.locator("#campus-dm-conversation-search");
  const filters = page.locator("[data-campus-dm-filter]");

  await expect(search).toBeVisible();
  await expect(search).toBeDisabled();
  await expect(filters).toHaveCount(3);
  await expect(page.locator('[data-campus-dm-filter="all"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-campus-dm-filter="requests"]')).toBeDisabled();
  await expect(page.locator('[data-campus-dm-filter="accepted"]')).toBeDisabled();
  await expect(page.locator("#campus-dm-refresh")).toBeVisible();
  await expect(page.locator("#campus-dm-thread-empty")).toBeVisible();
  await expect(page.locator("#campus-dm-new-title")).toHaveText("New message");
});

test("Private Messages stays within the viewport from phone to wide desktop", async ({ page }) => {
  for (const width of [360, 390, 430, 768, 1024, 1366, 1920]) {
    await openPrivateMessages(page, width);
    const dimensions = await page.locator("#page-campus-messages").evaluate((root) => {
      const layout = root.querySelector(".campus-dm-layout");
      const rail = root.querySelector(".campus-dm-rail");
      const thread = root.querySelector(".campus-dm-thread");
      return {
        rootClient: root.clientWidth,
        rootScroll: root.scrollWidth,
        layoutClient: layout.clientWidth,
        layoutScroll: layout.scrollWidth,
        railWidth: rail.getBoundingClientRect().width,
        threadWidth: thread.getBoundingClientRect().width
      };
    });
    expect(dimensions.rootScroll, "Private Messages must not overflow horizontally at " + width + "px")
      .toBeLessThanOrEqual(dimensions.rootClient + 1);
    expect(dimensions.layoutScroll, "Message panels must not overflow horizontally at " + width + "px")
      .toBeLessThanOrEqual(dimensions.layoutClient + 1);
    expect(dimensions.railWidth).toBeGreaterThan(240);
    expect(dimensions.threadWidth).toBeGreaterThan(240);
  }
});

test("Inbox filters and search remain available without exposing conversations before campus verification", async ({ page }) => {
  await openPrivateMessages(page, 390);
  const buttons = page.locator("[data-campus-dm-filter]");
  await expect(buttons).toHaveCount(3);
  await expect(page.locator("#campus-dm-conversation-search")).toBeDisabled();
  await expect(buttons).toHaveJSProperty("length", 3);
  const ariaStates = await buttons.evaluateAll((items) => items.map((item) => item.getAttribute("aria-pressed")));
  expect(ariaStates).toEqual(["true", "false", "false"]);
});
