const { test, expect } = require("@playwright/test");

test("unified search finds campus spaces and currently rendered campus content", async ({ page }) => {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const workspace = document.getElementById("workspace");
    if (workspace) { workspace.hidden = false; workspace.style.display = "block"; }
    const login = document.getElementById("login-screen");
    if (login) { login.hidden = true; login.style.display = "none"; }
  });

  const search = page.locator("#campus-global-search");
  const results = page.locator("#campus-global-search-results");
  await expect(search).toBeVisible();
  await expect(page.locator("#campus-marketplace-search")).toHaveCount(1);
  await expect(page.locator("#campus-opportunities-search")).toHaveCount(1);

  await search.fill("Marketplace");
  await expect(results).toContainText("Marketplace");
  await expect(page.locator("#campus-dashboard-quicklinks [data-page='marketplace']")).toHaveCount(1);

  await search.fill("Opportunity Hub");
  await expect(results).toContainText("Opportunity Hub");
  await expect(page.locator("#campus-dashboard-quicklinks [data-page='opportunities']")).toHaveCount(1);

  const hasNetwork = await page.locator("#page-campus-network").count();
  await search.fill("Campus Network");
  if (hasNetwork) {
    await expect(results).toContainText("Campus Network");
    await expect(page.locator("#campus-dashboard-quicklinks [data-page='campus-network']")).toHaveCount(1);
  } else {
    await expect(results).not.toContainText("Campus Network");
  }

  await page.evaluate(() => {
    const feed = document.getElementById("campus-marketplace-feed");
    const card = document.createElement("article");
    card.className = "community-post campus-marketplace-card";
    const heading = document.createElement("h3");
    heading.textContent = "Physics 101 revision workbook";
    const description = document.createElement("p");
    description.textContent = "Calculus and mechanics study notes for first year students.";
    card.append(heading, description);
    feed.replaceChildren(card);
  });
  await search.fill("Physics 101 revision workbook");
  await expect(results).toContainText("Physics 101 revision workbook");
  await page.evaluate(() => {
    const nav = document.querySelector('.nav [data-page="marketplace"]');
    nav?.addEventListener("click", () => {
      document.documentElement.dataset.marketplaceSearchActivated = "true";
    }, {capture:true, once:true});
  });
  await page.locator(".global-search-result").first().click();
  // This fixture deliberately has no signed-in Supabase session, so the app
  // shows its sign-in guard instead of switching pages. Confirm the search
  // correctly triggers the real Marketplace navigation control.
  await expect(page.locator("html")).toHaveAttribute("data-marketplace-search-activated", "true");
  await expect(results).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  const searchBox = await search.boundingBox();
  expect(searchBox).not.toBeNull();
  expect(searchBox.x).toBeGreaterThanOrEqual(0);
  expect(searchBox.x + searchBox.width).toBeLessThanOrEqual(391);
});
