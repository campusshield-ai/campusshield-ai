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
      .select("user_id, university_id, student_number, object_path, status, reviewed_by, reviewed_at, created_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  };

  backend.uploadStudentIdentityDocument = async function uploadStudentIdentityDocument(file, studentNumber) {
    const client = requireClient();
    const user = await backend.getCurrentUser();
    if (!user) throw new Error("Sign in before submitting an identity document.");

    const campus = await backend.getMyCampusContext();
    if (!campus || !campus.university_id) {
      throw new Error("Complete campus onboarding before submitting your identity document.");
    }

    const normalizedNumber = String(studentNumber || "").trim();
    if (normalizedNumber.length < 2 || normalizedNumber.length > 80) {
      throw new Error("Student or matric number must be 2–80 characters.");
    }
    if (!file || !(file instanceof File)) {
      throw new Error("Choose a JPEG, PNG, or PDF student ID document.");
    }
    if (!acceptedTypes.has(file.type)) {
      throw new Error("Use a JPEG, PNG, or PDF document only.");
    }
    if (file.size < 1 || file.size > maxFileBytes) {
      throw new Error("The identity document must be smaller than or equal to 5 MB.");
    }

    const existing = await backend.getMyStudentIdentityVerification();
    if (existing) {
      throw new Error("An identity document is already on file. Contact your university administrator for review.");
    }

    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("requested_role, verification_status")
      .eq("id", user.id)
      .single();
    if (profileError) throw profileError;
    if (profile?.requested_role !== "student" || profile?.verification_status !== "pending") {
      throw new Error("A pending student account is required to submit a student ID.");
    }

    // Staging Storage policy permits one fixed object path per user.
    const objectPath = user.id + "/student-identity-document";
    const bucket = client.storage.from(bucketName);
    const { error: uploadError } = await bucket.upload(objectPath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type
    });
    if (uploadError) throw uploadError;

    const { error: submitError } = await client.rpc("submit_student_identity_verification", {
      p_student_number: normalizedNumber,
      p_object_path: objectPath
    });
    if (submitError) {
      // The Storage policy permits removal of an unsubmitted owner's object only.
      try { await bucket.remove([objectPath]); } catch (_) { /* Preserve the original error. */ }
      throw submitError;
    }
    return true;
  };

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