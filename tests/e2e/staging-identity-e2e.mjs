import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const EXPECTED_STAGING_REF = "hywcpnoqqhxvujnimhxl";
const IDENTITY_BUCKET = "student-identity-documents";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required workflow secret/variable: ${name}`);
  return value;
}

const supabaseUrl = requiredEnv("SUPABASE_STAGING_URL");
const anonKey = requiredEnv("SUPABASE_STAGING_ANON_KEY");
const serviceRoleKey = requiredEnv("SUPABASE_STAGING_SERVICE_ROLE_KEY");
const parsedUrl = new URL(supabaseUrl);

if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== `${EXPECTED_STAGING_REF}.supabase.co`) {
  throw new Error("Refusing E2E test: URL must be the approved CampusShield staging project. No test writes were made.");
}

const runId = randomUUID().replaceAll("-", "");
const emailPrefix = `campusshieldaitechnologies+campusshield-e2e-${runId}`;
const createdUsers = new Map();
const uploadedPaths = new Set();
const cleanupErrors = [];

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const anonymous = () => createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

function mustSucceed(error, message) {
  if (error) throw new Error(`${message}: ${error.message || String(error)}`);
}

function strongSyntheticPassword() {
  return `Cs-E2E!-${randomBytes(24).toString("base64url")}-9aA`;
}

async function generateAndConfirmSyntheticUser(role, university) {
  const email = `${emailPrefix}-${role}@gmail.com`;
  const password = strongSyntheticPassword();
  const baseRequestedRole = role === "admin" ? "teacher" : "student";
  const displayName = role === "admin"
    ? "CampusShield Synthetic E2E Reviewer"
    : "CampusShield Synthetic E2E Student";

  // generateLink returns a token but does not send an email. This lets CI exercise
  // the actual Supabase confirmation-token verification path without emailing a
  // real inbox or a third party.
  const generated = await admin.auth.admin.generateLink({ type: "signup", email, password });
  mustSucceed(generated.error, `Generate staging confirmation token for synthetic ${role}`);
  const user = generated.data?.user;
  const properties = generated.data?.properties;
  assert.ok(user?.id, `Supabase creates the synthetic ${role} account`);
  assert.ok(properties?.hashed_token, `Supabase returns a confirmation token hash for synthetic ${role}`);
  createdUsers.set(user.id, { email, role, displayName });
  
  const metadataUpdate = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      requested_role: baseRequestedRole,
      display_name: displayName,
      campusshield_e2e_run_id: runId,
      campusshield_e2e_synthetic: true,
    },
  });
  mustSucceed(metadataUpdate.error, `Mark synthetic ${role} account for safe cleanup`);

  const client = anonymous();
  const confirmation = await client.auth.verifyOtp({
    token_hash: properties.hashed_token,
    type: properties.verification_type || "signup",
  });
  mustSucceed(confirmation.error, `Verify synthetic ${role} signup confirmation token`);
  assert.equal(confirmation.data.user?.id, user.id, `Confirmed ${role} identity matches the generated user`);
  assert.ok(confirmation.data.session?.access_token, `Confirmed ${role} account receives an authenticated session`);

  const currentUser = await client.auth.getUser();
  mustSucceed(currentUser.error, `Read authenticated synthetic ${role} user`);
  assert.equal(currentUser.data.user?.email_confirmed_at ? true : false, true,
    `Synthetic ${role} account is email-confirmed through the token flow`);
  assert.equal(currentUser.data.user?.user_metadata?.campusshield_e2e_run_id, runId,
    `Synthetic ${role} account keeps this run's marker`);

  const profile = {
    id: user.id,
    display_name: displayName,
    role: role === "admin" ? "admin" : "student",
    requested_role: baseRequestedRole,
    verification_status: role === "admin" ? "verified" : "pending",
  };
  const profileWrite = await admin.from("profiles").upsert(profile, { onConflict: "id" });
  mustSucceed(profileWrite.error, `Provision the minimum staging-only profile for synthetic ${role}`);

  const membershipWrite = await admin.from("campus_memberships").upsert({
    user_id: user.id,
    university_id: university.id,
    faculty: "Synthetic E2E Faculty",
    department: "Synthetic E2E Department",
    course: "Synthetic E2E Programme",
    year_of_study: "100 Level",
    membership_status: "active",
    verification_status: role === "admin" ? "verified" : "pending",
    campus_role: role === "admin" ? "admin" : "student",
  }, { onConflict: "user_id" });
  mustSucceed(membershipWrite.error, `Provision the minimum staging-only membership for synthetic ${role}`);

  return { id: user.id, email, password, client, displayName };
}

