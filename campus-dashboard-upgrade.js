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
    const button = document.getElementById("campus-theme-toggle");
    if (button) {
      const dark = next === "dark";
      button.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
      button.setAttribute("aria-pressed", String(dark));
      button.title = dark ? "Switch to light mode" : "Switch to dark mode";
      button.innerHTML = dark
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg><span class="theme-toggle-label">Light</span>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.9 13A8.5 8.5 0 0 1 11 3.1 8.5 8.5 0 1 0 20.9 13Z"/></svg><span class="theme-toggle-label">Dark</span>';
    }
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
  themeButton.addEventListener("click", () => setTheme(root.dataset.theme === "dark" ? "light" : "dark"));
  const search = document.createElement("div");
  search.className = "global-search";
  search.innerHTML = '<svg class="global-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></svg><input class="global-search-input" id="campus-global-search" type="search" autocomplete="off" aria-label="Search campus features and resources" aria-controls="campus-global-search-results" aria-expanded="false" placeholder="Search courses, resources, events, opportunities…"><span class="global-search-kbd" aria-hidden="true">/</span><div class="global-search-results" id="campus-global-search-results" role="listbox" aria-label="Search results" hidden></div>';
  header.insertBefore(search, header.querySelector(".topbar-title"));
  actions.insertBefore(themeButton, actions.firstChild);
  setTheme(root.dataset.theme || initialTheme);

  const input = search.querySelector("input");
  const results = search.querySelector(".global-search-results");
  const destinations = [
    {title:"Overview", description:"Your campus dashboard and activity", page:"dashboard", keywords:"home dashboard safety"},
    {title:"Report an incident", description:"Submit a private campus safety report", page:"report", keywords:"safety incident emergency report"},
    {title:"ShieldMind AI", description:"Ask questions and get study assistance", page:"shieldmind", keywords:"ai assistant chat explain summarize notes"},
    {title:"Past Questions & Exam Prep", description:"Search past questions and practice", page:"past-questions", keywords:"courses exams academic revision tests"},
    {title:"Courses", description:"Your courses and learning resources", page:"courses", keywords:"course lecture learning resources"},
    {title:"CampusPulse", description:"Campus community and Lost & Found", page:"community", keywords:"lost found posts student social"},
    {title:"Upcoming Events", description:"Campus events and activities", page:"events", keywords:"calendar activities"},
    {title:"Opportunity Hub", description:"Explore opportunities and services", page:"opportunities", keywords:"jobs internships scholarship career"},
    {title:"Campus services & contacts", description:"Find university support contacts", page:"campus-contacts", keywords:"help clinic security contact support"},
    {title:"Verified campus noticeboard", description:"Updates from verified campus staff", page:"noticeboard", keywords:"announcements alerts notices"},
    {title:"My timetable", description:"Review your classes and schedule", page:"timetable", keywords:"schedule classes calendar"},
    {title:"Profile & settings", description:"Manage your profile and preferences", page:"profile-settings", keywords:"account settings personal"}
  ];
  function visibleDestination(item) {
    const nav = document.querySelector('.nav [data-page="' + item.page + '"]');
    const page = document.getElementById("page-" + item.page);
    return Boolean(nav || page || item.page === "dashboard");
  }
  function closeResults() {
    results.hidden = true;
    input.setAttribute("aria-expanded", "false");
  }
  function openDestination(item) {
    const target = document.querySelector('[data-page="' + item.page + '"]');
    if (target) target.click();
    else {
      const page = document.getElementById("page-" + item.page);
      if (page) {
        document.querySelectorAll(".page.active").forEach(el => el.classList.remove("active"));
        page.classList.add("active");
      }
    }
    input.value = "";
    closeResults();
    input.blur();
  }
  function renderResults(query) {
    const q = query.trim().toLocaleLowerCase();
    const matches = destinations.filter(item => visibleDestination(item) &&
      (!q || (item.title + " " + item.description + " " + item.keywords).toLocaleLowerCase().includes(q))).slice(0, 7);
    results.replaceChildren();
    const heading = document.createElement("div");
    heading.className = "global-search-heading";
    heading.textContent = q ? "Matching campus tools" : "Quick destinations";
    results.append(heading);
    if (!matches.length) {
      const empty = document.createElement("div");
      empty.className = "global-search-empty";
      empty.textContent = "No matching destination yet. Try “past questions”, “events” or “safety”.";
      results.append(empty);
    } else {
      matches.forEach(item => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "global-search-result";
        button.setAttribute("role", "option");
        const icon = document.createElement("span");
        icon.className = "global-search-result-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = ({dashboard:"⌂",report:"＋",shieldmind:"✧","past-questions":"▤",courses:"▦",community:"◎",events:"▣",opportunities:"↗","campus-contacts":"☎",noticeboard:"◉",timetable:"▦","profile-settings":"◌"})[item.page] || "↗";
        const copy = document.createElement("span");
        const title = document.createElement("strong");
        title.textContent = item.title;
        const detail = document.createElement("small");
        detail.textContent = item.description;
        copy.append(title, detail);
        button.append(icon, copy);
        button.addEventListener("click", () => openDestination(item));
        results.append(button);
      });
    }
    results.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }
  input.addEventListener("focus", () => renderResults(input.value));
  input.addEventListener("input", () => renderResults(input.value));
  input.addEventListener("keydown", event => {
    if (event.key === "Escape") { closeResults(); input.blur(); }
    if (event.key === "Enter") {
      const first = results.querySelector("button");
      if (first) { event.preventDefault(); first.click(); }
    }
    if (event.key === "ArrowDown" && !results.hidden) {
      event.preventDefault();
      const first = results.querySelector("button");
      if (first) first.focus();
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
})();
