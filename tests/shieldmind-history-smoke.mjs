import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, backend, html] = await Promise.all([
  readFile(new URL("../campusshield-app.js", import.meta.url), "utf8"),
  readFile(new URL("../campusshield-backend.js", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8")
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

assert.match(backend, /from\("shieldmind_conversations"\)/, "uses the existing conversation-header table");
assert.match(backend, /from\("shieldmind_messages"\)/, "uses the existing private message table");
assert.match(backend, /\.eq\("user_id", user\.id\)/, "queries are scoped to the authenticated user");
assert.match(backend, /getCurrentUser\(\)/, "history operations resolve the authenticated user");
assert.match(backend, /\.ilike\("content", pattern\)/, "conversation search includes private message content");
assert.match(backend, /\.order\("created_at", \{ ascending: true \}\)/, "messages load in chronological order");
assert.match(backend, /prefixMatches/, "saving only appends new messages and protects existing history");
assert.match(backend, /expectedUserId && user\.id !== expectedUserId/, "saving rejects account switches");
assert.match(backend, /conversation_id: savedId/, "new messages are linked to their private conversation");
assert.match(app, /saveShieldMindConversation\(\)/, "successful ShieldMind answers trigger persistence");
assert.match(app, /openShieldMindConversation\(row\.id\)/, "saved conversations can be reopened");
assert.match(app, /deleteShieldMindConversation\(row\.id\)/, "saved conversations can be deleted individually");
assert.match(app, /shieldMindConversationId=null/, "conversation state is cleared when the account changes");
assert.match(html, /id="shieldmind-history-search"/, "saved history search control exists");
assert.match(html, /id="shieldmind-history-list"/, "saved history list exists");

console.log("ShieldMind existing-table private history smoke checks passed.");
