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
    card.className = "community-post campus-marketplace-card campus-live-marketplace-card";
    card.dataset.status = "published";
    card.dataset.category = "books";
    card.dataset.price = "1500";
    card.dataset.createdAt = "2026-11-08T00:00:00Z";
    const heading = document.createElement("h3");
    heading.textContent = "Physics 101 revision workbook";
    const description = document.createElement("p");
    description.textContent = "Calculus and mechanics study notes for first year students.";
    card.append(heading, description);
    feed.replaceChildren(card);
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const searchBox = await search.boundingBox();
  expect(searchBox).not.toBeNull();
  expect(searchBox.x).toBeGreaterThanOrEqual(0);
  expect(searchBox.x + searchBox.width).toBeLessThanOrEqual(391);

  await search.fill("Physics 101 revision workbook");
  await expect(results).toContainText("Physics 101 revision workbook");
  await page.evaluate(() => {
    const nav = document.querySelector('[data-page="marketplace"]');
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
});




test("global search finds verified campus notices and course resources", async ({ page }) => {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const workspace = document.getElementById("workspace");
    if (workspace) { workspace.hidden = false; workspace.style.display = "block"; }
    const login = document.getElementById("login-screen");
    if (login) { login.hidden = true; login.style.display = "none"; }
    const addCard = (feedId, title, body) => {
      const feed = document.getElementById(feedId);
      const card = document.createElement("article");
      const heading = document.createElement("h3");
      heading.textContent = title;
      const description = document.createElement("p");
      description.textContent = body;
      card.append(heading, description);
      feed?.replaceChildren(card);
    };
    addCard("campus-noticeboard-feed", "Registration closes Friday", "Verified Registrar notice: semester registration deadline is Friday.");
    addCard("campus-courses-feed", "Computer Architecture", "Approved course resources and lecture notes for second year students.");
    addCard("campus-course-resources-feed", "Intro to Java notes", "Approved programming resource for first year students.");
  });
  const search = page.locator("#campus-global-search");
  const results = page.locator("#campus-global-search-results");
  await expect(search).toBeVisible();
  await expect(page.locator("#campus-global-search")).toHaveCount(1);
  await expect(page.locator("#campus-global-search-results")).toHaveCount(1);
  await search.fill("registration closes friday");
  await expect(results).toContainText("Registration closes Friday");
  await search.fill("Computer Architecture lecture notes");
  await expect(results).toContainText("Computer Architecture");
  await search.fill("Intro to Java");
  await expect(results).toContainText("Intro to Java notes");
});

test("global search keeps recently opened destinations handy and can clear them", async ({ page }) => {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const workspace = document.getElementById("workspace");
    if (workspace) { workspace.hidden = false; workspace.style.display = "block"; }
    const login = document.getElementById("login-screen");
    if (login) { login.hidden = true; login.style.display = "none"; }
    // Provide a visible destination trigger without relying on a signed-in session.
    // This isolates the in-session recent-history behavior from auth navigation.
    document.querySelectorAll('[data-page="opportunities"]').forEach(element => { element.hidden = true; });
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.dataset.page = "opportunities";
    trigger.textContent = "Open Opportunity Hub";
    document.getElementById("page-dashboard")?.append(trigger);
  });

  const search = page.locator("#campus-global-search");
  const results = page.locator("#campus-global-search-results");
  const heading = page.locator("#campus-global-search-heading .global-search-heading-label");
  const clear = page.getByRole("button", { name: "Clear recent destinations" });
  await search.fill("Opportunity Hub");
  await expect(results).toContainText("Opportunity Hub");
  await page.locator("#campus-global-search-options [role=option]").filter({ hasText: "Opportunity Hub" }).first().click();
  await expect(results).toBeHidden();

  await search.focus();
  await expect(heading).toHaveText("Recently opened");
  await expect(clear).toBeVisible();
  await expect(page.locator("#campus-global-search-options [role=option]")).toHaveCount(1);
  await expect(page.locator("#campus-global-search-options")).toContainText("Opportunity Hub");

  await clear.click();
  await expect(heading).toHaveText("Quick destinations");
  await expect(clear).toBeHidden();
  await expect(page.locator("#campus-global-search-options")).not.toContainText("Opportunity Hub");
});

