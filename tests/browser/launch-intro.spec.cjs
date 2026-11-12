const { test, expect } = require("@playwright/test");

const STORAGE_KEY = "campusshield.launchIntro.v1";

async function clearStoredIntro(page) {
  await page.goto("/index.html?password-reset=1", { waitUntil: "domcontentloaded" });
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
}

test("first opening shows the intro, then one Monday opening per local week", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-11T09:00:00") });
  await page.clock.pauseAt(new Date("2026-11-11T09:00:00"));
  await clearStoredIntro(page);
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

  const savedFirstLaunch = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  expect(savedFirstLaunch.version).toBe("2.0.0");
  expect(Number.isFinite(savedFirstLaunch.firstShownAt)).toBeTruthy();
  expect(savedFirstLaunch.lastMondayShown).toBeNull();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(intro).toHaveCount(0);

  // First opening on Monday: show once and remember that local Monday.
  await page.clock.setFixedTime(new Date("2026-11-16T09:00:00"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(intro).toBeVisible();
  await intro.getByRole("button", { name: /skip intro/i }).click();
  await expect(intro).toHaveCount(0);

  const mondayRecord = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  expect(mondayRecord.lastMondayShown).toBe("2026-11-16");
  expect(mondayRecord.firstShownAt).toBe(savedFirstLaunch.firstShownAt);

  // More opens on Monday and Tuesday do not replay the brand animation.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(intro).toHaveCount(0);
  await page.clock.setFixedTime(new Date("2026-11-17T09:00:00"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(intro).toHaveCount(0);

  // The first opening on the next Monday displays it again exactly once.
  await page.clock.setFixedTime(new Date("2026-11-23T09:00:00"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(intro).toBeVisible();
  await intro.getByRole("button", { name: /skip intro/i }).click();
  const nextMondayRecord = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  expect(nextMondayRecord.lastMondayShown).toBe("2026-11-23");
});

test("a missed Monday does not cause a delayed Tuesday introduction", async ({ page }) => {
  const sunday = new Date("2026-11-15T09:00:00").getTime();
  await page.clock.install({ time: new Date("2026-11-17T09:00:00") });
  await page.clock.pauseAt(new Date("2026-11-17T09:00:00"));
  await page.goto("/index.html?password-reset=1", { waitUntil: "domcontentloaded" });
  await page.evaluate(({ key, firstShownAt }) => {
    localStorage.setItem(key, JSON.stringify({
      firstShownAt,
      lastMondayShown: "2026-11-09",
      version: "2.0.0"
    }));
  }, { key: STORAGE_KEY, firstShownAt: sunday });
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#campusshield-launch-intro")).toHaveCount(0);
});

test("legacy completion records migrate without replaying on the same Monday", async ({ page }) => {
  const legacyMonday = new Date("2026-11-16T08:00:00").getTime();
  await page.clock.install({ time: new Date("2026-11-16T12:00:00") });
  await page.clock.pauseAt(new Date("2026-11-16T12:00:00"));
  await page.goto("/index.html?password-reset=1", { waitUntil: "domcontentloaded" });
  await page.evaluate(({ key, completedAt }) => {
    localStorage.setItem(key, JSON.stringify({ completedAt, version: "1.0.0" }));
  }, { key: STORAGE_KEY, completedAt: legacyMonday });
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  const intro = page.locator("#campusshield-launch-intro");
  await expect(intro).toHaveCount(0);

  await page.clock.setFixedTime(new Date("2026-11-23T09:00:00"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(intro).toBeVisible();
  await intro.getByRole("button", { name: /skip intro/i }).click();

  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  expect(saved.firstShownAt).toBe(legacyMonday);
  expect(saved.lastMondayShown).toBe("2026-11-23");
});

test("reduced motion uses a static intro and password recovery bypasses it", async ({ page }) => {
  // Keep the reduced-motion intro on screen while the test inspects and
  // activates Skip; real-time timers otherwise remove the short static card
  // during slower CI browser runs.
  const fixedTime = new Date("2026-11-12T09:00:00");
  await page.clock.install({ time: fixedTime });
  await page.clock.pauseAt(fixedTime);
  await page.goto("/index.html?password-reset=1", { waitUntil: "domcontentloaded" });
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });

  const intro = page.locator("#campusshield-launch-intro");
  await expect(intro).toBeVisible();
  await expect(intro.locator(".cs-launch-mark")).toHaveCSS("animation-name", "none");
  await intro.getByRole("button", { name: /skip intro/i }).click();
  await expect(intro).toHaveCount(0);

  await page.goto("/index.html?password-reset=1", { waitUntil: "domcontentloaded" });
  await expect(intro).toHaveCount(0);
});
