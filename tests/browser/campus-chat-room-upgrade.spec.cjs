const { test, expect } = require("@playwright/test");

async function openCampusChat(page, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const login = document.querySelector("#login-screen");
    const workspace = document.querySelector("#workspace");
    if (login) login.hidden = true;
    if (workspace) workspace.hidden = false;
    document.querySelectorAll(".page").forEach((item) => {
      item.classList.toggle("active", item.id === "page-campus-chat");
    });
  });
  await expect(page.locator("#page-campus-chat")).toBeVisible();
}

test("Campus Chat exposes the upgraded channel controls and message composer", async ({ page }) => {
  await openCampusChat(page, 1366);
  await expect(page.locator("#campus-chat-search")).toBeVisible();
  await expect(page.locator("#campus-chat-refresh")).toBeVisible();
  await expect(page.locator("#campus-chat-jump-latest")).toBeHidden();
  await expect(page.locator("#campus-chat-char-count")).toHaveText("0 / 1,200");
  await expect(page.locator("[data-chat-channel]")).toHaveCount(4);
  await expect(page.locator('[data-chat-channel="general"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#campus-chat-active-channel")).toHaveText("General");
});

test("Recent-message search filters message cards and reports its result count", async ({ page }) => {
  await openCampusChat(page, 1366);
  await page.locator("#campus-chat-messages").evaluate((list) => {
    list.replaceChildren();
    const rows = [
      { id: "chat-test-1", author: "student_one", text: "Can someone share the library timetable?" },
      { id: "chat-test-2", author: "student_two", text: "Who is joining the football match?" }
    ];
    rows.forEach((row) => {
      const card = document.createElement("article");
      card.className = "campus-chat-message";
      card.dataset.messageId = row.id;
      card.dataset.search = (row.author + " " + row.text).toLowerCase();
      const body = document.createElement("p");
      body.className = "campus-chat-message-body";
      body.textContent = row.text;
      card.appendChild(body);
      list.appendChild(card);
    });
  });

  await page.locator("#campus-chat-search").fill("library");
  const messages = page.locator("#campus-chat-messages .campus-chat-message");
  await expect(messages.nth(0)).toBeVisible();
  await expect(messages.nth(1)).toBeHidden();
  await expect(page.locator("#campus-chat-search-status")).toHaveText("Showing 1 of 2 loaded messages");

  await page.locator("#campus-chat-search").clear();
  await expect(messages.nth(1)).toBeVisible();
  await expect(page.locator("#campus-chat-search-status")).toHaveText("2 recent messages loaded");
});

test("Enter sends and Shift+Enter keeps a new line in the composer", async ({ page }) => {
  await openCampusChat(page, 1366);
  const input = page.locator("#campus-chat-input");
  await input.evaluate((element) => { element.disabled = false; });
  await page.locator("#campus-chat-send").evaluate((element) => { element.disabled = false; });
  await page.locator("#campus-chat-form").evaluate((form) => {
    window.__campusChatSubmitCount = 0;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      window.__campusChatSubmitCount += 1;
    });
  });

  await input.fill("A quick campus question");
  await input.press("Enter");
  await expect.poll(() => page.evaluate(() => window.__campusChatSubmitCount)).toBe(1);

  await input.fill("First line");
  await input.press("Shift+Enter");
  await input.type("Second line");
  await expect(input).toHaveValue("First line\nSecond line");
  await expect.poll(() => page.evaluate(() => window.__campusChatSubmitCount)).toBe(1);
  await expect(page.locator("#campus-chat-char-count")).toHaveText("23 / 1,200");
});

test("Campus Chat stays within the viewport across phone, tablet and desktop widths", async ({ page }) => {
  for (const width of [360, 390, 430, 768, 1024, 1366, 1920]) {
    await openCampusChat(page, width);
    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      pageClient: document.querySelector("#page-campus-chat").clientWidth,
      pageScroll: document.querySelector("#page-campus-chat").scrollWidth,
      panelClient: document.querySelector(".campus-chat-panel").clientWidth,
      panelScroll: document.querySelector(".campus-chat-panel").scrollWidth
    }));
    expect(dimensions.document, "document must not overflow at " + width + "px")
      .toBeLessThanOrEqual(dimensions.viewport + 1);
    expect(dimensions.pageScroll, "Campus Chat must not overflow at " + width + "px")
      .toBeLessThanOrEqual(dimensions.pageClient + 1);
    expect(dimensions.panelScroll, "chat panel must not overflow at " + width + "px")
      .toBeLessThanOrEqual(dimensions.panelClient + 1);
  }
});
