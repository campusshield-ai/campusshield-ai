import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const readBinary = path => readFileSync(new URL("../" + path, import.meta.url));
const brand = read("campusshield-brand-system.css");
const guide = read("campusshield-guide.css");
const serviceWorker = read("service-worker.js");
const lovableUxCss = read("campusshield-lovable-ux.css");
const lovableUxScript = read("campusshield-lovable-ux.js");
const moduleExperienceCss = read("campusshield-module-experience.css");
const iconGenerator = read("scripts/generate-pwa-icons.mjs");
const manifest = JSON.parse(read("manifest.webmanifest"));
const htmlMarkup = read("index.html");
const appScript = read("campusshield-app.js");
const dashboardUpgradeJs = read("campus-dashboard-upgrade.js");
const dashboardUpgradeCss = read("campus-dashboard-upgrade.css");
const pages = [
  "index.html","about.html","features.html","help.html","privacy.html",
  "terms.html","contact.html","offline.html","student-life-preview.html"
];

for (const page of pages) {
  const html = read(page);
  assert.ok(html.includes('href="./campusshield-brand-system.css"'), page + " loads the shared Forest Green + Emerald theme");
  assert.match(html, /<meta name="theme-color" content="#0B2E1B">/i, page + " exposes the matching browser theme colour");
}


const offlinePage = read("offline.html");
assert.ok(offlinePage.includes('id="check-connection"') && offlinePage.includes('id="connection-status"'),
  "Offline page exposes working connection-check feedback");
assert.ok(offlinePage.includes('class="offline-feature-grid"') && offlinePage.includes("offline-illustration"),
  "Offline page contains the responsive campus illustration and guidance cards");
assert.doesNotMatch(offlinePage, /CampusShield is a prototype|does not contact emergency services/i,
  "Offline page omits the removed prototype disclaimer");

for (const token of [
  "--cs-navy:#0B2E1B","--cs-primary:#15803D","--cs-seafoam:#22C55E",
  "--cs-seafoam-soft:#DCFCE7","--cs-ink:#173325","--cs-muted:#53695B",
  "--cs-canvas:#F5F9F5","--cs-line:#DCE9DE"
]) assert.ok(brand.includes(token), "Brand token exists: " + token);

assert.match(brand, /html\[data-theme="dark"\]/, "A matching dark-mode palette is defined");
assert.ok(brand.includes("#login-screen .login-intro"), "The sign-in hero receives the shared palette");
assert.ok(brand.includes("#workspace #page-dashboard .campus-dashboard-hero"), "The dashboard hero receives the shared palette");
assert.ok(brand.includes("linear-gradient(125deg,#071E13 0%,#10462A 55%,#17613A 100%)"), "The dashboard hero uses a forest-green gradient, not a blue gradient");
assert.ok(brand.includes('html[data-theme="dark"] #page-shieldmind .shieldmind-insights-panel') &&
  brand.includes("background-color:#123522;") &&
  brand.includes("background-image:linear-gradient(145deg,#173D28,#0D2F1D)") &&
  brand.includes("#page-shieldmind .shieldmind-insights-eyebrow"),
  "ShieldMind learning insights retain a dedicated dark-mode gradient");
assert.match(brand, /prefers-reduced-motion:\s*reduce/, "Reduced-motion preferences are respected");
assert.match(brand, /campus-map-nearby-safety/, "CampusMap components share the brand system");

assert.ok(brand.includes("#workspace .campus-home-pulse .student-shortcut-icon") &&
  brand.includes("#workspace .campus-home-academics .student-shortcut-icon"),
  "CampusPulse and academics shortcut accents use green");
assert.ok(brand.includes("#workspace .creator-tool-mark.mark-photo") &&
  brand.includes("#workspace .creator-tool-mark.mark-rea"),
  "Creator tool photo and reading accents use green");
assert.ok(brand.includes("#page-shieldmind .shieldmind-insights-topic[data-level=\"early\"] .shieldmind-insights-progress span") &&
  brand.includes("linear-gradient(90deg,#15803D,#86EFAC)"),
  "ShieldMind early-learning progress uses the green palette");
assert.ok(brand.includes("#page-shieldmind .shieldmind-insights-topics h3") &&
  brand.includes("color:#14532D !important;"),
  "ShieldMind learning insights headings use green in light mode");
assert.ok(brand.includes("html[data-theme=\"dark\"] #page-shieldmind .shieldmind-insights-topic-name") &&
  brand.includes("color:#E5F3E8 !important;"),
  "ShieldMind learning insights headings stay readable in dark mode");
assert.ok(brand.includes("#workspace .campus-ideas-impact .cii-status-in_progress") &&
  brand.includes("#workspace .campus-voice-player"),
  "Ideas & Impact and voice-note accents use green");
assert.ok(guide.includes("--guide-ink:#173325") && guide.includes("--guide-deep:#071E13") &&
  guide.includes("background:#123522") && guide.includes("background:#0F2C1C") &&
  !guide.includes("#06223a") && !guide.includes("#1b4052"),
  "The guide light and dark palettes stay in the green family");

assert.match(brand, /mobile-bottom-nav/, "Mobile navigation shares the brand system");

assert.equal(manifest.theme_color, "#0B2E1B", "PWA theme colour matches the website");
assert.equal(manifest.background_color, "#F5F9F5", "PWA canvas matches the website");
assert.ok(manifest.icons.some(icon => icon.src === "./icons/campusshield.svg" &&
  icon.type === "image/svg+xml"), "PWA uses the scalable branded SVG icon");
assert.ok(manifest.icons.some(icon => icon.src === "./icons/campusshield-maskable-512.png" &&
  icon.purpose === "maskable"), "PWA uses the dedicated safe-area maskable icon");

