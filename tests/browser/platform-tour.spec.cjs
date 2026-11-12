const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
  await page.goto("/platform-tour.html");
  await expect(page.getByRole("heading", { level: 1, name: /see how a smarter, safer campus can work/i })).toBeVisible();
  await expect(page.getByText(/demonstration environment — not connected to live university records/i)).toBeVisible();
});

test("role tour changes between student, security and administration perspectives", async ({ page }) => {
  await page.getByRole("button", { name: "Campus Security" }).click();
  await expect(page.locator("#role-title")).toHaveText("Review incidents and coordinate follow-up.");
  await expect(page.locator("#role-steps")).toContainText("Review assigned reports");
  await page.getByRole("button", { name: "University Admin" }).click();
  await expect(page.locator("#role-title")).toHaveText("Oversee campus services and governance.");
  await expect(page.locator("#role-steps")).toContainText("Manage access governance");
});

test("sample incident filters and status changes remain local to the demonstration", async ({ page }) => {
  const row = page.locator('#incident-table tbody tr').filter({ hasText: "DEMO-101" });
  await page.locator('[data-filter="Open"]').click();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Move to review" }).click();
  await expect(row).toHaveAttribute("data-status", "In review");
  await expect(row).toBeHidden();
  await expect(page.locator("#incident-status")).toContainText("local to the demonstration");
  await page.locator('[data-filter="In review"]').click();
  await expect(row).toBeVisible();
  await expect(row.locator("[data-status-label]")).toHaveText("In review");
});

test("advisory action displays a preview without claiming to send an alert", async ({ page }) => {
  await page.locator("#advisory-headline").fill("Sample library maintenance");
  await page.locator("#advisory-zone").selectOption("Central Quadrangle");
  await page.locator("#preview-advisory").click();
  await expect(page.locator("#advisory-preview")).toContainText("Sample library maintenance");
  await expect(page.locator("#advisory-preview")).toContainText("Preview only");
  await expect(page.locator("#advisory-preview")).toContainText("does not send a notification");
});

test("CampusMap search and route preview use illustrative sample places", async ({ page }) => {
  await page.locator("#map-search").fill("library");
  await expect(page.locator('[data-place="Central Library"]')).toBeVisible();
  await expect(page.locator('[data-place="Science Hall"]')).toBeHidden();
  await page.locator("#map-search").fill("");
  await page.locator("#preview-route").click();
  await expect(page.locator("#route-preview")).toContainText("Central Library");
  await expect(page.locator("#route-preview")).toContainText("Student Union");
  await expect(page.locator("#route-preview")).toContainText("not been checked against real campus geometry");
});

test("ShieldMind sample answers show their supporting document and trust scenarios switch", async ({ page }) => {
  await page.getByRole("button", { name: "What are the sample library access arrangements?" }).click();
  await expect(page.locator("#shieldmind-answer")).toContainText("Sample Central Library & Quiet Study Access Guide");
  await page.getByRole("button", { name: "Lost & Found relay" }).click();
  await expect(page.locator("#trust-scenario")).toContainText("private phone number or email address");
});

test("sample incident CSV can be exported", async ({ page }) => {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export sample CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("campusshield-sample-incidents.csv");
});
