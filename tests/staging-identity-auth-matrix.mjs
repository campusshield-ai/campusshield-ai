import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const PROJECT_REF = "hywcpnoqqhxvujnimhxl";
const env = process.env;
const url = env.CAMPUSSHIELD_STAGING_SUPABASE_URL;
const serviceKey = env.CAMPUSSHIELD_STAGING_SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = env.CAMPUSSHIELD_STAGING_SUPABASE_PUBLISHABLE_KEY || env.CAMPUSSHIELD_STAGING_SUPABASE_ANON_KEY;

function required(name, value) {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
required("CAMPUSSHIELD_STAGING_SUPABASE_URL", url);
required("CAMPUSSHIELD_STAGING_SUPABASE_SERVICE_ROLE_KEY", serviceKey);
required("CAMPUSSHIELD_STAGING_TEST_CONFIRM", env.CAMPUSSHIELD_STAGING_TEST_CONFIRM);
required("CAMPUSSHIELD_STAGING_SUPABASE_PUBLISHABLE_KEY (or legacy ANON_KEY)", publishableKey);
assert.equal(env.CAMPUSSHIELD_STAGING_TEST_CONFIRM, PROJECT_REF, "explicit confirmation must match staging project");
assert.equal(url, `https://${PROJECT_REF}.supabase.co`, "URL must be exactly the approved staging project");
assert.ok(!/service_role|secret/i.test(publishableKey), "signed-in clients must use a public key");

const campusA = required("CAMPUSSHIELD_STAGING_CAMPUS_A_ID", env.CAMPUSSHIELD_STAGING_CAMPUS_A_ID);
const campusB = required("CAMPUSSHIELD_STAGING_CAMPUS_B_ID", env.CAMPUSSHIELD_STAGING_CAMPUS_B_ID);
const campusAName = required("CAMPUSSHIELD_STAGING_CAMPUS_A_NAME", env.CAMPUSSHIELD_STAGING_CAMPUS_A_NAME);
const campusBName = required("CAMPUSSHIELD_STAGING_CAMPUS_B_NAME", env.CAMPUSSHIELD_STAGING_CAMPUS_B_NAME);
assert.notEqual(campusA, campusB, "two distinct campuses are required");

const runId = randomUUID();
const randomPassword = () => `CsStage!${randomUUID()}aA9`;
const users = [];
const objects = [];
const incidents = [];
let failed = null;

async function request(path, { key = publishableKey, bearer = key, method = "GET", body, headers = {}, raw = false } = {}) {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${bearer}`,
      ...(body !== undefined && !raw ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { response, data, text };
}
function assertOk(result, label) {
  assert.ok(result.response.ok, `${label}: HTTP ${result.response.status} ${JSON.stringify(result.data)}`);
  return result.data;
}
async function rpc(token, name, args = {}) {
  const result = await request(`/rest/v1/rpc/${name}`, {
    bearer: token, method: "POST", body: args,
  });
  return result;
}
async function selectIdentity(token, userId) {
  const q = new URLSearchParams({
    select: "user_id,university_id,institution_name,student_number,object_path,status,confirmed_fraud,fraud_decision_reason,fraud_notice_at,fraud_lock_at",
    user_id: `eq.${userId}`,
  });
  const result = await request(`/rest/v1/student_identity_verifications?${q}`, { bearer: token });
  return result;
}
async function createUser(label) {
  const email = `cs-identity-${runId}-${label}@example.invalid`;
  const password = randomPassword();
  const result = await request("/auth/v1/admin/users", {
    key: serviceKey,
    bearer: serviceKey,
    method: "POST",
    body: {
      email, password, email_confirm: true,
      user_metadata: { display_name: `Synthetic ${label}`, campusshield_staging_test: true, test_run_id: runId },
    },
  });
  const data = assertOk(result, `create synthetic Auth user ${label}`);
  assert.ok(data.id, "Admin API returned a created user ID");
  users.push(data.id);
  return { id: data.id, email, password, label };
}
async function signIn(user) {
  const result = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email: user.email, password: user.password },
  });
  const data = assertOk(result, `sign in synthetic ${user.label}`);
  assert.ok(data.access_token, "Auth API returned an access token");
  return data.access_token;
}
async function uploadSyntheticPdf(user, token) {
  const path = `${user.id}/${randomUUID()}.pdf`;
  // A small, fictional, non-sensitive PDF payload. No real document is ever used.
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
  const result = await request(`/storage/v1/object/student-identity-documents/${path.split("/").map(encodeURIComponent).join("/")}`, {
    bearer: token,
    key: publishableKey,
    method: "POST",
    raw: true,
    body: pdf,
    headers: { "Content-Type": "application/pdf", "x-upsert": "false" },
  });
  assertOk(result, `upload synthetic identity PDF for ${user.label}`);
  objects.push(path);
  return path;
}
async function onboardAndSubmit(user, token, campusId, campusName, label) {
  const role = await rpc(token, "save_my_requested_role", { p_requested_role: "student" });
  assertOk(role, `set student role for ${label}`);
  const membership = await rpc(token, "set_my_campus_membership", {
    p_university_id: campusId,
    p_faculty: "Synthetic Test Faculty",
    p_department: "Test Department",
    p_course: "Test Course",
    p_year_of_study: "Year 1",
  });
  assertOk(membership, `join staging campus for ${label}`);
  const objectPath = await uploadSyntheticPdf(user, token);
  const submitted = await rpc(token, "submit_student_identity_verification", {
    p_institution_name: campusName,
    p_student_number: `CS-TEST-${runId.slice(0, 12)}-${label}`,
    p_object_path: objectPath,
  });
  assertOk(submitted, `submit synthetic identity for ${label}`);
  return objectPath;
}
async function inspectSelf(token, userId) {
  const result = await selectIdentity(token, userId);
  return assertOk(result, "read identity row");
}
async function cleanUp() {
  const failures = [];
  for (const id of [...incidents].reverse()) {
    try {
      const result = await request(`/rest/v1/incidents?id=eq.${id}`, {
        key: serviceKey, bearer: serviceKey, method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });
      if (!result.response.ok && result.response.status !== 404) failures.push(`Synthetic incident ${id}: HTTP ${result.response.status} ${result.text}`);
    } catch (error) { failures.push(`Synthetic incident ${id}: ${error.message}`); }
  }
  for (const path of [...objects].reverse()) {
    try {
      const result = await request(`/storage/v1/object/student-identity-documents/${path.split("/").map(encodeURIComponent).join("/")}`, {
        key: serviceKey, bearer: serviceKey, method: "DELETE",
      });
      if (!result.response.ok && result.response.status !== 404) failures.push(`Storage ${path}: HTTP ${result.response.status} ${result.text}`);
    } catch (error) { failures.push(`Storage ${path}: ${error.message}`); }
  }
  for (const id of [...users].reverse()) {
    try {
      const result = await request(`/auth/v1/admin/users/${id}`, {
        key: serviceKey, bearer: serviceKey, method: "DELETE",
      });
      if (!result.response.ok && result.response.status !== 404) failures.push(`Auth user ${id}: HTTP ${result.response.status} ${result.text}`);
    } catch (error) { failures.push(`Auth user ${id}: ${error.message}`); }
  }
  for (const id of users) {
    try {
      const result = await request(`/auth/v1/admin/users/${id}`, { key: serviceKey, bearer: serviceKey });
      if (result.response.ok && result.data?.id) failures.push(`synthetic Auth user ${id} remains after cleanup`);
      else if (!result.response.ok && result.response.status !== 404) failures.push(`cannot verify deletion of ${id}: HTTP ${result.response.status} ${result.text}`);
    } catch (error) { failures.push(`verify deletion ${id}: ${error.message}`); }
  }
  if (failures.length) throw new Error(`CLEANUP INCOMPLETE:\n- ${failures.join("\n- ")}`);
}

async function main() {
  const adminAUser = {
    email: required("CAMPUSSHIELD_STAGING_ADMIN_A_EMAIL", env.CAMPUSSHIELD_STAGING_ADMIN_A_EMAIL),
    password: required("CAMPUSSHIELD_STAGING_ADMIN_A_PASSWORD", env.CAMPUSSHIELD_STAGING_ADMIN_A_PASSWORD),
    label: "campus A admin",
  };
  const adminBUser = {
    email: required("CAMPUSSHIELD_STAGING_ADMIN_B_EMAIL", env.CAMPUSSHIELD_STAGING_ADMIN_B_EMAIL),
    password: required("CAMPUSSHIELD_STAGING_ADMIN_B_PASSWORD", env.CAMPUSSHIELD_STAGING_ADMIN_B_PASSWORD),
    label: "campus B admin",
  };
  const adminAToken = await signIn(adminAUser);
  const adminBToken = await signIn(adminBUser);

  for (const [label, token, expectedCampus] of [
    ["campus A admin", adminAToken, campusA],
    ["campus B admin", adminBToken, campusB],
  ]) {
    const context = assertOk(await rpc(token, "get_my_campus_context"), `${label} campus context`);
    assert.equal((Array.isArray(context) ? context[0] : context)?.university_id, expectedCampus, `${label} must resolve to configured campus`);
  }

  // Two synthetic students are onboarded using the application's real membership
  // RPC and upload/submit RPC. No direct table updates or identity-row seeding.
  const studentA = await createUser("student-a");
  const studentB = await createUser("student-b");
  const tokenA = await signIn(studentA);
  const tokenB = await signIn(studentB);
  const initialObjectA = await onboardAndSubmit(studentA, tokenA, campusA, campusAName, "A");
  await onboardAndSubmit(studentB, tokenB, campusB, campusBName, "B");

  // 1) Cross-account identity and notice and document privacy. Private Storage
  // must not let the second campus student download the first student's file.
  const foreignObject = await request(`/storage/v1/object/student-identity-documents/${initialObjectA.split("/").map(encodeURIComponent).join("/")}`, {
    bearer: tokenB,
  });
  assert.ok(!foreignObject.response.ok, "another student cannot download a private identity document");

  const peerA = await request(`/rest/v1/student_identity_verifications?select=user_id&user_id=eq.${studentB.id}`, { bearer: tokenA });
  assertOk(peerA, "peer identity query");
  assert.deepEqual(peerA.data, [], "campus A student cannot read campus B student's identity row");
  const peerB = await request(`/rest/v1/student_identity_verifications?select=user_id&user_id=eq.${studentA.id}`, { bearer: tokenB });
  assertOk(peerB, "reverse peer identity query");
  assert.deepEqual(peerB.data, [], "campus B student cannot read campus A student's identity row");
  const selfStatus = assertOk(await rpc(tokenA, "my_identity_fraud_lock_status"), "self fraud status");
  assert.equal(Object.hasOwn(selfStatus, "student_number"), false);
  const targetedStatus = await rpc(tokenA, "my_identity_fraud_lock_status", { p_user_id: studentB.id });
  assert.ok(!targetedStatus.response.ok, "fraud-status RPC must not allow arbitrary target-user arguments");

  // 2) Ordinary rejection leaves the fraud flag and deadline unset.
  const ordinaryReject = await rpc(adminAToken, "review_student_identity_verification", {
    p_user_id: studentA.id, p_decision: "reject", p_rejection_reason: "Synthetic ordinary rejection",
  });
  assertOk(ordinaryReject, "ordinary same-campus rejection");
  const rejected = await inspectSelf(adminAToken, studentA.id);
  assert.equal(rejected[0]?.confirmed_fraud, false);
  assert.equal(rejected[0]?.fraud_lock_at, null);

  // 3) A rejected identity can be corrected and resubmitted through the ordinary flow.
  // A new path/upload is required; prior synthetic file is retained until final cleanup.
  await onboardAndSubmit(studentA, tokenA, campusA, campusAName, "A-correction");
  const corrected = await inspectSelf(tokenA, studentA.id);
  assert.equal(corrected[0]?.status, "pending");
  assert.equal(corrected[0]?.confirmed_fraud, false);
  assert.equal(corrected[0]?.fraud_lock_at, null);

  // Approval uses the real same-campus identity approval RPC. The profile/account
  // approval is chained by the existing verified admin review workflow.
  assertOk(await rpc(adminAToken, "review_student_identity_verification", {
    p_user_id: studentA.id, p_decision: "approve",
  }), "approve corrected synthetic identity");
  const approved = await inspectSelf(adminAToken, studentA.id);
  assert.equal(approved[0]?.status, "approved");
  assert.equal(approved[0]?.confirmed_fraud, false);

  // 4) Explicit confirmed fraud starts an exact 48-hour window for a verified student.
  assertOk(await rpc(adminAToken, "review_student_identity_verification", {
    p_user_id: studentA.id, p_decision: "fraud", p_rejection_reason: "Synthetic confirmed fraud finding",
  }), "confirm synthetic fraud");
  const fraud = await inspectSelf(adminAToken, studentA.id);
  assert.equal(fraud[0]?.confirmed_fraud, true);
  const durationMs = Date.parse(fraud[0]?.fraud_lock_at) - Date.parse(fraud[0]?.fraud_notice_at);
  assert.ok(durationMs >= 47.9 * 60 * 60 * 1000 && durationMs <= 48.1 * 60 * 60 * 1000, "fraud deadline must be 48 hours after notice");
  const activeNotice = assertOk(await rpc(tokenA, "my_identity_fraud_lock_status"), "student notice during grace period");
  assert.equal(activeNotice.confirmed_fraud, true);
  assert.equal(activeNotice.locked, false, "student still has grace-period status before the deadline");

  // Prove protected campus interactions still work during the grace period by
  // inserting a clearly fictional incident. It is tracked and deleted in finally.
  const graceInsert = await request("/rest/v1/incidents", {
    bearer: tokenA,
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: {
      reporter_id: studentA.id,
      university_id: campusA,
      category: "Other",
      severity: "Low",
      location: "Synthetic staging-only test location",
      description: `Synthetic grace-period access test ${runId}; not a real incident.`,
    },
  });
  assertOk(graceInsert, "protected incident insert during fraud notice grace period");
  assert.ok(Array.isArray(graceInsert.data) && graceInsert.data[0]?.id, "grace-period incident insert returns ID");
  incidents.push(graceInsert.data[0].id);

  // Fast-forward only this synthetic user's deadline through the server-only
  // staging admin API. This is tightly scoped to the run-created user and reset by
  // Auth deletion in finally; regular clients are separately proven unable to update it.
  // Only the run-created synthetic student's row may be changed; never issue an unfiltered PATCH.
  const forceScopedDeadline = await request(`/rest/v1/student_identity_verifications?user_id=eq.${studentA.id}`, {
    key: serviceKey, bearer: serviceKey, method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: { fraud_lock_at: new Date(Date.now() - 1000).toISOString() },
  });
  assertOk(forceScopedDeadline, "fast-forward synthetic student's fraud deadline");
  const overdue = assertOk(await rpc(tokenA, "my_identity_fraud_lock_status"), "student status after deadline");
  assert.equal(overdue.locked, true, "status RPC must report deadline passed");
  // Protected operations fail via the actual verified campus-access gate.
  const restricted = await request("/rest/v1/incidents", {
    bearer: tokenA,
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: {
      reporter_id: studentA.id,
      university_id: campusA,
      category: "Other",
      severity: "Low",
      location: "Synthetic staging-only test location",
      description: `Synthetic overdue access test ${runId}; not a real incident.`,
    },
  });
  assert.ok(!restricted.response.ok, "protected incident insert must be blocked after deadline");
  if (Array.isArray(restricted.data)) {
    for (const row of restricted.data) if (row?.id) incidents.push(row.id);
  }

  // 5) Fraud correction clears lock metadata and requires renewed approval.
  await onboardAndSubmit(studentA, tokenA, campusA, campusAName, "A-fraud-correction");
  const resubmitted = await inspectSelf(tokenA, studentA.id);
  assert.equal(resubmitted[0]?.status, "pending");
  assert.equal(resubmitted[0]?.confirmed_fraud, false);
  assert.equal(resubmitted[0]?.fraud_lock_at, null);
  assert.equal((assertOk(await rpc(tokenA, "my_identity_fraud_lock_status"), "cleared status")).confirmed_fraud, false);
  assertOk(await rpc(adminAToken, "review_student_identity_verification", {
    p_user_id: studentA.id, p_decision: "approve",
  }), "renewed approval after fraud correction");
  const renewed = await inspectSelf(adminAToken, studentA.id);
  assert.equal(renewed[0]?.status, "approved");
  assert.equal(renewed[0]?.confirmed_fraud, false);
  assert.equal(renewed[0]?.fraud_lock_at, null);

  // Cross-campus admin review must fail even for a well-formed, pending test identity.
  const crossCampusReview = await rpc(adminAToken, "review_student_identity_verification", {
    p_user_id: studentB.id, p_decision: "reject", p_rejection_reason: "Synthetic cross-campus denial",
  });
  assert.ok(!crossCampusReview.response.ok, "campus A admin cannot review campus B identity");
  const crossCampusFraudStatus = await rpc(tokenA, "my_identity_fraud_lock_status", { p_user_id: studentB.id });
  assert.ok(!crossCampusFraudStatus.response.ok, "self status cannot expose another user's fraud status");

  console.log("PASS ordinary rejection creates no confirmed-fraud metadata/deadline");
  console.log("PASS correction/resubmission clears prior rejection and returns identity to pending");
  console.log("PASS same-campus admin approval and renewed approval succeed");
  console.log("PASS confirmed fraud records a 48-hour deadline and protected incident submission succeeds during grace period");
  console.log("PASS after deadline, self status reports locked and protected incident submission is denied");
  console.log("PASS cross-account identity rows and fraud status remain private");
  console.log("PASS cross-campus administrator cannot review another campus identity");
}

try {
  await main();
} catch (error) {
  failed = error;
} finally {
  try {
    await cleanUp();
  } catch (cleanupError) {
    console.error(cleanupError.stack || cleanupError);
    failed = failed
      ? new Error(`${failed.stack || failed}\n\nCleanup also failed: ${cleanupError.stack || cleanupError}`)
      : cleanupError;
  }
}
if (failed) {
  console.error(failed.stack || failed);
  process.exitCode = 1;
} else {
  console.log(`PASS authenticated staging matrix completed; run ${runId}; synthetic user and upload cleanup verified`);
}
