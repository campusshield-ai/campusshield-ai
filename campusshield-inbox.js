/* CampusShield AI — Universal Campus Inbox.
   Read-only aggregation of existing RLS-scoped feeds. Private messages, incident
   reports, staff-only records and notification tables are intentionally excluded. */
(() => {
  "use strict";
  let mounted = false;
  let loading = false;
  let items = [];
  let activeFilter = "all";
  let lastLoadAt = null;
  const $ = id => document.getElementById(id);

  function ensureStylesheet() {
    if (document.querySelector('link[data-campus-inbox-style="true"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "./campusshield-inbox.css?v=20261114-1";
    link.dataset.campusInboxStyle = "true";
    document.head.appendChild(link);
  }

  function ensurePage() {
    const workspace = $("workspace");
    const content = workspace?.querySelector(".content");
    if (!workspace || !content) return null;
    let page = $("page-inbox");
    if (!page) {
      page = document.createElement("section");
      page.className = "page";
      page.id = "page-inbox";
      const profile = $("page-profile-settings");
      if (profile?.parentNode === content) content.insertBefore(page, profile);
      else content.appendChild(page);
    }
    if (page.dataset.inboxMounted !== "true") {
      page.innerHTML =
        '<div class="heading inbox-heading"><div><span class="campus-hub-eyebrow">ONE PLACE FOR CAMPUS UPDATES</span><h1>Campus Inbox</h1><p>Official university notices, your classroom announcements and published campus events, brought together.</p></div><button class="btn secondary" type="button" id="campus-inbox-refresh">Refresh inbox</button></div>' +
        '<div class="notice-inline inbox-privacy-note" role="note">This inbox only combines information your account is already authorised to view. Private messages, incident reports and confidential staff records remain in their separate workspaces.</div>' +
        '<section class="panel campus-inbox-panel" aria-labelledby="campus-inbox-title"><div class="campus-inbox-toolbar"><div class="campus-inbox-filters" role="group" aria-label="Filter inbox items">' +
        '<button type="button" class="campus-inbox-filter is-active" data-inbox-filter="all" aria-pressed="true">All updates</button>' +
        '<button type="button" class="campus-inbox-filter" data-inbox-filter="notice" aria-pressed="false">University notices</button>' +
        '<button type="button" class="campus-inbox-filter" data-inbox-filter="class" aria-pressed="false">Class updates</button>' +
        '<button type="button" class="campus-inbox-filter" data-inbox-filter="event" aria-pressed="false">Events</button></div>' +
        '<label class="campus-inbox-search"><span class="sr-only">Search your campus inbox</span><input id="campus-inbox-search" type="search" autocomplete="off" placeholder="Search updates…"></label></div>' +
        '<div class="campus-inbox-summary" id="campus-inbox-summary">Your latest campus updates will appear here.</div>' +
        '<div class="campus-inbox-list" id="campus-inbox-list" aria-live="polite" aria-busy="true"></div>' +
        '<p class="campus-inbox-status" id="campus-inbox-status" role="status" aria-live="polite">Loading your campus inbox…</p></section>';
      page.dataset.inboxMounted = "true";
    }
    return page;
  }

  function validDate(value) {
    const date = new Date(value || "");
    return Number.isFinite(date.getTime()) ? date : null;
  }

  function formatDate(value) {
    const date = validDate(value);
    if (!date) return "Date unavailable";
    return new Intl.DateTimeFormat(undefined, { dateStyle:"medium", timeStyle:"short" }).format(date);
  }

  function normalise(value) {
    return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function makeItem(type, record, source, destination) {
    const title = String(record.title || "").trim();
    if (!title) return null;
    const date = record.published_at || record.created_at || record.starts_at || "";
    return {
      id: type + ":" + String(record.id || title + ":" + date),
      type, title,
      body: String(record.body || record.description || "").trim(),
      source,
      date,
      dateLabel: formatDate(date),
      destination,
      category: String(record.category || "").replace(/_/g, " ")
    };
  }

  async function collect() {
    const backend = window.CampusShieldBackend;
    if (!backend) throw new Error("Campus services are not ready. Refresh the page and try again.");

    const sourceResults = await Promise.allSettled([
      typeof backend.listCampusNotices === "function" ? backend.listCampusNotices() : Promise.resolve([]),
      typeof backend.listCampusEvents === "function" ? backend.listCampusEvents() : Promise.resolve([]),
      typeof backend.listCampusClassrooms === "function" ? backend.listCampusClassrooms() : Promise.resolve([])
    ]);
    const notices = sourceResults[0].status === "fulfilled" ? sourceResults[0].value : [];
    const events = sourceResults[1].status === "fulfilled" ? sourceResults[1].value : [];
    const classrooms = sourceResults[2].status === "fulfilled" ? sourceResults[2].value : [];
    const failures = [];
    sourceResults.forEach((result, index) => {
      if (result.status === "rejected") failures.push(["notices", "events", "classrooms"][index]);
    });

    const next = [];
    (Array.isArray(notices) ? notices : []).forEach(row => {
      const item = makeItem("notice", row, row.publisher_label || "Verified university notice", "noticeboard");
      if (item) next.push(item);
    });

    (Array.isArray(events) ? events : []).forEach(row => {
      const body = [row.description, row.location ? "Location: " + row.location : "", row.starts_at ? "Starts: " + formatDate(row.starts_at) : ""].filter(Boolean).join("\n");
      const item = makeItem("event", Object.assign({}, row, { body, created_at:row.created_at || row.starts_at }), "Published campus event", "events");
      if (item) next.push(item);
    });

    const accessibleClasses = Array.isArray(classrooms) ? classrooms.slice(0, 12) : [];
    const classResults = await Promise.allSettled(accessibleClasses.map(async classroom => {
      if (!classroom?.id || typeof backend.listCampusClassroomAnnouncements !== "function") return [];
      const rows = await backend.listCampusClassroomAnnouncements(classroom.id);
      return (Array.isArray(rows) ? rows : []).map(row => ({
        row,
        source: String(classroom.name || classroom.subject || "Your classroom") + " · Class announcement"
      }));
    }));
    classResults.forEach(result => {
      if (result.status === "rejected") {
        failures.push("class");
        return;
      }
      result.value.forEach(entry => {
        const item = makeItem("class", entry.row, entry.source, "classroom");
        if (item) next.push(item);
      });
    });

    next.sort((a, b) => (validDate(b.date)?.getTime() || 0) - (validDate(a.date)?.getTime() || 0));
    return { items:next, failures };
  }

  function filteredItems() {
    const query = normalise($("campus-inbox-search")?.value || "");
    return items.filter(item => {
      const filterMatch = activeFilter === "all" || item.type === activeFilter;
      const haystack = normalise([item.title, item.body, item.source, item.category].join(" "));
      return filterMatch && (!query || query.split(/\s+/).every(word => haystack.includes(word)));
    });
  }

  function render() {
    const list = $("campus-inbox-list");
    const summary = $("campus-inbox-summary");
    const status = $("campus-inbox-status");
    if (!list || !summary || !status) return;
    const filtered = filteredItems();
    list.replaceChildren();
    summary.textContent = items.length + (items.length === 1 ? " update available to your account" : " updates available to your account");

    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "campus-inbox-empty";
      const heading = document.createElement("strong");
      heading.textContent = items.length ? "No matching updates" : "Your inbox is clear";
      const description = document.createElement("p");
      description.textContent = items.length
        ? "Try another search or choose a different inbox filter."
        : "Published notices, class announcements and campus events will appear here when they are available to your account.";
      empty.append(heading, description);
      list.appendChild(empty);
    } else {
      filtered.forEach(item => {
        const card = document.createElement("article");
        card.className = "campus-inbox-item campus-inbox-item-" + item.type;
        const meta = document.createElement("div");
        meta.className = "campus-inbox-item-top";
        const type = document.createElement("span");
        type.className = "campus-inbox-type";
        type.textContent = item.type === "notice" ? "University notice" : item.type === "class" ? "Class update" : "Campus event";
        const time = document.createElement("time");
        const parsed = validDate(item.date);
        if (parsed) time.dateTime = parsed.toISOString();
        time.textContent = item.dateLabel;
        meta.append(type, time);

        const title = document.createElement("h3");
        title.textContent = item.title;
        const source = document.createElement("p");
        source.className = "campus-inbox-source";
        source.textContent = item.source + (item.category ? " · " + item.category : "");
        const body = document.createElement("p");
        body.className = "campus-inbox-body";
        body.textContent = item.body || "Open the relevant campus area to view the full update.";
        const actions = document.createElement("div");
        actions.className = "campus-inbox-item-actions";
        const open = document.createElement("button");
        open.type = "button";
        open.className = "btn secondary";
        open.dataset.page = item.destination;
        open.textContent = item.destination === "noticeboard" ? "Open noticeboard" : item.destination === "classroom" ? "Open classroom" : "View events";
        actions.appendChild(open);
        card.append(meta, title, source, body, actions);
        list.appendChild(card);
      });
    }

    document.querySelectorAll("[data-inbox-filter]").forEach(button => {
      const active = button.dataset.inboxFilter === activeFilter;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    status.textContent = lastLoadAt
      ? "Updated " + new Intl.DateTimeFormat(undefined, { hour:"numeric", minute:"2-digit" }).format(lastLoadAt)
      : "Your inbox has not been refreshed yet.";
  }

  async function load(options = {}) {
    if (!ensurePage()) return;
    ensureStylesheet();
    if (loading && !options.force) return;
    loading = true;
    const status = $("campus-inbox-status");
    const list = $("campus-inbox-list");
    if (status) status.textContent = "Refreshing campus notices, class updates and events…";
    if (list) list.setAttribute("aria-busy", "true");
    try {
      const result = await collect();
      items = result.items;
      lastLoadAt = new Date();
      render();
      if (status) status.textContent = result.failures.length
        ? "Some campus sources could not be refreshed. Available updates are still shown; try again later."
        : items.length ? "Your campus inbox is up to date." : "No authorised updates are available yet. New published campus information will appear here.";
    } catch (error) {
      if (status) status.textContent = error?.message || "Your inbox could not be loaded. Try again.";
      if (list && !list.children.length) {
        const empty = document.createElement("p");
        empty.className = "campus-inbox-empty";
        empty.textContent = "Sign in with your campus account to load authorised updates.";
        list.appendChild(empty);
      }
    } finally {
      loading = false;
      if (list) list.setAttribute("aria-busy", "false");
    }
  }

  function bindEvents() {
    const page = $("page-inbox");
    if (!page || page.dataset.inboxEventsBound === "true") return;
    page.dataset.inboxEventsBound = "true";
    page.addEventListener("click", event => {
      const filter = event.target.closest("[data-inbox-filter]");
      if (filter) {
        activeFilter = filter.dataset.inboxFilter || "all";
        render();
        return;
      }
      if (event.target.closest("#campus-inbox-refresh")) void load({ force:true });
    });
    $("campus-inbox-search")?.addEventListener("input", render);
  }

  function mount() {
    if (mounted) return;
    ensureStylesheet();
    ensurePage();
    bindEvents();
    mounted = true;
  }

  window.CampusShieldInbox = { mount, load };
})();