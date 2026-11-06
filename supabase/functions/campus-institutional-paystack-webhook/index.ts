import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function verifySignature(raw: string, signature: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  const expected = [...digest].map((value) => value.toString(16).padStart(2, "0")).join("");
  return safeEqual(expected, signature.toLowerCase());
}

async function sha256(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...digest].map((part) => part.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const secret = Deno.env.get("PAYSTACK_SECRET_KEY") || "";
    const url = Deno.env.get("SUPABASE_URL") || "";
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !service || !secret) return json({ error: "Staging institutional webhook is not configured." }, 503);
    if (!secret.startsWith("sk_test_")) {
      return json({ error: "This Staging webhook accepts Paystack test events only." }, 409);
    }

    const raw = await req.text();
    const signature = req.headers.get("x-paystack-signature") || "";
    if (!signature || !await verifySignature(raw, signature, secret)) {
      return json({ error: "Invalid Paystack signature." }, 401);
    }

    let envelope: any;
    try { envelope = JSON.parse(raw); } catch { return json({ error: "Invalid JSON payload." }, 400); }
    const eventType = String(envelope?.event || "").trim().toLowerCase();
    const data = envelope?.data || {};
    const supported = new Set([
      "charge.success",
      "invoice.create",
      "invoice.payment_failed",
      "invoice.update",
      "subscription.create",
      "subscription.disable",
      "subscription.not_renew",
      "refund.processed",
      "charge.dispute.create",
    ]);
    if (!supported.has(eventType)) return json({ received: true, ignored: true });

    const transaction = data.transaction || {};
    const subscription = data.subscription || {};
    const customer = data.customer || {};
    const plan = data.plan || {};
    const reference = String(data.reference || transaction.reference || "").trim() || null;
    const subscriptionCode = String(data.subscription_code || subscription.subscription_code || "").trim() || null;
    const invoiceCode = String(data.invoice_code || data.invoice?.invoice_code || "").trim() || null;
    const amount = Number(data.amount ?? transaction.amount ?? subscription.amount);
    const email = String(customer.email || data.email || data.customer_email || "").trim().toLowerCase() || null;
    const currency = String(data.currency || transaction.currency || "").trim() || null;
    const domain = String(data.domain || transaction.domain || "").trim() || null;
    const providerStatus = String(data.status || transaction.status || subscription.status || "").trim() || null;
    const transactionId = data.id ?? transaction.id;
    const planCode = String(plan.plan_code || data.plan_code || "").trim() || null;

    const keyMaterial = reference || subscriptionCode || invoiceCode || String(transactionId || "");
    const eventKey = eventType + ":" + (keyMaterial || await sha256(raw));
    const eventPayload = {
      event: eventType,
      reference,
      transaction_id: transactionId == null ? null : String(transactionId),
      subscription_code: subscriptionCode,
      invoice_code: invoiceCode,
      customer_email: email,
      plan_code: planCode,
      amount_kobo: Number.isFinite(amount) ? amount : null,
      currency,
      domain,
      status: providerStatus,
      paid_at: data.paid_at || transaction.paid_at || null,
      received_at: new Date().toISOString(),
    };

    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await admin.schema("private").from("campus_institutional_paystack_events").upsert({
      event_key: eventKey,
      event_type: eventType,
      provider_reference: reference,
      provider_transaction_id: transactionId == null ? null : String(transactionId),
      provider_subscription_code: subscriptionCode,
      provider_invoice_code: invoiceCode,
      customer_email: email,
      plan_code: planCode,
      amount_kobo: Number.isFinite(amount) ? Math.trunc(amount) : null,
      currency,
      provider_domain: domain,
      provider_status: providerStatus,
      event_payload: eventPayload,
      received_at: new Date().toISOString(),
    }, { onConflict: "event_key", ignoreDuplicates: true });

    if (error) {
      console.error("Institutional Paystack event could not be stored.", { code: error.code || "unknown" });
      return json({ error: "Webhook event could not be stored." }, 503);
    }

    // Evidence is recorded only. Finance must verify a transaction against an issued invoice.
    return json({ received: true, recorded: true, activated: false });
  } catch (error) {
    console.error("Institutional Paystack webhook failed.", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return json({ error: "Webhook processing failed." }, 500);
  }
});
