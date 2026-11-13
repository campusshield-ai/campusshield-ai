import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../campusshield-app.js", import.meta.url), "utf8");

const rendererStart = app.indexOf("      function renderAlerts() {", app.indexOf("async function loadProfileSettingsAlerts"));
const rendererEnd = app.indexOf("\n      if (filterGroup) {", rendererStart);
assert.ok(rendererStart >= 0 && rendererEnd > rendererStart, "Helpdesk alert renderer exists");
const renderer = app.slice(rendererStart, rendererEnd);

assert.match(html, /id="profile-settings-alert-filters"[^>]*role="group"/, "Helpdesk alerts expose an accessible filter group");
assert.match(html, /data-alert-filter="all"[^>]*aria-pressed="true"/, "All is the default filter");
assert.match(html, /data-alert-filter="unread"[^>]*aria-pressed="false"/, "Unread filter is available");
assert.match(html, /data-alert-count="all"/, "All filter has a live total count");
assert.match(html, /data-alert-count="unread"/, "Unread filter has a live unread count");
assert.match(html, /Helpdesk activity/, "The card accurately identifies its data source");

assert.match(renderer, /activeFilter === 'unread'/, "Unread view filters to unread helpdesk alerts");
assert.match(renderer, /setAttribute\('aria-pressed'/, "Filter state is exposed to assistive technology");
assert.match(renderer, /readIds\.delete\(row\.id\)/, "Read alerts can be marked unread");
assert.match(renderer, /readIds\.add\(row\.id\)/, "Unread alerts can be marked read");
assert.match(renderer, /data-alert-toggle-id/, "Individual read controls have stable row identity");
assert.match(renderer, /You’re all caught up/, "The filtered empty state is present");
assert.match(renderer, /Staff update/, "Updates are labelled by their real Helpdesk event type");
assert.match(renderer, /New Helpdesk request/, "Admin request alerts are labelled accurately");
assert.match(renderer, /open\.dataset\.page = 'helpdesk'/, "Opening an alert routes to the existing Helpdesk page");

assert.match(app, /campusshield\.profile-alerts\.v1\./, "Read state remains scoped by the existing per-user storage key");
assert.match(app, /campusContext\?\.university_id/, "Read state remains scoped by university");
assert.match(app, /backend\.listCampusHelpdeskTickets\(\)/, "Alerts still use the existing Helpdesk records");
assert.match(app, /backend\.listCampusHelpdeskTicketUpdates\(/, "Student updates still use the existing Helpdesk update records");

console.log("Profile Helpdesk Alert Center smoke checks passed.");
