import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const EXPECTED_STAGING_REF = "hywcpnoqqhxvujnimhxl";
function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Missing required Staging workflow value: " + name);
  return value;
}
const supabaseUrl = requiredEnv("SUPABASE_STAGING_URL");
const anonKey = requiredEnv("SUPABASE_STAGING_ANON_KEY");
const serviceRoleKey = requiredEnv("SUPABASE_STAGING_SERVICE_ROLE_KEY");
const parsedUrl = new URL(supabaseUrl);
if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== EXPECTED_STAGING_REF + ".supabase.co") {
  throw new Error("Refusing Campus Network E2E: only the approved Staging project is allowed.");
}

const runId = randomUUID().replaceAll("-", "");
const runTag = "csn-" + runId.slice(0, 10);
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});
const anonymous = () => createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});
const createdUsers = new Map();
const createdBlocks = [];
const applicationIds = [];
const introIds = [];
const cleanupErrors = [];
let postId = null;
let alumniUserId = null;
let runFailure = null;

function mustSucceed(error, message) {
  if (error) throw new Error(message + ": " + (error.message || String(error)));
}
function strongSyntheticPassword() {
  return "Cs-Campus-Network-E2E!" + randomBytes(24).toString("base64url") + "-9aA";
}
async function createVerifiedMember(key, university, username) {
  const email = "campusshieldaitechnologies+campus-network-" + runId + "-" + key + "@gmail.com";
  const password = strongSyntheticPassword();
  const generated = await admin.auth.admin.generateLink({ type: "signup", email, password });
  mustSucceed(generated.error, "Generate confirmation token for " + key);
  const user = generated.data?.user;
  const properties = generated.data?.properties;
  assert.ok(user?.id, "Supabase creates the synthetic " + key + " user");
  createdUsers.set(user.id, key);
  assert.ok(properties?.hashed_token, "Supabase returns a confirmation token hash");

  const metadata = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      display_name: "CampusShield synthetic network test " + key,
      campusshield_network_e2e_run_id: runId,
      campusshield_network_e2e_synthetic: true,
    },
  });
  mustSucceed(metadata.error, "Mark " + key + " for run-scoped cleanup");

  const client = anonymous();
  const confirmation = await client.auth.verifyOtp({
    token_hash: properties.hashed_token,
    type: properties.verification_type || "signup",
  });
  mustSucceed(confirmation.error, "Confirm synthetic " + key);
  assert.equal(confirmation.data.user?.id, user.id);
  assert.ok(confirmation.data.session?.access_token, "Synthetic member receives a real JWT");
  const authUser = await client.auth.getUser();
  mustSucceed(authUser.error, "Read authenticated synthetic " + key);
  assert.ok(authUser.data.user?.email_confirmed_at, "Synthetic member is email-confirmed");

  const profile = await admin.from("profiles").upsert({
    id: user.id,
    display_name: "CampusShield synthetic network test " + key,
    role: "teacher",
    requested_role: "teacher",
    verification_status: "verified",
  }, { onConflict: "id" });
  mustSucceed(profile.error, "Provision verified synthetic profile for " + key);

  const membership = await admin.from("campus_memberships").upsert({
    user_id: user.id,
    university_id: university.id,
    faculty: "Synthetic Campus Network E2E Faculty",
    department: "Synthetic Campus Network E2E Department",
    course: "Synthetic Campus Network E2E Programme",
    membership_status: "active",
    verification_status: "verified",
    campus_role: "teacher",
  }, { onConflict: "user_id" });
  mustSucceed(membership.error, "Provision verified synthetic membership for " + key);

  const communityProfile = await admin.from("community_profiles").upsert({
    user_id: user.id,
    username,
  }, { onConflict: "user_id" });
  mustSucceed(communityProfile.error, "Provision synthetic Campus Network username for " + key);

  return { id: user.id, email, client, username, university };
}

async function removeBlock(row) {
  const result = await admin.from("campus_member_blocks").delete()
    .eq("blocker_id", row.blocker_id)
    .eq("blocked_id", row.blocked_id)
    .eq("university_id", row.university_id);
  mustSucceed(result.error, "Remove synthetic Campus Network block");
  const index = createdBlocks.findIndex(x =>
    x.blocker_id === row.blocker_id && x.blocked_id === row.blocked_id && x.university_id === row.university_id
  );
  if (index >= 0) createdBlocks.splice(index, 1);
}

