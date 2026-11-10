const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;

const publicPages = [
  { path: "/", name: "CampusShield sign-in" },
  { path: "/about.html", name: "About" },
  { path: "/features.html", name: "Features" },
  { path: "/help.html", name: "How to use CampusShield" },
  { path: "/privacy.html", name: "Privacy" },
  { path: "/terms.html", name: "Terms" },
  { path: "/contact.html", name: "Contact" },
];

for (const item of publicPages) {
  test(item.name + " meets WCAG 2.1 A/AA and accessibility best practices", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const response = await page.goto(item.path, { waitUntil: "domcontentloaded" });
    expect(response && response.ok(), item.path + " must load successfully").toBeTruthy();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
      .analyze();
    expect(results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      targets: violation.nodes.map((node) => node.target),
    })), item.name + " accessibility violations").toEqual([]);
    expect(pageErrors, item.name + " JavaScript page errors").toEqual([]);
  });
}
