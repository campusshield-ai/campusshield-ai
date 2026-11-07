import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const index = read("../index.html");
const app = read("../campusshield-app.js");

const gettingStarted = index.indexOf('<div class="nav-section-label">GETTING STARTED</div>');
const guideButton = index.indexOf('<button data-page="guide" id="guide-nav"');
const safety = index.indexOf('<div class="nav-section-label">SAFETY & RESPONSE</div>');
const support = index.indexOf('<div class="nav-section-label">INSIGHTS & SUPPORT</div>');

assert.ok(gettingStarted >= 0 && gettingStarted < guideButton && guideButton < safety,
  "How to use CampusShield must have a standalone Getting Started section above all feature groups");
assert.match(index, /<div class="nav-section-label">GETTING STARTED<\/div>\s*<button data-page="guide" id="guide-nav"[^>]*>[\s\S]*?How to use CampusShield<\/button>/,
  "The standalone Getting Started item must visibly read How to use CampusShield");
assert.ok(guideButton < support,
  "The guide must not be buried inside Insights & Support");
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
console.log("Production guide sidebar navigation checks passed.");
