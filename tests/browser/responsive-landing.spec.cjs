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
        `${viewport.name}: dark landing panel must stretch to the authentication column's first grid row`,
      ).toBeGreaterThanOrEqual(metrics.formWrap.height - 1);
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
  await expect(landingFooter.locator("a")).toHaveCount(8);
  const expectedLandingLinks = [
    ["./features.html", "Features"],
    ["./for-universities.html", "For Universities"],
    ["./about.html", "About"],
    ["./trust-safety.html", "Trust & Safety"],
    ["./help.html", "Help"],
    ["./privacy.html", "Privacy"],
    ["./terms.html", "Terms"],
    ["./contact.html", "Contact"],
  ];
  for (const [href, label] of expectedLandingLinks) {
    const link = landingFooter.locator(`a[href="${href}"]`);
    await expect(link).toHaveCount(1);
    await expect(link).toHaveText(label);
  }
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
    { route: "/for-universities.html", title: /For Universities/, heading: /A more connected digital campus, built around people/ },
    { route: "/trust-safety.html", title: /Trust & Safety/, heading: /Trust, Privacy & Responsible Campus Technology/ },
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
  await expect(page.locator(".login-footer-links a[href='./features.html']")).toHaveText("Àwọn Ẹ̀ya");
  await expect(page.locator(".login-footer-links a[href='./for-universities.html']")).toHaveText("Fún àwọn Yunifásítì");
  await expect(page.locator(".login-footer-links a[href='./about.html']")).toHaveText("Nípa wa");
  await expect(page.locator(".login-footer-links a[href='./trust-safety.html']")).toHaveText("Ìgbẹ́kẹ̀lé àti Ààbò");
  await expect(page.locator(".login-footer-links a[href='./help.html']")).toHaveText("Ìrànlọ́wọ́");
  await expect(page.locator(".login-footer-links a[href='./privacy.html']")).toHaveText("Ìpamọ́");
  await expect(page.locator(".login-footer-links a[href='./terms.html']")).toHaveText("Àwọn Òfin Lílò");
  await expect(page.locator(".login-footer-links a[href='./contact.html']")).toHaveText("Kàn sí wa");

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


test("CampusMap renderer and map-only assets load only after opening the map", async ({ page }) => {
  const mapRequests = [];
  page.on("request", request => {
    if (/maplibre-gl|campus-map-geometry\.js/.test(request.url())) mapRequests.push(request.url());
  });

  await page.route("https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.css", route =>
    route.fulfill({ status: 200, contentType: "text/css", body: "" })
  );
  await page.route("https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.mjs", route => route.abort());
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#login-screen")).toBeVisible();

  await page.waitForTimeout(300);
  expect(mapRequests, "the initial page should not request map engine or geometry assets").toEqual([]);
  await expect(page.locator('link[data-campusshield-lazy-map-style]')).toHaveCount(0);
  await expect(page.locator('script[src*="campus-map-geometry.js"]')).toHaveCount(0);

  const mapEngineRequest = page.waitForRequest(request =>
    request.url() === "https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.mjs"
  );
  await page.locator("#page-campus-map").evaluate(element => element.classList.add("active"));
  await mapEngineRequest;

  await expect.poll(() => page.locator('link[data-campusshield-lazy-map-style]').count()).toBe(3);
  await expect.poll(() => page.locator('script[src*="campus-map-geometry.js"]').count()).toBe(1);
  expect(mapRequests.some(url => url.includes("campus-map-geometry.js"))).toBeTruthy();
  expect(mapRequests.some(url => url.endsWith("/maplibre-gl.mjs"))).toBeTruthy();
});


