const { test, expect } = require("@playwright/test");

test("guide content appears only on its dedicated Getting Started destination", async ({ page }) => {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });

  const guideButton = page.locator("#guide-nav");
  const guideSection = page.locator("#sidebar-guide-access");
  const featureNav = page.locator("#app-sidebar > .nav");
  const dashboard = page.locator("#page-dashboard");
  const guidePage = page.locator("#page-guide");

  await expect(guideButton).toHaveCount(1);
  await expect(guideSection.locator("#guide-nav")).toHaveCount(1);
  await expect(featureNav.locator("#guide-nav")).toHaveCount(0);
  await expect(guideSection.locator(".nav-section-label")).toHaveText("GETTING STARTED");
  await expect(dashboard).toHaveClass(/\bactive\b/);
  await expect(guidePage).not.toHaveClass(/\bactive\b/);
  await expect(guidePage).toHaveCSS("display", "none");

  await page.evaluate(() => {
    document.querySelectorAll(".page").forEach((item) => {
      item.classList.toggle("active", item.id === "page-guide");
    });
  });
  await expect(guidePage).toHaveClass(/\bactive\b/);
  await expect(guidePage).toHaveCSS("display", "grid");
  await expect(dashboard).not.toHaveClass(/\bactive\b/);

  await page.evaluate(() => {
    document.querySelectorAll(".page").forEach((item) => {
      item.classList.toggle("active", item.id === "page-dashboard");
    });
  });
  await expect(dashboard).toHaveClass(/\bactive\b/);
  await expect(guidePage).not.toHaveClass(/\bactive\b/);
  await expect(guidePage).toHaveCSS("display", "none");
});
