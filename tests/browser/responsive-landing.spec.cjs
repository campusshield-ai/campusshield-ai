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
  await expect(page.locator('a[href^="mailto:campusshieldaitechnologies@gmail.com"]')).toHaveCount(4);
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
  await expect(page.locator(".login-footer-links a").nth(0)).toHaveText("Àwọn Ẹ̀ya");
  await expect(page.locator(".login-footer-links a").nth(1)).toHaveText("Nípa wa");
  await expect(page.locator(".login-footer-links a").nth(2)).toHaveText("Ìrànlọ́wọ́");
  await expect(page.locator(".login-footer-links a").nth(3)).toHaveText("Ìpamọ́");
  await expect(page.locator(".login-footer-links a").nth(4)).toHaveText("Àwọn Òfin Lílò");
  await expect(page.locator(".login-footer-links a").nth(5)).toHaveText("Kàn sí wa");
  await expect(page.locator("#auth-tabs [data-auth-mode='signup']")).toHaveText("Ṣẹ̀dá àkọọ́lẹ̀");

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



test("shared glass interaction layer remains responsive and motion-aware", async ({ page }) => {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator('link[href="./campusshield-interaction-layer.css"]')).toHaveCount(1);
  const widths = [360, 390, 430, 768, 1024, 1366, 1920];

  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    const metrics = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(metrics.document, `document should not overflow at ${width}px`).toBeLessThanOrEqual(width + 1);
    expect(metrics.body, `body should not overflow at ${width}px`).toBeLessThanOrEqual(width + 1);
    await expect(page.locator(".auth-panel")).toBeVisible();
    await expect(page.locator(".login-feature-grid")).toBeVisible();
  }

  await page.locator('[data-auth-mode="signup"]').click();
  await expect(page.locator("#signup-fields")).toBeVisible();
  const authModeBackground = await page.locator('[data-auth-mode="signup"]').evaluate((element) =>
    getComputedStyle(element).backgroundImage
  );
  expect(authModeBackground).not.toBe("none");

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reducedMotionDuration = await page.locator("#signup-fields").evaluate((element) =>
    parseFloat(getComputedStyle(element).animationDuration)
  );
  expect(reducedMotionDuration).toBeLessThan(0.001);
});


test("interactive dashboard and CampusMap coverage panels fit the app shell", async ({ page }) => {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator('link[href="./campus-dashboard-insights.css"]')).toHaveCount(1);
  await expect(page.locator("#dashboard-safety-insights")).toHaveCount(1);
  await expect(page.locator("#campus-dashboard-saved-panel")).toHaveCount(1);
  await expect(page.locator("#campus-map-coverage-overview")).toHaveCount(1);

  // Reveal the signed-in layout without authenticating or creating any records.
  await page.evaluate(() => {
    document.querySelector("#login-screen").hidden = true;
    document.querySelector("#workspace").hidden = false;
    document.querySelector("#page-dashboard").classList.add("active");
    document.querySelector("#page-campus-map").classList.add("active");
  });

  for (const width of [360, 390, 430, 768, 1024, 1366, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const metrics = await page.evaluate(() => {
      const columns = selector => {
        const element = document.querySelector(selector);
        return element ? getComputedStyle(element).gridTemplateColumns.split(/\s+/).filter(Boolean).length : 0;
      };
      return {
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
        analyticsColumns: columns(".dashboard-insights-grid"),
        mapCoverageColumns: columns(".campus-map-coverage-overview"),
      };
    });
    expect(metrics.document, `dashboard/map document overflow at ${width}px`).toBeLessThanOrEqual(width + 1);
    expect(metrics.body, `dashboard/map body overflow at ${width}px`).toBeLessThanOrEqual(width + 1);
    expect(metrics.analyticsColumns, `analytics cards should stack on narrow screens at ${width}px`).toBe(width <= 850 ? 1 : 2);
    expect(metrics.mapCoverageColumns, `map coverage cards should adapt at ${width}px`).toBe(width <= 850 ? 2 : width <= 1100 ? 3 : 5);
    await expect(page.locator("#dashboard-safety-insights")).toBeVisible();
    await expect(page.locator("#campus-map-coverage-overview")).toBeVisible();
  }
});


