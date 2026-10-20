import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const MAX_BYTES = 5 * 1024 * 1024;
const MIME_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" };

async function detectMime(bytes: Uint8Array): Promise<string | null> {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((n,i) => bytes[i] === n)) return "image/png";
  if (bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0,5)) === "%PDF-") return "application/pdf";
  return null;
}
async function hash(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2,"0")).join("");
}
function randomPath(userId: string, mime: string) { return userId + "/" + crypto.randomUUID() + "." + MIME_EXT[mime]; }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed." }, 405);
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return reply({ error: "Sign in is required." }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) return reply({ error: "Secure upload service is not configured." }, 503);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userResult, error: userError } = await userClient.auth.getUser();
    const user = userResult?.user;
    if (userError || !user) return reply({ error: "Your sign-in session could not be verified." }, 401);

    const { data: profile, error: profileError } = await userClient.from("profiles")
      .select("id,requested_role,verification_status").eq("id", user.id).maybeSingle();
    if (profileError || !profile || profile.requested_role !== "student" || profile.verification_status !== "pending") {
      return reply({ error: "Only a pending student account can submit identity verification." }, 403);
    }
    const { data: previous, error: previousError } = await userClient.from("student_identity_verifications")
      .select("status,object_path").eq("user_id", user.id).maybeSingle();
    if (previousError) return reply({ error: "Current identity status could not be checked." }, 503);
    if (previous?.status === "approved") return reply({ error: "Your student identity is already approved." }, 409);
    if (previous?.status === "pending") return reply({ error: "Your current identity submission is awaiting review." }, 409);

    const form = await req.formData();
    const file = form.get("file");
    const institutionName = String(form.get("institution_name") || "").trim();
    const studentNumber = String(form.get("student_number") || "").trim();
    if (!(file instanceof File)) return reply({ error: "Choose a student ID image or PDF." }, 400);
    if (file.size < 1 || file.size > MAX_BYTES) return reply({ error: "Student ID files must be no larger than 5 MiB." }, 400);
    if (institutionName.length < 2 || institutionName.length > 180) return reply({ error: "Institution name must be 2–180 characters." }, 400);
    if (studentNumber.length < 2 || studentNumber.length > 80 || /[\u0000-\u001f]/.test(studentNumber)) return reply({ error: "Student or matric number must be 2–80 characters." }, 400);

    const input = new Uint8Array(await file.arrayBuffer());
    if (input.byteLength !== file.size || input.byteLength > MAX_BYTES) return reply({ error: "The uploaded file could not be read safely." }, 400);
    const mime = await detectMime(input);
    if (!mime || (file.type && file.type !== mime)) return reply({ error: "The file content does not match a supported JPEG, PNG, or PDF. Renaming a file does not change its type." }, 415);
    const fileHash = await hash(input);
    const scannerUrl = Deno.env.get("MALWARE_SCANNER_URL");
    const scannerToken = Deno.env.get("MALWARE_SCANNER_TOKEN");
    if (!scannerUrl || !scannerToken) {
      return reply({ error: "Malware scanning is not configured in staging yet. No file was uploaded or submitted. Configure the trusted private ClamAV scanner first.", status: "scan_unavailable" }, 503);
    }
    let scanEndpoint: URL;
    try { scanEndpoint = new URL(scannerUrl); } catch {
      return reply({ error: "The malware scanner configuration is invalid. No file was uploaded.", status: "scan_unavailable" }, 503);
    }
    if (scanEndpoint.protocol !== "https:" || scanEndpoint.username || scanEndpoint.password) {
      return reply({ error: "The malware scanner must use HTTPS. No file was uploaded.", status: "scan_unavailable" }, 503);
    }
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const quarantinePath = randomPath(user.id, mime);
    const { error: uploadError } = await admin.storage.from("student-identity-quarantine").upload(quarantinePath, input, {
      contentType: mime, cacheControl: "0", upsert: false,
    });
    if (uploadError) return reply({ error: "The private quarantine upload failed. No identity submission was created." }, 503);
    const { data: job, error: jobError } = await admin.from("student_identity_upload_scans").insert({
      user_id: user.id, status: "quarantined", quarantine_path: quarantinePath, file_sha256: fileHash,
      file_size_bytes: input.byteLength, detected_mime: mime,
    }).select("id").single();
    if (jobError || !job) {
      await admin.storage.from("student-identity-quarantine").remove([quarantinePath]);
      return reply({ error: "A secure scan record could not be created." }, 503);
    }

    await admin.from("student_identity_upload_scans").update({ status: "scanning", updated_at: new Date().toISOString() }).eq("id", job.id);
    let scanStatus = "";
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25000);
      let response: Response;
      try {
        response = await fetch(scanEndpoint, { method: "POST", redirect: "error", signal: controller.signal,
          headers: { "Authorization": "Bearer " + scannerToken, "Accept": "application/json",
            "Content-Type": mime, "X-File-SHA256": fileHash }, body: input });
      } finally { clearTimeout(timer); }
      if (!response.ok) throw new Error("scanner_http_error");
      const result = await response.json().catch(() => null);
      if ((result?.status !== "clean" && result?.status !== "infected") || result?.sha256 !== fileHash) {
        throw new Error("scanner_invalid_result");
      }
      scanStatus = result.status;
    } catch {
      await admin.storage.from("student-identity-quarantine").remove([quarantinePath]);
      await admin.from("student_identity_upload_scans").update({ status: "scan_unavailable", quarantine_path: null, failure_code: "scanner_unreachable_or_invalid_response", updated_at: new Date().toISOString() }).eq("id", job.id);
      return reply({ error: "The scanner could not confirm the file is clean. The upload was discarded and was not submitted for review.", status: "scan_unavailable" }, 503);
    }

    if (scanStatus !== "clean") {
      await admin.from("student_identity_upload_scans").update({ status: "infected", quarantine_path: null, failure_code: "malware_detected", updated_at: new Date().toISOString() }).eq("id", job.id);
      await admin.storage.from("student-identity-quarantine").remove([quarantinePath]);
      return reply({ error: "The malware scanner flagged this file. It was not submitted for identity review.", status: "infected" }, 422);
    }

    // Only a definitive clean response can promote a file from private quarantine.
    const finalPath = randomPath(user.id, mime);
    const { error: moveError } = await admin.storage.from("student-identity-documents").upload(finalPath, input, {
      contentType: mime, cacheControl: "0", upsert: false,
    });
    if (moveError) {
      await admin.storage.from("student-identity-quarantine").remove([quarantinePath]);
      await admin.from("student_identity_upload_scans").update({ status: "error", quarantine_path: null, failure_code: "clean_file_promotion_failed", updated_at: new Date().toISOString() }).eq("id", job.id);
      return reply({ error: "The file scanned clean, but secure promotion failed. The upload was discarded and is not available for review; try again later.", status: "error" }, 503);
    }
    const { error: submitError } = await userClient.rpc("submit_student_identity_verification", {
      p_institution_name: institutionName, p_student_number: studentNumber, p_object_path: finalPath,
    });
    if (submitError) {
      await admin.storage.from("student-identity-documents").remove([finalPath]);
      await admin.storage.from("student-identity-quarantine").remove([quarantinePath]);
      await admin.from("student_identity_upload_scans").update({ status: "error", quarantine_path: null, failure_code: "identity_submission_rejected", updated_at: new Date().toISOString() }).eq("id", job.id);
      return reply({ error: "The file scanned clean, but the identity submission was rejected by the database. The file was discarded and no identity record was created.", status: "error" }, 403);
    }
    if (previous?.object_path && previous.object_path !== finalPath) {
      const { error: oldFileError } = await admin.storage.from("student-identity-documents").remove([previous.object_path]);
      if (oldFileError) console.warn("A replaced rejected identity file could not be removed.");
    }
    await admin.storage.from("student-identity-quarantine").remove([quarantinePath]);
    await admin.from("student_identity_upload_scans").update({ status: "clean", quarantine_path: null, updated_at: new Date().toISOString() }).eq("id", job.id);
    return reply({ status: "clean", message: "The file passed the configured malware scan and was submitted for identity review." });
  } catch (error) {
    console.error("Identity upload scan failed:", error instanceof Error ? error.message : "unknown error");
    return reply({ error: "Secure identity upload could not complete. No unscanned file was approved." }, 500);
  }
});