async function uploadSyntheticDocument(student, extension = "pdf") {
  const objectPath = `${student.id}/${randomUUID()}.${extension}`;
  uploadedPaths.add(objectPath);
  const pdfBytes = Buffer.from(
    "%PDF-1.4\n% CampusShield synthetic E2E document; no personal or real identity data.\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n",
    "utf8",
  );
  const upload = await student.client.storage.from(IDENTITY_BUCKET).upload(objectPath, pdfBytes, {
    contentType: "application/pdf",
    upsert: false,
  });
  mustSucceed(upload.error, "Upload a synthetic PDF using the student's authenticated session");
  return objectPath;
}

async function cleanup() {
  for (const objectPath of uploadedPaths) {
    const result = await admin.storage.from(IDENTITY_BUCKET).remove([objectPath]);
    if (result.error) cleanupErrors.push("private identity file cleanup failed");
  }

  for (const [userId, metadata] of createdUsers) {
    const scanDelete = await admin.from("student_identity_upload_scans").delete().eq("user_id", userId);
    if (scanDelete.error) cleanupErrors.push("identity scan-record cleanup failed");
    const identityDelete = await admin.from("student_identity_verifications").delete().eq("user_id", userId);
    if (identityDelete.error) cleanupErrors.push("identity-record cleanup failed");
    const membershipDelete = await admin.from("campus_memberships").delete().eq("user_id", userId);
    if (membershipDelete.error) cleanupErrors.push("membership cleanup failed");
    const profileDelete = await admin.from("profiles").delete().eq("id", userId);
    if (profileDelete.error) cleanupErrors.push("profile cleanup failed");
    const userDelete = await admin.auth.admin.deleteUser(userId);
    if (userDelete.error && !/not found|does not exist/i.test(userDelete.error.message || "")) {
      cleanupErrors.push("synthetic auth-account cleanup failed");
    }
  }

  if (cleanupErrors.length) {
    throw new Error(`Staging E2E cleanup did not fully succeed (${cleanupErrors.length} cleanup operation(s)). Review the job's cleanup step before another run.`);
  }
}

