import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(new URL("../manifest.webmanifest", import.meta.url), "utf8"));
const migration = await readFile(
  new URL("../supabase/migrations/20261108032000_campus_opportunity_bookmarks_own_access.sql", import.meta.url),
  "utf8",
);

assert.equal(manifest.display, "standalone", "CampusShield remains installable as a PWA");
assert.equal(manifest.orientation, "any", "Installed CampusShield must support portrait and landscape devices");
assert.match(manifest.description, /student community/i);
assert.match(manifest.description, /learning support/i);
assert.match(manifest.description, /university information/i);

assert.match(migration, /create table if not exists public\.campus_opportunity_bookmarks/i);
assert.match(migration, /primary key \(opportunity_id, user_id\)/i);
assert.match(migration, /alter table public\.campus_opportunity_bookmarks enable row level security/i);
assert.match(migration, /user_id = \(select auth\.uid\(\)\)/i);
assert.match(migration, /private\.current_campus_university_id\(\)/i);
assert.match(migration, /private\.current_user_has_verified_campus_access\(\)/i);
assert.match(migration, /o\.status = 'published'/i);
assert.match(migration, /drop policy if exists verified_account_required_for_interactions/i);
assert.match(migration, /revoke all on table public\.campus_opportunity_bookmarks from anon/i);
assert.match(migration, /grant select, insert, delete on table public\.campus_opportunity_bookmarks to authenticated/i);
assert.doesNotMatch(
  migration,
  /create policy verified_account_required_for_interactions/i,
  "A broad verified-account policy must never be recreated on private bookmarks",
);

console.log("PASS opportunity bookmark RLS parity and flexible CampusShield PWA orientation");