test("global search respects role-gated destinations and activates an available trigger", async ({ page }) => {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const workspace = document.getElementById("workspace");
    if (workspace) { workspace.hidden = false; workspace.style.display = "block"; }
    const login = document.getElementById("login-screen");
    if (login) { login.hidden = true; login.style.display = "none"; }
    document.querySelectorAll('[data-page="noticeboard"]').forEach(element => { element.hidden = true; });
  });

  const search = page.locator("#campus-global-search");
  const results = page.locator("#campus-global-search-results");
  await search.fill("Verified campus noticeboard");
  await expect(results).not.toContainText("Verified campus noticeboard");

  await page.evaluate(() => {
    // Model a role-valid secondary entry point while leaving the first (hidden)
    // navigation match gated. Search must activate the visible entry point.
    const visibleTrigger = document.createElement("button");
    visibleTrigger.type = "button";
    visibleTrigger.dataset.page = "noticeboard";
    visibleTrigger.textContent = "Open verified notices";
    visibleTrigger.addEventListener("click", () => {
      document.documentElement.dataset.visibleNoticeboardTriggerActivated = "true";
    }, { capture: true, once: true });
    document.getElementById("page-dashboard")?.append(visibleTrigger);
  });

  await search.fill("Verified campus noticeboard");
  await expect(results).toContainText("Verified campus noticeboard");
  await page.locator("#campus-global-search-options [role=option]").filter({ hasText: "Verified campus noticeboard" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-visible-noticeboard-trigger-activated", "true");
});

test("My Day renders the real private timetable snapshot, clears on sign-out and fits mobile", async ({ page }) => {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const workspace = document.getElementById("workspace");
    if (workspace) { workspace.hidden = false; workspace.style.display = "block"; }
    const login = document.getElementById("login-screen");
    if (login) { login.hidden = true; login.style.display = "none"; }

    const todayAt = hour => new Date(
      new Date().getFullYear(), new Date().getMonth(), new Date().getDate(), hour, 0, 0
    ).toISOString();
    window.CampusShieldBackend = {
      isConfigured: true,
      getMyCampusContext: async () => ({ university_id: "university-fixture" }),
      listMyTimetableItems: async () => [
        { id: "class-1", title: "Applied Mathematics", kind: "class", course_code: "MTH 201", location: "Lecture Hall A", starts_at: todayAt(9), ends_at: todayAt(10), completed: false },
        { id: "task-1", title: "Submit lab report", kind: "assignment", course_code: "CSC 204", starts_at: todayAt(10), ends_at: null, completed: false }
      ],
      listCampusCourses: async () => [],
      listCampusEvents: async () => [
        { id: "event-1", title: "Faculty seminar", starts_at: todayAt(11), location: "Main Auditorium" }
      ]
    };
    window.dispatchEvent(new CustomEvent("campusshield:profile-ready", {
      detail: { role: "student" }
    }));
  });

  const panel = page.locator("#campus-my-day");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Applied Mathematics");

  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  const lightPanelStyle = await panel.evaluate(element => ({
    radius: getComputedStyle(element).borderTopLeftRadius,
    border: getComputedStyle(element).borderTopColor
  }));
  expect(lightPanelStyle.radius).toBe("20px");
  expect(lightPanelStyle.border).toBe("rgb(220, 233, 223)");
  const itemLayout = await panel.locator(".campus-my-day-item").first().evaluate(element =>
    getComputedStyle(element).display
  );
  expect(itemLayout).toBe("grid");

  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  const darkPanelBorder = await panel.evaluate(element => getComputedStyle(element).borderTopColor);
  expect(darkPanelBorder).toBe("rgb(49, 83, 66)");
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  await expect(panel).toContainText("MTH 201");
  await expect(panel).toContainText("Submit lab report");
  await expect(panel).toContainText("Faculty seminar");
  await expect(page.locator("#campus-my-day-summary")).toContainText("1 class");
  await expect(page.locator("#campus-my-day-summary")).toContainText("1 task");
  await expect(page.locator("#campus-my-day-summary")).toContainText("1 campus event");
  await expect(panel.locator("[data-page='timetable']")).toHaveText("Open timetable");

  await page.evaluate(() => window.dispatchEvent(new Event("campusshield:profile-cleared")));
  await expect(panel).not.toContainText("Applied Mathematics");
  await expect(panel).toContainText("Sign in to sync your day");

  await page.evaluate(() => {
    window.CampusShieldBackend.listMyTimetableItems = () => new Promise(resolve => {
      window.__resolveStaleTimetable = resolve;
    });
    window.__staleTimetableLoad = window.CampusShieldTimetable.load();
  });
  await page.waitForFunction(() => typeof window.__resolveStaleTimetable === "function");
  await page.evaluate(() => {
    window.dispatchEvent(new Event("campusshield:profile-cleared"));
    window.__resolveStaleTimetable([
      { id: "stale-1", title: "Previous account private class", kind: "class", course_code: "OLD 100", starts_at: new Date().toISOString() }
    ]);
  });
  await page.evaluate(async () => { await window.__staleTimetableLoad; });
  const clearedSnapshot = await page.evaluate(() => window.CampusShieldTimetable.getTodaySnapshot());
  expect(clearedSnapshot.loaded).toBe(false);
  expect(clearedSnapshot.items).toHaveLength(0);
  await expect(panel).not.toContainText("Previous account private class");
  await expect(panel).toContainText("Sign in to sync your day");

  await page.setViewportSize({ width: 390, height: 844 });
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(391);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(391);
});