test("Campus Passport and entrance discovery fit the CampusMap experience at seven widths", async ({ page }) => {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator('link[href="./campus-map-passport.css"]')).toHaveCount(1);
  await expect(page.locator("#campus-map-discovery-filters")).toHaveCount(1);

  // Reveal the app shell and the empty-state Passport card. This test does not
  // authenticate or insert campus records into Supabase.
  await page.evaluate(() => {
    document.querySelector("#login-screen").hidden = true;
    document.querySelector("#workspace").hidden = false;
    document.querySelector("#page-campus-map").classList.add("active");
    const passport = document.querySelector("#campus-map-passport");
    passport.hidden = false;
    document.querySelector("#campus-map-passport-title").textContent = "Campus Passport preview";
    document.querySelector("#campus-map-passport-description").textContent =
      "Verified campus details appear here after an authorised review.";
  });
  await expect(page.locator("#campus-map-discovery-filters")).toBeVisible();

  for (const width of [360, 390, 430, 768, 1024, 1366, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const metrics = await page.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      passport: document.querySelector("#campus-map-passport").getBoundingClientRect().width,
      factsColumns: getComputedStyle(document.querySelector("#campus-map-passport-facts")).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
      filterScroll: document.querySelector("#campus-map-discovery-filters").scrollWidth,
      filterClient: document.querySelector("#campus-map-discovery-filters").clientWidth,
    }));
    expect(metrics.document, `Campus Passport document overflow at ${width}px`).toBeLessThanOrEqual(width + 1);
    expect(metrics.body, `Campus Passport body overflow at ${width}px`).toBeLessThanOrEqual(width + 1);
    expect(metrics.passport, `Campus Passport card must have a usable width at ${width}px`).toBeGreaterThan(220);
    expect(metrics.factsColumns, `Passport facts should retain a compact two-column layout at ${width}px`).toBeGreaterThanOrEqual(2);
    expect(metrics.filterScroll, `filter row must not overflow its panel at ${width}px`).toBeLessThanOrEqual(metrics.filterClient + 1);
    await expect(page.locator("#campus-map-passport")).toBeVisible();
    await expect(page.locator("#campus-map-passport-route")).toBeVisible();
    await expect(page.locator("#campus-map-passport-accessible-route")).toBeDisabled();
  }

  await page.emulateMedia({ reducedMotion: "reduce" });
  const duration = await page.locator('[data-campus-filter="all"]').evaluate(element =>
    parseFloat(getComputedStyle(element).transitionDuration)
  );
  expect(duration).toBeLessThanOrEqual(0.001);
});

