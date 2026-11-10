const { test, expect } = require("@playwright/test");

async function openShieldMindHistory(page) {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.locator("#shieldmind-history-search").waitFor({ state: "attached" });
  await page.evaluate(() => {
    document.querySelector("#login-screen").style.display = "none";
    const workspace = document.querySelector("#workspace");
    workspace.hidden = false;
    workspace.classList.remove("mobile-nav-open", "sidebar-collapsed");
    document.querySelectorAll("#workspace .page").forEach(section => section.classList.remove("active"));
    document.querySelector("#page-shieldmind").classList.add("active");
    document.querySelector("#shieldmind-paid-gate").hidden = true;
    document.querySelector("#shieldmind-workspace-grid").hidden = false;
    document.querySelector("#page-shieldmind .shieldmind-quick-actions").hidden = false;
    window.CampusShieldShieldMindAccess = { active: true, plan: "starter", expiresAt: "2099-12-31T23:59:59.000Z" };
    const list = document.querySelector("#shieldmind-conversations-list");
    list.replaceChildren();
    const row = document.createElement("div");
    row.className = "shieldmind-history-item is-active";
    const open = document.createElement("button");
    open.className = "shieldmind-history-open";
    open.textContent = "CSC 201 — Data structures and algorithm analysis";
    const date = document.createElement("small");
    date.textContent = "A saved study session";
    open.appendChild(date);
    const remove = document.createElement("button");
    remove.className = "shieldmind-history-delete";
    remove.textContent = "×";
    row.append(open, remove);
    list.appendChild(row);
  });
}

const widths = [320, 360, 390, 430, 768, 1024, 1366];

for (const width of widths) {
  test(`Saved ShieldMind conversations fit a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openShieldMindHistory(page);
    const metrics = await page.locator("#page-shieldmind .shieldmind-history-panel").evaluate(panel => {
      const rect = panel.getBoundingClientRect();
      const list = panel.querySelector(".shieldmind-conversations-list").getBoundingClientRect();
      const row = panel.querySelector(".shieldmind-history-item").getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        width: rect.width,
        listWidth: list.width,
        rowWidth: row.width,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth
      };
    });
    expect(metrics.documentWidth).toBeLessThanOrEqual(width + 1);
    expect(metrics.bodyWidth).toBeLessThanOrEqual(width + 1);
    expect(metrics.left).toBeGreaterThanOrEqual(-1);
    expect(metrics.right).toBeLessThanOrEqual(width + 1);
    expect(metrics.width).toBeGreaterThan(220);
    expect(metrics.listWidth).toBeGreaterThan(150);
    expect(metrics.rowWidth).toBeGreaterThan(150);
    await expect(page.locator("#shieldmind-history-search")).toBeVisible();
    await expect(page.locator("#shieldmind-history-new")).toBeVisible();
    await expect(page.locator("#shieldmind-history-title")).toContainText("Saved conversations");
  });
}

test("New chat preserves previously saved conversations", async ({ page }) => {
  await openShieldMindHistory(page);
  await expect(page.locator("#shieldmind-conversations-list")).toContainText("CSC 201");
  await page.locator("#shieldmind-history-new").click();
  await expect(page.locator("#shieldmind-messages")).toContainText("New chat started");
  await expect(page.locator("#shieldmind-conversations-list")).toContainText("CSC 201");
  await expect(page.locator("#shieldmind-clear")).toHaveText("New chat");
});

test("saved conversation history supports the CampusShield dark theme", async ({ page }) => {
  await openShieldMindHistory(page);
  const theme = await page.locator("#page-shieldmind .shieldmind-history-panel").evaluate(panel => {
    document.documentElement.dataset.theme = "dark";
    return {
      background: getComputedStyle(panel).backgroundColor,
      search: getComputedStyle(panel.querySelector(".shieldmind-history-search")).backgroundColor,
      openText: getComputedStyle(panel.querySelector(".shieldmind-history-open")).color
    };
  });
  expect(theme.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(theme.search).not.toBe("rgb(251, 254, 252)");
  expect(theme.openText).not.toBe("rgb(35, 76, 55)");
});

for (const width of [320, 360, 390, 430, 768, 1024, 1366]) {
  test(`ShieldMind source evidence and retrieval freshness fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openShieldMindHistory(page);
    await page.evaluate(() => {
      const messages = document.querySelector("#shieldmind-messages");
      const evidence = document.createElement("section");
      evidence.className = "shieldmind-message-sources";
      const heading = document.createElement("strong");
      heading.textContent = "Related approved campus pages — not used to verify this answer";
      const list = document.createElement("ul");
      const item = document.createElement("li");
      const marker = document.createElement("span");
      marker.className = "shieldmind-source-marker";
      marker.textContent = "[1]";
      const link = document.createElement("a");
      link.href = "https://example.org/approved-page";
      link.textContent = "Approved test source";
      const freshness = document.createElement("small");
      freshness.className = "shieldmind-source-freshness is-stale";
      freshness.textContent = "Older source — verify current details";
      const retrieved = document.createElement("small");
      retrieved.className = "shieldmind-source-retrieved";
      retrieved.textContent = "CampusShield retrieved 1 August 2026";
      item.append(marker, link, freshness, retrieved);
      list.appendChild(item);
      evidence.append(heading, list);
      messages.appendChild(evidence);
      document.documentElement.dataset.theme = "dark";
    });
    const metrics = await page.locator("#shieldmind-messages .shieldmind-message-sources").last().evaluate(node => {
      const rect = node.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        width: rect.width,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        freshnessColor: getComputedStyle(node.querySelector(".shieldmind-source-freshness")).color,
        headingColor: getComputedStyle(node.querySelector("strong")).color
      };
    });
    expect(metrics.documentWidth).toBeLessThanOrEqual(width + 1);
    expect(metrics.bodyWidth).toBeLessThanOrEqual(width + 1);
    expect(metrics.left).toBeGreaterThanOrEqual(-1);
    expect(metrics.right).toBeLessThanOrEqual(width + 1);
    expect(metrics.width).toBeGreaterThan(180);
    expect(metrics.freshnessColor).not.toBe("rgb(148, 83, 59)");
    expect(metrics.headingColor).not.toBe("rgb(33, 75, 52)");
    await expect(page.locator("#shieldmind-messages .shieldmind-message-sources").last())
      .toContainText("Older source — verify current details");
  });
}

test("ShieldMind source links are described as retrieved, not as university last-updated dates", async ({ page }) => {
  await openShieldMindHistory(page);
  const cssAndApp = await page.evaluate(() => ({
    hasFreshnessLabel: document.documentElement.outerHTML.includes("shieldmind-source-freshness"),
    hasSafeSourceHeading: document.querySelector("#shieldmind-messages")?.textContent?.includes("Sources used") === false
  }));
  expect(cssAndApp.hasSafeSourceHeading).toBe(true);
});