test("dark mode keeps dashboard headings, student cards and form text readable", async ({ page }) => {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const workspace = document.getElementById("workspace");
    if (workspace) { workspace.hidden = false; workspace.style.display = "block"; }
    const login = document.getElementById("login-screen");
    if (login) { login.hidden = true; login.style.display = "none"; }

    const networkPage = document.getElementById("page-campus-network");
    const card = document.createElement("article");
    card.className = "campus-network-card";
    const title = document.createElement("h3");
    title.textContent = "Student opportunity";
    const description = document.createElement("p");
    description.textContent = "A visible description for students using dark mode.";
    const field = document.createElement("input");
    field.type = "text";
    field.setAttribute("aria-label", "Dark mode contrast fixture");
    field.placeholder = "Search campus opportunities";
    card.append(title, description, field);
    networkPage?.append(card);
    document.documentElement.dataset.theme = "dark";
  });

  const dashboardHeading = page.locator("#page-dashboard .dashboard-section-heading");
  const card = page.locator("#page-campus-network .campus-network-card").last();
  const metrics = await page.evaluate(() => {
    const read = selector => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const style = getComputedStyle(element);
      return { color: style.color, background: style.backgroundColor };
    };
    return {
      heading: read("#page-dashboard .dashboard-section-heading"),
      card: read("#page-campus-network .campus-network-card"),
      cardTitle: read("#page-campus-network .campus-network-card h3"),
      cardCopy: read("#page-campus-network .campus-network-card p"),
      input: read("#page-campus-network .campus-network-card input")
    };
  });

  await expect(dashboardHeading).toHaveText("Your campus overview");
  await expect(card).toContainText("A visible description for students using dark mode.");
  expect(metrics.heading.color).toBe("rgb(239, 248, 240)");
  expect(metrics.card.background).toBe("rgb(19, 42, 31)");
  expect(metrics.cardTitle.color).toBe("rgb(239, 248, 240)");
  expect(metrics.cardCopy.color).toBe("rgb(207, 225, 213)");
  expect(metrics.input.color).toBe("rgb(230, 241, 233)");
  expect(metrics.input.background).toBe("rgb(15, 36, 25)");
});

test("dashboard bento cards use dark surfaces and readable text in dark mode", async ({ page }) => {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const workspace = document.getElementById("workspace");
    if (workspace) { workspace.hidden = false; workspace.style.display = "block"; }
    const login = document.getElementById("login-screen");
    if (login) { login.hidden = true; login.style.display = "none"; }
    document.documentElement.dataset.theme = "dark";
  });

  const bento = page.locator("#student-shortcuts");
  await expect(bento).toBeVisible();
  const cards = bento.locator(".campus-home-card");
  await expect(cards).toHaveCount(5);

  const styles = await cards.evaluateAll(elements => elements.map(card => {
    const style = getComputedStyle(card);
    const read = selector => {
      const node = card.querySelector(selector);
      return node ? getComputedStyle(node).color : null;
    };
    return {
      backgroundImage: style.backgroundImage,
      backgroundColor: style.backgroundColor,
      borderColor: style.borderTopColor,
      heading: read("strong"),
      description: read("p"),
      footer: read(".campus-home-card-footer")
    };
  }));

  for (const [index, card] of styles.entries()) {
    expect(card.backgroundImage, "card " + index + " must use its dark-mode surface, not a light gradient")
      .toContain("linear-gradient");
    expect(card.backgroundImage).not.toContain("255, 255, 255");
    expect(card.backgroundColor).not.toBe("rgb(255, 255, 255)");
    expect(card.borderColor).toBe(index === 1 ? "rgb(74, 138, 92)" : "rgb(55, 107, 72)");
    expect(card.heading).toBe("rgb(242, 250, 243)");
    expect(card.description).toBe("rgb(210, 228, 214)");
    expect(card.footer).toBe("rgb(197, 242, 205)");
  }

  const ai = await bento.locator(".campus-home-ai").evaluate(element => ({
    background: getComputedStyle(element).backgroundImage,
    title: getComputedStyle(element.querySelector("strong")).color,
    copy: getComputedStyle(element.querySelector("p")).color
  }));
  expect(ai.background).toContain("radial-gradient");
  expect(ai.title).toBe("rgb(242, 250, 243)");
  expect(ai.copy).toBe("rgb(210, 228, 214)");

  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = await bento.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(391);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});

