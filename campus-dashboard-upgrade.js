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
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l-1.42-1.42m11.3-11.3 1.42-1.42"/></svg><span class="theme-toggle-label">Light</span>'
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
  themeButton.addEventListener("click", () => setTheme(root.dataset.theme === "dark" ? "light" : "dark"));

  // The desktop actions are hidden on phones, so provide a second control
  // beside the mobile menu. Both controls share one saved theme preference.
  const mobileThemeButton = document.createElement("button");
  mobileThemeButton.type = "button";
  mobileThemeButton.id = "campus-mobile-theme-toggle";
  mobileThemeButton.className = "theme-toggle mobile-theme-toggle";
  mobileThemeButton.addEventListener("click", () => setTheme(root.dataset.theme === "dark" ? "light" : "dark"));
  const mobileMenuButton = header.querySelector(".mobile-nav-toggle");
  if (mobileMenuButton) header.insertBefore(mobileThemeButton, mobileMenuButton);

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
    {title:"Marketplace", description:"Find textbooks, electronics and student services from your campus", page:"marketplace", keywords:"buy sell books textbooks electronics accommodation services"},
    {title:"Campus Network", description:"Connect with verified volunteers, startup teams and alumni", page:"campus-network", keywords:"university wide connections cross university volunteers startups alumni network"},
    {title:"CampusVolunteers", description:"Find ways to volunteer and support campus projects", page:"campus-network", keywords:"volunteer causes service community impact"},
    {title:"Startup Corner", description:"Find co-founders and collaborators across participating campuses", page:"campus-network", keywords:"startup founder team collaboration entrepreneurship"},
    {title:"Alumni Connect", description:"Discover verified alumni who opted into networking", page:"campus-network", keywords:"alumni mentor graduate networking career"},
    {title:"Opportunity Hub", description:"Explore scholarships, internships, grants and services", page:"opportunities", keywords:"jobs internships scholarship career grants mentorship hackathon"},
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

  // Index only campus content already rendered for this signed-in account.
  function getLiveCampusMatches(query) {
    if (!query || query.length < 2) return [];
    const sources = [
      {selector:"#campus-marketplace-feed article", page:"marketplace", label:"Marketplace"},
      {selector:"#campus-opportunities-feed article", page:"opportunities", label:"Opportunity Hub"},
      {selector:"#campus-volunteer-feed article", page:"campus-network", label:"CampusVolunteers"},
      {selector:"#campus-startup-feed article", page:"campus-network", label:"Startup Corner"},
      {selector:"#campus-alumni-feed article", page:"campus-network", label:"Alumni Connect"},
      {selector:"#campus-events-feed article", page:"events", label:"Campus events"},
      {selector:"#community-feed article, #campus-community-feed article, #campuspulse-feed article", page:"community", label:"CampusPulse"}
    ];
    const matches = [];
    sources.forEach(source => {
      if (!visibleDestination({page:source.page})) return;
      document.querySelectorAll(source.selector).forEach(element => {
        if (element.hidden || element.closest("[hidden]")) return;
        const body = String(element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
        if (!body || !body.toLocaleLowerCase().includes(query)) return;
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
    const destinationMatches = destinations.filter(item => visibleDestination(item) &&
      (!q || (item.title + " " + item.description + " " + item.keywords).toLocaleLowerCase().includes(q))).slice(0, 6);
    const matches = [...destinationMatches, ...getLiveCampusMatches(q)].slice(0, 10);
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
        icon.textContent = ({dashboard:"⌂",report:"＋",shieldmind:"✧","past-questions":"▤",courses:"▦",community:"◎",events:"▣",marketplace:"▣",opportunities:"↗","campus-network":"◎","campus-contacts":"☎",noticeboard:"◉",timetable:"▦","profile-settings":"◌"})[item.page] || "↗";
        const copy = document.createElement("span");
        const title = document.createElement("strong");
        title.textContent = item.title;
        const detail = document.createElement("small");
        detail.textContent = item.description;
        copy.append(title, detail);
        button.append(icon, copy);
        button.addEventListener("click", () => {
          openDestination(item);
          if (item.element) window.setTimeout(() => {
            if (item.element.isConnected) item.element.scrollIntoView({behavior:"smooth", block:"center"});
          }, 100);
        });
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
    section.className = "student-shortcuts";
    section.id = "student-shortcuts";
    section.setAttribute("aria-labelledby", "student-shortcuts-title");
    section.innerHTML = [
      '<div class="student-shortcuts-heading"><div><span class="campus-discovery-eyebrow">DISCOVER YOUR CAMPUS</span><h2 id="student-shortcuts-title">Find your people. Make campus yours.</h2><p>Explore the communities, activities and tools that make university life richer.</p></div><span class="campus-discovery-heading-note">Your campus · Your community</span></div>',
      '<div class="campus-discovery-layout">',
      '<article class="campus-discovery-featured"><div class="campus-discovery-featured-art" aria-hidden="true"><span class="campus-discovery-orbit orbit-one"></span><span class="campus-discovery-orbit orbit-two"></span><span class="campus-discovery-symbol">C<span>+</span></span></div><div class="campus-discovery-featured-copy"><span class="campus-discovery-featured-kicker">CAMPUSPULSE · MORE TOGETHER</span><h3>Your campus is more than a place to study.</h3><p>Meet collaborators, join clubs, find event buddies and save the moments that make your university experience yours.</p><div class="campus-discovery-tags"><span>Connect</span><span>Discover</span><span>Belong</span></div><button class="campus-discovery-primary" type="button" data-page="community">Explore CampusPulse <span aria-hidden="true">↗</span></button></div></article>',
      '<div class="campus-discovery-grid">',
      '<button class="campus-discovery-card" type="button" data-page="community" data-cps-open-tab="missions" data-dashboard-role="student"><span class="campus-discovery-card-top"><span class="campus-discovery-icon">✦</span><span class="campus-discovery-index">01 · PLAY</span></span><strong>Campus Missions</strong><p>Take on helpful campus challenges and earn progress through Rewards.</p><span class="campus-discovery-link">View missions <b aria-hidden="true">↗</b></span></button>',
      '<button class="campus-discovery-card" type="button" data-page="community" data-cps-open-tab="collab"><span class="campus-discovery-card-top"><span class="campus-discovery-icon">⌘</span><span class="campus-discovery-index">02 · CREATE</span></span><strong>Collab Finder</strong><p>Find study partners, project teammates and creative collaborators.</p><span class="campus-discovery-link">Find a team <b aria-hidden="true">↗</b></span></button>',
      '<button class="campus-discovery-card" type="button" data-page="community" data-cps-open-tab="buddies"><span class="campus-discovery-card-top"><span class="campus-discovery-icon">◷</span><span class="campus-discovery-index">03 · MEET</span></span><strong>Event Buddies</strong><p>Discover campus events and connect with students attending them.</p><span class="campus-discovery-link">Meet people <b aria-hidden="true">↗</b></span></button>',
      '<button class="campus-discovery-card" type="button" data-page="community" data-cps-open-tab="clubs"><span class="campus-discovery-card-top"><span class="campus-discovery-icon">◎</span><span class="campus-discovery-index">04 · BELONG</span></span><strong>Club Hubs</strong><p>Explore approved societies and campus interest communities.</p><span class="campus-discovery-link">Explore clubs <b aria-hidden="true">↗</b></span></button>',
      '<button class="campus-discovery-card" type="button" data-page="community" data-cps-open-tab="mentorship"><span class="campus-discovery-card-top"><span class="campus-discovery-icon">↗</span><span class="campus-discovery-index">05 · GROW</span></span><strong>Mentorship</strong><p>Learn from verified peers and campus staff who volunteer to help.</p><span class="campus-discovery-link">Find a mentor <b aria-hidden="true">↗</b></span></button>',
      '<button class="campus-discovery-card" type="button" data-page="community" data-cps-open-tab="memories"><span class="campus-discovery-card-top"><span class="campus-discovery-icon">▧</span><span class="campus-discovery-index">06 · REMEMBER</span></span><strong>Campus Memories</strong><p>Save meaningful moments and link them to published campus events.</p><span class="campus-discovery-link">Save a memory <b aria-hidden="true">↗</b></span></button>',
      '</div></div>',
      '<nav class="campus-discovery-utility" aria-label="More campus tools"><span>QUICK ACCESS</span><button type="button" data-page="campus-map">Campus Map <b aria-hidden="true">↗</b></button><button type="button" data-page="academics">Academic Life <b aria-hidden="true">↗</b></button><button type="button" data-page="helpdesk">Helpdesk <b aria-hidden="true">↗</b></button><button type="button" data-page="shieldmind">ShieldMind AI <b aria-hidden="true">↗</b></button></nav>'
    ].join("");
    hero.insertAdjacentElement("afterend", section);
    const applyRole = role => {
      const normalized = String(role || "").toLowerCase();
      section.dataset.accountRole = normalized;
      section.querySelectorAll("[data-dashboard-role]").forEach(card => {
        const allowed = String(card.dataset.dashboardRole || "").split(",").map(value => value.trim());
        card.hidden = !allowed.includes(normalized);
      });
    };
    applyRole(document.getElementById("workspace")?.dataset.accountRole || "");
    window.addEventListener("campusshield:profile-ready", event => applyRole(event.detail?.role));
  }
  // Feature shortcuts are built from pages that actually exist in this release.
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
    ].filter(visibleDestination).forEach(item => {
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
})();
