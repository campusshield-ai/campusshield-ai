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

test("tablet defaults to a compact icon rail while desktop collapse remains user-controlled", async ({ page }) => {
  for (const width of [651, 700, 760, 768, 820, 900, 901, 1023, 1024, 1366, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      localStorage.removeItem("campusshield-sidebar-collapsed");
      localStorage.removeItem("campusshield-tablet-expanded");
    });
    await page.goto("/index.html", { waitUntil: "domcontentloaded" });
    await revealWorkspace(page);

    const app = page.locator("#workspace");
    const sidebar = page.locator("#app-sidebar");
    const collapseButton = page.locator("#sidebar-collapse-toggle");
    const guideAccess = page.locator("#sidebar-guide-access");
    const guideButton = page.locator("#guide-nav");
    const featureNav = page.locator("#app-sidebar > .nav");
    const tablet = width >= 768 && width <= 1023;
    const expandedWidth = width <= 900 ? 200 : 235;
    const compactWidth = width <= 900 ? 74 : 82;

    await expect(guideAccess).toBeVisible();
    await expect(featureNav.locator("#guide-nav")).toHaveCount(0);
    await expect(collapseButton).toBeVisible();

    if (tablet) {
      await expect(app).toHaveClass(/tablet-compact/);
      await expect.poll(() => sidebar.evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(compactWidth);
      await expect(collapseButton).toHaveAttribute("aria-expanded", "false");
      await expect(page.locator("#app-sidebar .brand-copy")).toBeHidden();
      await expect(guideButton).toBeVisible();

      // Students can expand the compact rail on a tablet.
      await collapseButton.click();
      await expect(app).not.toHaveClass(/tablet-compact/);
      await expect(collapseButton).toHaveAttribute("aria-expanded", "true");
      await expect.poll(() => sidebar.evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(expandedWidth);
      await expect(page.locator("#app-sidebar .brand-copy")).toBeVisible();
      await expect(guideButton).toHaveText(/How to use CampusShield/);

      // And collapse it again without changing the desktop preference.
      await collapseButton.click();
      await expect(app).toHaveClass(/tablet-compact/);
    } else {
      await expect(app).not.toHaveClass(/tablet-compact/);
      await expect(guideAccess.locator(".nav-section-label")).toHaveText("GETTING STARTED");
      await expect(guideButton).toHaveText(/How to use CampusShield/);
      await expect(featureNav.locator(".nav-section-label").first()).toHaveText("SAFETY & RESPONSE");
      await collapseButton.click();
      await expect(app).toHaveClass(/sidebar-collapsed/);
      await expect.poll(() => sidebar.evaluate(el => el.getBoundingClientRect().width)).toBe(compactWidth);
      await expect(collapseButton).toHaveAttribute("aria-expanded", "false");
      await expect(page.locator("#app-sidebar .brand-copy")).toBeHidden();
    }

    const metrics = await page.evaluate(() => {
      const sidebar = document.querySelector("#app-sidebar");
      const main = document.querySelector("#workspace .main");
      const box = sidebar.getBoundingClientRect();
      return {
        sidebarWidth: box.width,
        sidebarScrollWidth: sidebar.scrollWidth,
        sidebarClientWidth: sidebar.clientWidth,
        mainMarginLeft: parseFloat(getComputedStyle(main).marginLeft),
        iconDisplay: getComputedStyle(sidebar.querySelector(".nav button .nav-icon")).display,
        iconWidth: sidebar.querySelector(".nav button .nav-icon").getBoundingClientRect().width,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      };
    });
    expect(metrics.sidebarWidth, `compact rail width at ${width}px`).toBe(compactWidth);
    expect(metrics.mainMarginLeft, `content offset at ${width}px`).toBe(compactWidth);
    expect(metrics.sidebarScrollWidth, `rail content at ${width}px`).toBeLessThanOrEqual(metrics.sidebarClientWidth + 1);
    expect(metrics.iconDisplay).not.toBe("none");
    expect(metrics.iconWidth).toBeGreaterThanOrEqual(18);
    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);

    if (tablet) {
      await collapseButton.click();
      await expect(app).not.toHaveClass(/tablet-compact/);
    } else {
      await collapseButton.click();
      await expect(app).not.toHaveClass(/sidebar-collapsed/);
    }
    await expect.poll(() => sidebar.evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(expandedWidth);
    await expect(page.locator("#app-sidebar .brand-copy")).toBeVisible();
    await expect(page.locator("#sidebar-guide-access")).toBeVisible();
    await expect(page.locator("#guide-nav")).toBeVisible();
  }
});

test("mobile drawer remains full-width and readable when a desktop collapse preference is saved", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.addInitScript(() => localStorage.setItem("campusshield-sidebar-collapsed", "true"));
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await revealWorkspace(page);
  await expect(page.locator("#workspace")).toHaveClass(/sidebar-collapsed/);

  await page.setViewportSize({ width: 333, height: 844 });
  const app = page.locator("#workspace");
  const sidebar = page.locator("#app-sidebar");
  const mobileButton = page.locator("#mobile-nav-toggle");

  await expect(mobileButton).toBeVisible();
  await mobileButton.click();
  await expect(app).toHaveClass(/mobile-nav-open/);
  await expect(sidebar).toBeVisible();
  await expect(sidebar).toHaveAttribute("role", "dialog");
  await expect(sidebar).toHaveAttribute("aria-modal", "true");
  await expect(page.locator(".main")).toHaveAttribute("inert", "");
  await expect(page.locator("#mobile-sidebar-close")).toBeFocused();
  await expect.poll(() => sidebar.evaluate(el => Math.round(el.getBoundingClientRect().left))).toBe(0);
  await expect(page.locator("#sidebar-backdrop")).toHaveCSS("opacity", "1");
  await expect(page.locator("#app-sidebar .sidebar-toggle")).toBeHidden();
  await expect(page.locator("#app-sidebar .brand-copy")).toBeVisible();
  await expect(page.locator("#app-sidebar .nav-section-label").first()).toBeVisible();
  await expect(page.locator("#app-sidebar .nav button .nav-icon").first()).toBeVisible();

  const metrics = await page.evaluate(() => {
    const sidebar = document.querySelector("#app-sidebar");
    const box = sidebar.getBoundingClientRect();
    return {
      sidebarWidth: box.width,
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      mainMarginLeft: parseFloat(getComputedStyle(document.querySelector("#workspace .main")).marginLeft),
    };
  });
  expect(metrics.sidebarWidth).toBeGreaterThan(260);
  expect(metrics.sidebarWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.mainMarginLeft).toBe(0);
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  await expect.poll(() => page.locator("body").evaluate(el => getComputedStyle(el).overflow)).toBe("hidden");
  await page.locator("#sidebar-backdrop").click({ position: { x: metrics.viewportWidth - 10, y: 500 } });
  await expect(app).not.toHaveClass(/mobile-nav-open/);
  await expect(sidebar).not.toHaveAttribute("aria-modal", "true");
  await expect(page.locator(".main")).not.toHaveAttribute("inert", "");
  await expect(mobileButton).toBeFocused();
  await expect.poll(() => sidebar.evaluate(el => el.getBoundingClientRect().left)).toBeLessThan(-250);
  await expect(page.locator("#sidebar-backdrop")).toBeHidden();
  await mobileButton.click();
  await expect(app).toHaveClass(/mobile-nav-open/);
  await page.keyboard.press("Escape");
  await expect(app).not.toHaveClass(/mobile-nav-open/);
  await expect(mobileButton).toBeFocused();
});