async function assertBlockedFromNetwork(peer, author, label, blockRow, titleTag, alumniUsername) {
  const inserted = await admin.from("campus_member_blocks").insert(blockRow);
  mustSucceed(inserted.error, "Create synthetic block for " + label);
  createdBlocks.push(blockRow);

  const feed = await peer.client.rpc("list_campus_network_posts", {
    p_post_type: "volunteer",
    p_scope: "network",
    p_query: titleTag,
  });
  mustSucceed(feed.error, "Load Campus Network while testing " + label);
  assert.ok(!(feed.data || []).some(row => row.id === postId),
    "Blocked post authors must be hidden from cross-university network discovery: " + label);

  const application = await peer.client.rpc("apply_to_campus_network_post", {
    p_post_id: postId,
    p_note: "Synthetic E2E request while this member relationship is blocked.",
  });
  assert.ok(application.error, "A blocked member must not apply to a Campus Network post: " + label);

  const directory = await peer.client.rpc("list_campus_alumni_directory", {
    p_scope: "network",
    p_query: alumniUsername,
  });
  mustSucceed(directory.error, "Load Alumni Connect while testing " + label);
  assert.ok(!(directory.data || []).some(row => row.username === alumniUsername),
    "Blocked alumni profiles must be hidden from cross-university discovery: " + label);

  const introduction = await peer.client.rpc("request_campus_alumni_intro_by_username", {
    p_username: alumniUsername,
    p_note: "Synthetic E2E introduction request while blocked.",
  });
  assert.ok(introduction.error, "A blocked alumnus must not receive an introduction request: " + label);

  await removeBlock(blockRow);
}

async function cleanup() {
  const ids = [...createdUsers.keys()];
  if (ids.length) {
    const introDelete = await admin.from("campus_alumni_intro_requests").delete()
      .or("alumni_user_id.in.(" + ids.join(",") + "),requester_id.in.(" + ids.join(",") + ")");
    if (introDelete.error) cleanupErrors.push("Campus Network introduction requests");
  }
  if (introIds.length) {
    const result = await admin.from("campus_alumni_intro_requests").delete().in("id", introIds);
    if (result.error) cleanupErrors.push("synthetic introduction rows");
  }
  if (applicationIds.length) {
    const result = await admin.from("campus_network_applications").delete().in("id", applicationIds);
    if (result.error) cleanupErrors.push("synthetic applications");
  }
  if (postId) {
    const result = await admin.from("campus_network_applications").delete().eq("post_id", postId);
    if (result.error) cleanupErrors.push("applications for synthetic post");
    const post = await admin.from("campus_network_posts").delete().eq("id", postId);
    if (post.error) cleanupErrors.push("synthetic network post");
  }
  if (alumniUserId) {
    const result = await admin.from("campus_alumni_profiles").delete().eq("user_id", alumniUserId);
    if (result.error) cleanupErrors.push("synthetic alumni profile");
  }
  for (const block of createdBlocks) {
    const result = await admin.from("campus_member_blocks").delete()
      .eq("blocker_id", block.blocker_id)
      .eq("blocked_id", block.blocked_id)
      .eq("university_id", block.university_id);
    if (result.error) cleanupErrors.push("Campus Network member blocks");
  }
  if (ids.length) {
    const community = await admin.from("community_profiles").delete().in("user_id", ids);
    if (community.error) cleanupErrors.push("synthetic community profiles");
    const memberships = await admin.from("campus_memberships").delete().in("user_id", ids);
    if (memberships.error) cleanupErrors.push("synthetic campus memberships");
    const profiles = await admin.from("profiles").delete().in("id", ids);
    if (profiles.error) cleanupErrors.push("synthetic profiles");
  }
  for (const userId of ids) {
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error && !/not found|does not exist/i.test(deleted.error.message || "")) {
      cleanupErrors.push("synthetic Auth users");
    }
  }
  if (cleanupErrors.length) {
    throw new Error("Campus Network E2E cleanup needs review (" + cleanupErrors.length + " cleanup categories failed).");
  }
}