test("production dashboard dark theme asset fixes all five bento cards and keeps the grid balanced", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const workspace = document.getElementById("workspace");
    if (workspace) { workspace.hidden = false; workspace.style.display = "block"; }
    const login = document.getElementById("login-screen");
    if (login) { login.hidden = true; login.style.display = "none"; }
    document.documentElement.dataset.theme = "dark";
  });

  await page.waitForFunction(() => {
    const link = [...document.querySelectorAll('link[rel="stylesheet"]')]
      .find(node => node.href.includes("campusshield-dashboard-polish-v3.css"));
    return Boolean(link?.sheet && document.querySelectorAll("#student-shortcuts .campus-home-card").length === 5);
  });

  const desktop = await page.evaluate(() => {
    const grid = document.querySelector("#workspace #page-dashboard #student-shortcuts .campus-home-bento-grid");
    const link = [...document.querySelectorAll('link[rel="stylesheet"]')]
      .find(node => node.href.includes("campusshield-dashboard-polish-v3.css"));
    const cards = [...document.querySelectorAll("#workspace #page-dashboard #student-shortcuts .campus-home-card")];
    const styles = cards.map(card => {
      const style = getComputedStyle(card);
      const getColor = selector => {
        const node = card.querySelector(selector);
        return node ? getComputedStyle(node).color : null;
      };
      return {
        type: card.classList.contains("campus-home-ai") ? "ai" : "standard",
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        borderColor: style.borderTopColor,
        title: getColor("strong"),
        description: getColor("p"),
        footer: getColor(".campus-home-card-footer"),
        topRowBackground: getComputedStyle(card.querySelector(".campus-home-card-top")).backgroundColor
      };
    });
    return {
      theme: document.documentElement.dataset.theme,
      stylesheet: link?.href || null,
      rulesLoaded: Boolean(link?.sheet?.cssRules?.length),
      columns: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
      cards: styles
    };
  });

  expect(desktop.theme).toBe("dark");
  expect(desktop.stylesheet).toContain("campusshield-dashboard-polish-v3.css?v=20261109-1");
  expect(desktop.rulesLoaded).toBe(true);
  expect(desktop.columns).toBe(6);
  expect(desktop.cards).toHaveLength(5);

  const contrastRatio = (foreground, background) => {
    const rgb = value => value.match(/[0-9.]+/g).slice(0, 3).map(Number).map(v => {
      const c = v / 255;
      return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
    });
    const [r,g,b] = rgb(foreground);
    const [R,G,B] = rgb(background);
    const lum = .2126*r + .7152*g + .0722*b;
    const back = .2126*R + .7152*G + .0722*B;
    return (Math.max(lum, back) + .05) / (Math.min(lum, back) + .05);
  };

  for (const [index, card] of desktop.cards.entries()) {
    expect(card.backgroundColor).toBe(card.type === "ai" ? "rgb(11, 45, 32)" : "rgb(16, 41, 29)");
    expect(card.backgroundImage).toContain("linear-gradient");
    expect(card.backgroundImage).not.toContain("255, 255, 255");
    expect(card.borderColor).not.toBe("rgb(255, 255, 255)");
    expect(card.title).toBe("rgb(242, 250, 243)");
    expect(card.description).toBe("rgb(210, 228, 214)");
    expect(card.footer).toBe("rgb(197, 242, 205)");
    expect(card.topRowBackground).toBe("rgba(0, 0, 0, 0)");
    expect(contrastRatio(card.description, card.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(card.title, card.backgroundColor)).toBeGreaterThanOrEqual(4.5);
  }

  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 844 });
    const layout = await page.evaluate(() => {
      const grid = document.querySelector("#student-shortcuts .campus-home-bento-grid");
      const rect = grid.getBoundingClientRect();
      const cards = [...grid.querySelectorAll(".campus-home-card")].map(card => {
        const box = card.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width };
      });
      return {
        columns: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
        gridLeft: rect.left,
        gridRight: rect.right,
        gridWidth: grid.clientWidth,
        scrollWidth: grid.scrollWidth,
        cards
      };
    });
    expect(layout.columns).toBe(2);
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.gridWidth + 1);
    for (const card of layout.cards) {
      expect(card.left).toBeGreaterThanOrEqual(layout.gridLeft - 1);
      expect(card.right).toBeLessThanOrEqual(layout.gridRight + 1);
    }
  }
});
