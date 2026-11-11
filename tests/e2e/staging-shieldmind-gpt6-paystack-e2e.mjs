import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";

const EXPECTED_STAGING_REF = "hywcpnoqqhxvujnimhxl";
const STAGING_APP_ORIGIN = "https://campusshield-ai-staging-preview.vercel.app";
const STUDY_IMAGE_BASE64 = "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";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Missing required Staging workflow value: " + name);
  return value;
}
function safePassword() { return "Cs-ShieldMind-E2E!" + randomBytes(32).toString("base64url") + "-9aA"; }
function firstRow(value) { return Array.isArray(value) ? value[0] : value; }
async function errorMessage(error) {
  let result = error?.message || String(error);
  const response = error?.context;
  if (response && typeof response.clone === "function") {
    const payload = await response.clone().json().catch(() => null);
    if (payload?.error) result += ": " + String(payload.error).slice(0, 500);
    if (response.status) result += " (HTTP " + response.status + ")";
  }
  return result;
}
const supabaseUrl = requiredEnv("SUPABASE_STAGING_URL");
const publishableKey = requiredEnv("SUPABASE_STAGING_ANON_KEY");
const serviceRoleKey = requiredEnv("SUPABASE_STAGING_SERVICE_ROLE_KEY");
const appOrigin = process.env.SUPABASE_STAGING_APP_ORIGIN || STAGING_APP_ORIGIN;
const parsedSupabaseUrl = new URL(supabaseUrl);
if (parsedSupabaseUrl.protocol !== "https:" || parsedSupabaseUrl.hostname !== EXPECTED_STAGING_REF + ".supabase.co") {
  throw new Error("Refusing ShieldMind test: only the approved Staging Supabase project is allowed.");
}
if (appOrigin !== STAGING_APP_ORIGIN) throw new Error("Refusing Paystack test: only the approved Staging app origin is allowed.");

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const runId = randomUUID().replaceAll("-", "");
const createdUserIds = [];
let browser = null;

async function createUser(label) {
  const email = "campusshieldaitechnologies+shieldmind-e2e-" + runId + "-" + label + "@gmail.com";
  const password = safePassword();
  const generated = await admin.auth.admin.generateLink({ type: "signup", email, password });
  if (generated.error) throw new Error("Could not create synthetic user: " + generated.error.message);
  const user = generated.data?.user;
  const props = generated.data?.properties;
  assert.ok(user?.id && props?.hashed_token, "Supabase created a confirmable synthetic user");
  createdUserIds.push(user.id);
  await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      display_name: "CampusShield Synthetic ShieldMind " + label,
      campusshield_shieldmind_e2e_run_id: runId,
      campusshield_shieldmind_e2e_synthetic: true,
    },
  });
  const client = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const verified = await client.auth.verifyOtp({ token_hash: props.hashed_token, type: props.verification_type || "signup" });
  if (verified.error || !verified.data.session?.access_token) throw new Error("Could not confirm synthetic user: " + (verified.error?.message || "No JWT returned."));
  return { id: user.id, email, password, client, session: verified.data.session };
}

async function assertUsage(account, expectedRequests, expectedImages) {
  const result = await account.client.rpc("get_my_shieldmind_usage");
  if (result.error) throw new Error("Could not read the caller's 30-day ShieldMind usage: " + result.error.message);
  const usage = firstRow(result.data);
  assert.ok(usage, "Active synthetic subscription returns a usage summary");
  assert.equal(usage.plan, "starter");
  assert.equal(Number(usage.request_limit), 150);
  assert.equal(Number(usage.requests_used), expectedRequests);
  assert.equal(Number(usage.requests_remaining), 150 - expectedRequests);
  assert.equal(Number(usage.image_uploads_used), expectedImages);
  assert.equal(Number(usage.image_upload_limit), 20);
  assert.ok(Number(usage.input_tokens) > 0, "OpenAI input tokens were recorded");
  assert.ok(Number(usage.output_tokens) > 0, "OpenAI output tokens were recorded");
  assert.ok(Number(usage.estimated_cost_usd) > 0, "Estimated provider cost was recorded");
  assert.equal(usage.last_model, "gpt-6-luna");
  return usage;
}

async function runAiAcceptance() {
  const account = await createUser("ai");
  const now = new Date();
  const start = now.toISOString();
  const expiry = new Date(now.getTime() + 30 * 86400000).toISOString();
  const subscription = await admin.from("shieldmind_subscriptions").upsert({
    user_id: account.id,
    plan: "starter",
    status: "active",
    billing_period: "monthly",
    provider: "paystack",
    amount_kobo: 200000,
    currency: "NGN",
    started_at: start,
    expires_at: expiry,
    image_upload_limit: 20,
    renewal_status: "non-renewing",
  }, { onConflict: "user_id" });
  if (subscription.error) throw new Error("Could not provision synthetic Staging plan: " + subscription.error.message);

  const textAnswer = await account.client.functions.invoke("shieldmind-chat", {
    body: { question: "Explain recursion in programming and give a short Java example.", history: [] },
  });
  if (textAnswer.error) throw new Error("GPT-6 Luna text test failed: " + await errorMessage(textAnswer.error));
  assert.equal(textAnswer.data?.mode, "provider");
  assert.ok(String(textAnswer.data?.answer || "").length > 80, "GPT-6 Luna returned a useful educational answer");
  await assertUsage(account, 1, 0);

  const imageAnswer = await account.client.functions.invoke("shieldmind-chat", {
    body: {
      question: "Read the simple arithmetic equation in this study image and explain the answer.",
      history: [],
      image_attested: true,
      image: { mime_type: "image/png", data_base64: STUDY_IMAGE_BASE64 },
    },
  });
  if (imageAnswer.error) throw new Error("GPT-6 Luna image test failed: " + await errorMessage(imageAnswer.error));
  assert.equal(imageAnswer.data?.mode, "provider");
  assert.ok(String(imageAnswer.data?.answer || "").length > 20, "GPT-6 Luna returned an image-assisted explanation");
  const usage = await assertUsage(account, 2, 1);
  console.log("PASS GPT-6 Luna text and image requests; token costs stored; monthly Starter allowance is 2/150.");
  return usage;
}