test("Getting Started stays pinned while feature navigation scrolls", async ({ page }) => {
  for (const width of [390, 768, 1366]) {
    await page.setViewportSize({ width, height: 760 });
    await page.goto("/index.html", { waitUntil: "domcontentloaded" });
    await revealWorkspace(page);

    const guide = page.locator("#sidebar-guide-access");
    const guideButton = page.locator("#guide-nav");
    const featureNav = page.locator("#app-sidebar > .nav");
    await expect(guide).toBeVisible();
    await expect(guideButton).toBeVisible();
    await expect(featureNav).toBeVisible();

    const before = await guideButton.boundingBox();
    await featureNav.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(50);
    const after = await guideButton.boundingBox();
    const navBox = await featureNav.boundingBox();
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(navBox).not.toBeNull();
    expect(Math.abs(after.y - before.y), "guide position changed while feature list scrolled at " + width + "px").toBeLessThanOrEqual(1);
    expect(after.y + after.height).toBeLessThanOrEqual(navBox.y + 1);
    const state = await featureNav.evaluate(el => ({ scrollTop:el.scrollTop, scrollHeight:el.scrollHeight, clientHeight:el.clientHeight }));
    expect(state.scrollHeight).toBeGreaterThan(state.clientHeight);
    expect(state.scrollTop).toBeGreaterThan(0);
    await expect(guide).toBeVisible();
  }
});
