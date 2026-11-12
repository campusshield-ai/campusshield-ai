const { test, expect } = require("@playwright/test");

const STORAGE_KEY = "campusshield.launchIntro.v1";

async function clearStoredIntro(page) {
  await page.goto("/index.html?password-reset=1", { waitUntil: "domcontentloaded" });
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
}

test("first opening shows the intro; repeats only after 45 days", async ({ page }) => {
  const firstOpen = new Date("2026-11-11T09:00:00");
  await page.clock.install({ time: firstOpen });
  await page.clock.pauseAt(firstOpen);
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
  expect(savedFirstLaunch.version).toBe("3.0.0");
  expect(savedFirstLaunch.firstShownAt).toBe(firstOpen.getTime());
  expect(savedFirstLaunch.lastShownAt).toBe(firstOpen.getTime());

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(intro).toHaveCount(0);

  // 44 days later is still inside the cooldown.
  await page.clock.setFixedTime(new Date("2026-12-25T09:00:00"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(intro).toHaveCount(0);

  // At 45 full days, the next app opening may show the intro again.
  const secondOpen = new Date("2026-12-26T09:00:00");
  await page.clock.setFixedTime(secondOpen);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(intro).toBeVisible();
  await intro.getByRole("button", { name: /skip intro/i }).click();

  const secondRecord = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  expect(secondRecord.firstShownAt).toBe(firstOpen.getTime());
  expect(secondRecord.lastShownAt).toBe(secondOpen.getTime());

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(intro).toHaveCount(0);

  // A second rare repeat is also blocked until another 45 days have elapsed.
  await page.clock.setFixedTime(new Date("2027-02-08T09:00:00"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(intro).toHaveCount(0);
  await page.clock.setFixedTime(new Date("2027-02-09T09:00:00"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(intro).toBeVisible();
});

test("previous weekly records migrate without an early replay", async ({ page }) => {
  const firstShownAt = new Date("2026-10-01T09:00:00").getTime();
  await page.clock.install({ time: new Date("2026-12-24T12:00:00") });
  await page.clock.pauseAt(new Date("2026-12-24T12:00:00"));
  await page.goto("/index.html?password-reset=1", { waitUntil: "domcontentloaded" });
  await page.evaluate(({ key, firstShownAt }) => {
    localStorage.setItem(key, JSON.stringify({
      firstShownAt,
      lastMondayShown: "2026-11-09",
      version: "2.0.0"
    }));
  }, { key: STORAGE_KEY, firstShownAt });

  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  const intro = page.locator("#campusshield-launch-intro");
  await expect(intro).toHaveCount(0);

  // The old record uses a date, not a time, so migration waits until the
  // full 45 days have passed from the end of that Monday.
  const eligibleOpen = new Date("2026-12-25T09:00:00");
  await page.clock.setFixedTime(eligibleOpen);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(intro).toBeVisible();
  await intro.getByRole("button", { name: /skip intro/i }).click();

  const migrated = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  expect(migrated.version).toBe("3.0.0");
  expect(migrated.firstShownAt).toBe(firstShownAt);
  expect(migrated.lastShownAt).toBe(eligibleOpen.getTime());
});

test("legacy completion timestamps respect the 45-day cooldown", async ({ page }) => {
  const completedAt = new Date("2026-11-16T08:00:00").getTime();
  await page.clock.install({ time: new Date("2026-12-30T09:00:00") });
  await page.clock.pauseAt(new Date("2026-12-30T09:00:00"));
  await page.goto("/index.html?password-reset=1", { waitUntil: "domcontentloaded" });
  await page.evaluate(({ key, completedAt }) => {
    localStorage.setItem(key, JSON.stringify({ completedAt, version: "1.0.0" }));
  }, { key: STORAGE_KEY, completedAt });

  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  const intro = page.locator("#campusshield-launch-intro");
  await expect(intro).toHaveCount(0);

  await page.clock.setFixedTime(new Date("2027-01-01T09:00:00"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(intro).toBeVisible();
  await intro.getByRole("button", { name: /skip intro/i }).click();

  const migrated = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  expect(migrated.version).toBe("3.0.0");
  expect(migrated.firstShownAt).toBe(completedAt);
  expect(migrated.lastShownAt).toBe(new Date("2027-01-01T09:00:00").getTime());
});

test("reduced motion uses a static intro and password recovery bypasses it", async ({ page }) => {
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
