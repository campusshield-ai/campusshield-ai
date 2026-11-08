import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const html = read("../index.html");
const dashboard = read("../campus-dashboard-upgrade.js");
const discovery = read("../campus-discovery-ui.js");
const app = read("../campusshield-app.js");

new vm.Script(dashboard, { filename: "campus-dashboard-upgrade.js" });
new vm.Script(discovery, { filename: "campus-discovery-ui.js" });
new vm.Script(app, { filename: "campusshield-app.js" });

assert.match(html, /campus-discovery-ui\.js/);
assert.match(dashboard, /getLiveCampusMatches/);
assert.match(dashboard, /campus-marketplace-feed article/);
assert.match(dashboard, /campus-opportunities-feed article/);
assert.match(dashboard, /campus-volunteer-feed article/);
assert.match(dashboard, /Alumni Connect/);
assert.match(dashboard, /campus-dashboard-quicklinks/);

for (const id of [
  "campus-marketplace-search", "campus-marketplace-category-filter",
  "campus-marketplace-status-filter", "campus-marketplace-sort",
  "campus-marketplace-results", "campus-opportunities-search",
  "campus-opportunities-category-filter", "campus-opportunities-sort",
  "campus-opportunities-results"
]) assert.ok(discovery.includes(id), "Missing discovery control: " + id);

const groupRendererStart = app.indexOf("$('campus-groups-feed').innerHTML = visibleGroups");
const marketRendererStart = app.indexOf("$('campus-marketplace-feed').innerHTML = listings");
assert.ok(groupRendererStart >= 0 && marketRendererStart > groupRendererStart, "Expected campus group and marketplace renderers");
const groupRenderer = app.slice(groupRendererStart, marketRendererStart);
const marketplaceRenderer = app.slice(marketRendererStart, app.indexOf("async function loadCampusClassroomsPage", marketRendererStart));
assert.doesNotMatch(groupRenderer, /listing\\./, "Campus group renderer must not reference Marketplace listing records");
assert.doesNotMatch(groupRenderer, /campus-live-marketplace-card/, "Campus group cards must not carry Marketplace-only metadata");
assert.match(marketplaceRenderer, /campus-live-marketplace-card/, "Marketplace cards need discovery metadata");
assert.match(app, /campus-live-opportunity-card/);
assert.match(discovery, /filter only cards already rendered/);
console.log("Campus discovery usability smoke checks passed.");
