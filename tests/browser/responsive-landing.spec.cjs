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
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
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
        authPanelClientHeight: document.querySelector(".auth-panel")?.clientHeight || 0,
        authPanelScrollHeight: document.querySelector(".auth-panel")?.scrollHeight || 0,
        submitButton: rect("#auth-submit"),
        documentHeight: document.documentElement.scrollHeight,
        featureGrid: rect(".login-feature-grid"),
        featureColumns: columns(".login-feature-grid"),
        layoutColumns: columns("#login-screen"),
        illustrationDisplay: getComputedStyle(document.querySelector(".login-visual")).display,
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
    if (viewport.height <= 780 && viewport.width >= 961) {
      expect(
        metrics.authPanelScrollHeight,
        `${viewport.name}: short landscape view must not hide auth controls inside a nested scroll panel`,
      ).toBeLessThanOrEqual(metrics.authPanelClientHeight + 1);
      expect(
        metrics.submitButton.bottom,
        `${viewport.name}: sign-in action must be reachable in the document scroll area`,
      ).toBeLessThanOrEqual(metrics.documentHeight + 1);
      expect(
        metrics.intro.height,
        `${viewport.name}: dark landing panel must stretch to the full grid row with no blank strip`,
      ).toBeGreaterThanOrEqual(metrics.login.height - 1);
    }
    if (viewport.width > 650 && viewport.width <= 1440) {
      expect(metrics.illustrationDisplay, `${viewport.name}: illustration must not collide with tablet/laptop headline`).toBe("none");
    }
    if (viewport.width >= 1441) {
      expect(metrics.illustrationDisplay, `${viewport.name}: illustration remains available on wide desktop`).not.toBe("none");
    }

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

test("site-wide legal links and contact fallback remain explicit", async ({ page }) => {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  const landingFooter = page.locator(".login-footer-links");
  await expect(landingFooter.locator("a")).toHaveCount(6);
  await expect(landingFooter.locator("a").nth(0)).toHaveText("Features");
  await expect(landingFooter.locator("a").nth(1)).toHaveText("About");
  await expect(landingFooter.locator("a").nth(2)).toHaveText("Help");
  await expect(landingFooter.locator("a").nth(3)).toHaveText("Privacy");
  await expect(landingFooter.locator("a").nth(4)).toHaveText("Terms");
  await expect(landingFooter.locator("a").nth(5)).toHaveText("Contact");
  const appFooter = page.locator(".app-legal-footer");
  await expect(appFooter.locator('a[href="./privacy.html"]')).toHaveCount(1);
  await expect(appFooter.locator('a[href="./terms.html"]')).toHaveCount(1);
  await expect(appFooter.locator('a[href="./contact.html"]')).toHaveCount(1);
  await expect(page.locator(".login-footer-links a[href='./privacy.html']")).toHaveCount(1);
  await expect(page.locator(".login-footer-links a[href='./terms.html']")).toHaveCount(1);
  await expect(page.locator(".login-footer-links a[href='./contact.html']")).toHaveCount(1);

  await page.goto("/contact.html", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/on-site form is not connected/i)).toBeVisible();

  // Primary contact actions must open browser-based Gmail drafts, not depend
  // on an installed desktop/mobile mail handler. Each action also keeps a
  // direct mailto fallback for users who prefer their configured email app.
  const contactActions = page.locator(".email-action[data-contact-action]");
  await expect(contactActions).toHaveCount(3);
  const expectedSubjects = {
    support: "CampusShield AI support request",
    privacy: "CampusShield AI privacy request",
    partnership: "CampusShield AI partnership enquiry",
  };
  for (const [kind, subject] of Object.entries(expectedSubjects)) {
    const action = page.locator(`.email-action[data-contact-action="${kind}"]`);
    await expect(action).toBeVisible();
    await expect(action).toHaveAttribute("target", "_blank");
    await expect(action).toHaveAttribute("rel", "noopener noreferrer");
    const href = await action.getAttribute("href");
    const draft = new URL(href);
    expect(draft.origin + draft.pathname).toBe("https://mail.google.com/mail/");
    expect(draft.searchParams.get("view")).toBe("cm");
    expect(draft.searchParams.get("fs")).toBe("1");
    expect(draft.searchParams.get("to")).toBe("campusshieldaitechnologies@gmail.com");
    expect(draft.searchParams.get("su")).toBe(subject);
    expect(draft.searchParams.get("body")).toBeTruthy();
  }
  await expect(page.locator(".email-action-fallback[href^='mailto:campusshieldaitechnologies@gmail.com']")).toHaveCount(3);
  await expect(page.locator('a[href^="mailto:campusshieldaitechnologies@gmail.com"]')).toHaveCount(4);
  await expect(page.locator(".public-cta a[href^='https://mail.google.com/mail/']")).toHaveCount(1);
  await expect(page.locator('a[href*="tiktok.com"], a[href*="youtube.com"]')).toHaveCount(0);
});

