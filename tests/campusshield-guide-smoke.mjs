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
assert.match(index, /id="guide-nav"[\s\S]*?data-page="guide"/);
assert.match(index, /mobile-topbar-help" data-page="guide"/);
assert.match(index, /id="page-guide"[\s\S]*?aria-labelledby="guide-title"/);
assert.match(index, /campusshield-guide\.css/);
assert.match(index, /campusshield-guide\.js/);
assert.match(app, /guide:'How to use CampusShield'/);

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

assert.match(offline, /does not store reports for offline use/i);
assert.match(help, /Privacy Policy/);
assert.match(help, /Terms of Use/);
console.log("CampusShield in-app guide and public Help Centre checks passed.");
