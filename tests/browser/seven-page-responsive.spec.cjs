const { test, expect } = require("@playwright/test");

const pages = [
  { name: "Home", path: "/index.html", links: [
    ["Features", "/features.html"], ["About", "/about.html"], ["Help", "/help.html"]
  ]},
  { name: "Features", path: "/features.html" },
  { name: "About", path: "/about.html" },
  { name: "Help", path: "/help.html" },
  { name: "Privacy", path: "/privacy.html" },
  { name: "Terms", path: "/terms.html" },
  { name: "Contact", path: "/contact.html" },
];
const widths = [360, 390, 430, 768, 1024, 1366, 1920];

for (const width of widths) {
  test.describe(`responsive width ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const pageInfo of pages) {
      test(`${pageInfo.name}: no horizontal overflow, readable content, and usable footer`, async ({ page }) => {
        await page.goto(pageInfo.path);
        await expect(page.locator("body")).toBeVisible();
        await expect(page.locator("h1").first()).toBeVisible();
        const metrics = await page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          scroll: document.documentElement.scrollWidth,
          bodyScroll: document.body.scrollWidth,
          fontSize: parseFloat(getComputedStyle(document.querySelector("h1")).fontSize),
          textColor: getComputedStyle(document.querySelector("h1")).color,
          background: getComputedStyle(document.querySelector("h1")).backgroundColor,
        }));
        expect(metrics.scroll, `document overflow at ${width}px on ${pageInfo.path}`).toBeLessThanOrEqual(metrics.viewport + 1);
        expect(metrics.bodyScroll, `body overflow at ${width}px on ${pageInfo.path}`).toBeLessThanOrEqual(metrics.viewport + 1);
        expect(metrics.fontSize).toBeGreaterThanOrEqual(16);
        const footer = page.locator("footer").last();
        await expect(footer).toBeVisible();
        const footerLinks = footer.locator("a");
        await expect(footerLinks).toHaveCount(6);
        for (const label of ["Features", "About", "Help", "Privacy", "Terms", "Contact"]) {
          await expect(footerLinks.filter({ hasText: label }).first()).toBeVisible();
        }
        const firstLink = footerLinks.first();
        await firstLink.focus();
        await expect(firstLink).toBeFocused();
        const linkBox = await firstLink.boundingBox();
        expect(linkBox).not.toBeNull();
        expect(linkBox.height).toBeGreaterThanOrEqual(30);
      });
    }
  });
}

test("homepage public navigation links open their intended pages", async ({ page }) => {
  await page.goto("/index.html");
  for (const [label, path] of [["Features", "/features.html"], ["About", "/about.html"], ["Help", "/help.html"]]) {
    await page.goto("/index.html");
    await page.getByRole("navigation", { name: "Public navigation" }).getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(new RegExp(path.replace(".", "\\.")));
    await expect(page.locator("h1").first()).toBeVisible();
  }
});

test("information-page footer navigation works between pages", async ({ page }) => {
  for (const pageInfo of pages.slice(1)) {
    await page.goto(pageInfo.path);
    const footer = page.locator("footer").last();
    for (const [label, path] of [["Features", "/features.html"], ["About", "/about.html"], ["Help", "/help.html"], ["Privacy", "/privacy.html"], ["Terms", "/terms.html"], ["Contact", "/contact.html"]]) {
      const link = footer.getByRole("link", { name: label, exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", `.${path}`);
    }
  }
});
