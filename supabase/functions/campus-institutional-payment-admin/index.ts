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
    headers: {
      ...cors,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Pragma": "no-cache",
    },
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

function normalizedEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function appCallbackUrl(request: Request): string {
  const configured = Deno.env.get("CAMPUSSHIELD_APP_ORIGIN") || "";
  const requestOrigin = request.headers.get("origin") || "";
  const candidate = configured || requestOrigin || "https://campusshield-ai.github.io";
  const parsed = new URL(candidate);
  const allowedHosts = new Set([
    "campusshield-ai.github.io",
    "campusshieldai.com",
    "www.campusshieldai.com",
    "campusshield-ai-staging-preview.vercel.app",
  ]);
  const approvedPreview = parsed.hostname.startsWith("campusshield-ai-staging-preview-") &&
    parsed.hostname.endsWith(".vercel.app");
  if (parsed.protocol !== "https:" || (!allowedHosts.has(parsed.hostname) && !approvedPreview)) {
    throw new Error("The institutional payment return address is not an approved CampusShield app origin.");
  }
  const path = parsed.hostname === "campusshield-ai.github.io"
    ? "/campusshield-ai/"
    : "/";
  const callback = new URL(path, parsed.origin);
  callback.searchParams.set("institutional_invoice_payment", "1");
  return callback.toString();
}

