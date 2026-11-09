const { test, expect } = require("@playwright/test");

const MODULE_PAGES = [
  "community",
  "campus-chat",
  "timetable",
  "courses",
  "opportunities",
  "campus-network",
  "marketplace",
  "helpdesk"
];
const WIDTHS = [320, 360, 390, 430, 768, 1024, 1366, 1920];

async function openModule(page, pageName, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate((name) => {
    const workspace = document.getElementById("workspace");
    if (workspace) {
      workspace.hidden = false;
      workspace.style.display = "block";
    }
    const login = document.getElementById("login-screen");
    if (login) {
      login.hidden = true;
      login.style.display = "none";
    }
    document.querySelectorAll("#workspace .page").forEach(section => section.classList.remove("active"));
    const target = document.getElementById("page-" + name);
    if (target) target.classList.add("active");
  }, pageName);
  await expect(page.locator("#page-" + pageName)).toBeVisible();
  await expect(page.locator("#page-" + pageName + " > .heading")).toBeVisible();
}

for (const pageName of MODULE_PAGES) {
  for (const width of WIDTHS) {
    test(`${pageName} module header fits a ${width}px viewport`, async ({ page }) => {
      await openModule(page, pageName, width);
      const heading = page.locator("#page-" + pageName + " > .heading");
      const metrics = await heading.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const styles = getComputedStyle(element);
        const action = element.querySelector(":scope > .heading-actions");
        const actionRect = action?.getBoundingClientRect();
        const title = element.querySelector("h1")?.getBoundingClientRect();
        const description = element.querySelector("p")?.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          width: rect.width,
          display: styles.display,
          direction: styles.flexDirection,
          hasActions: Boolean(action),
          titleBeforeDescription: Boolean(title && description && title.bottom <= description.top + 2),
          documentWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth,
          actionRight: actionRect?.right ?? null
        };
      });

      expect(metrics.display).toBe(metrics.hasActions ? "flex" : "block");
      if (metrics.hasActions) {
        expect(metrics.direction).toBe(width <= 760 ? "column" : "row");
      }
      expect(metrics.titleBeforeDescription).toBe(true);
      expect(metrics.left).toBeGreaterThanOrEqual(-1);
      expect(metrics.right).toBeLessThanOrEqual(width + 1);
      expect(metrics.width).toBeGreaterThan(240);
      expect(metrics.documentWidth).toBeLessThanOrEqual(width + 1);
      expect(metrics.bodyWidth).toBeLessThanOrEqual(width + 1);
      if (metrics.actionRight !== null) {
        expect(metrics.actionRight).toBeLessThanOrEqual(width + 1);
      }
    });
  }
}

test("module headings and first-level cards retain readable forest-green dark theme", async ({ page }) => {
  await openModule(page, "courses", 1366);
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });

  const heading = page.locator("#page-courses > .heading");
  const panel = page.locator("#page-courses > .panel").first();
  const colors = await page.evaluate(() => ({
    heading: getComputedStyle(document.querySelector("#page-courses > .heading h1")).color,
    panel: getComputedStyle(document.querySelector("#page-courses > .panel")).backgroundColor
  }));

  expect(colors.heading).toBe("rgb(229, 243, 232)");
  expect(colors.panel).toBe("rgb(18, 53, 34)");
  await expect(heading).toBeVisible();
  await expect(panel).toBeVisible();
});
