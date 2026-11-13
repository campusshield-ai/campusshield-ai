/* CampusShield AI: persistent light/dark theme and keyboard-accessible campus search. */
(() => {
  const root = document.documentElement;
  const themeKey = "campusshield_theme";
  const stored = (() => { try { return localStorage.getItem(themeKey); } catch { return null; } })();
  const initialTheme = stored === "dark" || stored === "light" ? stored :
    (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  function setTheme(theme) {
    const next = theme === "dark" ? "dark" : "light";
    root.dataset.theme = next;
    root.style.colorScheme = next;
    document.querySelectorAll("#campus-theme-toggle, #campus-mobile-theme-toggle").forEach(button => {
      const dark = next === "dark";
      button.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
      button.setAttribute("aria-pressed", String(dark));
      button.title = dark ? "Switch to light mode" : "Switch to dark mode";
      button.innerHTML = dark
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l-1.42 1.42m11.3-11.3 1.42-1.42"/></svg><span class="theme-toggle-label">Light</span>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.9 13A8.5 8.5 0 0 1 11 3.1 8.5 8.5 0 1 0 20.9 13Z"/></svg><span class="theme-toggle-label">Dark</span>';
    });
    try { localStorage.setItem(themeKey, next); } catch { /* Theme still works for this session. */ }
  }
  setTheme(initialTheme);

  const header = document.querySelector("#workspace .topbar");
  if (!header) return;
  const actions = header.querySelector(".topbar-actions");
  if (!actions) return;
  const themeButton = document.createElement("button");
  themeButton.type = "button";
  themeButton.id = "campus-theme-toggle";
  themeButton.className = "theme-toggle";
  const toggleTheme = () => setTheme(root.dataset.theme === "dark" ? "light" : "dark");
  themeButton.addEventListener("click", toggleTheme);

  // The desktop actions container is intentionally hidden on phones. Add a
  // dedicated copy beside the mobile menu so touch users can still switch modes.
  const mobileThemeButton = document.createElement("button");
  mobileThemeButton.type = "button";
  mobileThemeButton.id = "campus-mobile-theme-toggle";
  mobileThemeButton.className = "theme-toggle mobile-theme-toggle";
  mobileThemeButton.addEventListener("click", toggleTheme);
  const mobileMenuButton = header.querySelector(".mobile-nav-toggle");
  if (mobileMenuButton) header.insertBefore(mobileThemeButton, mobileMenuButton);

  const search = document.createElement("div");
  search.className = "global-search";
  search.innerHTML = '<svg class="global-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></svg><input class="global-search-input" id="campus-global-search" type="search" role="combobox" aria-autocomplete="list" aria-haspopup="listbox" autocomplete="off" aria-label="Search campus features and resources" aria-controls="campus-global-search-options" aria-expanded="false" placeholder="Search courses, resources, events, opportunities…"><span class="global-search-kbd" aria-hidden="true">/</span><div class="global-search-results" id="campus-global-search-results" hidden><div class="global-search-heading" id="campus-global-search-heading"><span class="global-search-heading-label"></span><button class="global-search-clear-recent" type="button" aria-label="Clear recent destinations" hidden>Clear</button></div><div class="global-search-options" id="campus-global-search-options" role="listbox" aria-label="Campus search suggestions"></div><div class="global-search-empty" id="campus-global-search-empty" role="status" aria-live="polite" hidden></div></div>';
  header.insertBefore(search, header.querySelector(".topbar-title"));
  actions.insertBefore(themeButton, actions.firstChild);
  setTheme(root.dataset.theme || initialTheme);

  const input = search.querySelector("input");
  const results = search.querySelector(".global-search-results");
  const resultOptions = search.querySelector("#campus-global-search-options");
  const resultHeading = search.querySelector(".global-search-heading-label");
  const clearRecentButton = search.querySelector(".global-search-clear-recent");
  const emptyState = search.querySelector("#campus-global-search-empty");
  let activeResultIndex = -1;
  // Recently opened destinations stay in this page session only. No search terms,
  // private content or account data are written to storage.
  let recentDestinations = [];
  const destinations = [
    {title:"Overview", description:"Your campus dashboard and activity", page:"dashboard", keywords:"home dashboard safety"},
    {title:"Report an incident", description:"Submit a private campus safety report", page:"report", keywords:"safety incident emergency report"},
    {title:"ShieldMind AI", description:"Ask questions and get study assistance", page:"shieldmind", keywords:"ai assistant chat explain summarize notes"},
    {title:"Past Questions & Exam Prep", description:"Search past questions and practice", page:"past-questions", keywords:"courses exams academic revision tests"},
    {title:"Courses", description:"Your courses and learning resources", page:"courses", keywords:"course lecture learning resources"},
    {title:"CampusPulse", description:"Campus community and Lost & Found", page:"community", keywords:"lost found posts student social"},
    {title:"Upcoming Events", description:"Campus events and activities", page:"events", keywords:"calendar activities"},
    {title:"Marketplace", description:"Find textbooks, electronics and student services from your campus", page:"marketplace", keywords:"buy sell books textbooks electronics accommodation services"},
    {title:"Campus Network", description:"Connect with verified volunteers, startup teams and alumni", page:"campus-network", keywords:"university wide connections cross university volunteers startups alumni network"},
    {title:"CampusVolunteers", description:"Find ways to volunteer and support campus projects", page:"campus-network", keywords:"volunteer causes service community impact"},
    {title:"Startup Corner", description:"Find co-founders and collaborators across participating campuses", page:"campus-network", keywords:"startup founder team collaboration entrepreneurship"},
    {title:"Alumni Connect", description:"Discover verified alumni who opted into networking", page:"campus-network", keywords:"alumni mentor graduate networking career"},
    {title:"Opportunity Hub", description:"Explore scholarships, internships, grants and services", page:"opportunities", keywords:"jobs internships scholarship career grants mentorship hackathon"},
    {title:"Campus services & contacts", description:"Find university support contacts", page:"campus-contacts", keywords:"help clinic security contact support"},
    {title:"Verified campus noticeboard", description:"Updates from verified campus staff", page:"noticeboard", keywords:"announcements alerts notices registration deadlines"},
    {title:"Campus Helpdesk", description:"Track requests for university services and facilities", page:"helpdesk", keywords:"support requests wifi maintenance facilities report issue"},
    {title:"Classrooms & Attendance", description:"Open your authorized classes and attendance tools", page:"classroom", keywords:"class lectures attendance registers teacher"},
    {title:"My timetable", description:"Review your classes and schedule", page:"timetable", keywords:"schedule classes calendar"},
    {title:"Profile & settings", description:"Manage your profile and preferences", page:"profile-settings", keywords:"account settings personal"}
  ];
  function isAvailableTrigger(element) {
    return Boolean(element && !element.hidden && !element.disabled &&
      element.getAttribute("aria-disabled") !== "true" && !element.closest("[hidden]"));
  }

  function findDestinationTrigger(pageName) {
    const triggers = Array.from(document.querySelectorAll('[data-page="' + pageName + '"]'))
      .filter(isAvailableTrigger);
    // Prefer the primary navigation, then dashboard shortcuts. Never click a
    // role-gated/hidden first match when another valid entry point exists.
    return triggers.find(element => element.closest("#app-sidebar, .mobile-bottom-nav")) ||
      triggers.find(element => element.closest("#page-dashboard")) || triggers[0] || null;
  }

  function visibleDestination(item) {
    const page = document.getElementById("page-" + item.page);
    return Boolean(page && !page.hidden && !page.closest("[hidden]") && findDestinationTrigger(item.page));
  }

  function normalizeSearchText(value) {
    return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  // Search only public or campus-approved content already rendered for this account.
  // Private messages, incident records, identity files and personal Helpdesk requests
  // are intentionally outside these selectors.
  function getLiveCampusMatches(query) {
    const normalizedQuery = normalizeSearchText(query);
    if (normalizedQuery.length < 2) return [];
    const queryWords = normalizedQuery.split(/\s+/).filter(Boolean);
    const sources = [
      {selector:"#campus-marketplace-feed article", page:"marketplace", label:"Marketplace"},
      {selector:"#campus-opportunities-feed article", page:"opportunities", label:"Opportunity Hub"},
      {selector:"#campus-volunteer-feed article", page:"campus-network", label:"CampusVolunteers"},
      {selector:"#campus-startup-feed article", page:"campus-network", label:"Startup Corner"},
      {selector:"#campus-alumni-feed article", page:"campus-network", label:"Alumni Connect"},
      {selector:"#campus-events-feed article", page:"events", label:"Campus events"},
      {selector:"#campus-courses-feed article", page:"courses", label:"Courses & study resources"},
      {selector:"#campus-course-resources-feed article", page:"courses", label:"Course learning resource"},
      {selector:"#campus-noticeboard-feed article", page:"noticeboard", label:"Verified campus notice"},
      {selector:"#community-feed article, #campus-community-feed article, #campuspulse-feed article", page:"community", label:"CampusPulse"}
    ];
    const matches = [];
    sources.forEach(source => {
      if (!visibleDestination({page:source.page})) return;
      // A feed may live inside an inactive page; the existing server-scoped feed
      // remains the access boundary for every content result.
      document.querySelectorAll(source.selector).forEach(element => {
        if (element.hidden || element.closest("[hidden]")) return;
        const body = String(element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
        const normalizedBody = normalizeSearchText(body);
        if (!normalizedBody || !queryWords.every(word => normalizedBody.includes(word))) return;
        const heading = element.querySelector("h2,h3,h4,[data-search-title]");
        const title = String(heading?.textContent || body).trim().slice(0, 90);
        matches.push({title, description:source.label + " · " + body.slice(0, 150),
          page:source.page, keywords:body, element, isContent:true});
      });
    });
    return matches.slice(0, 5);
  }
  function closeResults() {
    results.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    activeResultIndex = -1;
  }
  function setActiveResult(index) {
    const options = [...resultOptions.querySelectorAll('[role="option"]')];
    if (!options.length) {
      activeResultIndex = -1;
      input.removeAttribute("aria-activedescendant");
      return;
    }
    activeResultIndex = (index + options.length) % options.length;
    options.forEach((option, optionIndex) => {
      const selected = optionIndex === activeResultIndex;
      option.setAttribute("aria-selected", String(selected));
      if (selected) {
        input.setAttribute("aria-activedescendant", option.id);
        option.scrollIntoView?.({ block: "nearest" });
      }
    });
  }
  function rememberDestination(item) {
    const recent = {
      title: String(item.title || "Campus destination"),
      description: String(item.description || "Recently opened campus space"),
      page: item.page
    };
    recentDestinations = [recent, ...recentDestinations.filter(entry => entry.page !== recent.page)].slice(0, 4);
  }

  function openDestination(item) {
    const target = findDestinationTrigger(item.page);
    // Access can change while the suggestion list is open (for example, after
    // account verification changes). Re-check before activating the destination.
    if (!target || !visibleDestination(item)) {
      closeResults();
      return;
    }
    rememberDestination(item);
    target.click();
    input.value = "";
    closeResults();
    input.blur();
  }
  function renderResults(query) {
    const q = normalizeSearchText(query);
    const queryWords = q.split(/\s+/).filter(Boolean);
    const destinationMatches = q
      ? destinations.filter(item => visibleDestination(item) &&
          queryWords.every(word => normalizeSearchText(item.title + " " + item.description + " " + item.keywords).includes(word)))
        .sort((a, b) => {
          const aTitle = normalizeSearchText(a.title);
          const bTitle = normalizeSearchText(b.title);
          const score = title => title === q ? 0 : title.startsWith(q) ? 1 : queryWords.every(word => title.includes(word)) ? 2 : 3;
          return score(aTitle) - score(bTitle);
        }).slice(0, 6)
      : [];
    const recentMatches = !q ? recentDestinations.filter(visibleDestination).slice(0, 4) : [];
    const quickMatches = !q && !recentMatches.length ? destinations.filter(visibleDestination).slice(0, 6) : [];
    const primaryMatches = q ? destinationMatches : recentMatches.length ? recentMatches : quickMatches;
    const matches = [...primaryMatches, ...getLiveCampusMatches(q)].slice(0, 10);
    resultOptions.replaceChildren();
    resultHeading.textContent = q ? "Matching campus tools" : recentMatches.length ? "Recently opened" : "Quick destinations";
    clearRecentButton.hidden = q.length > 0 || recentMatches.length === 0;
    emptyState.textContent = matches.length
      ? ""
      : "No matching destination yet. Try “past questions”, “events” or “safety”.";
    emptyState.hidden = matches.length > 0;
    activeResultIndex = -1;
    input.removeAttribute("aria-activedescendant");

    matches.forEach((item, index) => {
      const option = document.createElement("div");
      option.className = "global-search-result";
      option.id = "campus-global-search-option-" + index;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");
      option.tabIndex = -1;
      const icon = document.createElement("span");
      icon.className = "global-search-result-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = ({dashboard:"⌂",report:"＋",shieldmind:"✧","past-questions":"▤",courses:"▦",community:"◎",events:"▣",marketplace:"▣",opportunities:"↗","campus-network":"◎","campus-contacts":"☎",noticeboard:"◉",timetable:"▦","profile-settings":"◌"})[item.page] || "↗";
      const copy = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = item.title;
      const detail = document.createElement("small");
      detail.textContent = item.description;
      copy.append(title, detail);
      option.append(icon, copy);
      option.addEventListener("pointerdown", event => event.preventDefault());
      option.addEventListener("pointermove", () => setActiveResult(index));
      option.addEventListener("click", () => {
        openDestination(item);
        if (item.element) window.setTimeout(() => {
          if (item.element.isConnected) item.element.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
      });
      resultOptions.append(option);
    });
    results.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  clearRecentButton.addEventListener("click", () => {
    recentDestinations = [];
    renderResults(input.value);
    input.focus();
  });
  input.addEventListener("focus", () => renderResults(input.value));
  input.addEventListener("input", () => renderResults(input.value));
  search.addEventListener("focusout", event => {
    if (!search.contains(event.relatedTarget)) closeResults();
  });
  input.addEventListener("keydown", event => {
    const options = resultOptions.querySelectorAll('[role="option"]');
    if (event.key === "Escape" && !results.hidden) {
      event.preventDefault();
      closeResults();
    } else if (event.key === "ArrowDown" && !results.hidden && options.length) {
      event.preventDefault();
      setActiveResult(activeResultIndex + 1);
    } else if (event.key === "ArrowUp" && !results.hidden && options.length) {
      event.preventDefault();
      setActiveResult(activeResultIndex < 0 ? options.length - 1 : activeResultIndex - 1);
    } else if (event.key === "Enter" && !results.hidden && options.length) {
      event.preventDefault();
      const selected = activeResultIndex >= 0 ? options[activeResultIndex] : options[0];
      selected?.click();
    }
  });
  document.addEventListener("click", event => {
    if (!search.contains(event.target)) closeResults();
  });
  document.addEventListener("keydown", event => {
    if ((event.key === "/" && !/input|textarea|select/i.test(document.activeElement?.tagName || "") && !event.ctrlKey && !event.metaKey && !event.altKey) ||
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k")) {
      event.preventDefault();
      input.focus();
    }
  });

  const dashboard = document.getElementById("page-dashboard");
  const hero = dashboard?.querySelector(".campus-dashboard-hero");
  if (dashboard && hero && !document.getElementById("student-shortcuts")) {
    const section = document.createElement("section");
    section.className = "student-shortcuts campus-home-bento";
    section.id = "student-shortcuts";
    section.setAttribute("aria-labelledby", "student-shortcuts-title");
    section.innerHTML = `
      <div class="student-shortcuts-heading">
        <div>
          <span class="campus-home-eyebrow">YOUR CAMPUS, CONNECTED</span>
          <h2 id="student-shortcuts-title">Everything you need, in one place</h2>
          <p>Open the tools you use most, without hunting through menus.</p>
        </div>
      </div>
      <div class="student-shortcuts-grid campus-home-bento-grid">
        <article class="student-shortcut-card campus-home-card campus-home-map" aria-labelledby="campus-home-map-title">
          <span class="campus-home-card-top">
            <span class="student-shortcut-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/></svg></span>
            <span class="campus-home-status">In preparation</span>
          </span>
          <strong id="campus-home-map-title">CampusMap</strong>
          <p>Verified campus buildings, entrances and pedestrian routes are being prepared. We will not show unverified pins or invented paths.</p>
          <span class="campus-home-card-footer">Verified mapping is next <span aria-hidden="true">→</span></span>
          <span class="campus-home-map-art" aria-hidden="true"><span></span><span></span><span></span></span>
        </article>
        <button class="student-shortcut-card campus-home-card campus-home-ai" type="button" data-page="shieldmind" aria-label="Open ShieldMind AI">
          <span class="campus-home-card-top">
            <span class="student-shortcut-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1"/><circle cx="12" cy="12" r="5"/></svg></span>
            <span class="campus-home-card-kicker">AI STUDY PARTNER</span>
          </span>
          <strong>ShieldMind AI</strong>
          <p>Ask questions, understand difficult topics and plan your revision.</p>
          <span class="campus-home-card-footer">Ask ShieldMind <span aria-hidden="true">→</span></span>
        </button>
        <button class="student-shortcut-card campus-home-card campus-home-pulse" type="button" data-page="community" aria-label="Open CampusPulse">
          <span class="campus-home-card-top">
            <span class="student-shortcut-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3 20v-1.5A4.5 4.5 0 0 1 7.5 14h3A4.5 4.5 0 0 1 15 18.5V20M16 5a3 3 0 0 1 0 6M18 14a4 4 0 0 1 3 3.9V20"/></svg></span>
            <span class="campus-home-card-kicker">STUDENT COMMUNITY</span>
          </span>
          <strong>CampusPulse</strong>
          <p>Campus updates, groups, conversations and Lost &amp; Found.</p>
          <span class="campus-home-card-footer">Open community <span aria-hidden="true">→</span></span>
        </button>
        <button class="student-shortcut-card campus-home-card campus-home-academics" type="button" data-page="academics" aria-label="Open Academic Life">
          <span class="campus-home-card-top">
            <span class="student-shortcut-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 5.5A2.5 2.5 0 0 1 5.5 3H21v17H5.5A2.5 2.5 0 0 1 3 17.5z"/><path d="M3 17.5A2.5 2.5 0 0 1 5.5 15H21M8 7h8M8 10h8M8 13h5"/></svg></span>
            <span class="campus-home-card-kicker">STUDY &amp; PLAN</span>
          </span>
          <strong>My Academics</strong>
          <p>Timetable, course resources and exam preparation.</p>
          <span class="campus-home-card-footer">Open academics <span aria-hidden="true">→</span></span>
        </button>
        <button class="student-shortcut-card campus-home-card campus-home-safety" type="button" data-page="noticeboard" aria-label="Open verified campus notices">
          <span class="campus-home-card-top">
            <span class="student-shortcut-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 20 6v5c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg></span>
            <span class="campus-home-card-kicker">VERIFIED UPDATES</span>
          </span>
          <strong>Campus Safety</strong>
          <p>Read verified campus notices and find trusted support contacts.</p>
          <span class="campus-home-card-footer">View notices <span aria-hidden="true">→</span></span>
        </button>
      </div>`;

    hero.insertAdjacentElement("afterend", section);
  }
  // Show quick links only for feature pages included in this release.
  let shortcutHost = document.getElementById("student-shortcuts");
  const dashboardHero = document.querySelector("#page-dashboard .campus-dashboard-hero");
  if (!shortcutHost && dashboardHero) {
    shortcutHost = document.createElement("div");
    shortcutHost.id = "student-shortcuts";
    shortcutHost.className = "campus-dashboard-shortcuts-host";
    dashboardHero.insertAdjacentElement("afterend", shortcutHost);
  }
  if (shortcutHost && !document.getElementById("campus-dashboard-quicklinks")) {
    const quicklinks = document.createElement("nav");
    quicklinks.id = "campus-dashboard-quicklinks";
    quicklinks.className = "campus-dashboard-quicklinks";
    quicklinks.setAttribute("aria-label", "Your campus shortcuts");
    const label = document.createElement("span");
    label.className = "campus-dashboard-quicklinks-label";
    label.textContent = "OPEN A CAMPUS SPACE";
    quicklinks.append(label);
    [
      {title:"Marketplace", page:"marketplace"},
      {title:"Opportunity Hub", page:"opportunities"},
      {title:"Campus Network", page:"campus-network"}
    ].filter(item => Boolean(document.getElementById("page-" + item.page))).forEach(item => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "campus-dashboard-quicklink";
      button.dataset.page = item.page;
      button.setAttribute("aria-label", "Open " + item.title);
      button.textContent = item.title;
      quicklinks.append(button);
    });
    if (quicklinks.querySelector("button")) shortcutHost.append(quicklinks);
  }

  // My Day reuses only the signed-in user's existing private timetable snapshot.
  const myDayPanel = document.createElement("section");
  myDayPanel.id = "campus-my-day";
  myDayPanel.className = "campus-my-day-panel";
  myDayPanel.setAttribute("aria-labelledby", "campus-my-day-title");
  const myDayHeader = document.createElement("div");
  myDayHeader.className = "campus-my-day-header";
  const myDayHeading = document.createElement("div");
  const myDayTitle = document.createElement("h2");
  myDayTitle.id = "campus-my-day-title";
  myDayTitle.textContent = "My Day";
  const myDayDate = document.createElement("p");
  myDayDate.id = "campus-my-day-date";
  myDayDate.className = "campus-my-day-date";
  myDayHeading.append(myDayTitle, myDayDate);
  const myDayOpen = document.createElement("button");
  myDayOpen.type = "button";
  myDayOpen.className = "campus-my-day-open";
  myDayOpen.dataset.page = "timetable";
  myDayOpen.textContent = "Open timetable";
  myDayOpen.setAttribute("aria-label", "Open my full timetable");
  myDayHeader.append(myDayHeading, myDayOpen);
  const myDaySummary = document.createElement("p");
  myDaySummary.id = "campus-my-day-summary";
  myDaySummary.className = "campus-my-day-summary";
  myDaySummary.setAttribute("aria-live", "polite");
  const myDayFocus = document.createElement("div");
  myDayFocus.id = "campus-my-day-focus";
  myDayFocus.className = "campus-my-day-focus";
  myDayFocus.hidden = true;
  myDayFocus.setAttribute("aria-live", "polite");
  myDayFocus.setAttribute("aria-atomic", "true");
  const myDayFeed = document.createElement("ol");
  myDayFeed.id = "campus-my-day-feed";
  myDayFeed.className = "campus-my-day-feed";
  myDayFeed.setAttribute("aria-label", "Today's classes, tasks and campus events");
  myDayPanel.append(myDayHeader, myDaySummary, myDayFocus, myDayFeed);
  if (shortcutHost) shortcutHost.insertAdjacentElement("afterend", myDayPanel);
  else if (dashboardHero) dashboardHero.insertAdjacentElement("afterend", myDayPanel);

  let myDayLoading = false;
  function renderMyDay() {
    myDayDate.textContent = new Date().toLocaleDateString([], {
      weekday: "long", month: "long", day: "numeric"
    });
    const snapshot = window.CampusShieldTimetable?.getTodaySnapshot?.();
    myDayFeed.replaceChildren();
    myDayFocus.replaceChildren();
    myDayFocus.hidden = true;
    if (!snapshot?.loaded) {
      myDaySummary.textContent = myDayLoading
        ? "Syncing your private timetable…"
        : "Your personal schedule is private to your account.";
      const empty = document.createElement("li");
      empty.className = "campus-my-day-empty";
      empty.textContent = myDayLoading
        ? "Your classes, tasks and campus events will appear here."
        : "Sign in to sync your day, or open your timetable to refresh it.";
      myDayFeed.append(empty);
      return;
    }

    const items = Array.isArray(snapshot.items) ? snapshot.items : [];
    const classes = items.filter(item => item.kind === "class").length;
    const events = items.filter(item => item.kind === "event").length;
    const tasks = items.length - classes - events;
    const completedCount = items.filter(item => item.completed).length;
    const countLabel = (count, name) => count + " " + name + (count === 1 ? "" : "s");
    myDaySummary.textContent = [
      countLabel(classes, "class"),
      countLabel(tasks, "task"),
      countLabel(events, "campus event"),
      countLabel(completedCount, "completed")
    ].join(" · ");

    if (!items.length) {
      const empty = document.createElement("li");
      empty.className = "campus-my-day-empty";
      empty.textContent = "Nothing scheduled for today. Add a class, task or reminder to your private timetable.";
      myDayFeed.append(empty);
      return;
    }

    const formatTime = value => {
      const date = new Date(value);
      return Number.isFinite(date.getTime())
        ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        : "Time not set";
    };
    const now = Date.now();
    const pending = items.filter(item => !item.completed);
    const inProgress = pending.find(item => {
      const start = Date.parse(item.startsAt || "");
      const end = Date.parse(item.endsAt || "");
      return Number.isFinite(start) && Number.isFinite(end) && start <= now && end > now;
    });
    const upcoming = pending.find(item => {
      const start = Date.parse(item.startsAt || "");
      return Number.isFinite(start) && start >= now;
    });
    const stillToDo = pending.find(item => {
      const start = Date.parse(item.startsAt || "");
      return item.kind !== "class" && item.kind !== "event" && Number.isFinite(start) && start < now;
    });
    const focusItem = inProgress || upcoming || stillToDo;

    const appendFocusText = (tagName, className, text) => {
      const node = document.createElement(tagName);
      node.className = className;
      node.textContent = text;
      myDayFocus.append(node);
      return node;
    };
    myDayFocus.hidden = false;
    if (focusItem) {
      const focusState = inProgress ? "HAPPENING NOW" : upcoming ? "UP NEXT" : "STILL TO DO";
      appendFocusText("span", "campus-my-day-focus-kicker", focusState);
      appendFocusText("strong", "campus-my-day-focus-title", String(focusItem.title || "Scheduled item"));
      const focusMeta = [];
      if (inProgress) {
        focusMeta.push(focusItem.endsAt ? "Ends " + formatTime(focusItem.endsAt) : "In progress");
      } else if (upcoming) {
        focusMeta.push("Starts at " + formatTime(focusItem.startsAt));
      } else {
        focusMeta.push("Scheduled at " + formatTime(focusItem.startsAt));
      }
      [focusItem.label, focusItem.courseCode, focusItem.location]
        .map(value => String(value || "").trim())
        .filter(Boolean)
        .forEach(value => focusMeta.push(value));
      appendFocusText("span", "campus-my-day-focus-meta", focusMeta.join(" · "));
    } else if (completedCount === items.length) {
      appendFocusText("span", "campus-my-day-focus-kicker", "DAY COMPLETE");
      appendFocusText("strong", "campus-my-day-focus-title", "You're all caught up");
      appendFocusText("span", "campus-my-day-focus-meta", completedCount + " of " + items.length + " scheduled items completed.");
    } else {
      appendFocusText("span", "campus-my-day-focus-kicker", "TODAY");
      appendFocusText("strong", "campus-my-day-focus-title", "No more items coming up");
      appendFocusText("span", "campus-my-day-focus-meta", completedCount + " of " + items.length + " scheduled items marked complete. Check earlier entries above.");
    }

    items.slice(0, 6).forEach(item => {
      const row = document.createElement("li");
      row.className = "campus-my-day-item" + (item.completed ? " is-complete" : "");
      const time = document.createElement("time");
      time.className = "campus-my-day-time";
      time.dateTime = item.startsAt || "";
      time.textContent = formatTime(item.startsAt);
      const copy = document.createElement("div");
      copy.className = "campus-my-day-copy";
      const title = document.createElement("strong");
      title.textContent = String(item.title || "Scheduled item");
      const meta = document.createElement("span");
      meta.className = "campus-my-day-meta";
      meta.textContent = [item.label || "Task", item.courseCode, item.location]
        .map(value => String(value || "").trim()).filter(Boolean).join(" · ");
      copy.append(title, meta);
      const state = document.createElement("span");
      state.className = "campus-my-day-kind";
      state.textContent = item.completed ? "Completed" : (item.label || "Planned");
      row.append(time, copy, state);
      myDayFeed.append(row);
    });
    if (items.length > 6) {
      const more = document.createElement("li");
      more.className = "campus-my-day-more";
      more.textContent = (items.length - 6) + " more item(s) in your timetable.";
      myDayFeed.append(more);
    }
  }

  window.addEventListener("campusshield:timetable-loading", () => {
    myDayLoading = true;
    renderMyDay();
  });
  window.addEventListener("campusshield:timetable-updated", () => {
    myDayLoading = false;
    renderMyDay();
  });
  window.addEventListener("campusshield:profile-cleared", () => {
    myDayLoading = false;
    renderMyDay();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) renderMyDay();
  });
  document.addEventListener("click", event => {
    if (event.target?.closest?.('[data-page="dashboard"]')) renderMyDay();
  });
  renderMyDay();

})();
