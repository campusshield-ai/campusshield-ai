const { test, expect } = require("@playwright/test");

async function revealWorkspace(page) {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.locator("#campus-global-search").waitFor({ state: "attached" });
  await page.evaluate(() => {
    const login = document.querySelector("#login-screen");
    const workspace = document.querySelector("#workspace");
    if (login) { login.hidden = true; login.style.display = "none"; }
    if (workspace) { workspace.hidden = false; workspace.style.display = "block"; }
    document.querySelectorAll("#workspace .page").forEach(page => page.classList.remove("active"));
    document.querySelector("#page-dashboard")?.classList.add("active");
    document.documentElement.dataset.theme = "light";
  });
}

test("Lovable-inspired tablet rail fits 768–1023px in light and dark mode", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 768, height: 1024 });
  await revealWorkspace(page);

  for (const width of [768, 820, 900, 901, 1023]) {
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: width === 820 ? 1180 : 768 });
      await page.evaluate(themeName => {
        document.documentElement.dataset.theme = themeName;
      }, theme);
      await expect(page.locator("#workspace")).toHaveClass(/tablet-compact/);
      const metrics = await page.evaluate(() => {
        const sidebar = document.querySelector("#app-sidebar");
        const main = document.querySelector("#workspace .main");
        const box = sidebar.getBoundingClientRect();
        const active = document.querySelector('#app-sidebar .nav button[aria-current="page"]');
        const buttons = [...sidebar.querySelectorAll("button[data-page]:not([hidden])")];
        return {
          sidebarWidth: box.width,
          mainMargin: parseFloat(getComputedStyle(main).marginLeft),
          scrollWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
          bodyBackground: getComputedStyle(document.body).backgroundColor,
          activeLabel: active?.getAttribute("aria-label") || active?.textContent.trim(),
          labelledButtons: buttons.every(button => Boolean(button.getAttribute("aria-label") || button.title || button.textContent.trim()))
        };
      });
      const expectedRail = width <= 900 ? 74 : 82;
      expect(metrics.sidebarWidth, `${width}px ${theme}: tablet rail width`).toBe(expectedRail);
      expect(metrics.mainMargin, `${width}px ${theme}: main content offset`).toBe(expectedRail);
      expect(metrics.scrollWidth, `${width}px ${theme}: no horizontal overflow`).toBeLessThanOrEqual(metrics.viewportWidth + 1);
      expect(metrics.activeLabel).toContain("Dashboard");
      expect(metrics.labelledButtons).toBe(true);
    }
  }
  expect(errors).toEqual([]);
});

