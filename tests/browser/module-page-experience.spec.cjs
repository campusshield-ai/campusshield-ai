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
    const darkSurfaceToken = getComputedStyle(document.documentElement).getPropertyValue("--cs-dark-surface").trim();

    const parseHexColor = value => {
      if (!value || !value.startsWith("#")) return null;
      const hex = value.slice(1);
      if (![3, 4, 6, 8].includes(hex.length)) return null;
      const normalized = hex.length <= 4
        ? [...hex].map(char => char + char).join("")
        : hex;
      const channels = [0, 2, 4, 6].map(index => {
        const component = normalized.slice(index, index + 2);
        return component ? Number.parseInt(component, 16) / 255 : 0;
      });
      return channels.length >= 3 ? [channels[0], channels[1], channels[2], channels[3] ?? 1] : null;
    };

    const parseRgbColor = value => {
      const match = value.match(/^rgba?\(\s*([0-9.]+%?)\s*,\s*([0-9.]+%?)\s*,\s*([0-9.]+%?)(?:\s*,\s*([0-9.]+%?))?\s*\)$/i);
      if (!match) return null;

      const toLinearChannel = (component, isPercent) => {
        const value = Number.parseFloat(component);
        if (!Number.isFinite(value)) return null;
        const normalized = isPercent ? value / 100 : value / 255;
        return normalized > 1 ? null : normalized;
      };

      const [r, g, b, alphaText] = match.slice(1);
      const red = toLinearChannel(r, r.endsWith("%"));
      const green = toLinearChannel(g, g.endsWith("%"));
      const blue = toLinearChannel(b, b.endsWith("%"));
      if ([red, green, blue].some(channel => channel === null)) return null;

      const alpha = alphaText === undefined
        ? 1
        : Number.parseFloat(alphaText) / (alphaText.endsWith("%") ? 100 : 1);

      if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) return null;

      return [red, green, blue, alpha];
    };

    const parseColor = value => {
      if (!value || typeof value !== "string") return null;
      const trimmed = value.trim();
      if (trimmed.startsWith("#")) return parseHexColor(trimmed);
      return parseRgbColor(trimmed);
    };

    const luminance = color => {
      if (!Array.isArray(color) || color.length < 3) return null;
      const [r, g, b] = color;
      const channels = [r, g, b].map(channel => {
        const normalized = channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        return normalized;
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };

    const contrastRatio = (foreground, background) => {
      const foregroundLum = luminance(foreground);
      const backgroundLum = luminance(background);
      if (foregroundLum === null || backgroundLum === null) return null;
      return (Math.max(foregroundLum, backgroundLum) + 0.05) / (Math.min(foregroundLum, backgroundLum) + 0.05);
    };

    const headingRgb = parseColor(headingColor);
    const canvasRgb = parseColor(canvasColor);
    const panelRgb = parseColor(panelColor);
    const darkSurfaceRgb = parseColor(darkSurfaceToken);

    const contrast = headingRgb && canvasRgb ? contrastRatio(headingRgb, canvasRgb) : null;

    return {
      headingColor,
      canvasColor,
      panelColor,
      contrast,
      panelRgb,
      darkSurfaceRgb,
      headingRgb,
      canvasRgb
    };
  });

  expect(colors.contrast).not.toBeNull();
  expect(Number.isFinite(colors.contrast)).toBe(true);
  expect(colors.contrast).toBeGreaterThanOrEqual(4.5);
  expect(colors.darkSurfaceRgb).not.toBeNull();
  expect(colors.panelRgb).toEqual(colors.darkSurfaceRgb);
  await expect(heading).toBeVisible();
  await expect(panel).toBeVisible();
});
