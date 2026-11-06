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


test("phone quick actions render as a two-column bento grid with readable safety guidance", async ({ page }) => {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.locator("#workspace .quick-action-buttons").waitFor({ state: "attached" });

  // Reveal the signed-in shell without creating a session or touching Supabase.
  await page.evaluate(() => {
    const login = document.querySelector("#login-screen");
    const workspace = document.querySelector("#workspace");
    if (login) login.style.display = "none";
    if (workspace) workspace.hidden = false;
  });

  for (const width of phoneWidths) {
    await page.setViewportSize({ width, height: 844 });
    const metrics = await page.evaluate(() => {
      const grid = document.querySelector("#workspace .quick-action-buttons");
      const note = document.querySelector("#workspace .quick-action-safety-note");
      const visibleButtons = [...grid.querySelectorAll(".quick-action-button")]
        .filter(button => !button.hidden && getComputedStyle(button).display !== "none");
      const rect = element => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, height: box.height };
      };
      return {
        viewport: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        columns: getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
        buttons: visibleButtons.map(rect),
        note: rect(note),
      };
    });

    expect(metrics.documentWidth, `${width}px: dashboard has no horizontal overflow`).toBeLessThanOrEqual(width + 1);
    expect(metrics.bodyWidth, `${width}px: body has no horizontal overflow`).toBeLessThanOrEqual(width + 1);
    expect(metrics.columns, `${width}px: quick actions stay in two columns`).toBe(2);
    expect(metrics.buttons.length, `${width}px: essential visible quick actions remain available`).toBeGreaterThanOrEqual(3);
    for (const [index, button] of metrics.buttons.entries()) {
      expect(button.height, `${width}px: action ${index + 1} has a comfortable touch target`).toBeGreaterThanOrEqual(60);
      expect(button.left, `${width}px: action ${index + 1} stays within the viewport`).toBeGreaterThanOrEqual(-1);
      expect(button.right, `${width}px: action ${index + 1} stays within the viewport`).toBeLessThanOrEqual(width + 1);
    }
    expect(metrics.note.top, `${width}px: safety note follows the action grid`).toBeGreaterThanOrEqual(Math.max(...metrics.buttons.map(button => button.bottom)) + 4);
    expect(metrics.note.right, `${width}px: safety note remains visible`).toBeLessThanOrEqual(width + 1);
  }
});

test("mobile theme switch is visible, updates both modes and persists on phones", async ({ page }) => {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  const mobileToggle = page.locator("#campus-mobile-theme-toggle");
  await mobileToggle.waitFor({ state: "attached" });

  await page.evaluate(() => {
    const login = document.querySelector("#login-screen");
    const workspace = document.querySelector("#workspace");
    if (login) login.style.display = "none";
    if (workspace) workspace.hidden = false;
    localStorage.removeItem("campusshield_theme");
  });

  for (const width of phoneWidths) {
    await page.setViewportSize({ width, height: 844 });
    await expect(mobileToggle).toBeVisible();
    await expect(mobileToggle).toHaveAttribute("aria-label", "Switch to dark mode");

    const initial = await page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      header: getComputedStyle(document.querySelector("#workspace .topbar")).backgroundImage,
      searchBackground: getComputedStyle(document.querySelector("#workspace .global-search-input")).backgroundColor,
      width: document.documentElement.scrollWidth,
    }));
    expect(initial.theme).toBe("light");
    expect(initial.width, `${width}px: theme control creates no horizontal overflow`).toBeLessThanOrEqual(width + 1);

    await mobileToggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(mobileToggle).toHaveAttribute("aria-label", "Switch to light mode");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("campusshield_theme"))).toBe("dark");
    const darkPalette = await page.evaluate(() => ({
      header: getComputedStyle(document.querySelector("#workspace .topbar")).backgroundImage,
      searchBackground: getComputedStyle(document.querySelector("#workspace .global-search-input")).backgroundColor,
    }));
    expect(darkPalette.header, `${width}px: dark mode applies its own mobile header palette`).not.toBe(initial.header);
    expect(darkPalette.searchBackground, `${width}px: dark mode applies its own search surface`).not.toBe(initial.searchBackground);

    await mobileToggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(mobileToggle).toHaveAttribute("aria-label", "Switch to dark mode");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("campusshield_theme"))).toBe("light");
  }

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
