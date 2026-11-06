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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const paystack = Deno.env.get("PAYSTACK_SECRET_KEY") || "";
    if (!url || !anon || !service || !paystack) {
      return json({ error: "Institutional payment verification is not configured." }, 503);
    }
    const expectedDomain = expectedPaystackDomain(url);
    if (!expectedDomain || !paystack.startsWith("sk_" + expectedDomain + "_")) {
      return json({ error: "Paystack secret key does not match this Supabase project's payment environment." }, 503);
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

    const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await req.json().catch(() => null);

    if (body?.action === "get_subscription_management_link") {
      const subscriptionId = String(body?.subscription_id || "").trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(subscriptionId)) {
        return json({ error: "Select a valid institutional subscription." }, 400);
      }
      const [{ data: profile, error: profileError }, { data: campusContext, error: campusError }] = await Promise.all([
        userClient.from("profiles").select("role,verification_status").eq("id", user.id).maybeSingle(),
        userClient.rpc("get_my_campus_context"),
      ]);
      const campus = Array.isArray(campusContext) ? campusContext[0] : campusContext;
      if (profileError || campusError || profile?.role !== "admin" ||
          profile?.verification_status !== "verified" || !campus?.university_id ||
          campus.membership_status !== "active" || campus.verification_status !== "verified") {
        return json({ error: "Only a verified, active campus administrator for this university can manage its subscription." }, 403);
      }
      const { data: subscription, error: subscriptionError } = await db.from("campus_institutional_subscriptions")
        .select("id,university_id,provider_subscription_code,status,renewal_status,expires_at")
        .eq("id", subscriptionId).maybeSingle();
      if (subscriptionError) return json({ error: "Could not load the institutional subscription." }, 503);
      if (!subscription || subscription.university_id !== campus.university_id) {
        return json({ error: "This subscription does not belong to your verified university." }, 404);
      }
      if (!subscription.provider_subscription_code) {
        return json({ error: "This subscription has no linked Paystack recurring subscription code. Contact CampusShield finance." }, 409);
      }
      if (subscription.status === "expired" || subscription.status === "cancelled") {
        return json({ error: "This institutional subscription is no longer active." }, 409);
      }
      const manageResponse = await fetch(
        "https://api.paystack.co/subscription/" + encodeURIComponent(subscription.provider_subscription_code) + "/manage/link/",
        { headers: { Authorization: "Bearer " + paystack } },
      );
      const managePayload = await manageResponse.json().catch(() => null);
      const manageLink = String(managePayload?.data?.link || "");
      if (!manageResponse.ok || managePayload?.status !== true ||
          !/^https:\/\/paystack\.com\/manage\/subscriptions\//i.test(manageLink)) {
        return json({ error: "Paystack could not create the subscription management link. Try again or contact finance." }, 503);
      }
      return json({ link: manageLink, expires_at: subscription.expires_at, renewal_status: subscription.renewal_status });
    }

    if (body?.action === "list_payment_audit") {
      const requestedLimit = Number(body?.limit);
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(100, Math.max(1, Math.trunc(requestedLimit)))
        : 50;
      const { data: auditRows, error: auditError } = await db.schema("private")
        .from("campus_institutional_payment_audit")
        .select("id,invoice_id,university_id,verified_by,provider_reference,provider_transaction_id,provider_domain,customer_email,amount_kobo,currency,provider_paid_at,verified_at,payment_kind,verified_source,provider_invoice_code,period_start,period_end")
        .order("verified_at", { ascending: false })
        .limit(limit);
      if (auditError) return json({ error: "Could not load the institutional payment audit." }, 503);
      if (!auditRows?.length) return json({ entries: [] });

      const invoiceIds = [...new Set(auditRows.map((row: any) => row.invoice_id))];
      const universityIds = [...new Set(auditRows.map((row: any) => row.university_id))];
      const verifierIds = [...new Set(auditRows.map((row: any) => row.verified_by).filter(Boolean))];
      const [invoices, universities, verifiers] = await Promise.all([
        db.from("campus_institutional_invoices")
          .select("id,invoice_number,plan,billing_period")
          .in("id", invoiceIds),
        db.from("campus_universities")
          .select("id,name")
          .in("id", universityIds),
        verifierIds.length
          ? db.from("profiles").select("id,display_name").in("id", verifierIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (invoices.error || universities.error || verifiers.error) {
        return json({ error: "Could not enrich the institutional payment audit." }, 503);
      }
      const invoiceById = new Map((invoices.data || []).map((row: any) => [row.id, row]));
      const universityById = new Map((universities.data || []).map((row: any) => [row.id, row]));
      const verifierById = new Map((verifiers.data || []).map((row: any) => [row.id, row]));
      return json({
        entries: auditRows.map((row: any) => ({
          id: row.id,
          invoice_number: invoiceById.get(row.invoice_id)?.invoice_number || "Invoice unavailable",
          plan: invoiceById.get(row.invoice_id)?.plan || null,
          billing_period: invoiceById.get(row.invoice_id)?.billing_period || null,
          institution_name: universityById.get(row.university_id)?.name || "Institution unavailable",
          verified_by_name: row.verified_by
            ? (verifierById.get(row.verified_by)?.display_name || "Platform finance administrator")
            : (row.verified_source === "paystack_webhook" ? "Paystack renewal webhook" : "System"),
          provider_reference: row.provider_reference,
          provider_transaction_id: row.provider_transaction_id,
          provider_domain: row.provider_domain,
          customer_email: row.customer_email,
          amount_kobo: row.amount_kobo,
          currency: row.currency,
          provider_paid_at: row.provider_paid_at,
          verified_at: row.verified_at,
          payment_kind: row.payment_kind,
          provider_invoice_code: row.provider_invoice_code,
          period_start: row.period_start,
          period_end: row.period_end,
          verified_source: row.verified_source,
        })),
      });
    }

    if (body?.action !== "verify_invoice_payment") {
      return json({ error: "Unsupported institutional finance action." }, 400);
    }
    const invoiceId = String(body?.invoice_id || "").trim();
    const reference = String(body?.reference || "").trim();
    const subscriptionCode = String(body?.subscription_code || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invoiceId)) {
      return json({ error: "Select a valid institutional invoice." }, 400);
    }
    if (!/^[A-Za-z0-9_-]{4,128}$/.test(reference)) {
      return json({ error: "Enter the Paystack transaction reference from the receipt or dashboard." }, 400);
    }
    if (!/^SUB_[A-Za-z0-9_-]{6,120}$/.test(subscriptionCode)) {
      return json({ error: "Enter the Paystack subscription code (SUB_…) for this recurring payment." }, 400);
    }

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
        tx?.currency !== "NGN" || tx?.domain !== expectedDomain ||
        !email || email !== String(invoice.bill_to_email || "").trim().toLowerCase()) {
      return json({
        verified: false,
        activated: false,
        error: "Paystack did not confirm a successful payment matching this invoice amount, currency, environment and bill-to email.",
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

    // Verify the hosted page created a real recurring subscription for this
    // customer, at the exact invoiced amount and monthly interval.
    const subscriptionResponse = await fetch(
      "https://api.paystack.co/subscription/" + encodeURIComponent(subscriptionCode),
      { headers: { Authorization: "Bearer " + paystack } },
    );
    const subscriptionPayload = await subscriptionResponse.json().catch(() => null);
    const providerSubscription = subscriptionPayload?.data;
    const providerEmail = String(providerSubscription?.customer?.email || "").trim().toLowerCase();
    const providerAmount = Number(providerSubscription?.amount);
    const providerNextPayment = new Date(providerSubscription?.next_payment_date || "");
    if (!subscriptionResponse.ok || subscriptionPayload?.status !== true ||
        providerSubscription?.subscription_code !== subscriptionCode ||
        providerSubscription?.status !== "active" ||
        providerSubscription?.domain !== expectedDomain ||
        providerAmount !== Number(invoice.total_kobo) ||
        providerSubscription?.plan?.interval !== "monthly" ||
        String(providerSubscription?.plan?.currency || "NGN") !== "NGN" ||
        providerEmail !== String(invoice.bill_to_email || "").trim().toLowerCase() ||
        !Number.isFinite(providerNextPayment.getTime()) ||
        providerNextPayment <= paidAt ||
        providerNextPayment.getTime() > paidAt.getTime() + 45 * 86400000) {
      return json({
        verified: true,
        activated: false,
        error: "The payment succeeded, but Paystack did not confirm a matching active monthly subscription for this institution. Do not ask the university to pay again; finance must reconcile this transaction.",
      }, 409);
    }

    const { data: chargeEvents, error: chargeEventError } = await db.schema("private")
      .from("campus_institutional_paystack_events")
      .select("id,provider_subscription_code")
      .eq("event_type", "charge.success")
      .eq("provider_reference", reference)
      .limit(1);
    if (chargeEventError) return json({ error: "Could not match the signed Paystack event." }, 503);

    // Bind a subscription code only when Paystack included it on the exact
    // charge.success event with the transaction reference being verified.
    const subscriptionCode = chargeEvents?.[0]?.provider_subscription_code
      ? String(chargeEvents[0].provider_subscription_code)
      : null;

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
      p_next_payment_at: providerNextPayment.toISOString(),
      p_provider_plan_code: String(providerSubscription?.plan?.plan_code || "") || null,
      p_provider_customer_code: String(providerSubscription?.customer?.customer_code || "") || null,
      p_event_id: chargeEvents?.[0]?.id || null,
    });
    if (commitError || !subscriptionId) {
      console.error("Institutional payment database commit failed.", { code: commitError?.code || "unknown" });
      return json({ error: "Payment was verified by Paystack but could not be committed. Contact support before retrying or paying again." }, 503);
    }

    const { data: activeSubscription } = await db.from("campus_institutional_subscriptions")
      .select("expires_at,next_payment_at,provider_subscription_code")
      .eq("id", subscriptionId)
      .maybeSingle();

    return json({
      verified: true,
      activated: true,
      subscription_id: subscriptionId,
      invoice_number: invoice.invoice_number,
      provider_reference: reference,
      expires_at: activeSubscription?.expires_at || null,
      next_payment_at: activeSubscription?.next_payment_at || null,
      recurring_subscription_linked: Boolean(activeSubscription?.provider_subscription_code),
    });
  } catch (error) {
    console.error("Institutional payment admin action failed.", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return json({ error: "Institutional payment reconciliation could not be completed." }, 500);
  }
});
