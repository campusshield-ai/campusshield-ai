import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const html = read("index.html");
const js = read("campusshield-theme.js");
const css = read("campusshield-theme.css");

assert.match(html, /id="campusshield-theme-toggle"/, "Theme switch is present in the workspace header");
assert.match(html, /campusshield-theme\.js/, "Theme preference handler is loaded");
assert.match(html, /campusshield-theme\.css/, "Theme styles are loaded");
assert.match(html, /data-theme-icon="sun"/, "Sun icon is available");
assert.match(html, /data-theme-icon="moon"/, "Moon icon is available");

assert.match(js, /prefers-color-scheme:\s*dark/, "First visit follows the device colour preference");
assert.match(js, /localStorage\.getItem\(STORAGE_KEY\)/, "Saved theme preference is restored");
assert.match(js, /localStorage\.setItem\(STORAGE_KEY/, "Manual theme choice is persisted");
assert.match(js, /setAttribute\("data-theme", theme\)/, "The selected theme is applied globally");
assert.match(js, /aria-label/, "Theme switch exposes an accessible action label");
assert.match(js, /addEventListener\("storage"/, "Theme preference synchronises across tabs");

assert.match(css, /color-scheme:\s*dark/, "Dark theme updates native controls and browser form UI");
assert.match(css, /--bg:\s*#0b171b/, "Dark theme uses the CampusShield dark surface palette");
assert.match(css, /grid-template-areas:[\s\S]*"brand theme menu"/, "Mobile header reserves a visible theme control");
assert.match(css, /@media\s*\(max-width:\s*650px\)/, "Theme control has a mobile layout");
assert.match(css, /focus-visible/, "Theme control has a visible keyboard focus state");

console.log("CampusShield theme toggle and mobile colour-mode smoke checks passed.");
