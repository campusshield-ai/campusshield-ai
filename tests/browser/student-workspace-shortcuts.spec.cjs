const { test, expect } = require("@playwright/test");

const WIDTHS = [360, 390, 430, 768, 1024, 1366, 1920];

async function openWorkspacePage(page, name, width = 1366) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(pageName => {
    const login = document.getElementById("login-screen");
    if (login) {
      login.hidden = true;
      login.style.display = "none";
    }
    const workspace = document.getElementById("workspace");
    if (workspace) {
      workspace.hidden = false;
      workspace.style.display = "block";
      workspace.classList.remove("mobile-nav-open");
    }
    document.querySelectorAll("#workspace .page").forEach(section => section.classList.remove("active"));
    document.getElementById("page-" + pageName)?.classList.add("active");
  }, name);
  await expect(page.locator("#page-" + name)).toBeVisible();
}

test("CampusPulse quick spaces preserve the real community destinations", async ({ page }) => {
  await openWorkspacePage(page, "community");
  const nav = page.locator("#page-community .campuspulse-local-nav");
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link", { name: /Latest posts/ })).toHaveAttribute("href", "#community-feed-panel");
  for (const destination of ["events", "groups", "campus-chat"]) {
    await expect(nav.locator('button[data-page="' + destination + '"]')).toBeVisible();
  }
  await expect(page.locator("#communityPostForm")).toBeAttached();
  await expect(page.locator("#community-feed")).toBeAttached();
  await expect(page.locator("#community-moderation")).toBeAttached();
  await expect(page.locator("#page-community .campuspulse-bookmark-hint")).toContainText("signed-in account");
});

test("Academic Life links to existing account-aware campus modules", async ({ page }) => {
  await openWorkspacePage(page, "academics");
  const destinations = ["timetable", "courses", "classroom", "shieldmind", "groups", "noticeboard", "events", "opportunities", "community", "helpdesk", "marketplace"];
  for (const destination of destinations) {
    await expect(page.locator('#page-academics [data-page="' + destination + '"]').first()).toBeVisible();
  }
  await expect(page.locator("#page-academics .academic-primary-grid .academic-primary-card")).toHaveCount(6);
  await expect(page.locator("#page-academics .academic-trust-note")).toContainText("existing campus access");
  await expect(page.locator("#academic-exam-prep-shortcut")).toHaveAttribute("data-page", "shieldmind");
  await expect(page.locator("#academic-exam-prep-shortcut")).toHaveAttribute("data-shieldmind-prompt", /Help me prepare for an exam/);
});

test("Academic study hand-off prefills ShieldMind without auto-submitting", async ({ page }) => {
  await openWorkspacePage(page, "academics");
  const messageCount = await page.locator("#shieldmind-messages .shieldmind-message").count();
  const handoff = page.locator('#page-academics [data-page="shieldmind"][data-shieldmind-prompt]');
  await handoff.click();
  await expect(page.locator("#shieldmind-question")).toHaveValue(/Help me study a course topic/);
  await expect(page.locator("#shieldmind-messages .shieldmind-message")).toHaveCount(messageCount);
  await expect(page.locator("#shieldmind-submit")).toBeAttached();
});

test("ShieldMind study shortcuts prefill prompts and leave sending to the student", async ({ page }) => {
  await openWorkspacePage(page, "shieldmind");
  await page.locator("#shieldmind-workspace-grid").evaluate(node => { node.hidden = false; });
  const messageCount = await page.locator("#shieldmind-messages .shieldmind-message").count();
  const explain = page.locator('#shieldmind-study-tools [data-shieldmind-prompt]').first();
  await explain.click();
  await expect(page.locator("#shieldmind-question")).toHaveValue(/Explain this topic step by step/);
  await expect(page.locator("#shieldmind-messages .shieldmind-message")).toHaveCount(messageCount);
  await expect(page.locator("#shieldmind-submit")).toBeAttached();
  await expect(page.locator('#shieldmind-study-tools [data-page="timetable"]')).toBeVisible();
  await expect(page.locator("#shieldmind-conversations-list")).toBeAttached();
});

for (const name of ["academics", "community", "shieldmind"]) {
  for (const width of WIDTHS) {
    test(name + " workspace has no horizontal overflow at " + width + "px", async ({ page }) => {
      await openWorkspacePage(page, name, width);
      if (name === "shieldmind") {
        await page.locator("#shieldmind-workspace-grid").evaluate(node => { node.hidden = false; });
      }
      const metrics = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        viewportWidth: window.innerWidth
      }));
      expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
      expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
    });
  }
}