async function markAttemptForReview(
  db: ReturnType<typeof createClient>,
  attemptId: string,
  eventId?: string,
): Promise<void> {
  await db.schema("private").from("campus_institutional_payment_attempts")
    .update({ status: "review_required", updated_at: new Date().toISOString() })
    .eq("id", attemptId)
    .neq("status", "paid");
  if (eventId) {
    await db.schema("private").from("campus_institutional_paystack_events")
      .update({ review_status: "review_required", reviewed_at: new Date().toISOString() })
      .eq("id", eventId);
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
    const expectedDomain = expectedPaystackDomain(url);
    const paymentsEnabled = Deno.env.get("CAMPUS_INSTITUTIONAL_PAYMENTS_ENABLED") === "true";
    if (!url || !anon || !service || !expectedDomain) {
      return json({ error: "Institutional invoice services are not configured for this environment." }, 503);
    }

    const token = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return json({ error: "Sign in with a verified university finance account." }, 401);

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: "Bearer " + token } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user?.id || !user.email) {
      return json({ error: "Your signed-in session could not be verified." }, 401);
    }

    const [{ data: canManage, error: permissionError },
      { data: profile, error: profileError },
      { data: campusData, error: campusError },
      { data: financeData, error: financeError }] = await Promise.all([
      userClient.rpc("can_manage_institutional_billing"),
      userClient.from("profiles").select("role,verification_status").eq("id", user.id).maybeSingle(),
      userClient.rpc("get_my_campus_context"),
      userClient.rpc("get_my_campus_finance_access"),
    ]);

    const campus = Array.isArray(campusData) ? campusData[0] : campusData;
    const financeAccess = Array.isArray(financeData) ? financeData[0] : financeData;
    if (permissionError || profileError || campusError || financeError ||
        canManage !== true || !campus?.university_id ||
        campus.membership_status !== "active" ||
        campus.verification_status !== "verified" ||
        profile?.verification_status !== "verified" ||
        !["admin", "teacher"].includes(String(profile?.role || "")) ||
        (profile?.role === "teacher" && financeAccess?.university_id !== campus.university_id)) {
      return json({
        error: "Only a verified campus administrator or separately appointed finance officer can access this university's institutional invoices.",
      }, 403);
    }

    const db = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const body = await req.json().catch(() => null);
    const action = String(body?.action || "");

    if (action === "list_invoices") {
      const { data: invoices, error: invoiceError } = await db.from("campus_institutional_invoices")
        .select("id,invoice_number,university_id,bill_to_name,bill_to_email,plan,billing_period,description,subtotal_kobo,tax_kobo,total_kobo,currency,due_date,payment_instructions,status,issued_at,paid_at,paid_reference")
        .eq("university_id", campus.university_id)
        .order("issued_at", { ascending: false })
        .limit(50);
      if (invoiceError) return json({ error: "Institutional invoices could not be loaded." }, 503);
      const invoiceIds = (invoices || []).map((invoice: any) => invoice.id);
      const attemptQuery = invoiceIds.length
        ? await db.schema("private").from("campus_institutional_payment_attempts")
          .select("invoice_id,reference,status,expires_at,created_at")
          .in("invoice_id", invoiceIds)
          .in("status", ["pending", "review_required"])
          .order("created_at", { ascending: false })
        : { data: [], error: null };
      if (attemptQuery.error) return json({ error: "Institutional payment attempts could not be loaded." }, 503);
      const latestAttempt = new Map<string, any>();
      for (const row of attemptQuery.data || []) {
        if (!latestAttempt.has(row.invoice_id)) latestAttempt.set(row.invoice_id, row);
      }
      const auditQuery = invoiceIds.length
        ? await db.schema("private").from("campus_institutional_payment_audit")
          .select("invoice_id,receipt_number,provider_reference,provider_transaction_id,amount_kobo,currency,provider_paid_at,verified_at,payment_kind,verified_source")
          .in("invoice_id", invoiceIds)
          .order("verified_at", { ascending: false })
        : { data: [], error: null };
      if (auditQuery.error) return json({ error: "Institutional receipts could not be loaded." }, 503);
      const receiptByInvoice = new Map<string, any>();
      for (const row of auditQuery.data || []) {
        if (!receiptByInvoice.has(row.invoice_id)) receiptByInvoice.set(row.invoice_id, row);
      }
      return json({
        invoices: (invoices || []).map((invoice: any) => ({
          ...invoice,
          receipt: receiptByInvoice.get(invoice.id) || null,
          latest_attempt: latestAttempt.get(invoice.id) || null,
        })),
        university_name: campus.university_name || null,
        payments_enabled: paymentsEnabled && !!paystack &&
          paystack.startsWith("sk_" + expectedDomain + "_"),
      });
    }

    if (action === "initialize_invoice_payment") {
      if (!paymentsEnabled) {
        return json({ error: "Online institutional payments are disabled until the university payment provider is configured and explicitly enabled." }, 503);
      }
      if (!paystack || !paystack.startsWith("sk_" + expectedDomain + "_")) {
        return json({ error: "The Paystack key is missing or does not match this project's test/live environment." }, 503);
      }
      const invoiceId = String(body?.invoice_id || "").trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invoiceId)) {
        return json({ error: "Select a valid institutional invoice." }, 400);
      }
      const { data: invoice, error: invoiceError } = await db.from("campus_institutional_invoices")
        .select("id,invoice_number,university_id,bill_to_name,bill_to_email,plan,billing_period,total_kobo,currency,status,due_date")
        .eq("id", invoiceId)
        .eq("university_id", campus.university_id)
        .maybeSingle();
      if (invoiceError) return json({ error: "The institutional invoice could not be loaded." }, 503);
      if (!invoice) return json({ error: "This invoice does not belong to your verified university." }, 404);
      if (invoice.status !== "issued") return json({ error: "Only an issued, unpaid invoice can be paid." }, 409);
      const amount = Number(invoice.total_kobo);
      if (!Number.isSafeInteger(amount) || amount <= 0 || invoice.currency !== "NGN" ||
          !normalizedEmail(invoice.bill_to_email)) {
        return json({ error: "The invoice amount or bill-to details are incomplete. Contact CampusShield finance." }, 409);
      }

      const now = new Date();
      const { data: existingAttempt, error: attemptReadError } = await db.schema("private")
        .from("campus_institutional_payment_attempts")
        .select("id,reference,authorization_url,expires_at,status,amount_kobo")
        .eq("invoice_id", invoice.id)
        .eq("university_id", campus.university_id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (attemptReadError) return json({ error: "An existing payment attempt could not be checked." }, 503);
      if (existingAttempt && new Date(existingAttempt.expires_at).getTime() > now.getTime() &&
          existingAttempt.authorization_url) {
        return json({
          authorization_url: existingAttempt.authorization_url,
          reference: existingAttempt.reference,
          reused: true,
        });
      }
      if (existingAttempt) {
        await db.schema("private").from("campus_institutional_payment_attempts")
          .update({ status: "expired", updated_at: now.toISOString() })
          .eq("id", existingAttempt.id)
          .eq("status", "pending");
      }

      const attemptId = crypto.randomUUID();
      const reference = "CSI-" + crypto.randomUUID();
      const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
      const { error: attemptInsertError } = await db.schema("private")
        .from("campus_institutional_payment_attempts")
        .insert({
          id: attemptId,
          university_id: campus.university_id,
          invoice_id: invoice.id,
          actor_user_id: user.id,
          reference,
          amount_kobo: amount,
          currency: "NGN",
          customer_email: normalizedEmail(invoice.bill_to_email),
          provider_domain: expectedDomain,
          status: "pending",
          expires_at: expiresAt,
        });
      if (attemptInsertError) {
        return json({ error: "A secure payment attempt could not be created. Refresh the invoice list and try again." }, 503);
      }

      let callbackUrl: string;
      try {
        callbackUrl = appCallbackUrl(req);
      } catch {
        await markAttemptForReview(db, attemptId);
        return json({ error: "The return address is not an approved CampusShield app origin. Open the official CampusShield site and try again." }, 403);
      }
      const initResponse = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + paystack,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: normalizedEmail(invoice.bill_to_email),
          amount,
          currency: "NGN",
          reference,
          callback_url: callbackUrl,
          metadata: {
            source: "campusshield_institutional_invoice",
            invoice_id: invoice.id,
            university_id: campus.university_id,
            payment_attempt_id: attemptId,
            invoice_number: invoice.invoice_number,
          },
        }),
      });
      const initPayload = await initResponse.json().catch(() => null);
      const authorizationUrl = String(initPayload?.data?.authorization_url || "");
      if (!initResponse.ok || initPayload?.status !== true ||
          !/^https:\/\/checkout\.paystack\.com\//i.test(authorizationUrl)) {
        await markAttemptForReview(db, attemptId);
        return json({
          error: "Paystack could not open a secure checkout for this invoice. No payment confirmation was recorded. Contact finance before retrying if your bank shows a debit.",
        }, 503);
      }
      const { error: saveAttemptError } = await db.schema("private")
        .from("campus_institutional_payment_attempts")
        .update({ authorization_url: authorizationUrl, updated_at: new Date().toISOString() })
        .eq("id", attemptId);
      if (saveAttemptError) {
        await markAttemptForReview(db, attemptId);
        return json({
          error: "Paystack created a checkout, but CampusShield could not save the checkout state. Do not initiate another payment; contact finance with reference " + reference + ".",
          reference,
        }, 503);
      }
      return json({ authorization_url: authorizationUrl, reference, invoice_number: invoice.invoice_number });
    }

    if (action === "verify_invoice_payment") {
      const reference = String(body?.reference || "").trim();
      if (!/^[A-Za-z0-9_-]{4,120}$/.test(reference)) {
        return json({ error: "Enter the Paystack transaction reference." }, 400);
      }
      const { data: attempt, error: attemptError } = await db.schema("private")
        .from("campus_institutional_payment_attempts")
        .select("id,invoice_id,university_id,actor_user_id,reference,amount_kobo,currency,customer_email,provider_domain,status")
        .eq("reference", reference)
        .eq("university_id", campus.university_id)
        .maybeSingle();
      if (attemptError) return json({ error: "The payment attempt could not be loaded." }, 503);
      if (!attempt) return json({ error: "This payment reference does not belong to an invoice for your university." }, 404);
      if (attempt.status === "paid") {
        const { data: priorReceipt } = await db.schema("private").from("campus_institutional_payment_audit")
          .select("receipt_number,invoice_id")
          .eq("provider_reference", reference)
          .maybeSingle();
        return json({
          verified: true,
          duplicate: true,
          receipt_number: priorReceipt?.receipt_number || null,
          invoice_id: attempt.invoice_id,
        });
      }
      if (!["pending", "review_required"].includes(attempt.status)) {
        return json({ error: "This payment attempt is no longer active. Refresh the invoice before starting a new checkout." }, 409);
      }

      if (!paystack || !paystack.startsWith("sk_" + expectedDomain + "_")) {
        return json({ error: "Paystack verification is not configured for this environment. Do not retry payment." }, 503);
      }
      const verificationResponse = await fetch(
        "https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference),
        { headers: { Authorization: "Bearer " + paystack } },
      );
      const verification = await verificationResponse.json().catch(() => null);
      const tx = verification?.data;
      const email = normalizedEmail(tx?.customer?.email);
      const transactionId = tx?.id == null ? "" : String(tx.id);
      const paidAt = new Date(tx?.paid_at || tx?.created_at || "");
      const metadata = typeof tx?.metadata === "string"
        ? (() => { try { return JSON.parse(tx.metadata); } catch { return {}; } })()
        : (tx?.metadata || {});
      const mismatchedMetadata =
        (metadata?.invoice_id && metadata.invoice_id !== attempt.invoice_id) ||
        (metadata?.university_id && metadata.university_id !== attempt.university_id) ||
        (metadata?.payment_attempt_id && metadata.payment_attempt_id !== attempt.id);
      if (!verificationResponse.ok || verification?.status !== true ||
          tx?.status !== "success" || tx?.reference !== reference ||
          !transactionId || Number(tx?.amount) !== Number(attempt.amount_kobo) ||
          tx?.currency !== "NGN" || tx?.domain !== attempt.provider_domain ||
          tx?.domain !== expectedDomain || email !== normalizedEmail(attempt.customer_email) ||
          mismatchedMetadata || !Number.isFinite(paidAt.getTime()) ||
          paidAt.getTime() > Date.now() + 10 * 60 * 1000) {
        return json({
          verified: false,
          error: "Paystack has not confirmed a successful payment matching this invoice, amount, bill-to email and payment environment.",
        }, 409);
      }

      const { data: committed, error: commitError } = await db.rpc("commit_campus_institutional_invoice_payment", {
        p_attempt_id: attempt.id,
        p_actor_user_id: attempt.actor_user_id,
        p_reference: reference,
        p_transaction_id: transactionId,
        p_amount_kobo: Number(tx.amount),
        p_currency: String(tx.currency),
        p_customer_email: email,
        p_provider_domain: String(tx.domain),
        p_paid_at: paidAt.toISOString(),
        p_event_id: null,
        p_verified_source: "finance",
        p_verified_by_user_id: user.id,
      });
      if (commitError || !committed?.receipt_number) {
        console.error("Verified institutional invoice payment needs reconciliation.", {
          code: commitError?.code || "unknown",
          reference,
        });
        await markAttemptForReview(db, attempt.id);
        return json({
          verified: true,
          reconciled: false,
          reference,
          error: "Paystack confirms this payment, but CampusShield could not finish the database reconciliation. Do not pay again. Contact CampusShield finance and provide the reference above.",
        }, 503);
      }
      return json({
        verified: true,
        reconciled: true,
        duplicate: committed.duplicate === true,
        invoice_id: committed.invoice_id,
        invoice_number: committed.invoice_number,
        receipt_number: committed.receipt_number,
        expires_at: committed.expires_at || null,
      });
    }

    if (action === "get_invoice_receipt") {
      const invoiceId = String(body?.invoice_id || "").trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invoiceId)) {
        return json({ error: "Select a valid institutional invoice." }, 400);
      }
      const { data: invoice, error: invoiceError } = await db.from("campus_institutional_invoices")
        .select("id,invoice_number,university_id,bill_to_name,bill_to_email,plan,billing_period,description,total_kobo,currency,status,paid_at,paid_reference")
        .eq("id", invoiceId)
        .eq("university_id", campus.university_id)
        .eq("status", "paid")
        .maybeSingle();
      if (invoiceError) return json({ error: "The invoice receipt could not be loaded." }, 503);
      if (!invoice) return json({ error: "A paid invoice for this university was not found." }, 404);
      const { data: audit, error: auditError } = await db.schema("private")
        .from("campus_institutional_payment_audit")
        .select("receipt_number,provider_reference,provider_transaction_id,provider_domain,customer_email,amount_kobo,currency,provider_paid_at,verified_at,payment_kind,verified_source")
        .eq("invoice_id", invoice.id)
        .order("verified_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (auditError || !audit) return json({ error: "The payment was recorded, but its receipt is not currently available. Contact finance." }, 503);
      return json({ invoice, receipt: audit, university_name: campus.university_name || null });
    }

    return json({ error: "Unsupported institutional finance action." }, 400);
  } catch (error) {
    console.error("Institutional invoice payment action failed.", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return json({ error: "Institutional invoice payment processing could not be completed." }, 500);
  }
});
