import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const script = await readFile(new URL("../campusshield-launch-intro.js", import.meta.url), "utf8");
const styles = await readFile(new URL("../campusshield-launch-intro.css", import.meta.url), "utf8");

assert.ok(html.includes('href="./campusshield-launch-intro.css?v=20261112-2"'), "launch intro stylesheet is linked");
assert.ok(html.includes('src="./campusshield-launch-intro.js?v=20261112-2"'), "launch intro script is linked");
assert.ok(html.indexOf('src="./campusshield-launch-intro.js?v=20261112-2"') < html.indexOf("</head>"), "intro bootstrap runs before app scripts");
assert.ok(html.includes("</body>"), "app document remains complete");
assert.ok(script.includes('storage.getItem(STORAGE_KEY)'), "launch history is persisted");
assert.ok(script.includes("function localDateKey(date)"), "weekly schedule uses a device-local calendar date");
assert.ok(script.includes("today.getDay() !== 1"), "weekly intro is Monday-only");
assert.ok(script.includes('lastMondayShown(record) !== localDateKey(today)'), "intro is shown at most once per local Monday");
assert.ok(script.includes("function firstShownAt(record)"), "first-launch history is preserved");
assert.ok(script.includes("record.firstShownAt ?? record.completedAt"), "legacy launch records remain compatible");
assert.ok(script.includes("record.lastMondayShown"), "Monday completion is persisted");
assert.ok(script.includes('window.matchMedia("(prefers-reduced-motion: reduce)")'), "reduced-motion preference is respected");
assert.ok(script.includes('event.key === "Escape"'), "Escape skips the intro");
assert.ok(script.includes('event.key === "Tab"'), "keyboard focus stays within the intro");
assert.ok(script.includes('skipButton.addEventListener("click"'), "visible skip control is wired");
assert.ok(script.includes('query.get("password-reset") === "1"'), "password recovery bypasses the intro");
assert.ok(script.includes("overlay.remove()"), "intro is removed after completion");
assert.ok(!script.includes("CampusShieldBackend"), "intro does not call the backend");
assert.ok(!script.includes("supabase"), "intro does not change Supabase sessions or data");
assert.ok(styles.includes("@media (max-width: 520px)"), "mobile layout is included");
assert.ok(styles.includes("@media (prefers-reduced-motion: reduce)"), "reduced-motion styling is included");
assert.ok(styles.includes(".is-leaving"), "completion transition is defined");
assert.ok(!script.includes("Get Started"), "intro does not add an extra onboarding screen");

console.log("CampusShield first-launch + Monday intro smoke checks passed.");
