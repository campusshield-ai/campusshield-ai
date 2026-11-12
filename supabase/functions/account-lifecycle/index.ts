import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ??
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  "";
const DEACTIVATION_DAYS = 90;
const LONG_BAN_DURATION = "876000h"; // Ban until restored; the scheduled purge is the 90-day deadline.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  };
  if (!origin) return headers;
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    const allowed =
      host === "campusshield-ai.github.io" ||
      host === "campusshieldai.com" ||
      host === "www.campusshieldai.com" ||
      /^campusshield-ai-staging-preview(?:-[a-z0-9-]+)?\.vercel\.app$/.test(host) ||
      /^campusshield-ai-staging-p-git-[a-z0-9-]+\.vercel\.app$/.test(host) ||
      host === "localhost" ||
      host === "127.0.0.1";
    if (allowed) headers["Access-Control-Allow-Origin"] = origin;
  } catch {
    // An invalid Origin receives no CORS permission.
  }
  return headers;
}

function response(
  body: Record<string, unknown>,
  status: number,
  origin: string | null,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function addDays(date: Date, days: number): string {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return response({ error: "Method not allowed." }, 405, origin);
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
    return response({ error: "Account lifecycle service is not configured." }, 503, origin);
  }

  const authorization = req.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return response({ error: "Sign in to manage your account." }, 401, origin);
  }

  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: userData, error: userError } = await caller.auth.getUser(token);
    const user = userData?.user;
    if (userError || !user?.id) {
      return response({ error: "Your secure session could not be verified. Sign in again." }, 401, origin);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return response({ error: "A valid JSON request is required." }, 400, origin);
    }

    const action = String(body.action || "");
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id,role,display_name")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError || !profile) {
      return response({ error: "Your CampusShield profile could not be verified." }, 403, origin);
    }

    const { data: isPlatformAdmin, error: platformAdminError } = await caller.rpc("platform_is_admin");
    if (platformAdminError) {
      return response({ error: "Administrator permissions could not be verified." }, 403, origin);
    }

    if (action === "status") {
      const { data, error } = await admin
        .from("account_lifecycle")
        .select("status,deactivated_at,purge_after,legacy_soft_deleted")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return response({
        status: data?.status || "active",
        deactivated_at: data?.deactivated_at || null,
        purge_after: data?.purge_after || null,
        legacy_soft_deleted: data?.legacy_soft_deleted === true,
        recovery_window_days: DEACTIVATION_DAYS,
      }, 200, origin);
    }

    if (action === "deactivate") {
      if (profile.role === "admin" || isPlatformAdmin === true) {
        return response({
          error: "Administrator accounts cannot be deactivated from this flow. Keep at least one trusted administrator active.",
        }, 403, origin);
      }

      const now = new Date();
      const purgeAfter = addDays(now, DEACTIVATION_DAYS);
      const reason = String(body.reason || "").trim().slice(0, 240) || null;

      const { data: existing, error: existingError } = await admin
        .from("account_lifecycle")
        .select("status,purge_after,legacy_soft_deleted")
        .eq("user_id", user.id)
        .maybeSingle();
      if (existingError) throw existingError;

      if (existing?.legacy_soft_deleted) {
        return response({
          error: "This account was closed using the previous irreversible Auth soft-delete process and cannot be restored through this lifecycle.",
        }, 409, origin);
      }

      if (existing?.status === "deactivated" || existing?.status === "purge_blocked") {
        return response({
          status: existing.status,
          purge_after: existing.purge_after,
          recovery_window_days: DEACTIVATION_DAYS,
        }, 200, origin);
      }

      const { error: upsertError } = await admin
        .from("account_lifecycle")
        .upsert({
          user_id: user.id,
          status: "deactivated",
          deactivated_at: now.toISOString(),
          purge_after: purgeAfter,
          deactivated_by: user.id,
          deactivation_reason: reason,
          reactivated_at: null,
          legacy_soft_deleted: false,
          purge_attempts: 0,
          last_purge_attempt_at: null,
          last_purge_error: null,
          updated_at: now.toISOString(),
        }, { onConflict: "user_id" });
      if (upsertError) throw upsertError;

      const { error: banError } = await admin.auth.admin.updateUserById(user.id, {
        ban_duration: LONG_BAN_DURATION,
      });
      if (banError) {
        await admin.from("account_lifecycle").update({
          status: "active",
          deactivated_at: null,
          purge_after: null,
          deactivated_by: null,
          deactivation_reason: null,
          updated_at: new Date().toISOString(),
        }).eq("user_id", user.id);
        throw banError;
      }

      const { error: revokeError } = await admin.rpc("account_lifecycle_revoke_sessions", {
        p_user_id: user.id,
      });
      if (revokeError) {
        // The Auth ban remains in force. Do not re-enable an account just because
        // session revocation encountered a database error; report it for review.
        console.error("Account deactivated but session revocation failed:", revokeError.message);
      }

      return response({
        status: "deactivated",
        deactivated_at: now.toISOString(),
        purge_after: purgeAfter,
        recovery_window_days: DEACTIVATION_DAYS,
        sessions_revoked: !revokeError,
        message: "Your account is deactivated. Contact CampusShield support before the 90-day deadline to request reactivation.",
      }, 200, origin);
    }

    if (action === "list-deactivated") {
      if (isPlatformAdmin !== true) {
        return response({ error: "Only a trusted platform administrator can manage account lifecycle requests." }, 403, origin);
      }

      const { data: rows, error } = await admin
        .from("account_lifecycle")
        .select("user_id,status,deactivated_at,purge_after,legacy_soft_deleted,purge_attempts,last_purge_error")
        .in("status", ["deactivated", "purge_blocked"])
        .order("purge_after", { ascending: true });
      if (error) throw error;

      const ids = (rows || []).map(row => row.user_id);
      const { data: profiles, error: profilesError } = ids.length
        ? await admin.from("profiles").select("id,display_name,role").in("id", ids)
        : { data: [], error: null };
      if (profilesError) throw profilesError;

      const profileMap = new Map((profiles || []).map(row => [row.id, row]));
      const users = await Promise.all(ids.map(async (id) => {
        const { data } = await admin.auth.admin.getUserById(id);
        return [id, data?.user || null] as const;
      }));
      const userMap = new Map(users);

      return response({
        accounts: (rows || []).map(row => {
          const target = userMap.get(row.user_id);
          const targetProfile = profileMap.get(row.user_id);
          return {
            user_id: row.user_id,
            email: target?.email || null,
            display_name: targetProfile?.display_name || null,
            role: targetProfile?.role || null,
            status: row.status,
            deactivated_at: row.deactivated_at,
            purge_after: row.purge_after,
            legacy_soft_deleted: row.legacy_soft_deleted,
            purge_attempts: row.purge_attempts,
            last_purge_error: row.last_purge_error,
            reactivation_available: row.legacy_soft_deleted !== true &&
              new Date(row.purge_after).getTime() > Date.now(),
          };
        }),
      }, 200, origin);
    }

    if (action === "restore") {
      if (isPlatformAdmin !== true) {
        return response({ error: "Only a trusted platform administrator can restore an account." }, 403, origin);
      }
      const targetId = String(body.user_id || "");
      if (!UUID_RE.test(targetId)) {
        return response({ error: "Choose a valid account." }, 400, origin);
      }

      const { data: lifecycle, error: lifecycleError } = await admin
        .from("account_lifecycle")
        .select("status,purge_after,legacy_soft_deleted")
        .eq("user_id", targetId)
        .maybeSingle();
      if (lifecycleError) throw lifecycleError;
      if (!lifecycle || !["deactivated", "purge_blocked"].includes(lifecycle.status)) {
        return response({ error: "This account is not in the reactivation window." }, 409, origin);
      }
      if (lifecycle.legacy_soft_deleted) {
        return response({
          error: "This is a legacy Auth soft-deleted account. Supabase documents that state as irreversible; it cannot be restored through the supported Auth API.",
        }, 409, origin);
      }
      if (new Date(lifecycle.purge_after).getTime() <= Date.now()) {
        return response({ error: "The 90-day recovery window has expired. This account is no longer eligible for reactivation." }, 409, origin);
      }

      const { data: targetData, error: targetError } = await admin.auth.admin.getUserById(targetId);
      if (targetError || !targetData?.user) {
        return response({ error: "The account no longer exists in Supabase Auth." }, 404, origin);
      }

      const { error: unbanError } = await admin.auth.admin.updateUserById(targetId, {
        ban_duration: "none",
      });
      if (unbanError) throw unbanError;

      const now = new Date().toISOString();
      const { error: restoreError } = await admin
        .from("account_lifecycle")
        .update({
          status: "active",
          deactivated_at: null,
          purge_after: null,
          deactivated_by: null,
          deactivation_reason: null,
          reactivated_at: now,
          last_purge_error: null,
          updated_at: now,
        })
        .eq("user_id", targetId);
      if (restoreError) {
        await admin.auth.admin.updateUserById(targetId, { ban_duration: LONG_BAN_DURATION });
        throw restoreError;
      }

      return response({
        status: "active",
        user_id: targetId,
        reactivated_at: now,
        message: "The account has been reactivated. The owner can now sign in with their existing credentials.",
      }, 200, origin);
    }

    return response({ error: "Unsupported account lifecycle action." }, 400, origin);
  } catch (error) {
    console.error("Account lifecycle request failed:", error?.message || error);
    return response({ error: error?.message || "Account lifecycle request failed." }, 500, origin);
  }
});
