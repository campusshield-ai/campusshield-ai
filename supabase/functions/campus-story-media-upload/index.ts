import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

function detectMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)) return "image/png";
  if (bytes.length >= 6) {
    const gif = new TextDecoder().decode(bytes.slice(0, 6));
    if (gif === "GIF87a" || gif === "GIF89a") return "image/gif";
  }
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
      new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP") return "image/webp";
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp") {
    const brand = new TextDecoder().decode(bytes.slice(8, 12));
    if (["isom", "iso2", "mp41", "mp42", "avc1", "M4V "].includes(brand)) return "video/mp4";
  }
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    const header = new TextDecoder().decode(bytes.slice(0, Math.min(bytes.length, 4096))).toLowerCase();
    if (header.includes("webm")) return "video/webm";
  }
  return null;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed." }, 405);

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return reply({ error: "Sign in is required." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    // Prefer Supabase's current server-only secret-key set. Fall back to the
    // legacy service-role JWT for projects that have not enabled the new key format.
    let serverKey: string | null = null;
    const secretKeysEnv = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (secretKeysEnv) {
      try {
        const secretKeys = JSON.parse(secretKeysEnv);
        if (typeof secretKeys?.default === "string" && secretKeys.default.trim()) {
          serverKey = secretKeys.default.trim();
        }
      } catch {
        console.error("Supabase server secret-key configuration could not be parsed.");
      }
    }
    serverKey = serverKey || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || null;
    if (!supabaseUrl || !anonKey || !serverKey) {
      return reply({ error: "Secure Story upload is not configured." }, 503);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // Service-role access is used only to create the one-time clean-scan approval.
    // The actual Storage upload still uses the caller JWT, preserving Storage ownership.
    const adminClient = createClient(supabaseUrl, serverKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userResult, error: userError } = await userClient.auth.getUser();
    const user = userResult?.user;
    if (userError || !user) return reply({ error: "Your sign-in session could not be verified." }, 401);

    const form = await req.formData();
    const storyId = String(form.get("story_id") || "").trim();
    const file = form.get("file");
    const altText = String(form.get("alt_text") || "").trim().slice(0, 250);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(storyId)) {
      return reply({ error: "The Story identifier is invalid." }, 400);
    }
    if (!(file instanceof File)) return reply({ error: "Choose an image or video for your Story." }, 400);

    const campusResult = await userClient.rpc("get_my_campus_context");
    const campus = Array.isArray(campusResult.data) ? campusResult.data[0] : campusResult.data;
    if (campusResult.error || !campus?.university_id) {
      return reply({ error: "Choose your verified university before attaching Story media." }, 403);
    }

    // Confirm ownership, pending status, university and single-attachment eligibility before
    // spending scanner capacity. The RPC delegates to the same private predicate as Storage RLS.
    const { data: canUpload, error: eligibilityError } = await userClient.rpc("can_upload_campus_story_media", {
      p_story_id: storyId,
    });
    if (eligibilityError || canUpload !== true) {
      return reply({ error: "Only your own pending Story at your active verified university can receive one attachment." }, 403);
    }

    if (!file.size || file.size > 30 * 1024 * 1024) {
      return reply({ error: "Story videos must be 30 MB or smaller." }, 413);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength !== file.size) return reply({ error: "The uploaded file could not be read safely." }, 400);
    const detectedMime = detectMime(bytes);
    if (!detectedMime || detectedMime !== file.type || !MIME_EXT[detectedMime]) {
      return reply({ error: "The file content does not match a supported JPG, PNG, WEBP, GIF, MP4 or WEBM file." }, 415);
    }
    const isImage = detectedMime.startsWith("image/");
    const maxBytes = isImage ? 15 * 1024 * 1024 : 30 * 1024 * 1024;
    if (bytes.byteLength > maxBytes) {
      return reply({ error: isImage ? "Story images must be 15 MB or smaller." : "Story videos must be 30 MB or smaller." }, 413);
    }

    const scannerUrl = Deno.env.get("MALWARE_SCANNER_URL");
    const scannerToken = Deno.env.get("MALWARE_SCANNER_TOKEN");
    if (!scannerUrl || !scannerToken) {
      return reply({
        error: "Malware scanning is not configured. No Story media was uploaded. Configure the private ClamAV scanner first.",
        status: "scan_unavailable",
      }, 503);
    }

    let scanEndpoint: URL;
    try {
      scanEndpoint = new URL(scannerUrl);
    } catch {
      return reply({ error: "The malware scanner configuration is invalid. No Story media was uploaded.", status: "scan_unavailable" }, 503);
    }
    if (scanEndpoint.protocol !== "https:" || scanEndpoint.username || scanEndpoint.password) {
      return reply({ error: "The malware scanner must use HTTPS. No Story media was uploaded.", status: "scan_unavailable" }, 503);
    }

    const fileHash = await sha256(bytes);
    let scanStatus = "";
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      let response: Response;
      try {
        response = await fetch(scanEndpoint, {
          method: "POST",
          redirect: "error",
          signal: controller.signal,
          headers: {
            "Authorization": "Bearer " + scannerToken,
            "Accept": "application/json",
            "Content-Type": detectedMime,
            "X-File-SHA256": fileHash,
          },
          body: bytes,
        });
      } finally {
        clearTimeout(timeout);
      }
      if (!response.ok) throw new Error("scanner_http_error");
      const result = await response.json().catch(() => null);
      if ((result?.status !== "clean" && result?.status !== "infected") || result?.sha256 !== fileHash) {
        throw new Error("scanner_invalid_result");
      }
      scanStatus = result.status;
    } catch {
      return reply({
        error: "The scanner could not confirm this file is clean. No Story media was uploaded; try again later.",
        status: "scan_unavailable",
      }, 503);
    }

    if (scanStatus !== "clean") {
      return reply({ error: "The malware scanner flagged this file. It was not uploaded.", status: "infected" }, 422);
    }

    // A one-time, server-issued approval is recorded only after an exact-hash clean result.
    // Storage RLS requires this record, so direct browser uploads cannot bypass the scanner.
    const extension = MIME_EXT[detectedMime];
    const objectPath = campus.university_id + "/" + storyId + "/" + crypto.randomUUID() + "." + extension;
    const { error: approvalError } = await adminClient.from("campus_story_media_scan_approvals").insert({
      story_id: storyId,
      university_id: campus.university_id,
      uploader_id: user.id,
      object_path: objectPath,
      file_sha256: fileHash,
      mime_type: detectedMime,
      byte_size: bytes.byteLength,
      scan_status: "clean",
    });
    if (approvalError) {
      console.error("Story scan approval insert failed:", approvalError.code || "unknown_code", approvalError.message || "unknown_error");
      return reply({ error: "A one-time clean-scan approval could not be recorded. No Story media was uploaded." }, 503);
    }

    // Upload with the user's JWT so Storage records the actual uploader.
    const bucket = userClient.storage.from("campus-community-media");
    const { error: uploadError } = await bucket.upload(objectPath, bytes, {
      cacheControl: "1800",
      upsert: false,
      contentType: detectedMime,
    });
    if (uploadError) {
      await adminClient.from("campus_story_media_scan_approvals").delete().eq("object_path", objectPath);
      return reply({ error: "The clean file could not be saved to private Story storage." }, 503);
    }

    const { error: attachError } = await userClient.rpc("attach_campus_story_media", {
      p_story_id: storyId,
      p_object_path: objectPath,
      p_media_kind: isImage ? "image" : "video",
      p_mime_type: detectedMime,
      p_byte_size: bytes.byteLength,
      p_alt_text: altText || null,
    });
    if (attachError) {
      await bucket.remove([objectPath]);
      await adminClient.from("campus_story_media_scan_approvals").delete().eq("object_path", objectPath);
      return reply({ error: "The clean file could not be attached to this Story. The uploaded object was removed." }, 409);
    }

    return reply({ status: "clean", message: "The Story media passed malware scanning and was saved privately." });
  } catch (error) {
    console.error("Story media scan failed:", error instanceof Error ? error.message : "unknown error");
    return reply({ error: "Secure Story media upload could not complete. No unscanned file was approved." }, 500);
  }
});
