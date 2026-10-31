import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = path.join(root, "dist", "torio-staging");
const configPath = path.join(site, "supabase-config.js");
const configSource = await readFile(configPath, "utf8");

function configFor(hostname) {
  const window = { location: { hostname } };
  vm.runInNewContext(configSource, { window, console: { info() {} } });
  return window.CAMPUSSHIELD_SUPABASE_CONFIG;
}

const production = configFor("campusshield-ai.github.io");
assert.equal(production.url, "https://fvgtnujjnvdkhzqqcaqe.supabase.co", "GitHub Pages must remain on production Supabase");

const staging = configFor("torio-staging.pages.dev");
assert.equal(staging.url, "https://hywcpnoqqhxvujnimhxl.supabase.co", "Cloudflare Pages must select staging Supabase");

const branchPreview = configFor("feat-jarvis-command-interface.torio-staging.pages.dev");
assert.equal(branchPreview.url, staging.url, "Cloudflare branch previews must select staging Supabase");

const localhost = configFor("localhost");
assert.equal(localhost.url, staging.url, "Local development must continue to select staging Supabase");

for (const required of [
  "index.html",
  "torio-command-center.html",
  "torio-manifest.webmanifest",
  "service-worker.js",
  "offline.html",
  "supabase-config.js",
  "campusshield-backend.js",
  "icons/torio-ai.svg",
  "icons/campusshield-192.png"
]) {
  await access(path.join(site, required));
}

for (const forbidden of [".github", "supabase", "tests", "docs", "scripts", "README.md"]) {
  await assert.rejects(access(path.join(site, forbidden)), { code: "ENOENT" }, `Public payload must not include ${forbidden}`);
}

console.log("Cloudflare Pages staging safety checks passed.");
console.log("- GitHub Pages production host selects production Supabase.");
console.log("- pages.dev branch previews and localhost select staging Supabase.");
console.log("- Only required public site assets are included in the deployment payload.");
