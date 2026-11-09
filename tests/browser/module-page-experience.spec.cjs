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
  const colors = await page.evaluate(() => {
    const heading = getComputedStyle(document.querySelector("#page-courses > .heading h1")).color;
    const canvas = getComputedStyle(document.body).backgroundColor;
    const panel = getComputedStyle(document.querySelector("#page-courses > .panel")).backgroundColor;
    const rgb = value => {
      const match = value.match(/[0-9]+/g);
      if (!match) return null;
      return match.slice(1).map(Number).map(channel => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
    };
    const luminance = value => {
      const channels = rgb(value);
      return channels ? 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2] : null;
    };
    const headingLuminance = luminance(heading);
    const canvasLuminance = luminance(canvas);
    const contrast = headingLuminance === null || canvasLuminance === null
      ? 0
      : (Math.max(headingLuminance, canvasLuminance) + 0.05) / (Math.min(headingLuminance, canvasLuminance) + 0.05);
    return { heading, canvas, panel, contrast };
  });

  expect(colors.contrast).toBeGreaterThanOrEqual(4.5);
  expect(colors.panel).toBe("rgb(18, 53, 34)");
  await expect(heading).toBeVisible();
  await expect(panel).toBeVisible();
});