async function findAndFill(page, selectors, value, label) {
  for (const frame of page.frames()) {
    for (const selector of selectors) {
      const field = frame.locator(selector).first();
      if (await field.count() && await field.isVisible().catch(() => false)) {
        await field.fill(value);
        return;
      }
    }
  }
  const visibleFields = await page.locator("input").evaluateAll(items => items.filter(item => {
    const rect = item.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }).map(item => ({
    name: item.getAttribute("name"),
    placeholder: item.getAttribute("placeholder"),
    aria: item.getAttribute("aria-label"),
    autocomplete: item.getAttribute("autocomplete"),
    type: item.getAttribute("type"),
  })));
  throw new Error("Paystack checkout did not expose the " + label + " field. Visible input metadata: " + JSON.stringify(visibleFields));
}

async function runPaystackAcceptance() {
  const account = await createUser("paystack");
  const response = await fetch(supabaseUrl + "/functions/v1/shieldmind-billing-checkout", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + account.session.access_token,
      apikey: publishableKey,
      "Content-Type": "application/json",
      Origin: appOrigin,
    },
    body: JSON.stringify({ plan: "starter" }),
  });
  const checkout = await response.json().catch(() => null);
  if (!response.ok || !/^https:\/\/checkout\.paystack\.com\//.test(String(checkout?.authorization_url || ""))) {
    throw new Error("Staging Paystack test checkout could not initialize: " + String(checkout?.error || response.status));
  }
  assert.equal(checkout.mode, "test");
  assert.equal(checkout.amount_kobo, 200000);
  assert.equal(checkout.plan, "starter");
  console.log("PASS Paystack test-mode checkout initialized for the expected Starter amount.");

  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);
  await page.goto(checkout.authorization_url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByText(/paystack/i).first().waitFor({ state: "visible", timeout: 30000 });

  // Paystack's official no-validation reusable sandbox card.
  await findAndFill(page, [
    'input[autocomplete="cc-number"]',
    'input[name*="cardnumber" i]',
    'input[name*="card_number" i]',
    'input[placeholder*="card number" i]',
    'input[aria-label*="card number" i]',
  ], "4084084084084081", "card number");
  await findAndFill(page, [
    'input[autocomplete="cc-exp"]',
    'input[name*="expiry" i]',
    'input[name*="exp" i]',
    'input[placeholder*="MM/YY" i]',
    'input[placeholder*="expiry" i]',
  ], "11/27", "card expiry");
  await findAndFill(page, [
    'input[autocomplete="cc-csc"]',
    'input[name*="cvv" i]',
    'input[name*="cvc" i]',
    'input[placeholder*="cvv" i]',
    'input[placeholder*="security code" i]',
  ], "408", "card CVV");

  const payButton = page.locator('button:visible').filter({ hasText: /pay|complete|submit/i }).last();
  await payButton.click();
  await page.waitForURL(/billing=return/, { timeout: 120000, waitUntil: "domcontentloaded" });

  await page.waitForFunction(() => Boolean(window.CampusShieldBackend?.client?.auth?.setSession), null, { timeout: 30000 });
  await page.evaluate(async session => {
    const result = await window.CampusShieldBackend.client.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    if (result.error) throw new Error("Synthetic staging session could not be restored on payment return.");
  }, account.session);
  await page.waitForFunction(() => {
    const text = document.querySelector("#billing-payment-message")?.textContent || "";
    return /plan is active for 30 days|plan is already active/i.test(text);
  }, null, { timeout: 60000 });

  const { data: activated, error: activationError } = await admin.from("shieldmind_subscriptions")
    .select("plan,status,amount_kobo,started_at,expires_at,last_payment_reference")
    .eq("user_id", account.id).maybeSingle();
  if (activationError) throw new Error("Could not verify the reconciled Staging subscription: " + activationError.message);
  assert.equal(activated?.plan, "starter");
  assert.equal(activated?.status, "active");
  assert.equal(Number(activated?.amount_kobo), 200000);
  assert.equal(activated?.last_payment_reference, checkout.reference);
  const termMs = new Date(activated.expires_at).getTime() - new Date(activated.started_at).getTime();
  assert.ok(Math.abs(termMs - 30 * 86400000) < 60000, "Verified payment unlocks exactly a 30-day prepaid term");
  console.log("PASS Paystack test card payment verified; Starter entitlement activated for 30 days; payment reference reconciled.");
}

try {
  const usage = await runAiAcceptance();
  assert.equal(usage.last_model, "gpt-6-luna");
  await runPaystackAcceptance();
} finally {
  if (browser) await browser.close().catch(() => {});
  for (const userId of createdUserIds) {
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error) console.error("Synthetic Staging Auth cleanup failed", { code: deleted.error.code || null });
  }
}
