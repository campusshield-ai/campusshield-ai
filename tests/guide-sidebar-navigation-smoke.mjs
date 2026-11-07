import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const index = read("../index.html");
const app = read("../campusshield-app.js");

const guideAccess = index.indexOf('<div class="sidebar-guide-access" id="sidebar-guide-access">');
const gettingStarted = index.indexOf('<div class="nav-section-label">GETTING STARTED</div>');
const guideButton = index.indexOf('<button data-page="guide" id="guide-nav"');
const navStart = index.indexOf('<nav class="nav">');
const safety = index.indexOf('<div class="nav-section-label">SAFETY & RESPONSE</div>');
const support = index.indexOf('<div class="nav-section-label">INSIGHTS & SUPPORT</div>');

assert.ok(guideAccess >= 0 && guideAccess < navStart,
  "The Getting Started guide must be outside the independently scrollable feature menu");
assert.ok(guideAccess < gettingStarted && gettingStarted < guideButton && guideButton < navStart,
  "The pinned guide block must appear above the scrollable feature menu");
assert.match(index, /<div class="sidebar-guide-access" id="sidebar-guide-access">\s*<div class="nav-section-label">GETTING STARTED<\/div>\s*<button data-page="guide" id="guide-nav"[^>]*>[\s\S]*?How to use CampusShield<\/button>\s*<\/div>\s*<nav class="nav">\s*<div class="nav-section-label">SAFETY & RESPONSE<\/div>/,
  "The guide block must be pinned directly above the scrollable feature list");
assert.ok(safety > navStart && support > safety,
  "The feature sections must remain inside the scrollable feature menu");
assert.equal((index.match(/id="guide-nav"/g) || []).length, 1,
  "There must be exactly one guide navigation entry");
assert.doesNotMatch(index, /mobile-topbar-help/,
  "The guide must only appear in its dedicated sidebar section, not as a duplicate top-bar shortcut");
assert.equal((index.match(/id="guide-nav"/g) || []).length, 1,
  "There must be exactly one guide navigation entry");
assert.match(index, /id="page-guide"[\s\S]*?How CampusShield Works/,
  "The dedicated How CampusShield Works page must remain available");
assert.match(index, /id="guide-search-input"/,
  "The guide search must remain available");
assert.match(index, /data-guide-filter="all"/,
  "The guide topic filters must remain available");
assert.match(app, /button\.dataset\.page === 'guide'[\s\S]*?button\.hidden = false/,
  "The guide must remain visible to every signed-in account regardless of role or verification");
assert.match(app, /querySelectorAll\('\.nav button\[data-page\], \.sidebar-guide-access button\[data-page\]'\)/,
  "Role-based navigation synchronization must include the pinned guide outside the scrollable menu");
assert.match(app, /e\.target\.closest\('\[data-page\]'\)/,
  "The pinned guide must continue to use the shared page-navigation handler");
console.log("Production guide sidebar navigation checks passed.");