async function run() {
  let student;
  let reviewer;
  try {
    const universityResult = await admin
      .from("campus_universities")
      .select("id,name")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(1)
      .maybeSingle();
    mustSucceed(universityResult.error, "Find an active staging university for the synthetic test");
    assert.ok(universityResult.data?.id && universityResult.data?.name,
      "Staging must contain at least one active university; no real university rows are changed");

    const university = universityResult.data;
    reviewer = await generateAndConfirmSyntheticUser("admin", university);
    student = await generateAndConfirmSyntheticUser("student", university);

    // The unauthenticated caller must not be allowed to set a requested role.
    const anonymousRoleAttempt = await anonymous().rpc("save_my_requested_role", {
      p_requested_role: "student",
    });
    assert.ok(anonymousRoleAttempt.error, "Anonymous role update must be denied");

    // The confirmed student account must be able to persist only its requested
    // base role via an authenticated session.
    const saveRole = await student.client.rpc("save_my_requested_role", {
      p_requested_role: "student",
    });
    mustSucceed(saveRole.error, "Persist the synthetic student's requested role");
    const studentProfile = await admin.from("profiles")
      .select("role,requested_role,verification_status")
      .eq("id", student.id)
      .single();
    mustSucceed(studentProfile.error, "Read the synthetic student profile");
    assert.equal(studentProfile.data.role, "student");
    assert.equal(studentProfile.data.requested_role, "student");
    assert.equal(studentProfile.data.verification_status, "pending");

    const objectPath = await uploadSyntheticDocument(student);
    const submission = await student.client.rpc("submit_student_identity_verification", {
      p_institution_name: university.name,
      p_student_number: `E2E-${runId.slice(0, 20)}`,
      p_object_path: objectPath,
    });
    mustSucceed(submission.error, "Submit synthetic student identity using the student's authenticated session");

    const pending = await admin.from("student_identity_verifications")
      .select("status,object_path,university_id")
      .eq("user_id", student.id)
      .single();
    mustSucceed(pending.error, "Read the first synthetic identity submission");
    assert.equal(pending.data.status, "pending");
    assert.equal(pending.data.object_path, objectPath);
    assert.equal(pending.data.university_id, university.id);

    // A student session cannot approve or reject even its own identity record.
    const studentReviewAttempt = await student.client.rpc("review_student_identity_verification", {
      p_user_id: student.id,
      p_decision: "reject",
      p_rejection_reason: "Unauthorized synthetic test attempt.",
    });
    assert.ok(studentReviewAttempt.error, "Student identity review attempt must be denied");

    const rejection = await reviewer.client.rpc("review_student_identity_verification", {
      p_user_id: student.id,
      p_decision: "reject",
      p_rejection_reason: "Synthetic E2E rejection test.",
    });
    mustSucceed(rejection.error, "Verified administrator rejects the synthetic identity submission");

    const rejected = await admin.from("student_identity_verifications")
      .select("status,rejection_reason,reviewed_by")
      .eq("user_id", student.id)
      .single();
    mustSucceed(rejected.error, "Read the rejected synthetic identity record");
    assert.equal(rejected.data.status, "rejected");
    assert.equal(rejected.data.reviewed_by, reviewer.id);
    assert.equal(rejected.data.rejection_reason, "Synthetic E2E rejection test.");

    const pendingAfterRejection = await admin.from("profiles")
      .select("verification_status")
      .eq("id", student.id)
      .single();
    mustSucceed(pendingAfterRejection.error, "Read student status after identity rejection");
    assert.equal(pendingAfterRejection.data.verification_status, "pending",
      "Identity rejection must leave the student able to resubmit");

    // Resubmit with a new synthetic object, then exercise approval from the
    // authorized administrator JWT (never the service-role client).
    const secondPath = await uploadSyntheticDocument(student);
    const resubmission = await student.client.rpc("submit_student_identity_verification", {
      p_institution_name: university.name,
      p_student_number: `E2E-${runId.slice(0, 20)}`,
      p_object_path: secondPath,
    });
    mustSucceed(resubmission.error, "Resubmit a synthetic identity after rejection");

    const approval = await reviewer.client.rpc("review_student_identity_verification", {
      p_user_id: student.id,
      p_decision: "approve",
      p_rejection_reason: null,
    });
    mustSucceed(approval.error, "Verified administrator approves the resubmitted synthetic identity");

    const approved = await admin.from("student_identity_verifications")
      .select("status,reviewed_by")
      .eq("user_id", student.id)
      .single();
    mustSucceed(approved.error, "Read the approved synthetic identity record");
    assert.equal(approved.data.status, "approved");
    assert.equal(approved.data.reviewed_by, reviewer.id);

    const verifiedProfile = await admin.from("profiles")
      .select("role,requested_role,verification_status")
      .eq("id", student.id)
      .single();
    mustSucceed(verifiedProfile.error, "Read the approved student profile");
    assert.equal(verifiedProfile.data.role, "student");
    assert.equal(verifiedProfile.data.requested_role, "student");
    assert.equal(verifiedProfile.data.verification_status, "verified");

    console.log("PASS: staging confirmation-token verification completed without sending email.");
    console.log("PASS: anonymous role update denied; authenticated student role update accepted.");
    console.log("PASS: synthetic identity uploaded/submitted with the student JWT.");
    console.log("PASS: student review denied; verified administrator rejection recorded.");
    console.log("PASS: rejected identity resubmitted and approved with the administrator JWT.");
    console.log("PASS: approved identity set the pending student profile to verified.");
  } finally {
    await cleanup();
  }
}

await run();