assert.match(serviceWorker, /campusshield-offline-v10/, "Offline cache version is incremented for the updated module stylesheet");
assert.ok(htmlMarkup.includes('href="./campusshield-lovable-ux.css?v=20261109-1"'), "Lovable-inspired tablet and focus styles are loaded");
assert.ok(htmlMarkup.includes('href="./campusshield-module-experience.css?v=20261110-2"'), "Lovable-inspired module page styles are loaded after the navigation layer");
assert.ok(htmlMarkup.indexOf("campusshield-module-experience.css") > htmlMarkup.indexOf("campusshield-lovable-ux.css"), "Module page styling loads after the existing UX layer");
assert.match(moduleExperienceCss, /page:not\(#page-dashboard\) > \.heading/, "Feature pages share the refined module heading system");
assert.match(moduleExperienceCss, /html\[data-theme="dark"\]/, "Module page cards and headings have explicit dark-mode colours");
assert.match(moduleExperienceCss, /max-width: 760px/, "Module headers stack naturally on mobile");
assert.match(moduleExperienceCss, /prefers-reduced-motion: reduce/, "Module page motion respects reduced-motion preferences");
assert.ok(htmlMarkup.includes('src="./campusshield-lovable-ux.js" defer'), "Accessible active navigation integration is loaded");
assert.match(lovableUxCss, /min-width:\s*651px/,"tablet rail starts at 651px");
assert.match(lovableUxCss, /max-width:\s*1023px/,"tablet rail ends at 1023px");
assert.match(lovableUxScript, /aria-current/,"primary and mobile navigation announce the active page");
assert.doesNotThrow(() => new Function(lovableUxScript), "Lovable UX integration script parses");
assert.match(dashboardUpgradeJs, /role="combobox"/,"campus search exposes the combobox pattern");
assert.match(dashboardUpgradeJs, /ArrowUp/,"campus search supports upward keyboard navigation");
assert.match(dashboardUpgradeJs, /aria-activedescendant/,"campus search announces the active suggestion");
assert.match(dashboardUpgradeJs, /getTodaySnapshot/, "My Day reads the existing private timetable snapshot");
assert.match(dashboardUpgradeJs, /campus-my-day-focus/, "My Day renders a dedicated next-item focus");
assert.match(dashboardUpgradeJs, /HAPPENING NOW|UP NEXT|STILL TO DO/, "My Day distinguishes current, upcoming and outstanding work");
assert.match(dashboardUpgradeJs, /campusshield:timetable-updated/, "My Day refreshes from timetable update events");
assert.match(dashboardUpgradeCss, /campus-my-day-focus/, "My Day focus has its own responsive styling");
assert.match(dashboardUpgradeCss, /html\[data-theme="dark"\].*campus-my-day-focus/s, "My Day focus supports dark mode");

assert.match(appScript, /tablet-compact/,"tablet compact navigation is implemented");
assert.match(appScript, /drawerFocusable/,"mobile drawer traps keyboard focus");
assert.match(appScript, /aria-modal/,"mobile drawer is exposed as a modal navigation dialog");
assert.match(htmlMarkup, /report-emergency-note/,"incident form keeps the real emergency limitation notice");
const dashboardHtml = read("index.html");
const dashboardPolish = read("campusshield-dashboard-polish-v3.css");
assert.ok(dashboardHtml.includes('href="./campusshield-dashboard-polish-v3.css?v=20261109-1"'),
  "The cache-busted dashboard polish stylesheet is loaded");
assert.ok(dashboardHtml.indexOf("campusshield-dashboard-polish-v3.css") >
  dashboardHtml.indexOf("campusshield-dark-mode-accessibility.css"),
  "The fresh dashboard stylesheet loads after the previous theme overrides");
assert.ok(dashboardPolish.includes("grid-template-columns: repeat(6, minmax(0, 1fr))") &&
  dashboardPolish.includes("#10291d") && dashboardPolish.includes("#d2e4d6"),
  "The dashboard polish defines a balanced six-column layout and readable dark card colours");
assert.ok(serviceWorker.includes("cache.add(OFFLINE_URL)") &&
  serviceWorker.includes("cache.add(BRAND_STYLESHEET_URL)") &&
  serviceWorker.includes("cache.add(MODULE_STYLESHEET_URL)"),
  "Offline fallback, shared brand stylesheet and module page stylesheet are all cached");

assert.ok(iconGenerator.includes("const background = [21, 128, 61, 255];") &&
  iconGenerator.includes("const shieldColor = [255, 255, 255, 255];"),
  "The PWA icon generator uses the green and white logo colours");

for (const asset of ["icons/campusshield.svg","assets/campusshield-logo.svg"]) {
  const svg = read(asset);
  assert.ok(svg.includes("#15803D") && svg.includes("#FFFFFF"), asset + " uses the official green logo treatment");
}

for (const [path,width,height] of [
  ["icons/apple-touch-icon.png",180,180],
  ["icons/campusshield-192.png",192,192],
  ["icons/campusshield-512.png",512,512],
  ["icons/campusshield-maskable-512.png",512,512]
]) {
  const png = readBinary(path);
  assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10],path + " is a valid PNG");
  assert.equal(png.readUInt32BE(16),width,path + " width");
  assert.equal(png.readUInt32BE(20),height,path + " height");
}

assert.ok(read("index.html").indexOf("campusshield-brand-system.css") >
  read("index.html").indexOf("campusshield-guide.css"),
  "The shared brand override loads after existing workspace styles");

console.log("CampusShield Forest Green + Emerald and green-logo checks passed.");
