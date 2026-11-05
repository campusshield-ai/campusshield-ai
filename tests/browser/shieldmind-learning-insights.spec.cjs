const { test, expect } = require("@playwright/test");

async function openShieldMind(page) {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.locator("#shieldmind-paid-gate").waitFor({ state: "attached" });
  await page.evaluate(() => {
    document.querySelector("#login-screen").style.display = "none";
    const workspace = document.querySelector("#workspace");
    workspace.hidden = false;
    workspace.classList.remove("mobile-nav-open", "sidebar-collapsed");
    document.querySelectorAll("#workspace .page").forEach(section => section.classList.remove("active"));
    document.querySelector("#page-shieldmind").classList.add("active");
    // Reveal the presentation layer only. Data access remains covered separately
    // by the module's paid-entitlement and staging-environment smoke assertions.
    document.querySelector("#shieldmind-learning-insights").hidden = false;
  });
  await expect(page.locator("#shieldmind-learning-insights")).toBeVisible();
}

const widths = [320, 360, 390, 430, 768, 1024, 1366];

for (const width of widths) {
  test(`ShieldMind learning insights fit a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openShieldMind(page);
    const metrics = await page.locator("#shieldmind-learning-insights").evaluate(panel => {
      const rect = panel.getBoundingClientRect();
      const grid = panel.querySelector(".shieldmind-insights-metrics");
      const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length;
      const bodyColumns = getComputedStyle(panel.querySelector(".shieldmind-insights-body"))
        .gridTemplateColumns.split(" ").filter(Boolean).length;
      return {
        left: rect.left,
        right: rect.right,
        width: rect.width,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        columns,
        bodyColumns
      };
    });
    expect(metrics.documentWidth).toBeLessThanOrEqual(width + 1);
    expect(metrics.bodyWidth).toBeLessThanOrEqual(width + 1);
    expect(metrics.left).toBeGreaterThanOrEqual(-1);
    expect(metrics.right).toBeLessThanOrEqual(width + 1);
    expect(metrics.width).toBeGreaterThan(240);
    expect(metrics.columns).toBe(width <= 760 ? 2 : 4);
    expect(metrics.bodyColumns).toBe(width <= 760 ? 1 : 2);
    await expect(page.locator("#shieldmind-insights-refresh")).toBeVisible();
    await expect(page.locator("#shieldmind-insights-average")).toBeVisible();
  });
}

test("ShieldMind learning insights retain readable dark-mode colours", async ({ page }) => {
  await openShieldMind(page);
  const colors = await page.locator("#shieldmind-learning-insights").evaluate(panel => {
    document.documentElement.dataset.theme = "dark";
    return {
      panel: getComputedStyle(panel).backgroundColor,
      title: getComputedStyle(panel.querySelector("h2")).color,
      metric: getComputedStyle(panel.querySelector(".shieldmind-insights-metric strong")).color
    };
  });
  expect(colors.panel).not.toBe("rgba(0, 0, 0, 0)");
  expect(colors.title).not.toBe("rgb(18, 62, 42)");
  expect(colors.metric).not.toBe("rgb(18, 62, 42)");
});
