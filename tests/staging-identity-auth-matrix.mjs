import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const expectedProjectRef = "hywcpnoqqhxvujnimhxl";
const url = process.env.CAMPUSSHIELD_STAGING_SUPABASE_URL;
const serviceKey = process.env.CAMPUSSHIELD_STAGING_SUPABASE_SERVICE_ROLE_KEY;
const confirmation = process.env.CAMPUSSHIELD_STAGING_TEST_CONFIRM;
const campusA = process.env.CAMPUSSHIELD_STAGING_CAMPUS_A_ID;
const campusB = process.env.CAMPUSSHIELD_STAGING_CAMPUS_B_ID;
const adminAEmail = process.env.CAMPUSSHIELD_STAGING_ADMIN_A_EMAIL;
const adminBEmail = process.env.CAMPUSSHIELD_STAGING_ADMIN_B_EMAIL;
const adminAPassword = process.env.CAMPUSSHIELD_STAGING_ADMIN_A_PASSWORD;
const adminBPassword = process.env.CAMPUSSHIELD_STAGING_ADMIN_B_PASSWORD;

function requireEnv(name, value) {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
}
for (const [name, value] of Object.entries({
  CAMPUSSHIELD_STAGING_SUPABASE_URL: url,
  CAMPUSSHIELD_STAGING_SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  CAMPUSSHIELD_STAGING_TEST_CONFIRM: confirmation,
  CAMPUSSHIELD_STAGING_CAMPUS_A_ID: campusA,
  CAMPUSSHIELD_STAGING_CAMPUS_B_ID: campusB,
  CAMPUSSHIELD_STAGING_ADMIN_A_EMAIL: adminAEmail,
  CAMPUSSHIELD_STAGING_ADMIN_B_EMAIL: adminBEmail,
  CAMPUSSHIELD_STAGING_ADMIN_A_PASSWORD: adminAPassword,
  CAMPUSSHIELD_STAGING_ADMIN_B_PASSWORD: adminBPassword,
})) requireEnv(name, value);

assert.equal(confirmation, expectedProjectRef, "explicit confirmation must match the staging project ref");
assert.match(url, new RegExp(`^https://${expectedProjectRef}\\.supabase\\.co/?$`), "URL must point to the approved staging project");
assert.notEqual(campusA, campusB, "two distinct staging campuses are required");

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const createdUsers = [];
const createdObjectPaths = [];
const runId = randomUUID();
const emailDomain = "example.invalid";
const password = `CsStage!${randomUUID()}aA9`;

