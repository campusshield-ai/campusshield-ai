import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const DEFAULT_APP_ORIGIN = "https://campusshield-ai.github.io";
const cors = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});
const json = (body: Record<string, unknown>, status = 200, origin = DEFAULT_APP_ORIGIN) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
const normaliseOrigin = (value: string) => value.replace(/\/$/, "");
const allowedLocalOrigin = (value: string) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(value);

function isAllowedPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const allowed = host === "fcm.googleapis.com" ||
      host === "android.googleapis.com" ||
      host === "web.push.apple.com" ||
      host.endsWith(".push.services.mozilla.com") ||
      host === "push.services.mozilla.com" ||
      host.endsWith(".notify.windows.com");
    return url.protocol === "https:" && allowed && !url.username && !url.password && url.port === "";
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  const origin = normaliseOrigin(req.headers.get("origin") || "");
  const configuredOrigin = normaliseOrigin(Deno.env.get("CAMPUSSHIELD_APP_ORIGIN") || "");
  const originAllowed = Boolean(origin) && (configuredOrigin
    ? origin === configuredOrigin
    : origin === DEFAULT_APP_ORIGIN || allowedLocalOrigin(origin));
  const send = (body: Record<string, unknown>, status = 200) => json(body, status, origin || DEFAULT_APP_ORIGIN);
  if (!originAllowed) {
    if (req.method === "OPTIONS") return new Response("origin not allowed", { status: 403 });
    return new Response(JSON.stringify({ error: "Push origin is not allowed. Configure CAMPUSSHIELD_APP_ORIGIN for this staging preview." }), {
      status: 403, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return send({ error: "Method not allowed." }, 405);

  try {
    const authorization = req.headers.get("authorization") || "";
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return send({ error: "Sign in to manage push notifications." }, 401);
    const url = Deno.env.get("SUPABASE_URL") || "";
    const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !anon || !service) return send({ error: "Push notification storage is not configured." }, 503);

    const authClient = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user?.id) return send({ error: "Your sign-in session could not be verified." }, 401);

    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await req.json().catch(() => null);
    const action = body?.action;
    const publicKey = String(Deno.env.get("VAPID_PUBLIC_KEY") || "").trim();

    if (action === "config" || action === "status") {
      const { count, error } = await admin.from("campus_push_subscriptions")
        .select("endpoint", { count: "exact", head: true }).eq("user_id", user.id);
      if (error) return send({ error: "Could not read push notification status." }, 503);
      return send({
        configured: Boolean(publicKey),
        publicKey: publicKey || null,
        subscribed: Boolean(count && count > 0),
        subscriptionCount: count || 0,
      });
    }

    if (action === "subscribe") {
      if (!publicKey) return send({ error: "Background push is not configured yet. The staging VAPID public key is missing." }, 503);
      const subscription = body?.subscription;
      const endpoint = String(subscription?.endpoint || "");
      const p256dh = String(subscription?.keys?.p256dh || "");
      const auth = String(subscription?.keys?.auth || "");
      const userAgent = String(req.headers.get("user-agent") || "").slice(0, 300);
      if (!isAllowedPushEndpoint(endpoint) || p256dh.length < 16 || p256dh.length > 256 || auth.length < 8 || auth.length > 128) {
        return send({ error: "The browser returned an invalid push subscription." }, 400);
      }
      const { data: existing, error: existingError } = await admin.from("campus_push_subscriptions")
        .select("user_id").eq("endpoint", endpoint).maybeSingle();
      if (existingError) return send({ error: "Could not safely check this push subscription." }, 503);
      if (existing && existing.user_id !== user.id) {
        return send({ error: "This browser subscription is already associated with another account. Disable it there first." }, 409);
      }
      const now = new Date().toISOString();
      const { error } = await admin.from("campus_push_subscriptions").upsert({
        user_id: user.id, endpoint, p256dh_key: p256dh, auth_key: auth, user_agent: userAgent, expiration_time: subscription?.expirationTime ? new Date(subscription.expirationTime).toISOString() : null, updated_at: now, failure_count: 0, last_error_code: null,
      }, { onConflict: "endpoint" });
      if (error) return send({ error: "Could not save your push subscription." }, 503);
      return send({ subscribed: true });
    }

    if (action === "unsubscribe") {
      const endpoint = String(body?.endpoint || "");
      if (!isAllowedPushEndpoint(endpoint)) return send({ error: "The browser push endpoint is invalid." }, 400);
      const { error } = await admin.from("campus_push_subscriptions").delete()
        .eq("user_id", user.id).eq("endpoint", endpoint);
      if (error) return send({ error: "Could not remove your push subscription." }, 503);
      return send({ subscribed: false });
    }
    return send({ error: "Unknown push action." }, 400);
  } catch {
    console.error("campus-push-subscriptions: unexpected failure");
    return send({ error: "Push notification settings are unavailable. Please try again." }, 500);
  }
});
