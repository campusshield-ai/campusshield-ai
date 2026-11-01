const { test, expect } = require("@playwright/test");

const viewports = [360, 390, 430, 768, 1024, 1366, 1920];

test.beforeEach(async ({ page }) => {
  await page.route("**/campusshield-backend.js", route => route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: [
      "(() => {",
      "  const session = { access_token: 'torio-browser-test-token', user: { id: 'torio-browser-test-user', email: 'torio-browser-test@example.invalid' } };",
      "  window.CampusShieldBackend = {",
      "    isConfigured: true,",
      "    client: { auth: { getSession: async () => ({ data: { session }, error: null }) } },",
      "    askShieldMind: async question => ({ answer: 'Mock ShieldMind response: ' + String(question).slice(0, 120), mode: 'mock' })",
      "  };",
      "})();"
    ].join("\n")
  }));

  await page.addInitScript(() => {
    class MockSpeechRecognition {
      start() {
        if (this.onstart) this.onstart();
        if (this.onresult) this.onresult({ results: [[{ transcript: "mock spoken question" }]] });
      }
      abort() {}
    }
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: MockSpeechRecognition });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: class { constructor(text) { this.text = text; } }
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { cancel() {}, speak(utterance) { window.__torioSpokenText = utterance.text; } }
    });
  });
});

test("TORIO core controls work with an authenticated test session", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto("/torio-command-center.html");
  await expect(page.getByRole("heading", { name: "TORIO command centre" })).toBeVisible();
  await expect(page.locator("#user-chip")).toHaveText("torio-browser-test@example.invalid");

  await page.locator("#guided-toggle").click();
  await expect(page.locator("#guided-toggle")).toHaveAttribute("aria-pressed", "true");

  await page.locator("#saved-context").fill("Prefer simple explanations with examples.");
  await page.locator("#save-context").click();
  await expect(page.locator("#context-status")).toContainText("Saved for this account");

  await page.locator("#listen-btn").click();
  await expect(page.locator("#question")).toHaveValue("mock spoken question");
  await expect(page.locator("#voice-status")).toContainText("captured");

  await page.locator("#attachment-input").setInputFiles({
    name: "torio-study-notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Staging browser test notes for TORIO.")
  });
  await expect(page.locator("#attachment-list")).toContainText("torio-study-notes.txt");

  await page.locator("#question").fill("Summarize the attached notes.");
  await page.locator("#send-btn").click();
  await expect(page.locator("#chatlog")).toContainText("Mock ShieldMind response");
  await expect(page.locator("#speak-btn")).toBeEnabled();

  await page.locator("#speak-btn").click();
  await expect(page.locator("#voice-status")).toContainText("Reading the latest TORIO response aloud.");
  expect(await page.evaluate(() => window.__torioSpokenText)).toContain("Mock ShieldMind response");

  await page.locator("#verify-answer").click();
  await expect(page.locator("#chatlog")).toContainText("Independently review your previous answer");

  await page.locator('[data-mode="terminal"]').click();
  await page.locator("#term-command").fill("help");
  await page.locator("#term-form").press("Enter");
  await expect(page.locator("#term-out")).toContainText("Available commands");

  await page.locator("#term-command").fill("status");
  await page.locator("#term-form").press("Enter");
  await expect(page.locator("#term-out")).toContainText("Authentication: authenticated");

  expect(pageErrors).toEqual([]);
});

for (const width of viewports) {
  test("TORIO has no horizontal page overflow at " + width + "px", async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/torio-command-center.html");
    await expect(page.getByRole("heading", { name: "TORIO command centre" })).toBeVisible();
    const size = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth
    }));
    expect(size.document, "Horizontal overflow at " + width + "px: " + JSON.stringify(size))
      .toBeLessThanOrEqual(size.viewport + 1);
  });
}
