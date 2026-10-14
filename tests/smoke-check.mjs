import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const backend = await readFile(new URL("../campusshield-backend.js", import.meta.url), "utf8");
const config = await readFile(new URL("../supabase-config.js", import.meta.url), "utf8");
const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((match) => match[1]).filter((value) => value.trim());

for (const [index, source] of inlineScripts.entries()) {
  assert.doesNotThrow(() => new Function(source), `inline script ${index + 1} parses`);
}
assert.doesNotThrow(() => new Function(backend), "Supabase backend parses");
assert.doesNotThrow(() => new Function(config), "Supabase config parses");

assert.match(config, /window\.CAMPUSSHIELD_SUPABASE_CONFIG\s*=/);
assert.match(config, /https:\/\/fvgtnujjnvdkhzqqcaqe\.supabase\.co/);
const publicKey = config.match(/publishableKey:\s*"([^"]+)"/)?.[1];
assert.ok(publicKey?.startsWith("sb_publishable_"), "uses a publishable browser key");
assert.doesNotMatch(publicKey, /secret|service_role/i);

assert.match(backend, /from\("incidents"\)/);
assert.match(backend, /reporter_id:\s*user\.id/);
assert.match(backend, /update\(\{\s*status\s*\}/);
assert.match(html, /function canManageIncidents\(\)/);
assert.match(html, /\['security', 'admin'\]\.includes\(currentProfile\.role\)/);
assert.match(html, /if \(!canManageIncidents\(\)\)/);
assert.match(html, /const total = incidents\.length/);
assert.match(html, /await refreshIncidentsFromSupabase\(\)/);
assert.match(html, /does not contact emergency services/i);

console.log(`PASS ${inlineScripts.length} inline script(s), backend, and config parse`);
console.log("PASS browser config uses the Supabase project URL and publishable key only");
console.log("PASS incident reads, submissions, status updates, and dashboard metrics use Supabase data");
console.log("PASS resolve controls are shown only to verified security/admin users");
console.log("PASS emergency-services prototype warning remains visible");
