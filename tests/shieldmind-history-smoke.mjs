import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, backend, html, migration] = await Promise.all([
  readFile(new URL("../campusshield-app.js", import.meta.url), "utf8"),
  readFile(new URL("../campusshield-backend.js", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20261106140000_shieldmind_private_conversation_history.sql", import.meta.url), "utf8")
]);

assert.doesNotThrow(() => new Function(app), "CampusShield app parses");
assert.doesNotThrow(() => new Function(backend), "Supabase backend parses");

for (const method of [
  "listMyShieldMindConversations",
  "loadMyShieldMindConversation",
  "saveMyShieldMindConversation",
  "deleteMyShieldMindConversation"
]) {
  assert.match(backend, new RegExp("async " + method + "\\("), method + " backend method exists");
}

assert.match(backend, /\.eq\("user_id", user\.id\)/, "conversation reads and writes are scoped to the authenticated user");
assert.match(backend, /getCurrentUser\(\)/, "history operations resolve the authenticated user");
assert.match(backend, /messages\.map\(item =>/, "stored messages are validated and normalized");
assert.match(backend, /search_text/, "saved conversations support full-text-like search");
assert.match(app, /saveShieldMindConversation\(\)/, "successful ShieldMind answers trigger persistence");
assert.match(app, /openShieldMindConversation\(row\.id\)/, "saved conversations can be reopened");
assert.match(app, /deleteShieldMindConversation\(row\.id\)/, "saved conversations can be deleted individually");
assert.match(app, /shieldMindConversationId=null/, "conversation state is cleared when the account changes");
assert.match(html, /id="shieldmind-history-search"/, "saved history search control exists");
assert.match(html, /id="shieldmind-history-list"/, "saved history list exists");
assert.match(migration, /enable row level security/i, "history table enables RLS");
assert.match(migration, /force row level security/i, "history table forces RLS");
assert.match(migration, /user_id = \(select auth\.uid\(\)\)/, "RLS policies bind access to auth.uid()");
assert.match(migration, /on delete cascade/i, "account deletion cascades to private history");
assert.match(migration, /grant select, insert, update, delete on public\.shieldmind_conversations to authenticated/i, "authenticated users receive only the required table operations");
assert.match(migration, /revoke all .* from anon, public/i, "anonymous/public access is revoked");

console.log("ShieldMind private conversation history smoke checks passed.");
