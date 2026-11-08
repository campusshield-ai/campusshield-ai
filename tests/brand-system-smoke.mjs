import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const brand = read("campusshield-brand-system.css");
const manifest = JSON.parse(read("manifest.webmanifest"));
const pages = [
  "index.html","about.html","features.html","help.html","privacy.html",
  "terms.html","contact.html","offline.html","student-life-preview.html"
];
for (const page of pages) {
  const html = read(page);
  assert.ok(html.includes('href="./campusshield-brand-system.css"'), page + " loads the shared Atlantic Emerald theme");
  assert.match(html, /<meta name="theme-color" content="#0B2832">/i, page + " exposes the matching browser theme colour");
}
assert.ok(brand.includes("--cs-night:#071F28"), "The midnight blue-green foundation is defined");
assert.ok(brand.includes("--cs-primary:#0A7E83"), "The ocean-teal action colour is defined");
assert.ok(brand.includes("--cs-seafoam:#81E5D0"), "The seafoam accent is defined");
assert.ok(brand.includes("--cs-lime:#D9EF78"), "The restrained lime highlight is defined");
assert.match(brand, /html\[data-theme="dark"\]/, "A corresponding dark-mode palette is defined");
assert.ok(brand.includes("#login-screen .login-intro"), "The sign-in hero receives the Atlantic Emerald treatment");
assert.ok(brand.includes("#workspace #page-dashboard .campus-dashboard-hero"), "Legacy dashboard hero colours are explicitly overridden");
assert.match(brand, /#page-shieldmind \\.shieldmind-insights-panel[\\s\\S]*?linear-gradient/, "ShieldMind learning insights retain their custom dark-mode gradient");
assert.match(brand, /prefers-reduced-motion:\s*reduce/, "Reduced-motion preferences are respected");
assert.match(brand, /campus-map-nearby-safety/, "CampusMap nearby-safety components share the new palette");
assert.match(brand, /mobile-bottom-nav/, "Mobile navigation shares the new palette");
assert.equal(manifest.theme_color, "#0B2832", "The PWA theme colour matches the site");
assert.equal(manifest.background_color, "#F5F8F7", "The PWA canvas matches the site");
for (const asset of ["icons/campusshield.svg","assets/campusshield-logo.svg"]) {
  const svg = read(asset);
  assert.ok(svg.includes("#071F28") && svg.includes("#81E5D0"), asset + " matches the revised identity");
}
assert.ok(read("index.html").indexOf("campusshield-brand-system.css") > read("index.html").indexOf("campusshield-guide.css"),
  "The shared brand override loads after the existing workspace styles");
console.log("CampusShield Atlantic Emerald brand-system checks passed.");
