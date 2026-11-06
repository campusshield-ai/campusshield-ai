import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

const fixedMonthlyAmounts: Record<string, number> = {
  "university-starter": 10000000,
  "university-professional": 25000000,
  "university-enterprise": 50000000,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const paystack = Deno.env.get("PAYSTACK_SECRET_KEY") || "";
    if (!url || !anon || !service || !paystack) {
      return json({ error: "Staging institutional payment verification is not configured." }, 503);
    }
    if (!paystack.startsWith("sk_test_")) {
      return json({ error: "Staging institutional verification accepts Paystack test payments only." }, 409);
    }

    const token = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return json({ error: "Sign in with a trusted CampusShield finance account." }, 401);
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user?.id || !user.email) return json({ error: "Your signed-in session could not be verified." }, 401);
    const { data: isPlatformAdmin, error: adminError } = await userClient.rpc("platform_is_admin");
    if (adminError || isPlatformAdmin !== true) {
      return json({ error: "Only trusted CampusShield platform finance administrators can reconcile institutional payments." }, 403);
    }

    const body = await req.json().catch(() => null);
    if (body?.action !== "verify_invoice_payment") {
      return json({ error: "Unsupported institutional finance action." }, 400);
    }
    const invoiceId = String(body?.invoice_id || "").trim();
    const reference = String(body?.reference || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invoiceId)) {
      return json({ error: "Select a valid institutional invoice." }, 400);
    }
    if (!/^[A-Za-z0-9_-]{4,128}$/.test(reference)) {
      return json({ error: "Enter the Paystack transaction reference from the receipt or dashboard." }, 400);
    }

    const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: invoice, error: invoiceError } = await db.from("campus_institutional_invoices")
      .select("id,invoice_number,university_id,bill_to_email,plan,billing_period,total_kobo,currency,status,issued_at")
      .eq("id", invoiceId).maybeSingle();
    if (invoiceError) return json({ error: "Could not load the selected invoice." }, 503);
    if (!invoice) return json({ error: "The selected invoice was not found." }, 404);
    if (invoice.status !== "issued") return json({ error: "Only an issued, unpaid invoice can be reconciled." }, 409);
    if (invoice.billing_period !== "monthly") {
      return json({ error: "This Paystack page is monthly. Annual invoices must use their separately approved payment route." }, 409);
    }
    const expectedAmount = fixedMonthlyAmounts[String(invoice.plan || "")];
    if (!expectedAmount || Number(invoice.total_kobo) !== expectedAmount || invoice.currency !== "NGN") {
      return json({ error: "This invoice does not exactly match a fixed monthly Paystack page. Use finance-approved invoice instructions instead." }, 409);
    }

    const verificationResponse = await fetch(
      "https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference),
      { headers: { Authorization: "Bearer " + paystack } },
    );
    const verification = await verificationResponse.json().catch(() => null);
    const tx = verification?.data;
    const email = String(tx?.customer?.email || "").trim().toLowerCase();
    if (!verificationResponse.ok || verification?.status !== true ||
        tx?.status !== "success" || tx?.reference !== reference ||
        Number(tx?.amount) !== Number(invoice.total_kobo) ||
        tx?.currency !== "NGN" || tx?.domain !== "test" ||
        !email || email !== String(invoice.bill_to_email || "").trim().toLowerCase()) {
      return json({
        verified: false,
        activated: false,
        error: "Paystack did not confirm a successful test payment matching this invoice amount, currency and bill-to email.",
      }, 409);
    }

    const { data: prior, error: priorError } = await db.schema("private")
      .from("campus_institutional_payment_audit")
      .select("invoice_id,subscription_id")
      .eq("provider_reference", reference)
      .maybeSingle();
    if (priorError) return json({ error: "Could not check the payment audit trail." }, 503);
    if (prior) {
      if (prior.invoice_id === invoice.id) {
        return json({ verified: true, activated: true, duplicate: true, subscription_id: prior.subscription_id });
      }
      return json({ error: "This Paystack reference has already been reconciled against another invoice." }, 409);
    }

    const paidAt = new Date(tx.paid_at || tx.created_at || Date.now());
    if (Number.isNaN(paidAt.getTime())) return json({ error: "Paystack returned an invalid payment timestamp." }, 409);

    const { data: chargeEvents, error: chargeEventError } = await db.schema("private")
      .from("campus_institutional_paystack_events")
      .select("id")
      .eq("event_type", "charge.success")
      .eq("provider_reference", reference)
      .limit(1);
    if (chargeEventError) return json({ error: "Could not match the signed Paystack event." }, 503);

    let subscriptionCode: string | null = null;
    const since = new Date(paidAt.getTime() - 30 * 60 * 1000).toISOString();
    const until = new Date(paidAt.getTime() + 30 * 60 * 1000).toISOString();
    const { data: createEvents, error: createEventError } = await db.schema("private")
      .from("campus_institutional_paystack_events")
      .select("provider_subscription_code")
      .eq("event_type", "subscription.create")
      .eq("customer_email", email)
      .eq("amount_kobo", Number(tx.amount))
      .gte("received_at", since)
      .lte("received_at", until)
      .not("provider_subscription_code", "is", null)
      .limit(3);
    if (createEventError) return json({ error: "Could not match the Paystack subscription event." }, 503);
    const possibleCodes = [...new Set((createEvents || []).map((event: any) => event.provider_subscription_code).filter(Boolean))];
    if (possibleCodes.length === 1) subscriptionCode = String(possibleCodes[0]);

    const { data: subscriptionId, error: commitError } = await db.rpc("commit_campus_institutional_paystack_payment", {
      p_invoice_id: invoice.id,
      p_actor_user_id: user.id,
      p_reference: reference,
      p_transaction_id: String(tx.id),
      p_amount_kobo: Number(tx.amount),
      p_currency: String(tx.currency),
      p_customer_email: email,
      p_provider_domain: String(tx.domain),
      p_paid_at: paidAt.toISOString(),
      p_subscription_code: subscriptionCode,
      p_event_id: chargeEvents?.[0]?.id || null,
    });
    if (commitError || !subscriptionId) {
      console.error("Institutional payment database commit failed.", { code: commitError?.code || "unknown" });
      return json({ error: "Payment was verified by Paystack but could not be committed. Contact support before retrying or paying again." }, 503);
    }

    const { data: activeSubscription } = await db.from("campus_institutional_subscriptions")
      .select("expires_at")
      .eq("id", subscriptionId)
      .maybeSingle();

    return json({
      verified: true,
      activated: true,
      subscription_id: subscriptionId,
      invoice_number: invoice.invoice_number,
      provider_reference: reference,
      expires_at: activeSubscription?.expires_at || null,
      recurring_subscription_linked: Boolean(subscriptionCode),
    });
  } catch (error) {
    console.error("Institutional payment admin action failed.", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return json({ error: "Institutional payment reconciliation could not be completed." }, 500);
  }
});