test("public privacy, terms and contact pages render without mobile overflow", async ({ page }) => {
  const pages = [
    { route: "/privacy.html", title: /Privacy Policy/, heading: "Privacy Policy" },
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


test("language selector translates the access experience and remembers the choice", async ({ page }) => {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  const language = page.locator("#campusshield-language");
  await expect(language).toBeVisible();
  await expect(language.locator("option")).toHaveCount(26);

  await language.selectOption("de");
  await expect(page.locator(".login-public-nav a").nth(0)).toHaveText("Startseite");
  await expect(page.locator("#auth-title")).toHaveText("Willkommen zurück");

  await language.selectOption("yo");
  await expect(page.locator(".login-public-nav a").nth(0)).toHaveText("Ilé");
  await expect(page.locator("#auth-title")).toHaveText("Ẹ kú àbọ̀");
  await expect(page.locator("#auth-tabs [data-auth-mode='signup']")).toHaveText("Ṣẹ̀dá àkọọ́lẹ̀");
  await expect(page.locator(".login-footer-links a").nth(0)).toHaveText("Àwọn Ẹ̀ya");
  await expect(page.locator(".login-footer-links a").nth(1)).toHaveText("Nípa wa");
  await expect(page.locator(".login-footer-links a").nth(2)).toHaveText("Ìrànlọ́wọ́");
  await expect(page.locator(".login-footer-links a").nth(3)).toHaveText("Ìpamọ́");
  await expect(page.locator(".login-footer-links a").nth(4)).toHaveText("Àwọn Òfin Lílò");
  await expect(page.locator(".login-footer-links a").nth(5)).toHaveText("Kàn sí wa");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#campusshield-language")).toHaveValue("yo");
  await expect(page.locator(".login-public-nav a").nth(0)).toHaveText("Ilé");

  await page.locator("#campusshield-language").selectOption("fr");
  await expect(page.locator(".login-public-nav a").nth(0)).toHaveText("Accueil");
  await page.locator('[data-auth-mode="signup"]').click();
  await expect(page.locator("#auth-title")).toHaveText("Créer votre compte");
  await expect(page.locator('#signup-fields label[for="auth-name"]')).toHaveText("Nom complet");

  await page.locator("#campusshield-language").selectOption("ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.locator("#campusshield-language").selectOption("en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");


  await expect(page.locator('a[href*="tiktok.com"], a[href*="youtube.com"]')).toHaveCount(0);
  const contactResponse = await page.goto("/contact.html", { waitUntil: "domcontentloaded" });
  expect(contactResponse && contactResponse.status()).toBe(200);
  await expect(page.locator('a[href*="tiktok.com"], a[href*="youtube.com"]')).toHaveCount(0);
});


test("student and staff get separate identity-verification instructions and responsive form layout", async ({ page }) => {
  for (const viewport of [
    { name: "phone", width: 375, height: 812 },
    { name: "large-phone", width: 390, height: 844 },
    { name: "ipad-portrait", width: 768, height: 1024 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/index.html", { waitUntil: "domcontentloaded" });
    await page.locator('[data-auth-mode="signup"]').click();
    const guidance = page.locator("#signup-verification-guidance");
    const studentPanel = page.locator("#signup-student-identity-panel");
    await expect(guidance).toContainText("Students submit");
    await expect(studentPanel).toBeVisible();

    const layout = await page.evaluate(() => ({
      headingDisplay: getComputedStyle(document.querySelector(".signup-student-identity-panel>.heading")).display,
      headingWidth: document.querySelector(".signup-student-identity-panel>.heading").getBoundingClientRect().width,
      formColumns: getComputedStyle(document.querySelector("#studentIdentityForm")).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
      viewportWidth: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    expect(layout.headingDisplay, viewport.name + ": identity heading should be a normal full-width block").toBe("block");
    expect(layout.headingWidth, viewport.name + ": identity heading should not collapse into a narrow flex column").toBeGreaterThan(240);
    expect(layout.documentWidth, viewport.name + ": identity form must not create horizontal page overflow").toBeLessThanOrEqual(layout.viewportWidth + 1);
    if (viewport.width <= 820) expect(layout.formColumns, viewport.name + ": fields should stack on phone and portrait tablet").toBe(1);

    await page.locator("#auth-role").selectOption("teacher");
    await expect(guidance).toContainText("Teachers and university staff");
    await expect(studentPanel).toBeHidden();
    await expect(page.locator("#signup-staff-fields")).toBeVisible();
  }
});

test("Supabase browser SDK initializes before the CampusShield app", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(
    window.CAMPUSSHIELD_SUPABASE_CONFIG?.url &&
    typeof window.supabase?.createClient === "function" &&
    window.CampusShieldBackend?.isConfigured === true &&
    window.CampusShieldBackend?.client?.auth
  ), { timeout: 20_000 });

  const state = await page.evaluate(() => ({
    configured: window.CampusShieldBackend.isConfigured,
    projectHost: new URL(window.CAMPUSSHIELD_SUPABASE_CONFIG.url).hostname,
    sdkAvailable: typeof window.supabase?.createClient === "function",
    authClientAvailable: typeof window.CampusShieldBackend.client.auth.getSession === "function",
  }));

  expect(state.configured).toBe(true);
  expect(state.projectHost).toBe("hywcpnoqqhxvujnimhxl.supabase.co");
  expect(state.sdkAvailable).toBe(true);
  expect(state.authClientAvailable).toBe(true);
  expect(pageErrors).toEqual([]);
});

test("live GitHub Pages serves and initializes the Production Supabase client", async ({ page }) => {
  const failedRequests = [];
  const consoleErrors = [];
  page.on("requestfailed", (request) => {
    failedRequests.push({
      url: request.url(),
      error: request.failure()?.errorText || "unknown"
    });
  });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  const response = await page.goto("https://campusshield-ai.github.io/campusshield-ai/", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  expect(response?.status(), "GitHub Pages homepage must return HTTP 200").toBe(200);
  await page.waitForTimeout(2500);

  const state = await page.evaluate(() => ({
    hostname: window.location.hostname,
    pathname: window.location.pathname,
    projectHost: window.CAMPUSSHIELD_SUPABASE_CONFIG?.url
      ? new URL(window.CAMPUSSHIELD_SUPABASE_CONFIG.url).hostname
      : null,
    keyPrefix: String(window.CAMPUSSHIELD_SUPABASE_CONFIG?.publishableKey || "").slice(0, 15),
    sdkAvailable: typeof window.supabase?.createClient === "function",
    backendConfigured: window.CampusShieldBackend?.isConfigured === true,
    authClientAvailable: typeof window.CampusShieldBackend?.client?.auth?.getSession === "function",
    scripts: Array.from(document.scripts)
      .filter((script) => /supabase|campusshield-backend/i.test(script.src))
      .map((script) => script.src),
  }));

  const diagnostics = JSON.stringify({ state, failedRequests, consoleErrors }, null, 2);
  expect(state.hostname, diagnostics).toBe("campusshield-ai.github.io");
  expect(state.pathname, diagnostics).toBe("/campusshield-ai/");
  expect(state.projectHost, diagnostics).toBe("fvgtnujjnvdkhzqqcaqe.supabase.co");
  expect(state.sdkAvailable, diagnostics).toBe(true);
  expect(state.backendConfigured, diagnostics).toBe(true);
  expect(state.authClientAvailable, diagnostics).toBe(true);

  const authSettings = await page.evaluate(async () => {
    const config = window.CAMPUSSHIELD_SUPABASE_CONFIG;
    const result = await fetch(config.url + "/auth/v1/settings", {
      headers: { apikey: config.publishableKey, Accept: "application/json" },
    });
    return { status: result.status };
  });
  expect(authSettings.status, diagnostics).toBe(200);
});
