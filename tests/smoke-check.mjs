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
assert.match(backend, /client\.auth\.getUser\(\)/);
assert.match(backend, /update\(\{\s*status\s*\}/);
assert.match(html, /function canManageIncidents\(\)/);
assert.match(html, /\['security', 'admin'\]\.includes\(currentProfile\.role\)/);
assert.match(html, /if \(!canManageIncidents\(\)\)/);
assert.ok(
  html.includes(".in('verification_status', ['pending', 'rejected'])"),
  "account approvals query includes pending and rejected applications"
);
assert.ok(
  html.includes(".or('requested_role.in.(student,teacher),role.in.(student,teacher)')"),
  "account approvals query includes student/teacher applicants by requested or current role"
);
assert.ok(
  html.includes("row.verification_status === 'pending'"),
  "review actions are shown only for pending applications"
);
assert.ok(
  html.includes("Rejected — view only"),
  "rejected applications are displayed read-only"
);
assert.doesNotMatch(
  html,
  /\.eq\('verification_status', 'pending'\)/,
  "no pending-only status filter remains in the approvals query"
);
assert.match(html, /const total = incidents\.length/);
assert.match(html, /await refreshIncidentsFromSupabase\(\)/);
assert.match(html, /id="refresh-incidents"/);
assert.match(html, /setInterval\(\(\) => \{[\s\S]*?\}, 60000\)/);
assert.match(html, /addEventListener\('visibilitychange'/);
assert.match(html, /requestSessionVersion !== authSessionVersion/);
assert.match(html, /id="incidentSyncStatus"/);
assert.doesNotMatch(html, /id="reporter"/);
assert.match(html, /does not contact emergency services/i);

console.log(`PASS ${inlineScripts.length} inline script(s), backend, and config parse`);
console.log("PASS browser config uses the Supabase project URL and publishable key only");
console.log("PASS incident reads, submissions, status updates, and dashboard metrics use Supabase data");
console.log("PASS incident data can be refreshed manually, on tab return, and every minute");
console.log("PASS resolve controls are shown only to verified security/admin users");
console.log("PASS emergency-services prototype warning remains visible");
