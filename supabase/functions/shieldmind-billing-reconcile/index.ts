import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const DEFAULT_ORIGIN = "https://campusshield-ai.github.io";
const plans: Record<string, { amount: number; imageLimit: number }> = {
  starter: { amount: 200000, imageLimit: 20 },
  plus: { amount: 500000, imageLimit: 60 },
  pro: { amount: 1000000, imageLimit: 150 },
  ultra: { amount: 2000000, imageLimit: 300 },
  max: { amount: 2800000, imageLimit: 600 },
};

const cors = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});
const json = (body: Record<string, unknown>, status = 200, origin = DEFAULT_ORIGIN) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

Deno.serve(async (req: Request) => {
  const origin = (req.headers.get("origin") || "").replace(/\/$/, "");
  const configuredOrigin = (Deno.env.get("CAMPUSSHIELD_APP_ORIGIN") || "").replace(/\/$/, "");
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const allowed = Boolean(origin) && (configuredOrigin ? origin === configuredOrigin : origin === DEFAULT_ORIGIN || local);
  if (origin && !allowed) return json({ error: "Payment return origin is not allowed." }, 403);
  const respond = (body: Record<string, unknown>, status = 200) => json(body, status, origin || DEFAULT_ORIGIN);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin || DEFAULT_ORIGIN) });
  if (req.method !== "POST") return respond({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY") || "";
    if (!supabaseUrl || !anonKey || !serviceKey || !paystackKey) {
      return respond({ error: "Staging payment verification is not configured." }, 503);
    }
    if (!paystackKey.startsWith("sk_test_")) {
      return respond({ error: "Staging verification requires the Paystack test secret; live payment keys are rejected." }, 409);
    }

    const token = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return respond({ error: "Sign in to verify this payment." }, 401);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user?.id || !user.email || !user.email_confirmed_at) {
      return respond({ error: "A confirmed signed-in email is required to verify this checkout." }, 401);
    }

    const input = await req.json().catch(() => null);
    const reference = String(input?.reference || "").trim();
    if (!/^sm_[a-f0-9]{32}$/i.test(reference)) {
      return respond({ error: "Invalid staging Paystack reference." }, 400);
    }

    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: intent, error: intentError } = await db.schema("private").from("shieldmind_billing_intents")
      .select("id,user_id,email,plan,amount_kobo,currency,status,expires_at,provider_subscription_code")
      .eq("provider_subscription_code", reference)
      .eq("user_id", user.id)
      .maybeSingle();
    if (intentError) return respond({ error: "Could not look up this account's payment request." }, 503);
    if (!intent) return respond({ error: "No payment request was found for this signed-in account." }, 404);
    const plan = plans[String(intent.plan || "")];
    if (!plan || intent.currency !== "NGN" || Number(intent.amount_kobo) !== plan.amount) {
      return respond({ error: "The payment request does not match an available ShieldMind plan." }, 409);
    }

    const { data: current, error: currentError } = await db.from("shieldmind_subscriptions")
      .select("last_payment_reference,started_at")
      .eq("user_id", user.id).maybeSingle();
    if (currentError) return respond({ error: "Could not check the current subscription." }, 503);
    if (current?.last_payment_reference === reference) {
      return respond({ verified: true, activated: true, duplicate: true, billing_mode: "prepaid", period_days: 30 });
    }
    if (intent.status === "matched") {
      return respond({
        verified: false, activated: false, action_required: true,
        message: "This payment intent was already processed, but it is not the current plan reference. Contact support before paying again.",
      }, 409);
    }
    const expiresAt = Date.parse(String(intent.expires_at || ""));
    if (!["pending", "failed"].includes(String(intent.status)) || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return respond({ verified: false, activated: false, message: "This checkout has expired or is no longer eligible. Do not pay again; contact support if you were charged." }, 409);
    }

    const verificationResponse = await fetch(
      "https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference),
      { headers: { Authorization: `Bearer ${paystackKey}` } },
    );
    const verificationPayload = await verificationResponse.json().catch(() => null);
    const tx = verificationPayload?.data;
    if (!verificationResponse.ok || verificationPayload?.status !== true ||
        tx?.status !== "success" || tx?.reference !== reference ||
        Number(tx?.amount) !== plan.amount || tx?.currency !== "NGN" ||
        String(tx?.customer?.email || "").trim().toLowerCase() !== String(intent.email || "").trim().toLowerCase() ||
        String(intent.email || "").trim().toLowerCase() !== user.email.trim().toLowerCase()) {
      return respond({
        verified: false, activated: false,
        message: "Paystack has not confirmed a successful payment yet. Retry verification; do not start another checkout while this one is pending.",
      }, 409);
    }

    const paidAt = new Date(tx?.paid_at || Date.now());
    if (Number.isNaN(paidAt.getTime())) {
      return respond({ error: "The verified payment timestamp needs reconciliation." }, 503);
    }
    const currentStartedAt = Date.parse(String(current?.started_at || ""));
    if (Number.isFinite(currentStartedAt) && currentStartedAt > paidAt.getTime()) {
      return respond({
        verified: true, activated: false, action_required: true,
        message: "Payment verified, but a newer subscription was preserved. Contact support before making another payment.",
      });
    }

    const paidAtIso = paidAt.toISOString();
    const expiry = new Date(paidAt.getTime() + 30 * 86400000);
    const { error: activateError } = await db.from("shieldmind_subscriptions").upsert({
      user_id: user.id,
      plan: intent.plan,
      status: "active",
      billing_period: "monthly",
      provider: "paystack",
      provider_reference: reference,
      amount_kobo: plan.amount,
      currency: "NGN",
      started_at: paidAtIso,
      expires_at: expiry.toISOString(),
      updated_at: new Date().toISOString(),
      last_payment_reference: reference,
      last_payment_at: paidAtIso,
      renewal_status: "not_renewing",
      image_upload_limit: plan.imageLimit,
    }, { onConflict: "user_id" });
    if (activateError) {
      console.error("Staging payment verified but subscription activation failed", { code: activateError.code || "unknown" });
      return respond({ error: "Payment verified, but activation needs reconciliation. Retry verification." }, 503);
    }

    const { error: intentUpdateError } = await db.schema("private").from("shieldmind_billing_intents")
      .update({ status: "matched", updated_at: new Date().toISOString() })
      .eq("id", intent.id).in("status", ["pending", "failed"]);
    if (intentUpdateError) {
      console.error("Staging payment activated but intent update failed", { code: intentUpdateError.code || "unknown" });
      // A retry is safe because last_payment_reference makes the activation idempotent.
      return respond({ error: "Payment verified and activated, but reconciliation metadata needs a retry." }, 503);
    }
    return respond({ verified: true, activated: true, billing_mode: "prepaid", period_days: 30 });
  } catch (error) {
    console.error("Staging payment reconcile failed", { name: error instanceof Error ? error.name : "UnknownError" });
    return json({ error: "Payment verification could not be completed. Retry before starting another checkout." }, 500, origin || DEFAULT_ORIGIN);
  }
});
