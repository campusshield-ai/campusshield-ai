const { test, expect } = require("@playwright/test");

const phoneWidths = [320, 360, 375, 390, 430, 540, 650];

test("mobile workspace header separates brand, menu and full-width search", async ({ page }) => {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.locator("#workspace .global-search-input").waitFor({ state: "attached" });

  // Reveal the signed-in shell without requiring a real account or touching Supabase.
  await page.evaluate(() => {
    const login = document.querySelector("#login-screen");
    const workspace = document.querySelector("#workspace");
    if (login) login.style.display = "none";
    if (workspace) workspace.hidden = false;
  });

  for (const width of phoneWidths) {
    await page.setViewportSize({ width, height: 844 });
    const metrics = await page.evaluate(() => {
      const box = selector => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          display: style.display,
          gridArea: style.gridArea,
        };
      };
      return {
        viewport: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        topbar: box("#workspace .topbar"),
        brand: box("#workspace .mobile-topbar-brand"),
        menu: box("#workspace .mobile-nav-toggle"),
        search: box("#workspace .global-search"),
        input: box("#workspace .global-search-input"),
      };
    });

    expect(metrics.documentWidth, `${width}px: document has no horizontal overflow`).toBeLessThanOrEqual(width + 1);
    expect(metrics.bodyWidth, `${width}px: body has no horizontal overflow`).toBeLessThanOrEqual(width + 1);
    expect(metrics.brand.display).not.toBe("none");
    expect(metrics.menu.display).not.toBe("none");
    expect(metrics.search.display).not.toBe("none");
    expect(Math.abs(metrics.brand.top - metrics.menu.top), `${width}px: brand and menu share the first row`).toBeLessThanOrEqual(3);
    expect(metrics.brand.right, `${width}px: brand does not collide with menu`).toBeLessThanOrEqual(metrics.menu.left + 1);
    expect(metrics.search.top, `${width}px: search sits below the brand row`).toBeGreaterThanOrEqual(Math.max(metrics.brand.bottom, metrics.menu.bottom) + 5);
    expect(metrics.search.left, `${width}px: search stays inside viewport`).toBeGreaterThanOrEqual(-1);
    expect(metrics.search.right, `${width}px: search stays inside viewport`).toBeLessThanOrEqual(width + 1);
    expect(metrics.search.width, `${width}px: search uses the available row width`).toBeGreaterThan(width * 0.8);
    expect(metrics.input.height, `${width}px: search input remains touch-friendly`).toBeGreaterThanOrEqual(44);
  }
});
