import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

const migration = read("supabase/migrations/20261112150000_account_lifecycle_90_day_grace_period.sql");
const edge = read("supabase/functions/account-lifecycle/index.ts");
const ui = read("campusshield-account-lifecycle.js");
const html = read("index.html");
const css = read("campusshield-account-lifecycle.css");

assert.match(migration, /interval '90 days'/i, "legacy deactivation records get a 90-day deadline");
assert.match(migration, /create table if not exists public\.account_lifecycle/i, "private lifecycle state table exists");
assert.match(migration, /enable row level security/i, "lifecycle table has RLS enabled");
assert.match(migration, /revoke all on table public\.account_lifecycle from public, anon, authenticated/i, "clients cannot read or change lifecycle records directly");
assert.match(migration, /create extension if not exists pg_cron/i, "scheduled purge extension is enabled");
assert.match(migration, /cron\.schedule\([\s\S]*'0 3 \* \* \*'/i, "daily purge is scheduled");
assert.match(migration, /delete from storage\.objects/i, "owned Storage objects are removed before Auth deletion");
assert.match(migration, /status='purge_blocked'/i, "blocked purges remain recorded and retryable");
assert.match(migration, /private\.platform_admins/i, "trusted platform administrators are excluded from purge");
assert.doesNotMatch(migration, /grant execute on function private\.purge_expired_account_lifecycle\(\) to authenticated/i, "clients cannot run the purge");

assert.match(edge, /DEACTIVATION_DAYS = 90/i, "Edge Function uses a 90-day recovery window");
assert.match(edge, /ban_duration: LONG_BAN_DURATION/i, "deactivation uses a reversible Auth ban");
assert.match(edge, /ban_duration: "none"/i, "administrator restoration lifts the Auth ban");
assert.match(edge, /legacy_soft_deleted/i, "legacy irreversible soft-delete accounts cannot be mistakenly offered restoration");
assert.match(edge, /profile\.role === "admin" \|\| isPlatformAdmin === true/i, "administrator accounts cannot be deactivated");
assert.match(edge, /action === "list-deactivated"/i, "administrator queue is available");
assert.match(edge, /action === "restore"/i, "administrator reactivation action is available");
assert.doesNotMatch(edge, /auth\.admin\.deleteUser\(/i, "deactivation never permanently deletes a user");
assert.doesNotMatch(ui, /SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE_KEY/i, "service-role secrets are not in browser UI");

assert.match(ui, /account-lifecycle-deactivate/i, "profile UI offers deactivation");
assert.match(ui, /list-deactivated/i, "admin UI loads the recovery queue");
assert.match(ui, /account-lifecycle-admin-rows/i, "admin UI renders recovery queue");
assert.match(html, /id="account-lifecycle-panel"/i, "profile contains account lifecycle controls");
assert.match(html, /id="account-lifecycle-admin-panel"/i, "platform admin contains account recovery controls");
assert.match(html, /within 90 days to request reactivation/i, "sign-in page explains the recovery route");
assert.match(html, /campusshield-account-lifecycle\.js/i, "lifecycle script is loaded");
assert.match(html, /campusshield-account-lifecycle\.css/i, "lifecycle styles are loaded");
assert.ok(css.length > 100, "lifecycle styles are present");

new Function(ui);
console.log("PASS 90-day account lifecycle: RLS, reversible ban, admin restore, protected administrators, scheduled purge, UI wiring");
