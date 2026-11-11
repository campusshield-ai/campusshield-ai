import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEFAULT_APP_ORIGIN = "https://campusshield-ai.github.io";
const DEFAULT_APP_PATH = "/campusshield-ai/";
const ALLOWED_APP_ORIGINS = new Set([
  DEFAULT_APP_ORIGIN,
  "https://campusshield-ai-staging-preview.vercel.app",
  ...(Deno.env.get("CAMPUSSHIELD_APP_ORIGINS") || "")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean)
]);
const cors = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin"
});
function getAllowedOrigin(request: Request): string | null {
  const raw = (request.headers.get("origin") || "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" || parsed.origin !== raw) return null;
    return ALLOWED_APP_ORIGINS.has(parsed.origin) ? parsed.origin : null;
  } catch {
    return null;
  }
}
function getPaymentReturnUrl(origin: string): string {
  const path = origin === DEFAULT_APP_ORIGIN ? DEFAULT_APP_PATH : "/";
  const url = new URL(path, origin);
  url.searchParams.set("billing", "return");
  return url.toString();
}
const prices: Record<string, number> = {
  starter: 200000, plus: 500000, pro: 1000000, ultra: 2000000, max: 2800000
};
const limits: Record<string, number> = {
  starter: 20, plus: 60, pro: 150, ultra: 300, max: 600
};
const json = (status: number, body: Record<string, unknown>, origin = DEFAULT_APP_ORIGIN) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store" }
  });

Deno.serve(async (req: Request) => {
  const origin = getAllowedOrigin(req);
  const send = (status: number, body: Record<string, unknown>) => json(status, body, origin || DEFAULT_APP_ORIGIN);
  if (!origin) return send(403, { error: "This payment-return origin is not allowed. Open CampusShield from its official website address." });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return send(405, { error: "Method not allowed." });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY") || "";
    if (!supabaseUrl || !anonKey || !serviceKey || !paystackKey) {
      return send(503, { error: "Secure payment verification is not configured." });
    }
    if (!paystackKey.startsWith("sk_live_")) {
      return send(503, { error: "Production payment verification requires the Paystack live secret." });
    }

    const token = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return send(401, { error: "Sign in with the checkout account to verify payment." });

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user?.id || !user.email || !user.email_confirmed_at) {
      return send(401, { error: "A confirmed signed-in email is required to verify this checkout." });
    }

    let input: any;
    try { input = await req.json(); }
    catch { return send(400, { error: "Invalid verification request." }); }
    const reference = String(input?.reference || "").trim();
    if (!/^csa_[a-f0-9]{32}$/i.test(reference)) {
      return send(400, { error: "Invalid Paystack reference." });
    }

    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: order, error: orderError } = await db.from("shieldmind_payment_orders")
      .select("id,user_id,plan,billing_period,amount_kobo,currency,status,paid_at")
      .eq("provider_reference", reference)
      .eq("user_id", user.id)
      .maybeSingle();
    if (orderError) return send(503, { error: "Could not look up your payment request." });
    if (!order) return send(404, { error: "No payment request was found for this signed-in account." });
    if (!["pending", "failed", "paid"].includes(order.status)) {
      return send(409, { error: "This payment request is not eligible for verification." });
    }
    if (order.billing_period !== "monthly" || order.currency !== "NGN" ||
        prices[order.plan] !== order.amount_kobo || !limits[order.plan]) {
      return send(409, { error: "Payment request details do not match an active ShieldMind plan." });
    }

    const verificationResponse = await fetch(
      "https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference),
      { headers: { Authorization: `Bearer ${paystackKey}` } }
    );
    const verificationPayload = await verificationResponse.json().catch(() => null);
    const tx = verificationPayload?.data;
    if (!verificationResponse.ok || verificationPayload?.status !== true ||
        tx?.status !== "success" || tx?.reference !== reference ||
        Number(tx?.amount) !== order.amount_kobo || tx?.currency !== order.currency ||
        String(tx?.customer?.email || "").toLowerCase() !== user.email.toLowerCase()) {
      return send(409, {
        verified: false, activated: false,
        message: "Paystack has not confirmed a successful payment yet. Retry verification; do not start another checkout while this one is pending."
      });
    }

    const now = new Date();
    const paidAtValue = order.status === "paid" && order.paid_at
      ? order.paid_at
      : (tx?.paid_at || now.toISOString());
    const paidAt = new Date(paidAtValue);
    if (!Number.isFinite(paidAt.getTime())) {
      return send(503, { error: "The verified payment timestamp needs reconciliation." });
    }

    if (order.status !== "paid") {
      const { data: updatedOrder, error: updateError } = await db.from("shieldmind_payment_orders")
        .update({ status: "paid", paid_at: paidAt.toISOString(), updated_at: now.toISOString() })
        .eq("id", order.id).in("status", ["pending", "failed"])
        .select("id,paid_at").maybeSingle();
      if (updateError) return send(503, { error: "Could not record verified payment." });
      if (updatedOrder?.paid_at) {
        paidAt.setTime(new Date(updatedOrder.paid_at).getTime());
      } else {
        const { data: latest, error: latestError } = await db.from("shieldmind_payment_orders")
          .select("status,paid_at").eq("id", order.id).maybeSingle();
        if (latestError) return send(503, { error: "Could not reconcile verified payment." });
        if (latest?.status !== "paid") return send(409, { error: "Payment is verified, but the order is not payable." });
        if (latest.paid_at) paidAt.setTime(new Date(latest.paid_at).getTime());
      }
    }

    const { data: currentSubscription, error: subscriptionLookupError } = await db.from("shieldmind_subscriptions")
      .select("last_payment_reference,started_at")
      .eq("user_id", user.id).maybeSingle();
    if (subscriptionLookupError) return send(503, { error: "Could not check your active subscription." });

    if (currentSubscription?.last_payment_reference === reference) {
      return send(200, { verified: true, activated: true, duplicate: true, billing_mode: "prepaid", period_days: 30 });
    }

    const currentStartedAt = Date.parse(currentSubscription?.started_at || "");
    if (Number.isFinite(currentStartedAt) && currentStartedAt > paidAt.getTime()) {
      return send(200, {
        verified: true, activated: false, action_required: true,
        message: "Payment verified, but a newer subscription was preserved. Contact CampusShield support before making another payment."
      });
    }

    const expiry = new Date(paidAt.getTime() + 30 * 86400000);
    const paidAtIso = paidAt.toISOString();
    const { error: subscriptionError } = await db.from("shieldmind_subscriptions").upsert({
      user_id: user.id,
      plan: order.plan,
      status: "active",
      billing_period: "monthly",
      provider: "paystack",
      provider_reference: reference,
      amount_kobo: order.amount_kobo,
      currency: "NGN",
      started_at: paidAtIso,
      expires_at: expiry.toISOString(),
      updated_at: now.toISOString(),
      last_payment_reference: reference,
      last_payment_at: paidAtIso,
      renewal_status: "non-renewing",
      image_upload_limit: limits[order.plan]
    }, { onConflict: "user_id" });
    if (subscriptionError) {
      return send(503, { error: "Payment verified, but activation needs reconciliation. Retry verification." });
    }
    return send(200, { verified: true, activated: true, billing_mode: "prepaid", period_days: 30 });
  } catch {
    return send(500, { error: "Payment verification could not be completed." });
  }
});
