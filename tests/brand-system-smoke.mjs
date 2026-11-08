import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const readBinary = path => readFileSync(new URL("../" + path, import.meta.url));
const brand = read("campusshield-brand-system.css");
const serviceWorker = read("service-worker.js");
const iconGenerator = read("scripts/generate-pwa-icons.mjs");
const manifest = JSON.parse(read("manifest.webmanifest"));
const pages = [
  "index.html","about.html","features.html","help.html","privacy.html",
  "terms.html","contact.html","offline.html","student-life-preview.html"
];

for (const page of pages) {
  const html = read(page);
  assert.ok(html.includes('href="./campusshield-brand-system.css"'), page + " loads the shared Midnight Navy + Premium Teal theme");
  assert.match(html, /<meta name="theme-color" content="#0B1F33">/i, page + " exposes the matching browser theme colour");
}

for (const token of [
  "--cs-navy:#0B1F33","--cs-primary:#0F766E","--cs-seafoam:#14B8A6",
  "--cs-seafoam-soft:#CCFBF1","--cs-ink:#142536","--cs-muted:#64748B",
  "--cs-canvas:#F4F7FA","--cs-line:#E2E8F0"
]) assert.ok(brand.includes(token), "Brand token exists: " + token);

assert.match(brand, /html\[data-theme="dark"\]/, "A matching dark-mode palette is defined");
assert.ok(brand.includes("#login-screen .login-intro"), "The sign-in hero receives the shared palette");
assert.ok(brand.includes("#workspace #page-dashboard .campus-dashboard-hero"), "The dashboard hero receives the shared palette");
assert.ok(brand.includes('html[data-theme="dark"] #page-shieldmind .shieldmind-insights-panel') &&
  brand.includes("background:linear-gradient(145deg,#112C43,#0D243A);") &&
  brand.includes("#page-shieldmind .shieldmind-insights-eyebrow"),
  "ShieldMind learning insights retain a dedicated dark-mode gradient");
assert.match(brand, /prefers-reduced-motion:\s*reduce/, "Reduced-motion preferences are respected");
assert.match(brand, /campus-map-nearby-safety/, "CampusMap components share the brand system");
assert.match(brand, /mobile-bottom-nav/, "Mobile navigation shares the brand system");

assert.equal(manifest.theme_color, "#0B1F33", "PWA theme colour matches the website");
assert.equal(manifest.background_color, "#F4F7FA", "PWA canvas matches the website");
assert.ok(manifest.icons.some(icon => icon.src === "./icons/campusshield.svg" &&
  icon.type === "image/svg+xml"), "PWA uses the scalable branded SVG icon");

assert.match(serviceWorker, /campusshield-offline-v3/, "Offline cache version is incremented");
assert.ok(serviceWorker.includes("cache.add(OFFLINE_URL)") &&
  serviceWorker.includes("cache.add(BRAND_STYLESHEET_URL)"),
  "Offline fallback and shared brand stylesheet are both cached");

assert.ok(iconGenerator.includes("const background = [11, 31, 51, 255];") &&
  iconGenerator.includes("const shieldColor = [20, 184, 166, 255];"),
  "The PWA icon generator uses the new navy and teal colours");

for (const asset of ["icons/campusshield.svg","assets/campusshield-logo.svg"]) {
  const svg = read(asset);
  assert.ok(svg.includes("#0B1F33") && svg.includes("#14B8A6"), asset + " matches the official palette");
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

console.log("CampusShield Midnight Navy + Premium Teal brand-system checks passed.");
