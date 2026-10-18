import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const expectedProjectRef = "hywcpnoqqhxvujnimhxl";
const env = process.env;
const url = env.CAMPUSSHIELD_STAGING_SUPABASE_URL;
const serviceKey = env.CAMPUSSHIELD_STAGING_SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = env.CAMPUSSHIELD_STAGING_SUPABASE_PUBLISHABLE_KEY || env.CAMPUSSHIELD_STAGING_SUPABASE_ANON_KEY;
const confirmation = env.CAMPUSSHIELD_STAGING_TEST_CONFIRM;

function required(name, value) {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
required("CAMPUSSHIELD_STAGING_SUPABASE_URL", url);
required("CAMPUSSHIELD_STAGING_SUPABASE_SERVICE_ROLE_KEY", serviceKey);
required("CAMPUSSHIELD_STAGING_SUPABASE_PUBLISHABLE_KEY (or legacy ANON_KEY)", publishableKey);
required("CAMPUSSHIELD_STAGING_TEST_CONFIRM", confirmation);

assert.equal(confirmation, expectedProjectRef, "explicit confirmation must match staging project ref");
assert.equal(url, `https://${expectedProjectRef}.supabase.co`, "URL must be the approved staging project URL");
assert.ok(!/service_role|secret/i.test(publishableKey), "signed-in client must use a publishable/anon key");
assert.ok(!/service_role|secret/i.test(url), "URL must not contain key material");

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const client = (key = publishableKey) => createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const createdUsers = [];
const createdObjectPaths = [];
const createdIdentityUserIds = [];
const runId = randomUUID();
const syntheticPassword = `CsStage!${randomUUID()}aA9`;
let primaryError;

async function createSyntheticUser(label) {
  const email = `cs-identity-${runId}-${label}@example.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: syntheticPassword,
    email_confirm: true,
    user_metadata: { display_name: `Synthetic ${label}`, campusshield_staging_test: true, test_run_id: runId },
  });
  if (error) throw error;
  createdUsers.push(data.user.id);
  return { id: data.user.id, email, password: syntheticPassword };
}
async function signIn(user) {
  const signedIn = client();
  const { error } = await signedIn.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw error;
  return signedIn;
}
async function cleanup() {
  const failures = [];
  // Auth deletion cascades through profile/membership/identity foreign keys.
  // Delete only resources whose IDs and paths were captured by this process.
  for (const path of [...createdObjectPaths].reverse()) {
    try {
      const { error } = await admin.storage.from("student-identity-documents").remove([path]);
      if (error) failures.push(`Storage object ${path}: ${error.message}`);
    } catch (error) { failures.push(`Storage object ${path}: ${error.message}`); }
  }
  for (const id of [...createdUsers].reverse()) {
    try {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) failures.push(`Auth user ${id}: ${error.message}`);
    } catch (error) { failures.push(`Auth user ${id}: ${error.message}`); }
  }
  for (const id of createdUsers) {
    try {
      const { data, error } = await admin.auth.admin.getUserById(id);
      if (!error && data?.user) failures.push(`synthetic Auth user ${id} still exists`);
    } catch (error) { failures.push(`verify Auth user deletion ${id}: ${error.message}`); }
  }
  if (failures.length) throw new Error(`CLEANUP INCOMPLETE:\n- ${failures.join("\n- ")}`);
}

async function main() {
  // Require owner-provisioned, preverified admins in two different test campuses.
  const adminAEmail = required("CAMPUSSHIELD_STAGING_ADMIN_A_EMAIL", env.CAMPUSSHIELD_STAGING_ADMIN_A_EMAIL);
  const adminAPassword = required("CAMPUSSHIELD_STAGING_ADMIN_A_PASSWORD", env.CAMPUSSHIELD_STAGING_ADMIN_A_PASSWORD);
  const adminBEmail = required("CAMPUSSHIELD_STAGING_ADMIN_B_EMAIL", env.CAMPUSSHIELD_STAGING_ADMIN_B_EMAIL);
  const adminBPassword = required("CAMPUSSHIELD_STAGING_ADMIN_B_PASSWORD", env.CAMPUSSHIELD_STAGING_ADMIN_B_PASSWORD);
  const campusA = required("CAMPUSSHIELD_STAGING_CAMPUS_A_ID", env.CAMPUSSHIELD_STAGING_CAMPUS_A_ID);
  const campusB = required("CAMPUSSHIELD_STAGING_CAMPUS_B_ID", env.CAMPUSSHIELD_STAGING_CAMPUS_B_ID);
  assert.notEqual(campusA, campusB, "two distinct campus IDs are required");

  const adminA = await signIn({ email: adminAEmail, password: adminAPassword });
  const adminB = await signIn({ email: adminBEmail, password: adminBPassword });
  for (const [name, signedIn, expectedCampus] of [
    ["campus A admin", adminA, campusA],
    ["campus B admin", adminB, campusB],
  ]) {
    const { data: userData, error: userError } = await signedIn.auth.getUser();
    assert.ifError(userError);
    assert.ok(userData.user, `${name} authenticated`);
    const { data: campusContext, error: campusError } = await signedIn.rpc("get_my_campus_context");
    assert.ifError(campusError);
    const context = Array.isArray(campusContext) ? campusContext[0] : campusContext;
    assert.ok(context, `${name} has campus context`);
    assert.equal(context.university_id, expectedCampus, `${name} resolves to the configured campus`);
    const { data: status, error: statusError } = await signedIn.rpc("my_identity_fraud_lock_status");
    assert.ifError(statusError);
    assert.ok(status && typeof status === "object", `${name} self-status RPC returns JSON`);
  }

  // Probe self-only access, without assuming a new Auth user automatically receives
  // a campus profile or a valid identity submission.
  const studentA = await createSyntheticUser("student-a");
  const studentB = await createSyntheticUser("student-b");
  const studentClientA = await signIn(studentA);
  const studentClientB = await signIn(studentB);
  const selfStatus = await studentClientA.rpc("my_identity_fraud_lock_status");
  assert.ifError(selfStatus.error);
  assert.ok(selfStatus.data && typeof selfStatus.data === "object");
  assert.equal(Object.hasOwn(selfStatus.data, "student_number"), false);
  assert.equal(Object.hasOwn(selfStatus.data, "object_path"), false);
  const targetedStatus = await studentClientA.rpc("my_identity_fraud_lock_status", { p_user_id: studentB.id });
  assert.ok(targetedStatus.error, "self-status RPC must reject arbitrary target arguments");

  const peerRow = await studentClientA.from("student_identity_verifications")
    .select("user_id").eq("user_id", studentB.id);
  assert.ifError(peerRow.error);
  assert.equal(peerRow.data?.length ?? 0, 0, "student cannot read a peer identity record");
  const otherStudentRow = await studentClientB.from("student_identity_verifications")
    .select("user_id").eq("user_id", studentA.id);
  assert.ifError(otherStudentRow.error);
  assert.equal(otherStudentRow.data?.length ?? 0, 0, "peer privacy is symmetric");

  // Review on behalf of campus A must not be able to touch an Auth-created user
  // with no campus A membership. This negative assertion does not claim the
  // affirmative same-campus review/deadline/resubmission matrix passed.
  const crossCampusProbe = await adminA.rpc("review_student_identity_verification", {
    p_user_id: studentB.id,
    p_decision: "fraud",
    p_rejection_reason: "Synthetic cross-campus denial probe",
  });
  assert.ok(crossCampusProbe.error, "admin cannot review an unrelated account");

  // No direct writes to profiles, memberships, identity records, or Storage metadata
  // are used to invent privileged fixtures. The current connected execution does
  // not provide a safe way to exercise the real UI's campus onboarding and upload
  // workflow, so keep the job red until the required app-created fixture exists.
  throw new Error(
    "INCOMPLETE AUTHENTICATED MATRIX: self-only status, peer RLS privacy, and negative cross-campus probes passed, " +
    "but the four required end-to-end scenarios still need a verified synthetic campus fixture created through the real app: " +
    "ordinary rejection vs confirmed fraud, grace-period/deadline enforcement, correction/resubmission plus renewed approval, " +
    "and full cross-campus privacy. The job deliberately exits nonzero rather than incorrectly reporting overall PASS."
  );
}

try {
  await main();
} catch (error) {
  primaryError = error;
} finally {
  try {
    await cleanup();
  } catch (cleanupError) {
    console.error(cleanupError.stack || cleanupError);
    primaryError = primaryError
      ? new Error(`${primaryError.stack || primaryError}\n\nAlso cleanup failed: ${cleanupError.stack || cleanupError}`)
      : cleanupError;
  }
}

if (primaryError) {
  console.error(primaryError.stack || primaryError);
  process.exitCode = 1;
} else {
  console.log(`PASS all authenticated staging identity scenarios completed; run ${runId}; cleanup verified`);
}
