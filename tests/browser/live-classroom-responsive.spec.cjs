const { test, expect } = require('@playwright/test');

test('Online Classroom panel remains accessible and contained from phone to desktop', async ({ page }) => {
  await page.route('**/rest/v1/rpc/list_campus_live_classrooms', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('link[href="./campus-live-classroom.css"]')).toHaveCount(1);
  await expect(page.locator('script[src*="campus-live-classroom.js"]')).toHaveCount(0);

  // Reveal the signed-in Classroom page without using accounts or creating records.
  // Its runtime bundle should be requested only after the route becomes active.
  const classroomModuleRequest = page.waitForRequest(request =>
    new URL(request.url()).pathname.endsWith("/campus-live-classroom.js")
  );
  await page.evaluate(() => {
    document.querySelector('#login-screen').hidden = true;
    document.querySelector('#workspace').hidden = false;
    document.querySelectorAll('#workspace .page').forEach(page => page.classList.remove('active'));
    document.querySelector('#page-classroom').classList.add('active');
  });
  await classroomModuleRequest;
  await expect.poll(() => page.locator("#page-classroom").getAttribute("data-feature-loaded")).toBe("true");
  await expect(page.locator('script[src*="campus-live-classroom.js"]')).toHaveCount(1);

  const panel = page.locator('#campus-live-classroom-panel');
  const root = page.locator('#campus-live-classroom-root');
  await expect(panel).toBeVisible();
  await expect(page.locator('#campus-live-classroom-heading')).toHaveText('Live Online Classes');
  await expect(page.locator('#campus-live-classroom-refresh')).toBeVisible();
  await expect(root).toContainText('No classrooms are available yet.');

  for (const width of [360, 390, 430, 768, 1024, 1366, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const metrics = await page.evaluate(() => {
      const panel = document.querySelector('#campus-live-classroom-panel');
      const root = document.querySelector('#campus-live-classroom-root');
      const panelRect = panel.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      return {
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
        panelLeft: panelRect.left,
        panelRight: panelRect.right,
        panelWidth: panelRect.width,
        rootWidth: rootRect.width,
      };
    });
    expect(metrics.document, `document overflow at ${width}px`).toBeLessThanOrEqual(width + 1);
    expect(metrics.body, `body overflow at ${width}px`).toBeLessThanOrEqual(width + 1);
    expect(metrics.panelLeft, `panel starts inside viewport at ${width}px`).toBeGreaterThanOrEqual(-1);
    expect(metrics.panelRight, `panel ends inside viewport at ${width}px`).toBeLessThanOrEqual(width + 1);
    expect(metrics.panelWidth, `panel has usable width at ${width}px`).toBeGreaterThan(240);
    expect(metrics.rootWidth, `live classroom mount has usable width at ${width}px`).toBeGreaterThan(220);
  }
});
