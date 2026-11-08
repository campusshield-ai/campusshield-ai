import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const html = read("../index.html");
const dashboard = read("../campus-dashboard-upgrade.js");
const discovery = read("../campus-discovery-ui.js");
const app = read("../campusshield-app.js");
const timetable = read("../campus-timetable.js");

new vm.Script(dashboard, { filename: "campus-dashboard-upgrade.js" });
new vm.Script(discovery, { filename: "campus-discovery-ui.js" });
new vm.Script(app, { filename: "campusshield-app.js" });
new vm.Script(timetable, { filename: "campus-timetable.js" });

assert.match(html, /campus-discovery-ui\.js/);
assert.match(dashboard, /getLiveCampusMatches/);
assert.match(dashboard, /campus-marketplace-feed article/);
assert.match(dashboard, /campus-opportunities-feed article/);
assert.match(dashboard, /campus-volunteer-feed article/);
assert.match(dashboard, /Alumni Connect/);
assert.match(dashboard, /campus-dashboard-quicklinks/);
assert.match(dashboard, /campus-my-day/);
assert.match(dashboard, /campusshield:timetable-updated/);
assert.match(timetable, /function getTodaySnapshot/);
assert.match(timetable, /let loadSequence = 0/);
assert.match(timetable, /if \(!isCurrentRequest\(\)\) return/);
assert.match(timetable, /occurrenceForItem\(item, day\)/);
assert.match(timetable, /campusshield:timetable-updated/);
assert.match(app, /campusshield:profile-ready/);
assert.match(app, /campusshield:profile-cleared/);

for (const id of [
  "campus-marketplace-search", "campus-marketplace-category-filter",
  "campus-marketplace-status-filter", "campus-marketplace-sort",
  "campus-marketplace-results", "campus-opportunities-search",
  "campus-opportunities-category-filter", "campus-opportunities-sort",
  "campus-opportunities-results"
]) assert.ok(discovery.includes(id), "Missing discovery control: " + id);

assert.match(app, /campus-live-marketplace-card/);
assert.match(app, /campus-live-opportunity-card/);
assert.match(discovery, /filter only cards already rendered/);
console.log("Campus discovery usability smoke checks passed.");
