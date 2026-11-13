const { test, expect } = require("@playwright/test");

const widths = [320, 360, 390, 430, 768, 1024, 1366];

async function openWorkspace(page, target) {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.locator("#workspace .global-search-input").waitFor({ state: "attached" });
  await page.locator("#shieldmind-paid-gate").waitFor({ state: "attached" });
  const pastQuestionsRequest = target === "past-questions"
    ? page.waitForRequest(request => new URL(request.url()).pathname.endsWith("/past-question-practice.js"))
    : null;
  await page.evaluate(targetPage => {
    document.querySelector("#login-screen").style.display = "none";
    const workspace = document.querySelector("#workspace");
    workspace.hidden = false;
    // Tests start from a clean closed-navigation state; do not carry any drawer
    // state left by browser storage or prior navigation into layout measurements.
    workspace.classList.remove("mobile-nav-open", "sidebar-collapsed");
    const backdrop = document.querySelector("#sidebar-backdrop");
    if (backdrop) backdrop.hidden = true;
    document.querySelectorAll("#workspace .page").forEach(section => section.classList.remove("active"));
    document.querySelector("#page-" + targetPage).classList.add("active");
  }, target);
  if (pastQuestionsRequest) {
    await pastQuestionsRequest;
    await expect.poll(() => page.evaluate(() => Boolean(window.PastQuestionPractice))).toBe(true);
    await expect.poll(() => page.locator("#page-past-questions").getAttribute("data-feature-loaded")).toBe("true");
  }
}

test("ShieldMind locks AI chat until the account has an active paid plan", async ({ page }) => {
  await openWorkspace(page, "shieldmind");
  await expect(page.locator("#shieldmind-paid-gate")).toBeVisible();
  await expect(page.locator("#shieldmind-paid-gate")).toContainText("SUBSCRIPTION REQUIRED");
  await expect(page.locator("#shieldmind-paid-gate")).toContainText("Step-by-step tutor");
  await expect(page.locator("#shieldmind-paid-gate")).toContainText("Notes to revision");
  await expect(page.locator("#shieldmind-paid-gate")).toContainText("Quizzes");
  await expect(page.locator("#shieldmind-paid-gate")).toContainText("Study image explanations");
  await expect(page.locator("#shieldmind-paid-gate")).toContainText("Source-aware campus help");
  await expect(page.locator("#shieldmind-workspace-grid")).toBeHidden();
  await expect(page.locator("#shieldmind-form")).toBeHidden();
  await expect(page.locator(".shieldmind-quick-actions")).toBeHidden();
  await expect(page.locator("#shieldmind-paid-gate button[data-page=billing]")).toBeVisible();
});

test("billing lists only the five prepaid paid AI plans and keeps safety free", async ({ page }) => {
  await openWorkspace(page, "billing");
  const plans = page.locator("#page-billing .shieldmind-prices").first();
  await expect(plans.locator(".shieldmind-price")).toHaveCount(5);
  for (const name of ["Starter", "Plus", "Pro", "Ultra", "Max"]) await expect(plans).toContainText(name);
  await expect(plans).not.toContainText("Free");
  await expect(plans).not.toContainText("₦0");
  for (const name of ["starter", "plus", "pro", "ultra", "max"]) {
    await expect(plans.locator('[data-billing-plan="' + name + '"]')).toBeVisible();
  }
  await expect(page.locator("#page-billing")).toContainText("Essential campus safety stays free");
  await expect(page.locator("#page-billing")).toContainText("prepaid for 30 days");
});

