const { test, expect } = require("@playwright/test");

async function revealWorkspace(page) {
  await page.evaluate(() => {
    const login = document.querySelector("#login-screen");
    const workspace = document.querySelector("#workspace");
    if (login) login.hidden = true;
    if (workspace) workspace.hidden = false;
    document.querySelector("#page-dashboard")?.classList.add("active");
  });
}

test("mobile theme toggle is visible, synchronized and persisted without horizontal overflow", async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem("campusshield_theme"));
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await revealWorkspace(page);

  const toggle = page.locator("#campus-mobile-theme-toggle");
  for (const width of [320, 360, 375, 390, 430, 600, 650]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-label", "Switch to dark mode");
    await expect(page.locator("#campus-theme-toggle")).toHaveAttribute("aria-label", "Switch to dark mode");

    const light = await page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      header: getComputedStyle(document.querySelector("#workspace .topbar")).backgroundColor,
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth
    }));
    expect(light.theme).toBe("light");
    expect(light.documentWidth, `${width}px light mode should not overflow`).toBeLessThanOrEqual(light.viewportWidth + 1);

    await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(toggle).toHaveAttribute("aria-label", "Switch to light mode");
    await expect(page.locator("#campus-theme-toggle")).toHaveAttribute("aria-label", "Switch to light mode");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("campusshield_theme"))).toBe("dark");

    const dark = await page.evaluate(() => ({
      header: getComputedStyle(document.querySelector("#workspace .topbar")).backgroundColor,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth
    }));
    expect(dark.header).not.toBe(light.header);
    expect(dark.documentWidth, `${width}px dark mode should not overflow`).toBeLessThanOrEqual(dark.viewportWidth + 1);

    await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("campusshield_theme"))).toBe("light");
  }

  await page.setViewportSize({ width: 800, height: 900 });
  await expect(toggle).toBeHidden();
  await expect(page.locator("#campus-theme-toggle")).toBeVisible();
});
