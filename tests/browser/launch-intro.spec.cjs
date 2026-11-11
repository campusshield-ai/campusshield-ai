const { test, expect } = require("@playwright/test");

const STORAGE_KEY = "campusshield.launchIntro.v1";
const FORTY_SIX_DAYS = 46 * 24 * 60 * 60 * 1000;

test("first launch shows the intro responsively, then Skip remembers completion", async ({ page }) => {
  await page.addInitScript((key) => localStorage.removeItem(key), STORAGE_KEY);
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });

  const intro = page.locator("#campusshield-launch-intro");
  await expect(intro).toBeVisible();
  await expect(intro.getByRole("heading", { name: "CampusShield AI" })).toBeVisible();
  await expect(intro).toContainText("Your campus. Safer, together.");
  await expect(intro).toContainText("Stay informed");
  await expect(intro).toContainText("Report concerns");
  await expect(intro).toContainText("Find support");

  for (const viewport of [
    { name: "phone", width: 360, height: 800 },
    { name: "large phone", width: 430, height: 932 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "desktop", width: 1366, height: 900 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const metrics = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      overlay: document.querySelector("#campusshield-launch-intro")?.getBoundingClientRect().toJSON(),
      title: document.querySelector(".cs-launch-title")?.getBoundingClientRect().toJSON(),
    }));
    expect(metrics.document, viewport.name + " should not overflow horizontally").toBeLessThanOrEqual(viewport.width + 1);
    expect(metrics.overlay.width, viewport.name + " intro should fill the viewport").toBeGreaterThanOrEqual(viewport.width - 1);
    expect(metrics.title.left, viewport.name + " title should remain inside the viewport").toBeGreaterThanOrEqual(0);
    expect(metrics.title.right, viewport.name + " title should remain inside the viewport").toBeLessThanOrEqual(viewport.width + 1);
  }

  const skip = intro.getByRole("button", { name: /skip intro/i });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(skip).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(intro).toHaveCount(0);

  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  expect(saved.version).toBe("1.0.0");
  expect(Number.isFinite(saved.completedAt)).toBeTruthy();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#campusshield-launch-intro")).toHaveCount(0);
});

test("the intro repeats after 45 days and respects reduced motion", async ({ page }) => {
  await page.addInitScript(({ key, oldAt }) => {
    localStorage.setItem(key, JSON.stringify({ completedAt: oldAt, version: "1.0.0" }));
  }, { key: STORAGE_KEY, oldAt: Date.now() - FORTY_SIX_DAYS });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });

  const intro = page.locator("#campusshield-launch-intro");
  await expect(intro).toBeVisible();
  await expect(intro.locator(".cs-launch-mark")).toHaveCSS("animation-name", "none");
  await intro.getByRole("button", { name: /skip intro/i }).click();
  await expect(intro).toHaveCount(0);
});

test("password recovery bypasses the launch introduction", async ({ page }) => {
  await page.addInitScript((key) => localStorage.removeItem(key), STORAGE_KEY);
  await page.goto("/index.html?password-reset=1", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#campusshield-launch-intro")).toHaveCount(0);
});
