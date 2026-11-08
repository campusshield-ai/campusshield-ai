const { test, expect } = require("@playwright/test");

test("guided walkthrough switches journeys, tracks progress and opens the selected feature", async ({ page }) => {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const workspace = document.getElementById("workspace");
    if (workspace) { workspace.hidden = false; workspace.style.display = "block"; }
    const login = document.getElementById("login-screen");
    if (login) { login.hidden = true; login.style.display = "none"; }
    // This UI-only fixture does not impersonate an authenticated user. Reveal
    // the guide section directly so the app's real sign-in guard stays intact.
    document.getElementById("page-guide")?.classList.add("active");
  });
  const guide = page.locator("#page-guide");
  await expect(guide).toBeVisible();
  await expect(guide.locator("#guide-walkthrough")).toBeVisible();
  await expect(guide.locator("#guide-walkthrough-step-title")).toHaveText("Complete your profile");
  await expect(guide.locator("#guide-walkthrough-step-count")).toHaveText("STEP 1 OF 3");
  await expect(guide.locator("#guide-walkthrough-open")).toHaveAttribute("data-page", "profile-settings");

  await guide.locator('[data-guide-journey="safety"]').click();
  await expect(guide.locator("#guide-walkthrough-step-title")).toHaveText("Open incident reporting");
  await expect(guide.locator("#guide-walkthrough-open")).toHaveAttribute("data-page", "report");
  await guide.locator("#guide-walkthrough-complete").click();
  await expect(guide.locator("#guide-walkthrough-completion")).toHaveText("1 OF 3 COMPLETED");
  await expect(guide.locator("#guide-walkthrough-complete")).toHaveAttribute("aria-pressed", "true");
  await expect(guide.locator("#guide-walkthrough-progress")).toHaveAttribute("aria-valuenow", "1");

  await guide.locator("#guide-walkthrough-next").click();
  await expect(guide.locator("#guide-walkthrough-step-title")).toHaveText("Submit a clear report");
  await expect(guide.locator("#guide-walkthrough-step-count")).toHaveText("STEP 2 OF 3");
  await page.evaluate(() => {
    document.querySelector("#guide-walkthrough-open").addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      document.documentElement.dataset.walkthroughActionTriggered = "true";
    }, { capture: true, once: true });
  });
  await guide.locator("#guide-walkthrough-open").click();
  await expect(page.locator("html")).toHaveAttribute("data-walkthrough-action-triggered", "true");

  await guide.locator('[data-guide-journey="mobile"]').click();
  await expect(guide.locator("#guide-walkthrough-step-title")).toHaveText("Open installation guidance");
  await guide.locator("#guide-walkthrough-open").click();
  await expect(guide.locator("#guide-install-details")).toHaveAttribute("open", "");
  await expect(guide.locator("#guide-install-details summary")).toBeFocused();

  await guide.locator('[data-guide-journey="map"]').click();
  await expect(guide.locator("#guide-walkthrough-open")).toHaveAttribute("data-page", "campus-map");
  await page.setViewportSize({ width: 390, height: 844 });
  const box = await guide.locator("#guide-walkthrough").boundingBox();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(391);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(391);
});

test("walkthrough destinations are hidden instead of linking to features absent from a build", async ({ page }) => {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const workspace = document.getElementById("workspace");
    if (workspace) { workspace.hidden = false; workspace.style.display = "block"; }
    const login = document.getElementById("login-screen");
    if (login) { login.hidden = true; login.style.display = "none"; }
    document.getElementById("page-guide")?.classList.add("active");
    document.querySelectorAll('[data-page="campus-map"]').forEach(element => element.remove());
  });
  await page.locator('[data-guide-journey="map"]').click();
  await expect(page.locator("#guide-walkthrough-open")).toBeHidden();
  await expect(page.locator("#guide-walkthrough-note")).toContainText("not available in the current build");
});