test("tablet rail can be expanded and re-collapsed by the sidebar control", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await revealWorkspace(page);
  const app = page.locator("#workspace");
  const toggle = page.locator("#sidebar-collapse-toggle");
  await expect(app).toHaveClass(/tablet-compact/);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(app).not.toHaveClass(/tablet-compact/);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#app-sidebar .brand-copy")).toBeVisible();
  await toggle.click();
  await expect(app).toHaveClass(/tablet-compact/);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("mobile drawer traps focus, makes the page inert and restores focus on Escape", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await revealWorkspace(page);

  const app = page.locator("#workspace");
  const trigger = page.locator("#mobile-nav-toggle");
  const drawer = page.locator("#app-sidebar");
  const close = page.locator("#mobile-sidebar-close");
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(app).toHaveClass(/mobile-nav-open/);
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(drawer).toHaveAttribute("role", "dialog");
  await expect(drawer).toHaveAttribute("aria-modal", "true");
  await expect(page.locator("#workspace .main")).toHaveAttribute("inert", "");
  await expect(page.locator(".mobile-bottom-nav")).toHaveAttribute("inert", "");
  await expect(page.locator("body")).toHaveClass(/campus-nav-locked/);
  await expect(close).toBeFocused();

  const focusable = await page.evaluate(() => [...document.querySelector("#app-sidebar").querySelectorAll(
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
  )].filter(el => !el.closest("[hidden]") && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden")
    .map(el => el.id || el.getAttribute("aria-label") || el.textContent.trim()));
  expect(focusable.length).toBeGreaterThan(2);

  await page.keyboard.press("Shift+Tab");
  const lastFocusable = focusable[focusable.length - 1];
  const activeAfterShiftTab = await page.evaluate(() => {
    const el = document.activeElement;
    return el.id || el.getAttribute("aria-label") || el.textContent.trim();
  });
  expect(activeAfterShiftTab).toBe(lastFocusable);

  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(app).not.toHaveClass(/mobile-nav-open/);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#workspace .main")).not.toHaveAttribute("inert", "");
  await expect(page.locator(".mobile-bottom-nav")).not.toHaveAttribute("inert", "");
  await expect(page.locator("body")).not.toHaveClass(/campus-nav-locked/);
  await expect(trigger).toBeFocused();
  expect(errors).toEqual([]);
});

test("global campus search supports combobox keyboard navigation and no-results announcements", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await revealWorkspace(page);

  const input = page.locator("#campus-global-search");
  const results = page.locator("#campus-global-search-results");
  const options = page.locator("#campus-global-search-options [role=option]");
  await expect(input).toHaveAttribute("role", "combobox");
  await expect(input).toHaveAttribute("aria-autocomplete", "list");
  await expect(input).toHaveAttribute("aria-controls", "campus-global-search-options");

  await input.fill("campus");
  await expect(results).toBeVisible();
  expect(await options.count()).toBeGreaterThan(1);

  await page.keyboard.press("ArrowDown");
  const firstId = await input.getAttribute("aria-activedescendant");
  expect(firstId).toBeTruthy();
  await expect(page.locator("#" + firstId)).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("ArrowDown");
  const secondId = await input.getAttribute("aria-activedescendant");
  expect(secondId).not.toBe(firstId);
  await expect(page.locator("#" + secondId)).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("ArrowUp");
  await expect(input).toHaveAttribute("aria-activedescendant", firstId);

  await page.keyboard.press("Escape");
  await expect(results).toBeHidden();
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await expect(input).not.toHaveAttribute("aria-activedescendant");

  await input.fill("zzzz-campusshield-no-results");
  await expect(results).toBeVisible();
  await expect(page.locator("#campus-global-search-empty")).toHaveAttribute("role", "status");
  await expect(page.locator("#campus-global-search-empty")).toContainText("No matching destination");
  await expect(page.locator("#campus-global-search-empty")).toBeVisible();
  await expect(input).toHaveAttribute("aria-expanded", "true");

  // Activate the destination last, because search navigation changes the page.
  await input.fill("Overview");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(results).toBeHidden();
  await expect(input).toHaveValue("");
  expect(errors).toEqual([]);
});

test("the live incident report keeps its emergency limitation warning visible", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await revealWorkspace(page);
  await page.evaluate(() => {
    document.querySelectorAll("#workspace .page").forEach(page => page.classList.remove("active"));
    document.querySelector("#page-report")?.classList.add("active");
  });
  const note = page.locator("#page-report .report-emergency-note");
  await expect(note).toBeVisible();
  await expect(note).toHaveAttribute("role", "note");
  await expect(note).toContainText("does not contact emergency services");
  await expect(note).toContainText("contact campus security or local emergency services directly");
  await expect(page.locator("#report-submit")).toContainText("Submit report");
});

test("active page is announced in desktop, sidebar and mobile navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await revealWorkspace(page);
  await expect.poll(() => page.locator('#app-sidebar button[data-page="dashboard"]').getAttribute("aria-current")).toBe("page");

  await page.evaluate(() => {
    document.querySelectorAll("#workspace .page").forEach(section => section.classList.remove("active"));
    document.querySelector("#page-report")?.classList.add("active");
  });

  await expect.poll(() => page.locator('#app-sidebar button[data-page="report"]').getAttribute("aria-current")).toBe("page");
  await expect(page.locator('#app-sidebar button[data-page="dashboard"]')).not.toHaveAttribute("aria-current", "page");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.mobile-bottom-nav button[data-page="report"]')).toHaveAttribute("aria-current", "page");
  await expect(page.locator('.mobile-bottom-nav button[data-page="dashboard"]')).not.toHaveAttribute("aria-current", "page");
});