test("CampusMap layer controls are keyboard-accessible, persistent, and fit mobile screens", async ({ page }) => {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  const revealCampusMap = async () => {
    await page.evaluate(() => {
      document.querySelector("#login-screen").hidden = true;
      document.querySelector("#workspace").hidden = false;
      document.querySelector("#page-campus-map").classList.add("active");
    });
    await page.waitForFunction(() => typeof window.maplibregl?.Map === "function", { timeout: 15000 });
  };
  await revealCampusMap();

  const toggle = page.locator("#campus-map-layers-toggle");
  const panel = page.locator("#campus-map-layer-panel");
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(panel).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(panel.locator("input[data-map-layer]")).toHaveCount(6);
  await expect(page.locator("#campus-map-layer-drafts-option")).toBeHidden();

  const roads = panel.locator('input[data-map-layer="roads"]');
  await roads.uncheck();
  await expect(roads).not.toBeChecked();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(toggle).toBeFocused();

  await page.reload({ waitUntil: "domcontentloaded" });
  await revealCampusMap();
  await toggle.click();
  await expect(panel).toBeVisible();
  const persistedRoads = panel.locator('input[data-map-layer="roads"]');
  await expect(persistedRoads).not.toBeChecked();
  await page.keyboard.press("Escape");

  for (const width of [360, 390, 430, 768, 1024, 1366, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await toggle.click();
    await expect(panel).toBeVisible();
    const bounds = await page.evaluate(() => {
      const panelBox = document.querySelector("#campus-map-layer-panel").getBoundingClientRect();
      const stageBox = document.querySelector(".campus-map-stage").getBoundingClientRect();
      return {
        panelLeft: panelBox.left,
        panelRight: panelBox.right,
        stageLeft: stageBox.left,
        stageRight: stageBox.right,
        documentWidth: document.documentElement.scrollWidth
      };
    });
    expect(bounds.panelLeft, `layer panel should stay inside the stage at ${width}px`).toBeGreaterThanOrEqual(bounds.stageLeft - 1);
    expect(bounds.panelRight, `layer panel should stay inside the stage at ${width}px`).toBeLessThanOrEqual(bounds.stageRight + 1);
    expect(bounds.documentWidth, `layer panel must not cause horizontal page overflow at ${width}px`).toBeLessThanOrEqual(width + 1);
    await page.keyboard.press("Escape");
  }
});


test("CampusMap SVG symbols register in MapLibre and stay crisp in the responsive location list", async ({ page }) => {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    document.querySelector("#login-screen").hidden = true;
    document.querySelector("#workspace").hidden = false;
    document.querySelector("#page-campus-map").classList.add("active");
  });
  await page.waitForFunction(() => typeof window.CampusMapIcons?.addToMap === "function", { timeout: 20000 });

  const registration = await page.evaluate(async () => {
    const images = new Map();
    const mapAdapter = {
      hasImage: id => images.has(id),
      addImage: (id, image, options) => images.set(id, {
        width: image.naturalWidth,
        height: image.naturalHeight,
        pixelRatio: options.pixelRatio
      })
    };
    const loaded = await window.CampusMapIcons.addToMap(mapAdapter);
    return {
      expected: Array.from(window.CampusMapIcons.types).sort(),
      loaded: loaded.sort(),
      imageSizes: Array.from(images.values())
    };
  });
  expect(registration.loaded, "every local SVG should decode as a MapLibre-ready image").toEqual(registration.expected);
  expect(registration.imageSizes).toHaveLength(registration.expected.length);
  for (const image of registration.imageSizes) {
    expect(image).toEqual({ width: 64, height: 64, pixelRatio: 2 });
  }

  await page.evaluate(() => {
    const fixture = document.createElement("div");
    fixture.className = "campus-map-feature-list";
    fixture.dataset.svgFixture = "true";
    fixture.innerHTML = '<button type="button" class="campus-map-feature"><span class="campus-map-feature-icon" aria-hidden="true">' +
      window.CampusMapIcons.svg("library") +
      '</span><span class="campus-map-feature-copy"><strong>Library symbol check</strong><small>Academic</small></span><span aria-hidden="true">›</span></button>';
    document.querySelector(".campus-map-sidebar").appendChild(fixture);
  });

  for (const width of [360, 390, 430, 768, 1024, 1366, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const metrics = await page.evaluate(() => {
      const fixture = document.querySelector('[data-svg-fixture="true"]');
      const list = fixture.getBoundingClientRect();
      const button = fixture.querySelector(".campus-map-feature").getBoundingClientRect();
      const icon = fixture.querySelector(".campus-map-feature-icon svg").getBoundingClientRect();
      return {
        listWidth: list.width,
        listScrollWidth: fixture.scrollWidth,
        buttonRight: button.right,
        listRight: list.right,
        iconWidth: icon.width,
        iconHeight: icon.height,
        documentWidth: document.documentElement.scrollWidth
      };
    });
    expect(metrics.iconWidth, `SVG symbol should remain visible at ${width}px`).toBeGreaterThanOrEqual(30);
    expect(metrics.iconHeight, `SVG symbol should remain square at ${width}px`).toBeGreaterThanOrEqual(30);
    expect(metrics.buttonRight, `location card should fit the list at ${width}px`).toBeLessThanOrEqual(metrics.listRight + 1);
    expect(metrics.listScrollWidth, `location list should not overflow at ${width}px`).toBeLessThanOrEqual(metrics.listWidth + 1);
    expect(metrics.documentWidth, `SVG list fixture should not cause page overflow at ${width}px`).toBeLessThanOrEqual(width + 1);
  }
});
