import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error("Missing required environment variable: " + name);
  return value;
}

const supabaseUrl = required("SUPABASE_STAGING_URL");
const anonKey = required("SUPABASE_STAGING_ANON_KEY");
const serviceRoleKey = required("SUPABASE_STAGING_SERVICE_ROLE_KEY");
const universityId = required("SUPABASE_STAGING_UNIVERSITY_ID");

const stagingHost = new URL(supabaseUrl).hostname;
assert.equal(
  stagingHost,
  "hywcpnoqqhxvujnimhxl.supabase.co",
  "Private-message acceptance tests may only create fixtures in the dedicated Staging Supabase project."
);

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const runTag = randomUUID().replaceAll("-", "").slice(0, 10);
const createdUsers = [];
const userClients = [];

function check(result, label) {
  if (result.error) {
    throw new Error(label + ": " + result.error.message);
  }
  return result.data;
}

async function createVerifiedStudent(suffix) {
  const username = "pm_e2e_" + runTag + "_" + suffix;
  const email = "campusshield-pm-e2e-" + runTag + "-" + suffix + "@example.test";
  const displayName = "Private Messages E2E " + suffix.toUpperCase();

  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { display_name: displayName, role: "student" }
  });
  const authUser = check(created, "Create temporary Staging Auth user")?.user;
  assert.ok(authUser?.id, "Staging Auth returned a user ID");
  createdUsers.push(authUser.id);

  check(await admin.from("profiles").update({
    display_name: displayName,
    role: "student",
    requested_role: "student",
    verification_status: "verified"
  }).eq("id", authUser.id).select("id").single(), "Prepare temporary student profile");

  check(await admin.from("campus_memberships").upsert({
    user_id: authUser.id,
    university_id: universityId,
    membership_status: "active",
    verification_status: "verified",
    campus_role: "student",
    faculty: "Engineering",
    department: "Computer Science",
    course: "Computer Science",
    year_of_study: "200"
  }, { onConflict: "user_id" }).select("user_id").single(), "Prepare temporary verified campus membership");

  check(await admin.from("community_profiles").upsert({
    user_id: authUser.id,
    username,
    bio: "Automated private-messaging acceptance test account",
    faculty: "Engineering",
    department: "Computer Science",
    course_of_study: "Computer Science",
    year_of_study: "200",
    interests: []
  }, { onConflict: "user_id" }).select("user_id").single(), "Prepare temporary campus username");

  check(await admin.from("student_identity_verifications").upsert({
    user_id: authUser.id,
    university_id: universityId,
    student_number: "PM-E2E-" + runTag + "-" + suffix,
    object_path: authUser.id + "/student-identity-document",
    institution_name: "University of Lagos",
    status: "approved",
    confirmed_fraud: false
  }, { onConflict: "user_id" }).select("user_id").single(), "Prepare disposable approved identity fixture");

  // Generate the one-time token through the server-side admin API, then verify it
  // with the student's anon client. This exercises a real authenticated session
  // without using the CAPTCHA-protected password sign-in endpoint or weakening Auth.
  const link = check(await admin.auth.admin.generateLink({
    type: "magiclink",
    email
  }), "Generate temporary student sign-in token");
  const tokenHash = link?.properties?.hashed_token;
  const verificationType = link?.properties?.verification_type || "magiclink";
  assert.ok(tokenHash, "Admin generated a one-time sign-in token hash");

  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const signedIn = check(await client.auth.verifyOtp({
    token_hash: tokenHash,
    type: verificationType
  }), "Verify one-time sign-in token for temporary student " + suffix);
  assert.equal(signedIn.user.id, authUser.id, "The student session is authenticated as its created account");
  userClients.push(client);

  const verifiedRows = check(await client.rpc("get_my_campus_context"), "Check verified campus context");
  const verified = Array.isArray(verifiedRows) ? verifiedRows[0] : verifiedRows;
  assert.equal(verified?.membership_status, "active");
  assert.equal(verified?.verification_status, "verified");

  return { id: authUser.id, username, client };
}