test("workspace-only feature scripts load on first use instead of initial app startup", async ({ page }) => {
  const featureRequests = [];
  const featureNames = [
    "campus-course-community.js",
    "student-rewards.js",
    "shieldmind-planner.js",
    "shieldmind-learning-insights.js",
    "campus-timetable.js",
    "campus-ideas-impact.js",
    "campus-discovery-ui.js",
    "campusshield-guide.js",
    "student-creator-tools.js",
    "campus-chat-room-enhancements.js",
    "campus-voice-notes.js",
    "campus-private-messages-polish.js",
    "campus-service-directory.js"
  ];
  page.on("request", request => {
    const url = new URL(request.url());
    if (featureNames.some(name => url.pathname.endsWith("/" + name))) featureRequests.push(url.pathname);
  });

  await page.goto("/index.html?lazy-feature-test=1", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#login-screen")).toBeVisible();
  await page.waitForTimeout(300);
  expect(featureRequests, "feature-only bundles should stay out of the initial login/dashboard request path").toEqual([]);

  const rewardsRequest = page.waitForRequest(request => request.url().endsWith("/student-rewards.js"));
  const activatePage = async id => page.evaluate(pageId => {
    // Model the authenticated transition before exercising workspace-only routes.
    const workspace = document.getElementById("workspace");
    if (workspace) { workspace.hidden = false; workspace.style.display = "block"; }
    const login = document.getElementById("login-screen");
    if (login) { login.hidden = true; login.style.display = "none"; }
    document.querySelectorAll(".page.active").forEach(element => element.classList.remove("active"));
    document.getElementById(pageId)?.classList.add("active");
  }, id);
  await activatePage("page-student-rewards");
  await rewardsRequest;
  await expect.poll(() => page.evaluate(() => Boolean(window.CampusShieldStudentRewards))).toBe(true);

  const marketplaceRequest = page.waitForRequest(request => request.url().endsWith("/campus-discovery-ui.js"));
  await activatePage("page-marketplace");
  await marketplaceRequest;
  await expect.poll(() => page.locator("#campus-marketplace-results").count()).toBe(1);

  const shieldmindPlannerRequest = page.waitForRequest(request => request.url().endsWith("/shieldmind-planner.js"));
  await activatePage("page-shieldmind");
  await shieldmindPlannerRequest;
  await expect.poll(() => page.evaluate(() => Boolean(window.CampusShieldPlanner))).toBe(true);

  expect(featureRequests).toContain("/student-rewards.js");
  expect(featureRequests).toContain("/campus-discovery-ui.js");
  expect(featureRequests).toContain("/shieldmind-planner.js");

  const contactsRequest = page.waitForRequest(request => request.url().endsWith("/campus-service-directory.js"));
  await activatePage("page-campus-contacts");
  await contactsRequest;
  await expect.poll(() => page.evaluate(() => Boolean(window.CampusShieldServiceDirectory))).toBe(true);
});


test("mobile page transitions stay brief and use native scroll behavior", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/index.html?mobile-performance-test=1", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#login-screen")).toBeVisible();
  const performanceStylesheet = page.locator('link[href*="campusshield-performance-polish.css"]');
  await expect.poll(() => performanceStylesheet.evaluate(link => Boolean(link.sheet))).toBe(true);

  const mobileMotion = await page.locator("#page-dashboard").evaluate(element => {
    element.classList.add("active");
    const style = getComputedStyle(element);
    return {
      scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
      animationName: style.animationName,
      animationDurationMs: Math.max(...style.animationDuration.split(",").map(value => {
        const duration = parseFloat(value);
        return value.includes("ms") ? duration : duration * 1000;
      })),
    };
  });
  expect(mobileMotion.scrollBehavior).toBe("auto");
  expect(mobileMotion.animationName).toBe("page-in");
  expect(mobileMotion.animationDurationMs).toBeLessThanOrEqual(160);

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reducedMotion = await page.locator("#page-dashboard").evaluate(element => ({
    scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    animationName: getComputedStyle(element).animationName,
  }));
  expect(reducedMotion.scrollBehavior).toBe("auto");
  expect(reducedMotion.animationName).toBe("none");
});


test("optional workspace bundles stay out of login startup and load on first use", async ({ page }) => {
  const deferredRequests = [];
  const deferredNames = [
    "past-question-practice.js",
    "campus-live-classroom.js",
    "student-rewards-admin.js",
    "vendor/qrcode.js"
  ];
  page.on("request", request => {
    const pathname = new URL(request.url()).pathname;
    if (deferredNames.some(name => pathname.endsWith("/" + name))) deferredRequests.push(pathname);
  });

  await page.goto("/index.html?deferred-workspace-test=1", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#login-screen")).toBeVisible();
  await page.waitForTimeout(350);
  expect(deferredRequests, "optional modules should not download on the initial login path").toEqual([]);

  const activatePage = async id => page.evaluate(pageId => {
    // Model the authenticated transition before exercising workspace-only routes.
    const workspace = document.getElementById("workspace");
    if (workspace) { workspace.hidden = false; workspace.style.display = "block"; }
    const login = document.getElementById("login-screen");
    if (login) { login.hidden = true; login.style.display = "none"; }
    document.querySelectorAll(".page.active").forEach(element => element.classList.remove("active"));
    document.getElementById(pageId)?.classList.add("active");
  }, id);

  const pastQuestionsRequest = page.waitForRequest(request => request.url().includes("/past-question-practice.js"));
  await activatePage("page-past-questions");
  await pastQuestionsRequest;
  await expect.poll(() => page.evaluate(() => Boolean(window.PastQuestionPractice))).toBe(true);

  const adminRewardsRequest = page.waitForRequest(request => request.url().includes("/student-rewards-admin.js"));
  await activatePage("page-admin-rewards");
  await adminRewardsRequest;
  await expect.poll(() => page.evaluate(() => Boolean(window.CampusShieldAdminRewards))).toBe(true);

  const classroomRequest = page.waitForRequest(request => request.url().includes("/campus-live-classroom.js"));
  await activatePage("page-classroom");
  await classroomRequest;
  await expect.poll(() => page.locator("#page-classroom").getAttribute("data-feature-loaded")).toBe("true");

  expect(deferredRequests.some(path => path.endsWith("/vendor/qrcode.js"))).toBe(false);
  expect(deferredRequests.some(path => path.endsWith("/past-question-practice.js"))).toBe(true);
  expect(deferredRequests.some(path => path.endsWith("/student-rewards-admin.js"))).toBe(true);
  expect(deferredRequests.some(path => path.endsWith("/campus-live-classroom.js"))).toBe(true);
});
