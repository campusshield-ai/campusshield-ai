import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const index = read("../index.html");
const app = read("../campusshield-app.js");
const guide = read("../campusshield-guide.js");
const css = read("../campusshield-guide.css");
const help = read("../help.html");
const offline = read("../offline.html");

new vm.Script(guide, { filename: "campusshield-guide.js" });
assert.match(index, /<button data-page="guide" id="guide-nav" title="How to use CampusShield" aria-label="How to use CampusShield"/);
const gettingStartedIndex = index.indexOf('<div class="nav-section-label">GETTING STARTED</div>');
const guideNavIndex = index.indexOf('<button data-page="guide" id="guide-nav"');
const safetyNavIndex = index.indexOf('<div class="nav-section-label">SAFETY & RESPONSE</div>');
const supportNavIndex = index.indexOf('<div class="nav-section-label">INSIGHTS & SUPPORT</div>');
assert.ok(gettingStartedIndex >= 0 && gettingStartedIndex < guideNavIndex && guideNavIndex < safetyNavIndex,
  "The guide must have its own Getting Started section above the feature groups.");
assert.ok(guideNavIndex < supportNavIndex,
  "The guide must not be hidden inside Insights & Support.");
assert.match(app, /button\.dataset\.page === 'guide'[\s\S]*?button\.hidden = false/,
  "The guide navigation must remain visible to every signed-in account role.");
assert.match(index, /mobile-topbar-help" data-page="guide"/);
assert.match(index, /id="page-guide"[^>]*aria-labelledby="guide-title"/);
assert.match(index, /campusshield-guide\.css/);
assert.match(index, /campusshield-guide\.js/);
assert.match(app, /guide:'How to use CampusShield'/);

for (const token of [
  "Your first four steps",
  "Report an incident",
  "CampusPulse, groups, events and Lost & Found",
  "Ideas &amp; Impact",
  "Timetable, courses and study resources",
  "ShieldMind AI",
  "Campus Chat, private messages and voice notes",
  "Install CampusShield on your phone",
  "Teacher, security and administrator tools",
  "Immediate danger?"
]) assert.ok(index.includes(token), "Missing live-app guide topic: " + token);

const guideStart = index.indexOf('id="page-guide"');
const guideEnd = index.indexOf('<section class="page" id="page-shieldmind">', guideStart);
const guideSection = index.slice(guideStart, guideEnd);
assert.ok(guideSection.length > 1000, "Guide page must be inserted before ShieldMind.");
assert.doesNotMatch(guideSection, /CampusMap|campus-map/i,
  "Production guide must not advertise the Staging-only CampusMap module.");
for (const topic of ["safety","campus","learning","account","staff"]) {
  assert.ok(index.includes('data-guide-topic="' + topic + '"'), "Missing guide card topic: " + topic);
  assert.ok(index.includes('data-guide-filter="' + topic + '"'), "Missing guide filter: " + topic);
}
assert.match(guide, /toLocaleLowerCase/);
assert.match(guide, /card\.hidden = !visible/);
assert.match(guide, /aria-pressed/);
assert.match(css, /@media\(max-width:680px\)/);
assert.match(css, /prefers-reduced-motion:reduce/);
assert.match(css, /data-theme="dark"/);

for (const token of [
  "Create an account",
  "Report and follow up on an incident",
  "CampusPulse",
  "Ideas & Impact",
  "ShieldMind AI",
  "Install CampusShield on your device",
  "does not automatically call"
]) assert.ok(help.includes(token), "Missing public Help Centre content: " + token);
assert.doesNotMatch(help, /CampusMap|campus-map/i);
assert.match(help, /footer nav a\{display:inline-flex[^}]*min-height:32px/);
assert.match(offline, /No incident reports or sign-in details are saved for offline use/i);
assert.match(help, /Privacy Policy/);
assert.match(help, /Terms of Use/);
console.log("Production CampusShield in-app guide and Help Centre checks passed.");
