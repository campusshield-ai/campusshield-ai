/* CampusShield AI — Campus Home.
   A single launchpad for the university experience. It reuses existing routes
   and the private timetable's read-only dashboard snapshot; it does not make
   independent data permissions or add duplicate campus records. */
(() => {
  "use strict";

  let mounted = false;
  const $ = id => document.getElementById(id);

  function ensureStylesheet() {
    if (document.querySelector('link[data-campus-home-style="true"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "./campusshield-campus-home.css?v=20261114-1";
    link.dataset.campusHomeStyle = "true";
    document.head.appendChild(link);
  }

  function button(page, label, extraClass = "") {
    const action = document.createElement("button");
    action.type = "button";
    action.className = "campus-home-action " + extraClass;
    action.dataset.page = page;
    action.textContent = label;
    return action;
  }

  function makeGroup(title, subtitle, actions, icon) {
    const card = document.createElement("article");
    card.className = "campus-home-group";
    const head = document.createElement("div");
    head.className = "campus-home-group-head";
    const mark = document.createElement("span");
    mark.className = "campus-home-group-icon";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = icon;
    const copy = document.createElement("div");
    const heading = document.createElement("h3");
    heading.textContent = title;
    const description = document.createElement("p");
    description.textContent = subtitle;
    copy.append(heading, description);
    head.append(mark, copy);
    const actionList = document.createElement("div");
    actionList.className = "campus-home-group-actions";
    actions.forEach(item => actionList.appendChild(button(item.page, item.label)));
    card.append(head, actionList);
    return card;
  }

  function ensureHub() {
    const dashboard = $("page-dashboard");
    const anchor = $("campus-dashboard-panel");
    if (!dashboard || !anchor) return null;
    let hub = $("campus-home-hq");
    if (hub) return hub;

    hub = document.createElement("section");
    hub.id = "campus-home-hq";
    hub.className = "panel campus-home-hq";
    hub.setAttribute("aria-labelledby", "campus-home-hq-title");

    const header = document.createElement("div");
    header.className = "campus-home-hq-header";
    const eyebrow = document.createElement("span");
    eyebrow.className = "campus-home-hq-eyebrow";
    eyebrow.textContent = "YOUR UNIVERSITY · ONE HOME";
    const title = document.createElement("h2");
    title.id = "campus-home-hq-title";
    title.textContent = "One campus. Everything that matters.";
    const intro = document.createElement("p");
    intro.textContent = "Move between learning, student life, university services and safety without hunting through separate apps.";
    header.append(eyebrow, title, intro);

    const groups = document.createElement("div");
    groups.className = "campus-home-hq-grid";
    groups.append(
      makeGroup("Learn & prepare", "Your timetable, courses and study support.", [
        { page:"timetable", label:"My timetable" },
        { page:"courses", label:"Courses & resources" },
        { page:"classroom", label:"Classrooms" },
        { page:"shieldmind", label:"ShieldMind AI" }
      ], "▤"),
      makeGroup("Connect & discover", "Find people, campus activities and opportunities.", [
        { page:"community", label:"CampusPulse" },
        { page:"groups", label:"Study & interest groups" },
        { page:"events", label:"Events" },
        { page:"marketplace", label:"Marketplace" },
        { page:"opportunities", label:"Opportunities" }
      ], "◎"),
      makeGroup("Services & support", "Find trusted information and get help.", [
        { page:"helpdesk", label:"Campus Helpdesk" },
        { page:"campus-contacts", label:"University services" },
        { page:"noticeboard", label:"Verified notices" },
        { page:"campus-map", label:"CampusMap" }
      ], "⌂"),
      makeGroup("Safety & my space", "Keep safety, rewards and personal settings close.", [
        { page:"report", label:"Report an incident" },
        { page:"student-rewards", label:"Challenges & rewards" },
        { page:"profile-settings", label:"My profile" },
        { page:"studio", label:"My Campus Studio" }
      ], "✦")
    );

    const today = document.createElement("section");
    today.className = "campus-home-today";
    today.setAttribute("aria-labelledby", "campus-home-today-title");
    const todayHeader = document.createElement("div");
    todayHeader.className = "campus-home-today-header";
    const todayCopy = document.createElement("div");
    const todayEyebrow = document.createElement("span");
    todayEyebrow.className = "campus-home-hq-eyebrow";
    todayEyebrow.textContent = "YOUR PERSONAL PLAN";
    const todayTitle = document.createElement("h3");
    todayTitle.id = "campus-home-today-title";
    todayTitle.textContent = "Today at your university";
    const todayDescription = document.createElement("p");
    todayDescription.textContent = "Your private timetable and published campus events, together.";
    todayCopy.append(todayEyebrow, todayTitle, todayDescription);
    todayHeader.append(todayCopy, button("timetable", "Open my day", "is-primary"));
    const feed = document.createElement("div");
    feed.id = "campus-home-today-feed";
    feed.className = "campus-home-today-feed";
    const status = document.createElement("p");
    status.id = "campus-home-today-status";
    status.className = "campus-home-today-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.textContent = "Syncing your private timetable…";
    today.append(todayHeader, feed, status);

    hub.append(header, groups, today);
    anchor.insertAdjacentElement("afterend", hub);
    return hub;
  }

  function timeLabel(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return new Intl.DateTimeFormat(undefined, { hour:"numeric", minute:"2-digit" }).format(date);
  }

  function renderToday() {
    const feed = $("campus-home-today-feed");
    const status = $("campus-home-today-status");
    if (!feed || !status) return;

    const snapshot = window.CampusShieldTimetable?.getTodaySnapshot?.();
    feed.replaceChildren();

    if (!snapshot?.loaded) {
      status.textContent = "Your timetable is syncing. Your private schedule will appear here when it is ready.";
      const loading = document.createElement("p");
      loading.className = "campus-home-today-empty";
      loading.textContent = "Loading today's classes, reminders and campus events…";
      feed.appendChild(loading);
      return;
    }

    const items = Array.isArray(snapshot.items) ? snapshot.items.slice(0, 5) : [];
    if (!items.length) {
      status.textContent = "Your timetable is synced.";
      const empty = document.createElement("div");
      empty.className = "campus-home-today-empty";
      const message = document.createElement("p");
      message.textContent = "Nothing is scheduled for today yet. Add a class, reminder or study session to your private timetable.";
      empty.appendChild(message);
      empty.appendChild(button("timetable", "Add to my timetable", "is-primary"));
      feed.appendChild(empty);
      return;
    }

    items.forEach(item => {
      const row = document.createElement("article");
      row.className = "campus-home-today-item" + (item.completed ? " is-completed" : "");
      const time = document.createElement("time");
      time.textContent = timeLabel(item.startsAt) || "Time not set";
      const copy = document.createElement("div");
      const heading = document.createElement("strong");
      heading.textContent = String(item.title || "Timetable item");
      const meta = document.createElement("p");
      meta.textContent = [
        item.label || "Schedule item",
        item.courseCode || "",
        item.location || ""
      ].filter(Boolean).join(" · ");
      copy.append(heading, meta);
      row.append(time, copy);
      if (item.completed) {
        const done = document.createElement("span");
        done.className = "campus-home-today-done";
        done.textContent = "Completed";
        row.appendChild(done);
      } else if (item.kind === "event") {
        const event = document.createElement("span");
        event.className = "campus-home-today-tag";
        event.textContent = "Event";
        row.appendChild(event);
      }
      feed.appendChild(row);
    });

    status.textContent = items.length + (items.length === 1 ? " item" : " items") + " in today's schedule.";
  }

  function clearToday() {
    const feed = $("campus-home-today-feed");
    const status = $("campus-home-today-status");
    if (feed) {
      feed.replaceChildren();
      const message = document.createElement("p");
      message.className = "campus-home-today-empty";
      message.textContent = "Sign in to see your private timetable and today's campus plan.";
      feed.appendChild(message);
    }
    if (status) status.textContent = "Your personal schedule is hidden while signed out.";
  }

  function load() {
    ensureStylesheet();
    ensureHub();
    renderToday();
  }

  function mount() {
    if (mounted) return;
    ensureStylesheet();
    ensureHub();
    window.addEventListener("campusshield:timetable-updated", renderToday);
    window.addEventListener("campusshield:profile-ready", load);
    window.addEventListener("campusshield:profile-cleared", clearToday);
    window.addEventListener("campusshield:session-signed-out", clearToday);
    mounted = true;
    renderToday();
  }

  window.CampusShieldCampusHome = { mount, load };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once:true });
  } else {
    mount();
  }
})();