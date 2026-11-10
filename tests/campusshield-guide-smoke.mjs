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
const guideAccessIndex = index.indexOf('<div class="sidebar-guide-access" id="sidebar-guide-access">');
const guideSectionIndex = index.indexOf('<div class="nav-section-label">GETTING STARTED</div>');
const guideButtonIndex = index.indexOf('<button data-page="guide" id="guide-nav"');
const navStartIndex = index.indexOf('<nav class="nav">');
const safetySectionIndex = index.indexOf('<div class="nav-section-label">SAFETY & RESPONSE</div>');
const supportSectionIndex = index.indexOf('<div class="nav-section-label">INSIGHTS & SUPPORT</div>');
assert.ok(guideAccessIndex >= 0 && guideAccessIndex < navStartIndex,
  "The Getting Started guide must be outside the independently scrollable feature navigation");
assert.ok(guideAccessIndex < guideSectionIndex && guideSectionIndex < guideButtonIndex && guideButtonIndex < navStartIndex,
  "The pinned block must contain its Getting Started label and guide link before the feature navigation");
assert.match(index, /<div class="sidebar-guide-access" id="sidebar-guide-access">\s*<div class="nav-section-label">GETTING STARTED<\/div>\s*<button data-page="guide" id="guide-nav"[^>]*>[\s\S]*?How to use CampusShield<\/button>\s*<\/div>\s*<nav class="nav">\s*<div class="nav-section-label">SAFETY & RESPONSE<\/div>/,
  "The pinned Getting Started block must appear immediately before the scrollable feature menu");
assert.ok(safetySectionIndex > navStartIndex && supportSectionIndex > safetySectionIndex,
  "Feature sections must remain inside the scrollable navigation");
assert.equal((index.match(/id="guide-nav"/g) || []).length, 1,
  "There must be exactly one guide navigation button");
assert.doesNotMatch(index.slice(navStartIndex, supportSectionIndex), /id="guide-nav"/,
  "The guide must not be nested inside the scrollable feature list");
assert.match(app, /button\.dataset\.page === 'guide'[\s\S]*?button\.hidden = false/,
  "The guide remains visible regardless of a user's campus verification or role");
assert.match(app, /querySelectorAll\('\.nav button\[data-page\], \.sidebar-guide-access button\[data-page\]'\)/,
  "Role-based navigation synchronization must include the pinned guide outside the scrollable menu");
assert.match(app, /e\.target\.closest\('\[data-page\]'\)/,
  "The pinned guide continues to use the shared delegated page-navigation handler");
assert.doesNotMatch(index, /mobile-topbar-help/, "The mobile top bar must not duplicate the dedicated sidebar guide link");
assert.match(index, /id="page-guide"[\s\S]*?aria-labelledby="guide-title"/);
assert.match(index, /campusshield-guide\.css/);
assert.match(index, /campusshield-guide\.js/);
assert.match(app, /guide:'How to use CampusShield'/);

assert.match(index, /id="guide-walkthrough"[^>]*aria-labelledby="guide-walkthrough-title"/,
  "The in-app guide contains an accessible interactive walkthrough area");
for (const journey of ["setup","safety","discover","study","map","mobile"]) {
  assert.ok(index.includes('data-guide-journey="' + journey + '"'), "Missing guided walkthrough: " + journey);
}
for (const id of ["guide-walkthrough-step-count","guide-walkthrough-completion","guide-walkthrough-progress","guide-walkthrough-step-title","guide-walkthrough-step-description","guide-walkthrough-open","guide-walkthrough-complete","guide-walkthrough-previous","guide-walkthrough-next"]) {
  assert.ok(index.includes('id="' + id + '"'), "Missing guided walkthrough control: " + id);
}
assert.match(index, /id="guide-install-details"/, "The mobile walkthrough links to the actual install instructions");
assert.match(guide, /const journeys = \[/, "The guide defines supported task walkthroughs");
assert.match(guide, /function renderWalkthrough\(/, "The guide renders the selected walkthrough step");
assert.match(guide, /completedByJourney/, "Completion progress is kept separately for each journey");
assert.match(guide, /availablePage\(step\.page\)/, "Walkthrough links are shown only when the destination exists");
assert.match(guide, /guide-install-details/, "The mobile walkthrough opens the real installation instructions");
assert.match(css, /guide-walkthrough-layout/, "Guided walkthrough layout styling is loaded");
assert.match(css, /@media\(max-width:480px\)/, "Guided walkthrough controls reflow on narrow phones");


for (const token of [
  "Your first four steps",
  "Report an incident",
  "CampusPulse, groups, events and Lost & Found",
  "Ideas & Impact",
  "CampusMap",
  "Timetable, courses and study resources",
  "ShieldMind AI",
  "Campus Chat, private messages and voice notes",
  "Install CampusShield on your phone",
  "Teacher, security and administrator tools",
  "Immediate danger?"
]) assert.ok(index.includes(token), "Missing in-app guide topic: " + token);

for (const topic of ["safety","campus","learning","account","staff"]) {
  assert.ok(index.includes('data-guide-topic="' + topic + '"'), "Missing guide topic filter: " + topic);
  assert.ok(index.includes('data-guide-filter="' + topic + '"'), "Missing guide filter button: " + topic);
}
assert.match(index, /aria-pressed="true"/);
assert.match(index, /aria-live="polite"/);
assert.match(index, /target="_blank" rel="noopener noreferrer"/);

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
  "CampusMap",
  "ShieldMind AI",
  "Install CampusShield on your device",
  "does not automatically call"
]) assert.ok(help.includes(token), "Missing public Help Centre content: " + token);

assert.match(offline, /No incident reports or sign-in details are saved while you are offline/i);
assert.match(help, /Privacy Policy/);
assert.match(help, /Terms of Use/);
console.log("CampusShield in-app guide and public Help Centre checks passed.");