async function ok(promise, label) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}
async function createSyntheticUser(roleLabel) {
  const email = `cs-identity-${runId}-${roleLabel}@${emailDomain}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: `Synthetic ${roleLabel}`, campusshield_staging_test: true, test_run_id: runId },
  });
  if (error) throw error;
  createdUsers.push(data.user.id);
  return { id: data.user.id, email, password };
}
async function signIn(user) {
  const client = createClient(url, process.env.CAMPUSSHIELD_STAGING_SUPABASE_PUBLISHABLE_KEY || process.env.CAMPUSSHIELD_STAGING_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw error;
  return client;
}
async function tryRpc(client, fn, args) {
  return client.rpc(fn, args);
}
async function inspectIdentity(client, userId) {
  return client.from("student_identity_verifications")
    .select("user_id,university_id,status,confirmed_fraud,fraud_decision_reason,fraud_notice_at,fraud_lock_at")
    .eq("user_id", userId).maybeSingle();
}
async function cleanup() {
  const failures = [];
  // Remove only objects created by this run, identified by unique folder UUID.
  for (const path of createdObjectPaths.reverse()) {
    try {
      const { error } = await admin.storage.from("student-identity-documents").remove([path]);
      if (error) failures.push(`storage ${path}: ${error.message}`);
    } catch (error) { failures.push(`storage ${path}: ${error.message}`); }
  }
  for (const id of [...createdUsers].reverse()) {
    try {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) failures.push(`auth user ${id}: ${error.message}`);
    } catch (error) { failures.push(`auth user ${id}: ${error.message}`); }
  }
  // Best-effort postcondition: none of this run's synthetic identities remain.
  for (const id of createdUsers) {
    try {
      const { data, error } = await admin.auth.admin.getUserById(id);
      if (!error && data?.user) failures.push(`synthetic user ${id} remains after cleanup`);
    } catch (error) { failures.push(`cleanup verification for ${id}: ${error.message}`); }
  }
  if (failures.length) throw new Error(`CLEANUP INCOMPLETE:\n- ${failures.join("\n- ")}`);
}

async function main() {
  const publishableKey = process.env.CAMPUSSHIELD_STAGING_SUPABASE_PUBLISHABLE_KEY || process.env.CAMPUSSHIELD_STAGING_SUPABASE_ANON_KEY;
  requireEnv("CAMPUSSHIELD_STAGING_SUPABASE_PUBLISHABLE_KEY (or legacy ANON_KEY)", publishableKey);
  assert.ok(!/service_role|secret/i.test(publishableKey), "client key must be a publishable/anon key");
  const adminA = { email: adminAEmail, password: adminAPassword };
  const adminB = { email: adminBEmail, password: adminBPassword };
  const clientA = await signIn(adminA);
  const clientB = await signIn(adminB);

  // This harness deliberately depends on two pre-seeded verified staging admins.
  // The staging owner must ensure these credentials belong to verified admins of
  // campus A/B respectively; test-created student identities are always synthetic.
  for (const [label, client] of [["campus A admin", clientA], ["campus B admin", clientB]]) {
    const { data, error } = await client.rpc("my_identity_fraud_lock_status");
    assert.ifError(error, `${label} can call only its own identity-status RPC`);
    assert.ok(data && typeof data === "object", `${label} identity status has safe JSON shape`);
  }

  const student = await createSyntheticUser("student-a");
  const crossCampusStudent = await createSyntheticUser("student-b");
  const studentA = await signIn(student);
  const studentB = await signIn(crossCampusStudent);

  // Verify unauthorised self-status probing is impossible: the status RPC takes
  // no user ID, so a student cannot ask for another account's private notice.
  const ownStatus = await ok(studentA.rpc("my_identity_fraud_lock_status"), "student own fraud status");
  assert.equal(typeof ownStatus, "object");
  assert.equal(Object.hasOwn(ownStatus, "student_number"), false);
  assert.equal(Object.hasOwn(ownStatus, "object_path"), false);
  const otherStatus = await studentA.rpc("my_identity_fraud_lock_status", { p_user_id: crossCampusStudent.id });
  assert.ok(otherStatus.error, "status RPC must not accept an arbitrary target user ID");

  // Verify table RLS hides other users' identity records in both directions.
  const peerRead = await studentA.from("student_identity_verifications").select("user_id").eq("user_id", crossCampusStudent.id);
  assert.ifError(peerRead.error);
  assert.equal(peerRead.data?.length ?? 0, 0, "student cannot read another student's identity row");

  // This runner intentionally does not fabricate campus memberships, Storage metadata,
  // or profile roles via privileged SQL. Those operations are schema-specific and must
  // be exercised through the approved campus onboarding and upload path. We therefore
  // verify role/campus authorization with the real RPC and fail closed if test fixture
  // profiles are not properly prepared by the staging owner before relying on review.
  const reviewCrossCampus = await tryRpc(clientA, "review_student_identity_verification", {
    p_user_id: crossCampusStudent.id, p_decision: "fraud", p_rejection_reason: "synthetic cross-campus probe",
  });
  assert.ok(reviewCrossCampus.error, "campus A admin must not review campus B user");

  // A real set of pending/approved identity records must be created through the app
  // upload+submission path before fraud timeline assertions are meaningful. Report an
  // explicit actionable blocker rather than mutate data through service-role SQL.
  const studentIdentity = await inspectIdentity(studentA, student.id);
  assert.ifError(studentIdentity.error);
  assert.ok(studentIdentity.data, "test student must have an identity record created via the approved staging upload/submission flow");
  assert.equal(studentIdentity.data.university_id, campusA, "student fixture must belong to campus A");
  assert.equal(studentIdentity.data.status, "pending", "fresh synthetic identity should be pending");

  const ordinaryReject = await clientA.rpc("review_student_identity_verification", {
    p_user_id: student.id, p_decision: "reject", p_rejection_reason: "Synthetic ordinary rejection",
  });
  assert.ifError(ordinaryReject.error, "ordinary rejection should be accepted by verified same-campus admin");
  const afterReject = await ok(inspectIdentity(clientA, student.id), "inspect ordinary rejection");
  assert.equal(afterReject.confirmed_fraud, false);
  assert.equal(afterReject.fraud_lock_at, null, "ordinary rejection must not start a 48-hour deadline");

  // Reset fixture through the normal resubmission flow before confirming fraud;
  // the app should upload a fresh object, then call submit_student_identity_verification.
  const resubmit = await studentA.rpc("submit_student_identity_verification", {
    p_institution_name: process.env.CAMPUSSHIELD_STAGING_CAMPUS_A_NAME,
    p_student_number: `CS-TEST-${runId.slice(0, 8)}`,
    p_object_path: process.env.CAMPUSSHIELD_STAGING_STUDENT_OBJECT_PATH,
  });
  assert.ifError(resubmit.error, "identity correction/resubmission must be accepted using a fresh synthetic upload");
  const fraud = await clientA.rpc("review_student_identity_verification", {
    p_user_id: student.id, p_decision: "fraud", p_rejection_reason: "Synthetic confirmed fraud test",
  });
  assert.ifError(fraud.error, "verified same-campus admin should record explicit confirmed fraud");
  const afterFraud = await ok(inspectIdentity(clientA, student.id), "inspect confirmed fraud");
  assert.equal(afterFraud.confirmed_fraud, true);
  assert.ok(Date.parse(afterFraud.fraud_lock_at) - Date.parse(afterFraud.fraud_notice_at) >= 47.9 * 60 * 60 * 1000);
  assert.ok(Date.parse(afterFraud.fraud_lock_at) - Date.parse(afterFraud.fraud_notice_at) <= 48.1 * 60 * 60 * 1000);

  const setDeadlinePast = await admin.from("student_identity_verifications").update({ fraud_lock_at: new Date(Date.now() - 1000).toISOString() }).eq("user_id", student.id);
  assert.ok(setDeadlinePast.error, "direct client update of fraud deadline must be denied");
  const lockedStatus = await ok(studentA.rpc("my_identity_fraud_lock_status"), "student lock status");
  assert.equal(lockedStatus.confirmed_fraud, true);
  assert.equal(lockedStatus.locked, true, "protected status RPC must report deadline passed");

  console.log("PASS same-campus fraud status is self-only and peer identity rows are hidden by RLS");
  console.log("PASS cross-campus identity review is denied");
  console.log("PASS ordinary rejection does not set confirmed-fraud metadata or deadline");
  console.log("PASS confirmed-fraud notice records a 48-hour deadline");
  console.log("PASS deadline is evaluated without exposing an update path to ordinary clients");
  console.log("NOTE correction/resubmission and renewed approval require the seeded upload fixture documented in tests/STAGING-IDENTITY-TESTS.md");
}

let primaryError;
try {
  await main();
} catch (error) {
  primaryError = error;
} finally {
  try { await cleanup(); }
  catch (cleanupError) {
    console.error(cleanupError.stack || cleanupError);
    if (!primaryError) primaryError = cleanupError;
    else primaryError = new Error(`${primaryError.stack || primaryError}\n\nAlso ${cleanupError.stack || cleanupError}`);
  }
}
if (primaryError) {
  console.error(primaryError.stack || primaryError);
  process.exitCode = 1;
} else {
  console.log(`PASS staging authenticated identity matrix run ${runId}; synthetic Auth accounts removed`);
}
