/*
 * CampusShield AI — student identity verification bridge
 * Loaded after campusshield-backend.js and before index.html's app code.
 * Uses the existing Supabase browser client and server-enforced RLS/RPC checks.
 */
(() => {
  "use strict";

  const backend = window.CampusShieldBackend;
  if (!backend || !backend.client) {
    console.error("CampusShield identity add-on could not attach: backend client is unavailable.");
    return;
  }
  if (backend.__studentIdentityAddonInstalled) return;
  Object.defineProperty(backend, "__studentIdentityAddonInstalled", { value: true });

  const bucketName = "student-identity-documents";
  const maxFileBytes = 5 * 1024 * 1024;
  const acceptedTypes = new Set(["image/jpeg", "image/png", "application/pdf"]);

  function requireClient() {
    if (!backend.isConfigured || !backend.client) {
      throw new Error("Supabase is not configured.");
    }
    return backend.client;
  }

  backend.getMyStudentIdentityVerification = async function getMyStudentIdentityVerification() {
    const client = requireClient();
    const user = await backend.getCurrentUser();
    if (!user) throw new Error("Sign in to check your identity verification status.");

    const { data, error } = await client
      .from("student_identity_verifications")
      .select("user_id, university_id, institution_name, student_number, object_path, status, rejection_reason, reviewed_by, reviewed_at, created_at, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  };

  // Secure upload is implemented in campusshield-backend.js and invokes the
  // authenticated scan Edge Function. This add-on must never write files directly.

  backend.createStudentIdentityDocumentUrl = async function createStudentIdentityDocumentUrl(objectPath) {
    const client = requireClient();
    const user = await backend.getCurrentUser();
    if (!user) throw new Error("Sign in to view this document.");
    if (typeof objectPath !== "string" || !objectPath.trim() || objectPath.length > 500) {
      throw new Error("The identity document path is invalid.");
    }

    // Metadata RLS permits the owner or a verified same-campus administrator.
    const { data: record, error: recordError } = await client
      .from("student_identity_verifications")
      .select("object_path")
      .eq("object_path", objectPath)
      .maybeSingle();
    if (recordError) throw recordError;
    if (!record) throw new Error("This identity document is not available to your account.");

    const { data, error } = await client.storage
      .from(bucketName)
      .createSignedUrl(objectPath, 300);
    if (error) throw error;
    if (!data?.signedUrl) throw new Error("Could not create a temporary secure document link.");
    return data.signedUrl;
  };
})();
