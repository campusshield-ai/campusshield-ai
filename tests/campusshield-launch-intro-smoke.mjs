import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const script = await readFile(new URL("../campusshield-launch-intro.js", import.meta.url), "utf8");
const styles = await readFile(new URL("../campusshield-launch-intro.css", import.meta.url), "utf8");

assert.ok(html.includes('href="./campusshield-launch-intro.css"'), "launch intro stylesheet is linked");
assert.ok(html.includes('src="./campusshield-launch-intro.js"'), "launch intro script is linked");
assert.ok(html.indexOf('src="./campusshield-launch-intro.js"') < html.indexOf("</head>"), "intro bootstrap runs before app scripts");
assert.ok(html.includes("</body>"), "app document remains complete");
assert.ok(script.includes('localStorage.getItem(STORAGE_KEY)'), "launch history is persisted");
assert.ok(script.includes("REPEAT_AFTER_MS = 45 * 24 * 60 * 60 * 1000"), "repeat interval is 45 days");
assert.ok(script.includes("MIN_UPDATE_GAP_MS = 30 * 24 * 60 * 60 * 1000"), "major update repeats observe the 30-day minimum");
assert.ok(script.includes('window.matchMedia("(prefers-reduced-motion: reduce)")'), "reduced-motion preference is respected");
assert.ok(script.includes('event.key === "Escape"'), "Escape skips the intro");
assert.ok(script.includes('skipButton.addEventListener("click"'), "visible skip control is wired");
assert.ok(script.includes('query.get("password-reset") === "1"'), "password recovery bypasses the intro");
assert.ok(script.includes('overlay.remove()'), "intro is removed after completion");
assert.ok(!script.includes("CampusShieldBackend"), "intro does not call the backend");
assert.ok(!script.includes("supabase"), "intro does not change Supabase sessions or data");
assert.ok(styles.includes("@media (max-width: 520px)"), "mobile layout is included");
assert.ok(styles.includes("@media (prefers-reduced-motion: reduce)"), "reduced-motion styling is included");
assert.ok(styles.includes(".is-leaving"), "completion transition is defined");
assert.ok(!script.includes("Get Started"), "intro does not add an extra onboarding screen");

console.log("CampusShield launch intro smoke checks passed.");
