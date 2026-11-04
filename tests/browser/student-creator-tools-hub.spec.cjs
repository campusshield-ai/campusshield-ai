const { test, expect } = require("@playwright/test");

test.describe("Student Creator & Tools Hub", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/index.html", { waitUntil: "domcontentloaded" });
    // This suite targets the page component in isolation. The production app
    // still requires its normal signed-in workspace session to navigate here.
    await page.locator("#workspace").evaluate((element) => { element.hidden = false; });
    await page.locator("#workspace .page").evaluateAll((pages) => {
      pages.forEach((element) => element.classList.remove("active"));
    });
    await page.locator("#page-creator-tools").evaluate((element) => {
      element.classList.add("active");
    });
    await expect(page.locator("#page-creator-tools")).toBeVisible();
  });

  test("shows all five curated tools and the existing CampusShield shortcuts", async ({ page }) => {
    await expect(page.locator(".creator-tool-card")).toHaveCount(5);
    await expect(page.locator("#page-creator-tools h1")).toContainText("Study smarter.");
    await expect(page.locator("#page-creator-tools h1")).toContainText("Create better.");
    for (const name of ["PdfCraft", "PhotoCraft", "VoiceStudio", "ArtCraft", "REA"]) {
      await expect(page.locator(".creator-tool-card").filter({ has: page.getByRole("heading", { name, exact: true }) })).toHaveCount(1);
    }
    for (const pageName of ["shieldmind", "courses", "past-questions", "timetable"]) {
      await expect(page.locator(`.creator-tools-campus-card[data-page="${pageName}"]`)).toHaveCount(1);
    }
  });

  test("category filters and search work together", async ({ page }) => {
    await expect(page.locator("#creator-tools-count")).toHaveText("5 tools");

    await page.locator('[data-creator-filter="documents"]').click();
    await expect(page.locator('[data-creator-filter="documents"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".creator-tool-card:visible")).toHaveCount(1);
    await expect(page.locator(".creator-tool-card:visible h3")).toHaveText("PdfCraft");

    await page.locator('[data-creator-filter="all"]').click();
    await page.locator("#creator-tools-search").fill("voice");
    await expect(page.locator(".creator-tool-card:visible")).toHaveCount(1);
    await expect(page.locator(".creator-tool-card:visible h3")).toHaveText("VoiceStudio");

    await page.locator('[data-creator-filter="design"]').click();
    await expect(page.locator(".creator-tool-card:visible")).toHaveCount(0);
    await expect(page.locator("#creator-tools-empty")).toBeVisible();
    await page.locator("#creator-tools-reset").click();
    await expect(page.locator(".creator-tool-card:visible")).toHaveCount(5);
    await expect(page.locator("#creator-tools-search")).toHaveValue("");
    await expect(page.locator("#creator-tools-empty")).toBeHidden();
  });

  test("external links open safely and carry no private workspace data", async ({ page }) => {
    const links = page.locator(".creator-tool-actions a");
    await expect(links).toHaveCount(10);
    for (const link of await links.all()) {
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", /noopener/);
    }
    await expect(page.locator(".creator-tools-safety")).toContainText("Do not upload student ID cards");
    await expect(page.locator(".creator-tools-safety")).toContainText("CampusShield does not transmit your workspace data");
  });

  test("tool cards remain within a narrow mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const metrics = await page.evaluate(() => {
      const box = (selector) => {
        const el = document.querySelector(selector);
        const rect = el.getBoundingClientRect();
        return { left: rect.left, right: rect.right, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth };
      };
      return {
        viewport: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        hero: box(".creator-tools-hero"),
        cards: box(".creator-tools-grid"),
        campusCards: getComputedStyle(document.querySelector(".creator-tools-campus-grid")).gridTemplateColumns.split(/\s+/).length,
      };
    });
    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.hero.left).toBeGreaterThanOrEqual(-1);
    expect(metrics.hero.right).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.cards.scrollWidth).toBeLessThanOrEqual(metrics.cards.clientWidth + 1);
    expect(metrics.campusCards).toBe(1);
  });
});
