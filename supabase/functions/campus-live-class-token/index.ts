import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { AccessToken, RoomServiceClient } from "npm:livekit-server-sdk@2.19.2";

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
      // Fall through to the legacy, public anon key.
    }
  }
  return Deno.env.get("SUPABASE_ANON_KEY") || null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return json({ error: "Sign in to join this live class." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const publishableKey = getPublishableKey();
    if (!supabaseUrl || !publishableKey) {
      return json({ error: "Live class access is not configured. Please contact the campus administrator." }, 503);
    }

    const client = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userResult, error: userError } = await client.auth.getUser();
    const user = userResult?.user;
    if (userError || !user) return json({ error: "Your sign-in session could not be verified." }, 401);

    const body = await req.json().catch(() => null);
    const sessionId = typeof body?.session_id === "string" ? body.session_id.trim() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
      return json({ error: "Choose a valid live class." }, 400);
    }

    // The caller's own JWT is used for this RPC. The database verifies the
    // verified campus membership, classroom access and live status (including campus administrators).
    const { data: contextData, error: contextError } = await client.rpc(
      "get_campus_live_class_token_context",
      { p_session_id: sessionId },
    );
    const context = Array.isArray(contextData) ? contextData[0] : contextData;
    if (contextError || !context?.room_name || !["teacher", "assistant", "student", "admin"].includes(context.participant_role)) {
      return json({ error: "This live class is not currently available to your account." }, 403);
    }

    const livekitUrl = Deno.env.get("LIVEKIT_URL");
    const livekitApiKey = Deno.env.get("LIVEKIT_API_KEY");
    const livekitApiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    if (!livekitUrl || !livekitApiKey || !livekitApiSecret) {
      return json({ error: "Integrated video is not configured yet. Use the lecturer's external class link if one is available." }, 503);
    }

    let parsedLivekitUrl: URL;
    try {
      parsedLivekitUrl = new URL(livekitUrl);
    } catch {
      return json({ error: "The live classroom video service has an invalid server address." }, 503);
    }
    if (!["wss:", "ws:"].includes(parsedLivekitUrl.protocol)) {
      return json({ error: "The live classroom video service has an invalid server address." }, 503);
    }

    if (body?.diagnostic === true) {
      const apiUrl = new URL(parsedLivekitUrl.toString());
      apiUrl.protocol = apiUrl.protocol === "wss:" ? "https:" : "http:";
      const roomService = new RoomServiceClient(apiUrl.origin, livekitApiKey, livekitApiSecret);
      try {
        // This non-destructive probe verifies the Staging server URL and API key/secret pair.
        // It returns only a boolean and never exposes room names or credential material.
        await roomService.listRooms();
        return json({ diagnostic: true, credentialsAccepted: true, serverHost: parsedLivekitUrl.host });
      } catch (error) {
        const providerCode = String((error as { code?: unknown })?.code || "").toLowerCase();
        const errorName = error instanceof Error ? error.name.slice(0, 80) : "UnknownError";
        const providerStatus = Number(
          (error as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } })?.status
          ?? (error as { statusCode?: unknown })?.statusCode
          ?? (error as { response?: { status?: unknown } })?.response?.status
          ?? 0
        );
        const reason = /unauthenticated|unauthorized|permission_denied|forbidden|invalid.?token/.test(providerCode)
          || providerStatus === 401 || providerStatus === 403
          ? "credentials_rejected"
          : /unavailable|deadline|not_found|notfound|connection|transport/.test(providerCode)
            || providerStatus === 404 || providerStatus >= 500 || error instanceof TypeError
            ? "endpoint_unreachable"
            : "provider_rejected_request";
        console.error("LiveKit credential diagnostic failed", {
          stage: "credentials_check",
          reason,
          providerCode: providerCode.slice(0, 80) || null,
          providerStatus: providerStatus || null,
          errorName,
        });
        const message = reason === "credentials_rejected"
          ? "LiveKit rejected the API key/secret pair. Create or copy a matching key pair from this same LiveKit project."
          : reason === "endpoint_unreachable"
            ? "The LiveKit server URL could not be reached or does not expose the room API. Recheck the project's WSS URL."
            : "LiveKit did not accept the server-side credential check. Verify the URL and key pair belong to one project.";
        return json({
          error: message,
          diagnostic: true,
          credentialsAccepted: false,
          configurationComplete: true,
          reason,
          providerCode: providerCode.slice(0, 80) || null,
          providerStatus: providerStatus || null,
          providerErrorName: errorName,
          serverHost: parsedLivekitUrl.host,
        }, 503);
      }
    }

    const participantName = String(context.participant_display_name || "Campus member").slice(0, 80);
    const token = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: user.id,
      name: participantName,
      ttl: "2h",
    });
    token.addGrant({
      roomJoin: true,
      room: context.room_name,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const jwt = await token.toJwt();
    return json({
      token: jwt,
      serverUrl: livekitUrl,
      room: {
        title: String(context.session_title || "Live class").slice(0, 160),
        classroomTitle: String(context.classroom_title || "Campus classroom").slice(0, 160),
        participantRole: context.participant_role,
      },
    });
  } catch (error) {
    console.error("Live class token request failed", {
      stage: "request",
      errorName: error instanceof Error ? error.name.slice(0, 80) : "UnknownError",
    });
    return json({ error: "Could not prepare the live classroom. Please try again." }, 500);
  }
});