async function run() {
  try {
    const universities = await admin.from("campus_universities")
      .select("id,name").eq("is_active", true).order("name", { ascending: true }).limit(2);
    mustSucceed(universities.error, "Find active Staging universities");
    assert.ok(universities.data?.length >= 2,
      "Campus Network privacy E2E requires two active Staging universities");

    const firstUniversity = universities.data[0];
    const secondUniversity = universities.data[1];
    const peerUsername = "csn" + randomBytes(5).toString("hex");
    const alumniUsername = "csn" + randomBytes(5).toString("hex");
    const peer = await createVerifiedMember("peer", secondUniversity, peerUsername);
    const alumni = await createVerifiedMember("alumnus", firstUniversity, alumniUsername);
    alumniUserId = alumni.id;

    const post = await admin.from("campus_network_posts").insert({
      university_id: firstUniversity.id,
      user_id: alumni.id,
      post_type: "volunteer",
      category: "community",
      title: "Campus network privacy " + runTag,
      description: "Synthetic cross-university post used only to verify block privacy and cleanup.",
      skills: ["synthetic", "community"],
      commitment: "Flexible",
      visibility: "network",
      status: "published",
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }).select("id").single();
    mustSucceed(post.error, "Create synthetic cross-university post");
    postId = post.data.id;

    const alumniProfile = await admin.from("campus_alumni_profiles").insert({
      user_id: alumni.id,
      university_id: firstUniversity.id,
      programme: "Synthetic E2E Programme",
      graduation_year: 2025,
      headline: "Synthetic Campus Network Alumni Profile",
      bio: "Synthetic alumni biography created only for the staging privacy end-to-end test.",
      skills: ["synthetic", "mentoring"],
      visibility: "network",
      status: "verified",
      reviewed_by: peer.id,
    });
    mustSucceed(alumniProfile.error, "Create synthetic verified alumni profile");

    // A block placed in the blocker's own university must protect both directions
    // across the network, not only callers whose selected university matches it.
    await assertBlockedFromNetwork(peer, alumni, "alumnus blocks remote peer", {
      blocker_id: alumni.id,
      blocked_id: peer.id,
      university_id: firstUniversity.id,
    }, runTag, alumniUsername);

    await assertBlockedFromNetwork(peer, alumni, "remote peer blocks alumnus", {
      blocker_id: peer.id,
      blocked_id: alumni.id,
      university_id: secondUniversity.id,
    }, runTag, alumniUsername);

    // After removing both synthetic block rows, the normal cross-university
    // discovery, application and introduction paths must work again.
    const feed = await peer.client.rpc("list_campus_network_posts", {
      p_post_type: "volunteer",
      p_scope: "network",
      p_query: runTag,
    });
    mustSucceed(feed.error, "Read the unblocked Campus Network post");
    assert.ok((feed.data || []).some(row => row.id === postId), "Unblocked network post is discoverable");

    const application = await peer.client.rpc("apply_to_campus_network_post", {
      p_post_id: postId,
      p_note: "Synthetic E2E application after the test block has been removed.",
    });
    mustSucceed(application.error, "Apply after the synthetic block is removed");
    if (application.data) applicationIds.push(application.data);

    const directory = await peer.client.rpc("list_campus_alumni_directory", {
      p_scope: "network",
      p_query: alumniUsername,
    });
    mustSucceed(directory.error, "Read the unblocked Alumni Connect directory");
    assert.ok((directory.data || []).some(row => row.username === alumniUsername),
      "Unblocked alumni profile is discoverable");

    const introduction = await peer.client.rpc("request_campus_alumni_intro_by_username", {
      p_username: alumniUsername,
      p_note: "Synthetic E2E introduction after the test block has been removed.",
    });
    mustSucceed(introduction.error, "Request introduction after the synthetic block is removed");
    if (introduction.data) introIds.push(introduction.data);

    // Anonymous users must not bypass the authenticated directory or private tables.
    const anonDirectory = await anonymous().rpc("list_campus_alumni_directory", {
      p_scope: "network",
      p_query: alumniUsername,
    });
    assert.ok(anonDirectory.error, "Anonymous users cannot query Alumni Connect");
    const directBlockRead = await peer.client.from("campus_member_blocks").select("blocker_id").limit(1);
    assert.ok(directBlockRead.error, "Authenticated clients cannot read the private block table directly");

    console.log("PASS: reciprocal member blocks hide cross-university network posts.");
    console.log("PASS: blocked members cannot apply to cross-university posts.");
    console.log("PASS: reciprocal member blocks hide Alumni Connect profiles and prevent introductions.");
    console.log("PASS: unblocked members can discover, apply and request alumni introductions.");
    console.log("PASS: anonymous/direct-table access remains denied.");
  } catch (error) {
    runFailure = error;
    throw error;
  } finally {
    try {
      await cleanup();
      console.log("PASS: all synthetic Campus Network test rows and Auth users were removed.");
    } catch (cleanupError) {
      console.error(cleanupError.message || "Campus Network cleanup failed.");
      if (!runFailure) throw cleanupError;
    }
  }
}

await run();
