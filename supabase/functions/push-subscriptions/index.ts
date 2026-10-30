import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const DEFAULT_ORIGIN = "https://campusshield-ai.github.io";
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
const validPushEndpoint = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length > 4096) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (
      url.hostname === "fcm.googleapis.com" ||
      url.hostname.endsWith(".push.services.mozilla.com") ||
      url.hostname === "updates.push.services.mozilla.com" ||
      url.hostname === "web.push.apple.com"
    );
  } catch { return false; }
};

Deno.serve(async (req: Request) => {
  const origin = (req.headers.get("origin") || "").replace(/\/$/, "");
  const configuredOrigin = (Deno.env.get("CAMPUSSHIELD_APP_ORIGIN") || "").replace(/\/$/, "");
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const previewOrigins = new Set([
    "https://campusshield-ai-staging-preview-2olhtbzac.vercel.app",
    "https://campusshield-ai-staging-p-git-546f84-chinedugabrielanunobi-8135.vercel.app"
  ]);
  // Vercel assigns a new immutable hostname to each preview. Permit only this
  // project's two known hostname patterns, not arbitrary Vercel deployments.
  const isCampusShieldStagingPreview =
    /^https:\/\/campusshield-ai-staging-preview-[a-z0-9]+\.vercel\.app$/.test(origin) ||
    /^https:\/\/campusshield-ai-staging-p-git-[a-z0-9]+-chinedugabrielanunobi-8135\.vercel\.app$/.test(origin);
  const allowed = Boolean(origin) && (
    origin === DEFAULT_ORIGIN ||
    previewOrigins.has(origin) ||
    isCampusShieldStagingPreview ||
    local ||
    Boolean(configuredOrigin && origin === configuredOrigin)
  );
  if (!allowed) return json({ error: "App origin is not allowed. Configure CAMPUSSHIELD_APP_ORIGIN for this preview." }, 403);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405, origin);

  const token = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "Sign in before managing push notifications." }, 401, origin);
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !anon || !service) return json({ error: "Push subscriptions are not configured." }, 503, origin);

  try {
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser(token);
    if (userError || !user?.id) return json({ error: "Your session could not be verified." }, 401, origin);
    const body = await req.json().catch(() => null);
    if (!body || typeof body.action !== "string") return json({ error: "Choose a push subscription action." }, 400, origin);

    if (body.action === "get-key") {
      const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
      if (!publicKey) return json({ error: "Background notifications are not configured yet. An administrator must finish setup." }, 503, origin);
      return json({ publicKey }, 200, origin);
    }

    const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    if (body.action === "subscribe") {
      const sub = body.subscription;
      if (!sub || !validPushEndpoint(sub.endpoint) ||
          typeof sub.keys?.p256dh !== "string" || sub.keys.p256dh.length < 20 ||
          typeof sub.keys?.auth !== "string" || sub.keys.auth.length < 8 ||
          sub.endpoint.length > 4096) {
        return json({ error: "The browser returned an invalid push subscription." }, 400, origin);
      }
      const expiry = sub.expirationTime ? new Date(sub.expirationTime) : null;
      const { error } = await db.from("campus_push_subscriptions").upsert({
        endpoint: sub.endpoint,
        user_id: user.id,
        p256dh_key: sub.keys.p256dh,
        auth_key: sub.keys.auth,
        expiration_time: expiry && !Number.isNaN(expiry.getTime()) ? expiry.toISOString() : null,
        user_agent: String(req.headers.get("user-agent") || "").slice(0, 300) || null,
        updated_at: new Date().toISOString(),
        failure_count: 0,
        last_error_code: null,
      }, { onConflict: "endpoint" });
      if (error) {
        console.error("Push subscription upsert failed", { code: error.code });
        return json({ error: "Could not save this device's push subscription." }, 503, origin);
      }
      return json({ subscribed: true }, 200, origin);
    }

    if (body.action === "unsubscribe") {
      if (typeof body.endpoint !== "string" || !validPushEndpoint(body.endpoint)) {
        return json({ error: "Choose a valid device subscription." }, 400, origin);
      }
      const { error } = await db.from("campus_push_subscriptions")
        .delete().eq("endpoint", body.endpoint).eq("user_id", user.id);
      if (error) {
        console.error("Push subscription removal failed", { code: error.code });
        return json({ error: "Could not turn off push notifications for this device." }, 503, origin);
      }
      return json({ unsubscribed: true }, 200, origin);
    }

    return json({ error: "Unsupported push subscription action." }, 400, origin);
  } catch {
    return json({ error: "Push subscriptions are temporarily unavailable." }, 500, origin);
  }
});
