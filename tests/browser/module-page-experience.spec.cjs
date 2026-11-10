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
    const headingColor = getComputedStyle(document.querySelector("#page-courses > .heading h1")).color;
    const canvasColor = getComputedStyle(document.body).backgroundColor;
    const panelColor = getComputedStyle(document.querySelector("#page-courses > .panel")).backgroundColor;

    const parseColor = value => {
      if (typeof value !== "string") return null;
      const color = value.trim();
      const hexMatch = color.match(/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i);
      if (hexMatch) {
        let hex = hexMatch[1];
        if (hex.length <= 4) hex = [...hex].map(char => char + char).join("");
        const channels = [0, 2, 4].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
        const alpha = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1;
        return channels.every(Number.isFinite) && Number.isFinite(alpha) ? [...channels, alpha] : null;
      }

      const match = color.match(/^rgba?\(\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*,\s*([\d.]+%?)(?:\s*,\s*([\d.]+%?))?\s*\)$/i);
      if (!match) return null;
      const channels = match.slice(1, 4).map(component => {
        const isPercent = component.endsWith("%");
        const number = Number.parseFloat(isPercent ? component.slice(0, -1) : component);
        const normalized = number / (isPercent ? 100 : 255);
        return Number.isFinite(normalized) && normalized >= 0 && normalized <= 1 ? normalized : null;
      });
      if (channels.some(channel => channel === null)) return null;
      const alphaText = match[4];
      const alpha = alphaText === undefined ? 1 :
        Number.parseFloat(alphaText.endsWith("%") ? alphaText.slice(0, -1) : alphaText) /
        (alphaText.endsWith("%") ? 100 : 1);
      return Number.isFinite(alpha) && alpha >= 0 && alpha <= 1 ? [...channels, alpha] : null;
    };

    const luminance = color => {
      if (!Array.isArray(color) || color.length < 3) return null;
      const linear = color.slice(0, 3).map(channel =>
        channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
      );
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };

    const heading = parseColor(headingColor);
    const canvas = parseColor(canvasColor);
    const panel = parseColor(panelColor);
    const contrast = heading && canvas
      ? (Math.max(luminance(heading), luminance(canvas)) + 0.05) /
        (Math.min(luminance(heading), luminance(canvas)) + 0.05)
      : null;
    return { headingColor, canvasColor, panelColor, contrast, panel, panelLuminance: panel && luminance(panel) };
  });

  expect(colors.contrast, `Could not compute contrast for ${colors.headingColor} on ${colors.canvasColor}`).not.toBeNull();
  expect(Number.isFinite(colors.contrast)).toBe(true);
  expect(colors.contrast).toBeGreaterThanOrEqual(4.5);
  expect(colors.panel, `Could not parse panel background color ${colors.panelColor}`).not.toBeNull();
  // Check that the actual computed surface is dark green without duplicating
  // a CSS implementation detail as a brittle hard-coded RGB assertion.
  const [red, green, blue] = colors.panel;
  expect(green).toBeGreaterThan(red);
  expect(green).toBeGreaterThan(blue);
  expect(colors.panelLuminance).toBeLessThan(0.1);
  await expect(heading).toBeVisible();
  await expect(panel).toBeVisible();
});