test("premium gate fits phones, tablets and desktop without horizontal overflow", async ({ page }) => {
  await openWorkspace(page, "shieldmind");
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    const metrics = await page.locator("#shieldmind-paid-gate").evaluate(element => {
      const rect = element.getBoundingClientRect();
      const cta = element.querySelector(".shieldmind-paid-cta").getBoundingClientRect();
      const overflowing = [...document.querySelectorAll("#workspace *")].map(element => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          tag: element.tagName,
          id: element.id || "",
          className: typeof element.className === "string" ? element.className.slice(0,100) : "",
          left: Math.round(box.left), right: Math.round(box.right),
          width: Math.round(box.width), display: style.display,
          position: style.position, overflow: style.overflow,
          scrollWidth: element.scrollWidth, clientWidth: element.clientWidth
        };
      }).filter(item => item.width > 0 && (item.right > window.innerWidth + 1 || item.scrollWidth > item.clientWidth + 2))
        .sort((a,b) => b.right - a.right).slice(0,12);
      return {
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        overflowing,
        left: rect.left, right: rect.right, height: rect.height,
        ctaLeft: cta.left, ctaRight: cta.right, ctaHeight: cta.height
      };
    });
    expect(metrics.documentWidth).toBeLessThanOrEqual(width + 1);
    expect(metrics.bodyWidth, `${width}px body overflow candidates: ${JSON.stringify(metrics.overflowing)}`).toBeLessThanOrEqual(width + 1);
    expect(metrics.left).toBeGreaterThanOrEqual(-1);
    expect(metrics.right).toBeLessThanOrEqual(width + 1);
    expect(metrics.ctaLeft).toBeGreaterThanOrEqual(-1);
    expect(metrics.ctaRight).toBeLessThanOrEqual(width + 1);
    expect(metrics.ctaHeight).toBeGreaterThanOrEqual(42);
    expect(metrics.height).toBeGreaterThan(240);
  }
});

test("AI-generated exam practice and AI marking stay locked without the paid entitlement", async ({ page }) => {
  await openWorkspace(page, "past-questions");
  await page.evaluate(() => {
    window.CampusShieldShieldMindAccess = { active: false, plan: null, expiresAt: null };
    document.dispatchEvent(new CustomEvent("campusshield:shieldmind-access", { detail: window.CampusShieldShieldMindAccess }));
  });
  const gate = page.locator("#pq-ai-paid-gate");
  const form = page.locator("#pq-ai-form");
  await expect(gate).toBeVisible();
  await expect(gate).toContainText("require an active ShieldMind subscription");
  await expect(gate.locator("button[data-page=billing]")).toBeVisible();
  await expect(form.locator("input,select,textarea,button").first()).toBeDisabled();

  await page.evaluate(() => {
    window.CampusShieldShieldMindAccess = { active: true, plan: "starter", expiresAt: "2099-12-31T23:59:59.000Z" };
    document.dispatchEvent(new CustomEvent("campusshield:shieldmind-access", { detail: window.CampusShieldShieldMindAccess }));
  });
  await expect(gate).toBeHidden();
  await expect(form.locator("input,select,textarea").first()).toBeEnabled();
  await expect(page.locator("#pq-ai-generate")).toBeEnabled();
});

test("active ShieldMind plan allowances are clear and responsive", async ({ page }) => {
  await openWorkspace(page, "shieldmind");
  const summary = page.locator("#shieldmind-plan-summary");
  await expect(summary).toBeHidden();
  await page.evaluate(() => {
    const values = {
      name: "PRO",
      expiry: "Active until 12/31/2099",
      requests: "25 / 1,500",
      images: "150"
    };
    document.querySelector("#shieldmind-plan-summary-name").textContent = values.name;
    document.querySelector("#shieldmind-plan-summary-expiry").textContent = values.expiry;
    document.querySelector("#shieldmind-plan-summary-requests").textContent = values.requests;
    document.querySelector("#shieldmind-plan-summary-images").textContent = values.images;
    document.querySelector("#shieldmind-plan-summary").hidden = false;
  });
  await expect(summary).toContainText("PRO");
  await expect(summary).toContainText("25 / 1,500");
  await expect(summary).toContainText("150");
  await expect(summary.locator("[data-page=billing]")).toBeVisible();
  for (const width of [320, 360, 390, 430, 768, 1024, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    const metrics = await summary.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, scrollWidth: document.documentElement.scrollWidth };
    });
    expect(metrics.left).toBeGreaterThanOrEqual(-1);
    expect(metrics.right).toBeLessThanOrEqual(width + 1);
    expect(metrics.scrollWidth).toBeLessThanOrEqual(width + 1);
  }
});