async function main() {
  const uni = check(await admin.from("campus_universities")
    .select("id,name")
    .eq("id", universityId)
    .single(), "Validate the dedicated Staging university");
  assert.equal(uni.name, "University of Lagos", "The test is pinned to its known Staging campus");

  const sender = await createVerifiedStudent("a");
  const recipient = await createVerifiedStudent("b");

  const found = check(await sender.client.rpc("search_campus_members", {
    p_query: recipient.username
  }), "Search the verified campus directory");
  assert.ok(found.some((member) => member.username === recipient.username),
    "The verified student directory returns the recipient");

  const conversationId = check(await sender.client.rpc("create_campus_direct_message_request", {
    p_recipient_username: recipient.username,
    p_body: "Automated Staging message request " + runTag
  }), "Create a real authenticated student-to-student request");
  assert.match(conversationId, /^[0-9a-f-]{36}$/i, "The request returns a conversation UUID");

  const recipientInbox = check(await recipient.client.rpc("list_my_campus_direct_conversations"),
    "Load recipient's private inbox");
  const incoming = recipientInbox.find((row) => row.conversation_id === conversationId);
  assert.ok(incoming, "The recipient sees the incoming request");
  assert.equal(incoming.status, "pending");
  assert.equal(incoming.requested_by_me, false);

  const pendingMessages = check(await recipient.client.rpc("list_campus_direct_messages", {
    p_conversation_id: conversationId
  }), "Read the pending request introduction");
  assert.equal(pendingMessages.length, 1);
  assert.match(pendingMessages[0].body, new RegExp(runTag));
  assert.equal(pendingMessages[0].is_mine, false);

  assert.equal(check(await recipient.client.rpc("respond_campus_direct_message_request", {
    p_conversation_id: conversationId,
    p_action: "accept"
  }), "Accept the message request"), true);

  check(await sender.client.rpc("send_campus_direct_message", {
    p_conversation_id: conversationId,
    p_body: "Automated Staging reply after acceptance " + runTag
  }), "Send the first accepted-conversation reply");

  const [senderMessages, recipientMessages, senderInbox] = await Promise.all([
    sender.client.rpc("list_campus_direct_messages", { p_conversation_id: conversationId }),
    recipient.client.rpc("list_campus_direct_messages", { p_conversation_id: conversationId }),
    sender.client.rpc("list_my_campus_direct_conversations")
  ].map(async (promise, index) => check(await promise, [
    "Read sender conversation",
    "Read recipient conversation",
    "Refresh sender inbox"
  ][index])));

  assert.equal(senderMessages.length, 2, "Sender sees the introduction and reply");
  assert.equal(recipientMessages.length, 2, "Recipient sees the same two published messages");
  assert.equal(senderMessages[0].body, pendingMessages[0].body);
  assert.match(senderMessages[1].body, new RegExp(runTag));
  assert.equal(senderMessages[0].is_mine, true);
  assert.equal(senderMessages[1].is_mine, true);
  assert.equal(recipientMessages[0].is_mine, false);
  assert.equal(recipientMessages[1].is_mine, false);
  assert.deepEqual(
    recipientMessages.map((message) => message.id),
    senderMessages.map((message) => message.id),
    "Both authenticated participants see the same message records"
  );

  const accepted = senderInbox.find((row) => row.conversation_id === conversationId);
  assert.equal(accepted?.status, "accepted");
  assert.equal(accepted?.requested_by_me, true);

  console.log("PASS Staging private messaging: two authenticated students, verified directory lookup, request creation, recipient inbox, acceptance, reply, and matching conversation history.");
}

let failure;
try {
  await main();
} catch (error) {
  failure = error;
} finally {
  for (const client of userClients) {
    try { await client.auth.signOut(); } catch {}
  }

  const cleanupFailures = [];
  for (const userId of [...createdUsers].reverse()) {
    try {
      const result = await admin.auth.admin.deleteUser(userId);
      if (result.error) cleanupFailures.push(result.error.message);
    } catch (error) {
      cleanupFailures.push(error?.message || String(error));
    }
  }

  if (cleanupFailures.length) {
    const cleanupError = new Error(
      "Staging test-account cleanup failed for " + cleanupFailures.length +
      " temporary user(s): " + cleanupFailures.join("; ")
    );
    if (failure) cleanupError.cause = failure;
    failure = cleanupError;
  }
}

if (failure) {
  console.error("Private Messages Staging E2E failed:", failure?.stack || failure);
  process.exitCode = 1;
}
