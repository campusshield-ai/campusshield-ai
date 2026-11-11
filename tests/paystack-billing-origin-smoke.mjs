import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const [initialize, reconcile, chat, html] = await Promise.all([
  read("supabase/functions/paystack-initialize/index.ts"),
  read("supabase/functions/paystack-reconcile/index.ts"),
  read("supabase/functions/shieldmind-chat/index.ts"),
  read("index.html"),
]);

const supportedOrigin = "https://campusshield-ai-staging-preview.vercel.app";
const githubOrigin = "https://campusshield-ai.github.io";
for (const source of [initialize, reconcile]) {
  assert.ok(source.includes(githubOrigin), "GitHub Pages production origin remains supported");
  assert.ok(source.includes(supportedOrigin), "Stable Vercel Production alias is explicitly allowed");
  assert.ok(source.includes("CAMPUSSHIELD_APP_ORIGINS"), "Additional exact origins can be configured without wildcard CORS");
  assert.ok(source.includes("getAllowedOrigin(req)"), "Request origin must be validated against the exact allow-list");
  assert.ok(source.includes('"Access-Control-Allow-Origin": origin'), "CORS response must echo only the validated origin");
  assert.ok(source.includes("This checkout origin is not allowed") || source.includes("This payment-return origin is not allowed"), "Unknown origins must be rejected");
  assert.ok(!source.includes('Access-Control-Allow-Origin": "*"'), "Wildcard CORS is forbidden");
}
assert.ok(initialize.includes("callback_url:getPaymentReturnUrl(origin)"), "Paystack callback must return to the origin that started checkout");
assert.ok(initialize.includes('origin === DEFAULT_APP_ORIGIN ? DEFAULT_APP_PATH : "/"'), "GitHub Pages uses its repository path; Vercel/custom origins use root");
assert.ok(reconcile.includes("const origin = getAllowedOrigin(req)"), "Payment reconciliation uses the same validated origin allow-list");
assert.ok(reconcile.includes('if (latest?.status !== "paid")'), "Reconciliation must not activate an unverified order");

const pricePairs = [
  ["starter", "200000", "₦2,000"],
  ["plus", "500000", "₦5,000"],
  ["pro", "1000000", "₦10,000"],
  ["ultra", "2000000", "₦20,000"],
  ["max", "2800000", "₦28,000"],
];
for (const [plan, kobo, display] of pricePairs) {
  assert.ok(initialize.includes(plan + ":" + kobo), "Checkout amount must match " + plan);
  assert.ok(html.includes(display), "Billing page display must match " + plan);
}

assert.ok(chat.indexOf("const providerKey =") < chat.indexOf("consume_shieldmind_quota"), "OpenAI configuration must be checked before consuming user request quota");
assert.ok(html.includes("Each plan includes a fixed AI request allowance for its 30-day term"), "Billing UI must show the prepaid term request allowance");
assert.ok(chat.includes('const model = "gpt-6-luna"'), "Production ShieldMind chat must use GPT-6 Luna");
assert.ok(chat.includes("max_completion_tokens: 900"), "Chat output length must be bounded for predictable provider spend");
assert.ok(chat.includes("record_shieldmind_usage"), "Actual provider token use must be written to the server-side ledger");

console.log("Paystack origin, return URL, plan price and ShieldMind quota preflight checks passed.");
