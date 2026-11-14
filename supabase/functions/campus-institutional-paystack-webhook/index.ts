import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

function expectedPaystackDomain(supabaseUrl: string): "test" | "live" | null {
  try {
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
    if (projectRef === "hywcpnoqqhxvujnimhxl") return "test";
    if (projectRef === "fvgtnujjnvdkhzqqcaqe") return "live";
    return null;
  } catch {
    return null;
  }
}

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


async function verifyModernPaystackSignature(
  raw: string,
  header: string,
  secrets: string[],
): Promise<boolean> {
  const fields = header.split(",").map((part) => part.trim()).filter(Boolean);
  const timestampField = fields.find((part) => part.startsWith("t="));
  const timestampText = timestampField?.slice(2) || "";
  if (!/^\d{10}$/.test(timestampText)) return false;
  const timestamp = Number(timestampText);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300) return false;
  const signatures = fields.filter((part) => part.startsWith("v1=")).map((part) => {
    const value = part.slice(3);
    const separator = value.indexOf(":");
    return separator < 0 ? [] : [value.slice(0, separator), value.slice(separator + 1)];
  }).filter((parts) => parts.length === 2 &&
    /^whk_[a-zA-Z0-9_-]{4,100}$/.test(parts[0]) && /^[a-f0-9]{128}$/i.test(parts[1]));
  if (!signatures.length) return false;
  const encoder = new TextEncoder();
  for (const secret of secrets.filter((value) => value.startsWith("whsec_"))) {
    const key = await crypto.subtle.importKey(
      "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"],
    );
    const digest = new Uint8Array(await crypto.subtle.sign(
      "HMAC", key, encoder.encode(timestampText + "." + raw),
    ));
    const expected = [...digest].map((value) => value.toString(16).padStart(2, "0")).join("");
    for (const [, provided] of signatures) if (safeEqual(expected, provided.toLowerCase())) return true;
  }
  return false;
}

async function verifyIncomingPaystackSignature(raw: string, request: Request, legacySecret: string): Promise<boolean> {
  const modernHeader = request.headers.get("Paystack-Signature");
  if (modernHeader) {
    return await verifyModernPaystackSignature(raw, modernHeader, [
      Deno.env.get("PAYSTACK_WEBHOOK_SECRET") || "",
      Deno.env.get("PAYSTACK_WEBHOOK_SECRET_PREVIOUS") || "",
    ]);
  }
  const legacyHeader = request.headers.get("x-paystack-signature") || "";
  return Boolean(legacyHeader && legacySecret.startsWith("sk_") &&
    /^[a-f0-9]{128}$/i.test(legacyHeader) && await verifySignature(raw, legacyHeader, legacySecret));
}

async function sha256(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...digest].map((part) => part.toString(16).padStart(2, "0")).join("");
}

