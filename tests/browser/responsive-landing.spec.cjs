const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

const viewports = [
  { name: "phone-375", width: 375, height: 812, featureColumns: 1, layoutColumns: 1 },
  { name: "phone-390", width: 390, height: 844, featureColumns: 1, layoutColumns: 1 },
  { name: "phone-landscape", width: 844, height: 390, featureColumns: 3, layoutColumns: 1 },
  { name: "ipad-portrait", width: 768, height: 1024, featureColumns: 3, layoutColumns: 1 },
  { name: "ipad-large-portrait", width: 834, height: 1194, featureColumns: 3, layoutColumns: 1 },
  { name: "ipad-landscape", width: 1024, height: 768, featureColumns: 3, layoutColumns: 2 },
  { name: "laptop", width: 1366, height: 768, featureColumns: 3, layoutColumns: 2 },
  { name: "desktop", width: 1920, height: 1080, featureColumns: 3, layoutColumns: 2 },
];

test("landing page fits phone, tablet, iPad, laptop and desktop viewports", async ({ page }) => {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveTitle(/CampusShield AI/);
  await expect(page.locator("#login-screen")).toBeVisible();
  await expect(page.locator(".login-brand")).toBeVisible();
  await expect(page.locator("#auth-form")).toBeVisible();

  const screenshotsDir = path.resolve("test-results/responsive");
  fs.mkdirSync(screenshotsDir, { recursive: true });

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator(".login-brand")).toBeVisible();
    await expect(page.locator(".login-feature-grid")).toBeVisible();
    await expect(page.locator(".auth-panel")).toBeVisible();

    const metrics = await page.evaluate(() => {
      const rect = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width, height: box.height };
      };
      const columns = (selector) => {
        const element = document.querySelector(selector);
        return element ? getComputedStyle(element).gridTemplateColumns.split(/\s+/).filter(Boolean).length : 0;
      };
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        login: rect("#login-screen"),
        intro: rect(".login-intro"),
        formWrap: rect(".login-form-wrap"),
        authPanel: rect(".auth-panel"),
        featureGrid: rect(".login-feature-grid"),
        featureColumns: columns(".login-feature-grid"),
        layoutColumns: columns("#login-screen"),
      };
    });

    expect(metrics.documentWidth, `${viewport.name}: document must not scroll horizontally`).toBeLessThanOrEqual(viewport.width + 1);
    expect(metrics.bodyWidth, `${viewport.name}: body must not scroll horizontally`).toBeLessThanOrEqual(viewport.width + 1);
    expect(metrics.login.width, `${viewport.name}: login shell should fill but not exceed the viewport`).toBeLessThanOrEqual(viewport.width + 1);
    expect(metrics.authPanel.left, `${viewport.name}: auth panel must stay within the left edge`).toBeGreaterThanOrEqual(-1);
    expect(metrics.authPanel.right, `${viewport.name}: auth panel must stay within the right edge`).toBeLessThanOrEqual(viewport.width + 1);
    expect(metrics.featureGrid.left, `${viewport.name}: feature cards must stay within the left edge`).toBeGreaterThanOrEqual(-1);
    expect(metrics.featureGrid.right, `${viewport.name}: feature cards must stay within the right edge`).toBeLessThanOrEqual(viewport.width + 1);
    expect(metrics.featureColumns, `${viewport.name}: feature card columns`).toBe(viewport.featureColumns);
    expect(metrics.layoutColumns, `${viewport.name}: landing/form layout columns`).toBe(viewport.layoutColumns);

    if (["phone-390", "ipad-portrait", "ipad-landscape", "laptop", "desktop"].includes(viewport.name)) {
      await page.screenshot({
        path: path.join(screenshotsDir, `${viewport.name}.png`),
        fullPage: true,
        animations: "disabled",
      });
    }
  }
});

test("sign-in and create-account mode remain reachable", async ({ page }) => {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  const signInTab = page.locator('[data-auth-mode="signin"]');
  const signUpTab = page.locator('[data-auth-mode="signup"]');
  await expect(signInTab).toBeVisible();
  await expect(signUpTab).toBeVisible();

  await signUpTab.click();
  await expect(signUpTab).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#signup-fields")).toBeVisible();
  await expect(page.locator("#auth-name")).toBeVisible();
  await expect(page.locator("#auth-university-search")).toBeVisible();

  await signInTab.click();
  await expect(signInTab).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#signup-fields")).toBeHidden();
  await expect(page.locator("#auth-email")).toBeVisible();
  await expect(page.locator("#auth-password")).toBeVisible();
});

test("public privacy, terms and contact pages render without mobile overflow", async ({ page }) => {
  const pages = [
    { route: "/privacy.html", title: /Privacy Notice/, heading: "Privacy Notice" },
    { route: "/terms.html", title: /Terms of Use/, heading: "Terms of Use" },
    { route: "/contact.html", title: /Contact/, heading: "Contact CampusShield AI" },
  ];

  for (const viewport of [
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    for (const item of pages) {
      const response = await page.goto(item.route, { waitUntil: "domcontentloaded" });
      expect(response && response.status(), `${item.route} should load`).toBe(200);
      await expect(page).toHaveTitle(item.title);
      await expect(page.getByRole("heading", { name: item.heading })).toBeVisible();
      const widths = await page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
      }));
      expect(widths.document, `${item.route}: no horizontal overflow at ${viewport.width}px`).toBeLessThanOrEqual(viewport.width + 1);
      expect(widths.body, `${item.route}: body no horizontal overflow at ${viewport.width}px`).toBeLessThanOrEqual(viewport.width + 1);
    }
  }
});
