import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import webpush from "npm:web-push@3.6.7";

const genericMessages = {
  timetable_reminder: { title: "CampusShield timetable", body: "You have a scheduled campus item coming up.", page: "timetable" },
  new_message: { title: "CampusShield messages", body: "You have a new campus message. Sign in to view it.", page: "campus-messages" },
  campus_announcement: { title: "CampusShield campus update", body: "There is a new campus update available.", page: "noticeboard" },
  account_update: { title: "CampusShield account update", body: "There is an update to your account. Sign in to view it.", page: "profile-settings" },
  test: { title: "CampusShield notifications are on", body: "Background notifications are working on this device.", page: "profile-settings" },
} as const;
type PushKind = keyof typeof genericMessages;
const equalsConstantTime = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const expected = Deno.env.get("PUSH_DISPATCH_SECRET") || "";
  const supplied = req.headers.get("x-campus-push-secret") || "";
  const internalAuthorized = Boolean(expected && supplied && equalsConstantTime(expected, supplied));
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
  const subject = Deno.env.get("VAPID_SUBJECT") || "";
  if (!url || !service || !publicKey || !privateKey || !subject) {
    return json({ error: "Push delivery is not configured." }, 503);
  }

  try {
    // Validate the VAPID keypair before claiming an idempotency key.
    webpush.setVapidDetails(subject, publicKey, privateKey);
    const body = await req.json().catch(() => null);
    let userId = String(body?.user_id || "");
    let kind = body?.kind as PushKind;
    let eventKey: string | null = null;
    const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    if (!internalAuthorized) {
      const token = (req.headers.get("authorization") || "").match(/^Bearer\\s+(.+)$/i)?.[1];
      if (!["test", "message"].includes(String(body?.action || "")) || !token || !anon) {
        return json({ error: "Not authorized." }, 401);
      }
      const authClient = createClient(url, anon, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: { user }, error: authError } = await authClient.auth.getUser(token);
      if (authError || !user?.id) return json({ error: "Your session could not be verified." }, 401);
      if (body.action === "test") {
        userId = user.id;
        kind = "test";
        eventKey = null; // Users can send another test after re-subscribing or for troubleshooting.
      } else {
        const messageId = String(body?.message_id || "");
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(messageId)) {
          return json({ error: "A valid recent message is required." }, 400);
        }
        const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data: sentMessage, error: messageError } = await db.from("campus_direct_messages")
          .select("id,conversation_id,university_id,sender_id,status,created_at")
          .eq("id", messageId).eq("sender_id", user.id).eq("status", "published")
          .gte("created_at", since).maybeSingle();
        if (messageError || !sentMessage) return json({ error: "Only a recently sent message can trigger a background notification." }, 403);
        const { data: conversation, error: conversationError } = await db.from("campus_direct_conversations")
          .select("user_one_id,user_two_id,university_id,status")
          .eq("id", sentMessage.conversation_id)
          .eq("university_id", sentMessage.university_id)
          .eq("status", "accepted")
          .maybeSingle();
        if (conversationError || !conversation ||
            ![conversation.user_one_id, conversation.user_two_id].includes(user.id)) {
          return json({ error: "An accepted conversation between campus members is required." }, 403);
        }
        userId = conversation.user_one_id === user.id ? conversation.user_two_id : conversation.user_one_id;
        kind = "new_message";
        eventKey = "direct-message:" + sentMessage.id + ":" + userId;
      }
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId) ||
        !Object.prototype.hasOwnProperty.call(genericMessages, kind) ||
        (!internalAuthorized && !["test", "new_message"].includes(kind))) {
      return json({ error: "A valid recipient and notification kind are required." }, 400);
    }
    if (eventKey) {
      const { error: claimError } = await db.from("campus_push_delivery_events").insert({
        event_key: eventKey, user_id: userId, kind, status: "queued", updated_at: new Date().toISOString(),
      });
      if (claimError?.code === "23505") return json({ delivered: 0, expired: 0, duplicate: true });
      if (claimError) {
        console.error("Push event deduplication failed", { code: claimError.code });
        return json({ error: "Could not safely queue this notification." }, 503);
      }
    }
    const { data: subscriptions, error } = await db.from("campus_push_subscriptions")
      .select("endpoint,p256dh_key,auth_key")
      .eq("user_id", userId)
      .limit(20);
    if (error) {
      console.error("Push subscription lookup failed", { code: error.code });
      if (eventKey) await db.from("campus_push_delivery_events").update({ status: "failed", updated_at: new Date().toISOString() }).eq("event_key", eventKey);
      return json({ error: "Could not load notification destinations." }, 503);
    }
    if (!subscriptions?.length) {
      if (eventKey) await db.from("campus_push_delivery_events").update({ status: "no_subscription", updated_at: new Date().toISOString() }).eq("event_key", eventKey);
      return json({ delivered: 0, expired: 0 });
    }

    const message = genericMessages[kind];
    const payload = JSON.stringify({
      title: message.title,
      body: message.body,
      page: message.page,
      tag: "campusshield-" + kind,
      url: "./",
    });
    let delivered = 0;
    let expired = 0;
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh_key, auth: sub.auth_key },
        }, payload, { TTL: 300, urgency: "normal" });
        await db.from("campus_push_subscriptions").update({
          last_success_at: new Date().toISOString(), failure_count: 0, last_error_code: null,
        }).eq("endpoint", sub.endpoint);
        delivered++;
      } catch (err) {
        const status = Number((err as { statusCode?: number })?.statusCode) || 0;
        if (status === 404 || status === 410) {
          await db.from("campus_push_subscriptions").delete().eq("endpoint", sub.endpoint);
          expired++;
        } else {
          await db.from("campus_push_subscriptions").update({
            failure_count: 1, last_error_code: status || null,
          }).eq("endpoint", sub.endpoint);
          console.warn("Web push delivery failed", { status: status || "network_error" });
        }
      }
    }
    if (eventKey) await db.from("campus_push_delivery_events").update({
      status: delivered > 0 ? "sent" : "failed",
      delivered_count: delivered,
      expired_count: expired,
      updated_at: new Date().toISOString(),
    }).eq("event_key", eventKey);
    return json({ delivered, expired });
  } catch {
    return json({ error: "Push delivery failed." }, 500);
  }
});
