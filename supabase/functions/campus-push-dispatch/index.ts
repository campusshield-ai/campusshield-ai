import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import webpush from "npm:web-push@3.6.7";

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});
function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) diff |= (a[i] || 0) ^ (b[i] || 0);
  return diff === 0;
}
function safeInAppPath(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 500 || value.startsWith("//") ||
      /^[a-z][a-z0-9+.-]*:/i.test(value) || /[\r\n\\]/.test(value)) return "./";
  return value.startsWith("/") || value.startsWith("./") || value.startsWith("?") ? value : "./";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const dispatchSecret = Deno.env.get("PUSH_DISPATCH_SECRET") || "";
  const receivedSecret = req.headers.get("x-push-dispatch-secret") || "";
  if (!dispatchSecret) return json({ error: "Push dispatch is not configured." }, 503);
  if (!receivedSecret || !constantTimeEqual(receivedSecret, dispatchSecret)) {
    return json({ error: "Not authorized." }, 401);
  }
  const url = Deno.env.get("SUPABASE_URL") || "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
  const subject = Deno.env.get("VAPID_SUBJECT") || "";
  if (!url || !service || !publicKey || !privateKey || !subject) {
    return json({ error: "Push delivery is not configured." }, 503);
  }

  try {
    const body = await req.json().catch(() => null);
    const userId = String(body?.user_id || "");
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const title = String(body?.title || "").trim();
    const message = String(body?.body || "").trim();
    const tag = String(body?.tag || "campusshield-update").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80);
    const path = safeInAppPath(body?.url);
    if (!uuidPattern.test(userId) || !title || title.length > 80 || !message || message.length > 180) {
      return json({ error: "Provide a valid user ID, title (1–80 characters), and body (1–180 characters)." }, 400);
    }
    const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: subscriptions, error } = await db.from("campus_push_subscriptions")
      .select("user_id,endpoint,p256dh_key,auth_key").eq("user_id", userId).limit(20);
    if (error) return json({ error: "Could not load push subscriptions." }, 503);
    if (!subscriptions?.length) return json({ delivered: 0, expired: 0, failed: 0, reason: "no_subscriptions" });

    webpush.setVapidDetails(subject, publicKey, privateKey);
    const payload = JSON.stringify({ title, body: message, url: path, tag });
    let delivered = 0, expired = 0, failed = 0;
    for (const row of subscriptions) {
      try {
        await webpush.sendNotification({
          endpoint: row.endpoint, keys: { p256dh: row.p256dh_key, auth: row.auth_key },
        }, payload, { TTL: 3600 });
        delivered += 1;
      } catch (error) {
        const status = Number((error as { statusCode?: number })?.statusCode || 0);
        if (status === 404 || status === 410) {
          const { error: deleteError } = await db.from("campus_push_subscriptions").delete().eq("endpoint", row.endpoint).eq("user_id", userId);
          if (!deleteError) expired += 1;
          else failed += 1;
        } else {
          failed += 1;
          console.warn("campus-push-dispatch: delivery failure", JSON.stringify({
            status: status || null,
            code: String((error as { code?: unknown })?.code || "").slice(0, 60) || null,
          }));
        }
      }
    }
    console.info("campus-push-dispatch: completed", JSON.stringify({ requested: subscriptions.length, delivered, expired, failed }));
    return json({ delivered, expired, failed });
  } catch {
    console.error("campus-push-dispatch: unexpected failure");
    return json({ error: "Push delivery failed. Check server configuration and delivery diagnostics." }, 500);
  }
});