function validDate(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const secret = Deno.env.get("PAYSTACK_SECRET_KEY") || "";
    const url = Deno.env.get("SUPABASE_URL") || "";
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const expectedDomain = expectedPaystackDomain(url);
    if (!url || !service || !secret || !expectedDomain) {
      return json({ error: "Institutional Paystack webhook is not configured for this project." }, 503);
    }
    if (!secret.startsWith("sk_" + expectedDomain + "_")) {
      return json({ error: "Paystack secret key does not match this Supabase project's payment environment." }, 503);
    }

    const raw = await req.text();
    const modernSignature = req.headers.get("Paystack-Signature") || "";
    if (modernSignature) {
      const activeWebhookSecrets = [
        Deno.env.get("PAYSTACK_WEBHOOK_SECRET") || "",
        Deno.env.get("PAYSTACK_WEBHOOK_SECRET_PREVIOUS") || "",
      ].filter((value) => value.startsWith("whsec_"));
      if (!activeWebhookSecrets.length) {
        return json({ error: "Paystack's new webhook signing secret has not been configured." }, 503);
      }
    }
    if (!await verifyIncomingPaystackSignature(raw, req, secret)) {
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
      "refund.failed",
      "charge.dispute.create",
      "charge.dispute.resolve",
      "charge.dispute.remind",
    ]);
    if (!supported.has(eventType)) return json({ received: true, ignored: true });

    const transaction = data.transaction || {};
    const subscription = data.subscription || {};
    const customer = data.customer || {};
    const plan = data.plan || {};
    const reference = String(data.reference || transaction.reference || "").trim() || null;
    const subscriptionCode = String(
      data.subscription_code || subscription.subscription_code || data.subscription?.code || "",
    ).trim() || null;
    const invoiceCode = String(data.invoice_code || data.invoice?.invoice_code || "").trim() || null;
    const amount = Number(data.amount ?? transaction.amount ?? subscription.amount);
    const email = String(customer.email || data.email || data.customer_email || "").trim().toLowerCase() || null;
    const currency = String(data.currency || transaction.currency || "").trim() || null;
    const domain = String(data.domain || transaction.domain || subscription.domain || "").trim() || null;
    const providerStatus = String(data.status || transaction.status || subscription.status || "").trim() || null;
    const transactionId = data.id ?? transaction.id;
    const planCode = String(plan.plan_code || data.plan_code || subscription.plan?.plan_code || "").trim() || null;
    const paidAt = validDate(data.paid_at || transaction.paid_at);
    const periodStart = validDate(data.period_start || data.invoice?.period_start);
    const periodEnd = validDate(data.period_end || data.invoice?.period_end);
    const nextPaymentAt = validDate(subscription.next_payment_date || data.next_payment_date);
    const isPaid = data.paid === true || data.paid === 1 ||
      providerStatus === "success" || transaction.status === "success";
    const transactionReference = reference || String(transaction.reference || "").trim() || null;

    // Paystack Test Mode and Live Mode are separate. Never let an event from one
    // environment update the other environment's institutional subscriptions.
    if (domain && domain !== expectedDomain) {
      return json({ received: true, ignored: true, reason: "payment_environment_mismatch" });
    }

    const keyMaterial = reference || invoiceCode || subscriptionCode || String(transactionId || "");
    const eventKey = eventType + ":" + (keyMaterial || await sha256(raw));
    const eventPayload = {
      event: eventType,
      reference: transactionReference,
      transaction_id: transactionId == null ? null : String(transactionId),
      subscription_code: subscriptionCode,
      invoice_code: invoiceCode,
      customer_email: email,
      customer_code: String(customer.customer_code || "").trim() || null,
      plan_code: planCode,
      amount_kobo: Number.isFinite(amount) ? Math.trunc(amount) : null,
      currency,
      domain,
      status: providerStatus,
      paid: isPaid,
      paid_at: paidAt,
      period_start: periodStart,
      period_end: periodEnd,
      next_payment_date: nextPaymentAt,
      received_at: new Date().toISOString(),
    };

    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: storeError } = await admin.schema("private").from("campus_institutional_paystack_events").upsert({
      event_key: eventKey,
      event_type: eventType,
      provider_reference: transactionReference,
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
      review_status: "received",
    }, { onConflict: "event_key", ignoreDuplicates: true });

    if (storeError) {
      console.error("Institutional Paystack event could not be stored.", { code: storeError.code || "unknown" });
      return json({ error: "Webhook event could not be stored." }, 503);
    }

    const { data: storedEvent, error: eventLookupError } = await admin.schema("private")
      .from("campus_institutional_paystack_events")
      .select("id")
      .eq("event_key", eventKey)
      .maybeSingle();
    if (eventLookupError || !storedEvent?.id) return json({ error: "Stored webhook event could not be retrieved." }, 503);
    const eventId = String(storedEvent.id);

    // Reconcile one-time CampusShield institutional invoice payments only when
    // a matching private payment attempt exists. Other charge.success events are
    // recorded but never activate a university subscription.
    if (eventType === "charge.success" && transactionReference) {
      const { data: invoiceAttempt, error: attemptLookupError } = await admin.schema("private")
        .from("campus_institutional_payment_attempts")
        .select("id,invoice_id,university_id,actor_user_id,reference,amount_kobo,currency,customer_email,provider_domain,status")
        .eq("reference", transactionReference)
        .maybeSingle();

      if (attemptLookupError) {
        await admin.schema("private").from("campus_institutional_paystack_events")
          .update({ review_status: "review_required" }).eq("id", eventId);
        return json({ received: true, recorded: true, review_required: true, reason: "invoice_attempt_lookup_failed" });
      }

      if (invoiceAttempt) {
        const txResponse = await fetch(
          "https://api.paystack.co/transaction/verify/" + encodeURIComponent(transactionReference),
          { headers: { Authorization: "Bearer " + secret } },
        );
        const verifiedPayload = await txResponse.json().catch(() => null);
        const tx = verifiedPayload?.data;
        const verifiedEmail = String(tx?.customer?.email || "").trim().toLowerCase();
        const paidAt = validDate(tx?.paid_at || tx?.created_at);
        const metadata = typeof tx?.metadata === "string"
          ? (() => { try { return JSON.parse(tx.metadata); } catch { return {}; } })()
          : (tx?.metadata || {});
        const metadataMismatch =
          (metadata?.invoice_id && metadata.invoice_id !== invoiceAttempt.invoice_id) ||
          (metadata?.university_id && metadata.university_id !== invoiceAttempt.university_id) ||
          (metadata?.payment_attempt_id && metadata.payment_attempt_id !== invoiceAttempt.id);

        if (!txResponse.ok || verifiedPayload?.status !== true ||
            tx?.status !== "success" || tx?.reference !== transactionReference ||
            tx?.domain !== expectedDomain || tx?.currency !== "NGN" ||
            Number(tx?.amount) !== Number(invoiceAttempt.amount_kobo) ||
            verifiedEmail !== String(invoiceAttempt.customer_email || "").trim().toLowerCase() ||
            invoiceAttempt.provider_domain !== expectedDomain || metadataMismatch ||
            !paidAt || new Date(paidAt).getTime() > Date.now() + 10 * 60 * 1000) {
          await admin.schema("private").from("campus_institutional_payment_attempts")
            .update({ status: "review_required", updated_at: new Date().toISOString() })
            .eq("id", invoiceAttempt.id)
            .neq("status", "paid");
          await admin.schema("private").from("campus_institutional_paystack_events")
            .update({ review_status: "review_required" }).eq("id", eventId);
          return json({ received: true, recorded: true, review_required: true, reason: "invoice_transaction_mismatch" });
        }

        const { data: committed, error: commitError } = await admin.rpc(
          "commit_campus_institutional_invoice_payment",
          {
            p_attempt_id: invoiceAttempt.id,
            p_actor_user_id: invoiceAttempt.actor_user_id,
            p_reference: transactionReference,
            p_transaction_id: String(tx.id),
            p_amount_kobo: Number(tx.amount),
            p_currency: String(tx.currency),
            p_customer_email: verifiedEmail,
            p_provider_domain: String(tx.domain),
            p_paid_at: paidAt,
            p_event_id: eventId,
            p_verified_source: "paystack_webhook",
          },
        );

        if (commitError || !committed?.receipt_number) {
          console.error("Institutional invoice webhook reconciliation needs review.", {
            code: commitError?.code || "unknown",
            reference: transactionReference,
          });
          await admin.schema("private").from("campus_institutional_payment_attempts")
            .update({ status: "review_required", updated_at: new Date().toISOString() })
            .eq("id", invoiceAttempt.id)
            .neq("status", "paid");
          await admin.schema("private").from("campus_institutional_paystack_events")
            .update({ review_status: "review_required" }).eq("id", eventId);
          return json({ received: true, recorded: true, review_required: true });
        }

        return json({
          received: true,
          recorded: true,
          invoice_payment_reconciled: true,
          duplicate: committed.duplicate === true,
          receipt_number: committed.receipt_number,
        });
      }
    }

    if (eventType === "invoice.update" && isPaid && subscriptionCode && transactionReference && email) {
      const verificationResponse = await fetch(
        "https://api.paystack.co/transaction/verify/" + encodeURIComponent(transactionReference),
        { headers: { Authorization: "Bearer " + secret } },
      );
      const verification = await verificationResponse.json().catch(() => null);
      const tx = verification?.data;
      if (!verificationResponse.ok || verification?.status !== true ||
          tx?.status !== "success" || tx?.reference !== transactionReference ||
          Number(tx?.amount) !== amount || tx?.currency !== "NGN" ||
          tx?.domain !== expectedDomain ||
          String(tx?.customer?.email || "").trim().toLowerCase() !== email) {
        await admin.schema("private").from("campus_institutional_paystack_events")
          .update({ review_status: "review_required" }).eq("id", eventId);
        return json({ received: true, recorded: true, review_required: true, reason: "renewal_verification_mismatch" });
      }

      const verifiedPaidAt = validDate(tx.paid_at || tx.created_at);
      const accessThrough = nextPaymentAt || periodEnd;
      if (!verifiedPaidAt || !accessThrough || !periodStart || !invoiceCode) {
        await admin.schema("private").from("campus_institutional_paystack_events")
          .update({ review_status: "review_required" }).eq("id", eventId);
        return json({ received: true, recorded: true, review_required: true, reason: "renewal_period_data_missing" });
      }

      const { error: renewalError } = await admin.rpc("record_campus_institutional_paystack_renewal", {
        p_subscription_code: subscriptionCode,
        p_event_id: eventId,
        p_reference: transactionReference,
        p_transaction_id: String(tx.id),
        p_invoice_code: invoiceCode,
        p_amount_kobo: Number(tx.amount),
        p_currency: String(tx.currency),
        p_customer_email: email,
        p_provider_domain: String(tx.domain),
        p_paid_at: verifiedPaidAt,
        p_period_start: periodStart,
        p_access_through: accessThrough,
        p_next_payment_at: nextPaymentAt,
      });
      if (renewalError) {
        console.error("Institutional Paystack renewal needs review.", { code: renewalError.code || "unknown" });
        await admin.schema("private").from("campus_institutional_paystack_events")
          .update({ review_status: "review_required" }).eq("id", eventId);
        return json({ received: true, recorded: true, review_required: true });
      }
      return json({ received: true, recorded: true, renewal_processed: true });
    }

    if (eventType === "invoice.payment_failed" && subscriptionCode && email && Number.isFinite(amount)) {
      const { error: failedError } = await admin.rpc("mark_campus_institutional_paystack_renewal_failed", {
        p_subscription_code: subscriptionCode,
        p_event_id: eventId,
        p_customer_email: email,
        p_amount_kobo: Math.trunc(amount),
        p_currency: currency || "NGN",
        p_provider_domain: domain || expectedDomain,
        p_failed_at: new Date().toISOString(),
      });
      if (failedError) {
        await admin.schema("private").from("campus_institutional_paystack_events")
          .update({ review_status: "review_required" }).eq("id", eventId);
      }
      return json({ received: true, recorded: true, renewal_attention: !failedError });
    }

    if ((eventType === "subscription.not_renew" || eventType === "subscription.disable") &&
        subscriptionCode && email) {
      const { error: lifecycleError } = await admin.rpc("mark_campus_institutional_paystack_subscription_nonrenewing", {
        p_subscription_code: subscriptionCode,
        p_event_id: eventId,
        p_event_type: eventType,
        p_customer_email: email,
        p_provider_domain: domain || expectedDomain,
        p_event_at: new Date().toISOString(),
      });
      if (lifecycleError) {
        await admin.schema("private").from("campus_institutional_paystack_events")
          .update({ review_status: "review_required" }).eq("id", eventId);
      }
      return json({ received: true, recorded: true, nonrenewing: !lifecycleError });
    }

    if (eventType === "refund.processed" || eventType.startsWith("charge.dispute.")) {
      await admin.schema("private").from("campus_institutional_paystack_events")
        .update({ review_status: "review_required" }).eq("id", eventId);
    }

    // Initial payments are matched to their issued invoice by finance. A
    // subscription.create event alone is never treated as payment.
    return json({ received: true, recorded: true, activated: false });
  } catch (error) {
    console.error("Institutional Paystack webhook failed.", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return json({ error: "Webhook processing failed." }, 500);
  }
});
