import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { RoomServiceClient } from "npm:livekit-server-sdk@2.19.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function getPublishableKey(): string | null {
  const keyed = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (keyed) {
    try {
      const parsed = JSON.parse(keyed);
      const value = parsed?.default || Object.values(parsed || {})[0];
      if (typeof value === "string" && value) return value;
    } catch {
      // Fall through to the legacy public anon key.
    }
  }
  return Deno.env.get("SUPABASE_ANON_KEY") || null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "Sign in to end this class." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const publishableKey = getPublishableKey();
    if (!supabaseUrl || !publishableKey) return json({ error: "Classroom service is not configured." }, 503);

    const client = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userResult, error: userError } = await client.auth.getUser();
    if (userError || !userResult?.user) return json({ error: "Your sign-in session could not be verified." }, 401);

    const body = await req.json().catch(() => null);
    const sessionId = typeof body?.session_id === "string" ? body.session_id.trim() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
      return json({ error: "Choose a valid live class." }, 400);
    }

    // This RPC checks the live session, verified campus and classroom membership.
    // Only teachers and appointed class assistants may close the provider room.
    const { data: contextData, error: contextError } = await client.rpc(
      "get_campus_live_class_token_context",
      { p_session_id: sessionId },
    );
    const context = Array.isArray(contextData) ? contextData[0] : contextData;
    if (contextError || !context?.room_name || !["teacher", "assistant"].includes(context.participant_role)) {
      return json({ error: "Only the verified teacher or appointed class assistant can end this live class." }, 403);
    }

    const livekitUrl = Deno.env.get("LIVEKIT_URL");
    const livekitApiKey = Deno.env.get("LIVEKIT_API_KEY");
    const livekitApiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    let roomClosed = false;

    if (livekitUrl && livekitApiKey && livekitApiSecret) {
      const parsed = new URL(livekitUrl);
      if (!["wss:", "ws:"].includes(parsed.protocol)) return json({ error: "The live video server address is invalid." }, 503);
      parsed.protocol = parsed.protocol === "wss:" ? "https:" : "http:";
      const roomService = new RoomServiceClient(parsed.origin, livekitApiKey, livekitApiSecret);
      try {
        // Deleting the room disconnects every active participant and prevents
        // stale connections from continuing after the lecturer ends the class.
        await roomService.deleteRoom(context.room_name);
        roomClosed = true;
      } catch (error) {
        // A room that never started is already closed for practical purposes.
        const code = String((error as { code?: unknown })?.code || "").toLowerCase();
        const message = String((error as { message?: unknown })?.message || "").toLowerCase();
        if (code === "not_found" || code === "notfound" || message.includes("not found")) {
          roomClosed = true;
        } else {
          console.error("LiveKit room close failed", {
            stage: "room_close",
            errorName: error instanceof Error ? error.name.slice(0, 80) : "UnknownError",
          });
        }
      }
    } else {
      // When LiveKit is not configured no participant could have received a room token.
      roomClosed = true;
    }

    const { error: endError } = await client.rpc("end_campus_live_class_session", {
      p_session_id: sessionId,
    });
    if (endError) {
      console.error("Live class database close failed", {
        stage: "database_close",
        errorCode: endError.code || null,
      });
      return json({ error: "The live-room shutdown was requested, but the class status could not be updated. Refresh and try again." }, 503);
    }

    return json({
      ended: true,
      roomClosed,
      message: roomClosed
        ? "The class ended and the live room was closed."
        : "The class ended. The video provider did not confirm that all participants disconnected.",
    });
  } catch (error) {
    console.error("Live class end request failed", {
      stage: "request",
      errorName: error instanceof Error ? error.name.slice(0, 80) : "UnknownError",
    });
    return json({ error: "Could not end the live class. Please try again." }, 500);
  }
});
