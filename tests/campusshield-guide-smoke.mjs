import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const index = read("../index.html");
const featureLoader = read("../campusshield-feature-loader.js");
const app = read("../campusshield-app.js");
const guide = read("../campusshield-guide.js");
const css = read("../campusshield-guide.css");
const help = read("../help.html");

new vm.Script(guide, { filename: "campusshield-guide.js" });

assert.match(index, /<section class="page campus-guide-page" id="page-guide"/);
assert.match(index, /<h1 id="guide-title">How CampusShield Works<\/h1>/);
assert.match(index, /id="guide-search-input" type="search"/);
assert.match(index, /id="guide-results" role="status" aria-live="polite"/);
assert.match(index, /id="guide-no-results" hidden/);
assert.match(index, /data-guide-filter="all"/);
assert.match(index, /data-guide-filter="safety"/);
assert.match(index, /href="\.\/help\.html"/);
assert.match(index, /href="\.\/campusshield-guide\.css"/);
assert.match(featureLoader, /guide:\s*\{[\s\S]*?campusshield-guide\.js/);
assert.ok((index.match(/data-guide-card/g) || []).length >= 10, "Guide should contain at least ten searchable feature cards");
assert.match(app, /guide:\s*['"]How to use CampusShield['"]/);
assert.match(guide, /search\?\.addEventListener\(["']input["']/);
assert.match(guide, /button\.addEventListener\(["']click["']/);
assert.match(guide, /aria-pressed/);
assert.match(guide, /noResults\.hidden = visibleCount !== 0/);
assert.match(css, /@media\(max-width:680px\)/);
assert.match(css, /prefers-reduced-motion:reduce/);
assert.match(css, /html\[data-theme=["']dark["']\]/);
assert.match(help, /<title>How CampusShield Works \| Help Centre<\/title>/);
assert.match(help, /<h1>How CampusShield Works<\/h1>/);
assert.match(help, /Contact support/i);

console.log("CampusShield guide and Help Centre smoke checks passed.");
