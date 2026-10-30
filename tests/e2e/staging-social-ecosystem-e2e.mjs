import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const EXPECTED_STAGING_REF = "hywcpnoqqhxvujnimhxl";
const BUCKET = "campus-community-media";
const RUN_ID = randomUUID().replaceAll("-", "");
const createdUsers = [];
const storyIds = [];
const confessionIds = [];
const courseIds = [];
const groupIds = [];
const directUploadPaths = [];
const cleanupErrors = [];

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required workflow variable: ${name}`);
  return value;
}
function mustSucceed(error, context) {
  if (error) throw new Error(`${context}: ${error.message || String(error)}`);
}
function password() {
  return `Cs-E2E!-${randomBytes(24).toString("base64url")}-Aa9`;
}

const supabaseUrl = requiredEnv("SUPABASE_STAGING_URL");
const anonKey = requiredEnv("SUPABASE_STAGING_ANON_KEY");
const serviceRoleKey = requiredEnv("SUPABASE_STAGING_SERVICE_ROLE_KEY");
const parsed = new URL(supabaseUrl);
if (parsed.protocol !== "https:" || parsed.hostname !== `${EXPECTED_STAGING_REF}.supabase.co`) {
  throw new Error("Refusing E2E test: target must be the approved staging project. No writes were made.");
}
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/vxcAAAAASUVORK5CYII=",
  "base64",
);
const EICAR = Buffer.from(
  "X5O!P%@AP[4\\\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
  "ascii",
);
const INFECTED_PNG = Buffer.concat([PNG, EICAR]);

async function createUser(role, university) {
  const email = `campusshield-e2e-${RUN_ID}-${role}@example.test`;
  const pass = password();
  const displayName = `CampusShield synthetic ${role} ${RUN_ID.slice(0, 8)}`;
  const username = `cse2e${RUN_ID.slice(0, 10)}${role === "moderator" ? "m" : role === "outsider" ? "x" : "s"}`;

  const created = await admin.auth.admin.createUser({
    email,
    password: pass,
    email_confirm: true,
    user_metadata: { campusshield_e2e: true, campusshield_e2e_run_id: RUN_ID, requested_role: role === "moderator" ? "teacher" : "student" },
  });
  mustSucceed(created.error, `Create temporary staging ${role}`);
  const userId = created.data.user.id;
  createdUsers.push({ id: userId, email, role });

  const profile = await admin.from("profiles").upsert({
    id: userId,
    display_name: displayName,
    role: role === "moderator" ? "admin" : "student",
    requested_role: role === "moderator" ? "teacher" : "student",
    verification_status: "verified",
  }, { onConflict: "id" });
  mustSucceed(profile.error, `Provision staging ${role} profile`);

  const membership = await admin.from("campus_memberships").upsert({
    user_id: userId,
    university_id: university.id,
    faculty: "Synthetic E2E Faculty",
    department: "Synthetic E2E Department",
    course: "Synthetic E2E Programme",
    year_of_study: "100 Level",
    membership_status: "active",
    verification_status: "verified",
    campus_role: role === "moderator" ? "admin" : "student",
  }, { onConflict: "user_id" });
  mustSucceed(membership.error, `Provision staging ${role} membership`);

  const community = await admin.from("community_profiles").upsert({
    user_id: userId,
    username,
  }, { onConflict: "user_id" });
  mustSucceed(community.error, `Provision staging ${role} campus username`);

  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password: pass });
  mustSucceed(signedIn.error, `Authenticate synthetic staging ${role}`);
  assert.equal(signedIn.data.user?.id, userId, `Authenticated ${role} session matches the generated user`);
  return { id: userId, email, client, university };
}

async function createStory(student, body) {
  const result = await student.client.rpc("create_campus_story", { p_body: body });
  mustSucceed(result.error, "Create an authenticated synthetic Campus Story");
  assert.ok(result.data, "Story RPC returns a story id");
  storyIds.push(result.data);
  return result.data;
}

async function callStoryUpload(student, storyId, bytes, filename) {
  const form = new FormData();
  form.set("story_id", storyId);
  form.set("file", new File([bytes], filename, { type: "image/png" }));
  form.set("alt_text", "Synthetic malware scanning E2E fixture");
  return await student.client.functions.invoke("campus-story-media-upload", { body: form });
}

async function responsePayload(error) {
  const context = error?.context;
  if (context && typeof context.json === "function") {
    try { return { status: context.status, body: await context.json() }; } catch { /* use safe fallback */ }
  }
  return { status: context?.status ?? null, body: null };
}

async function cleanup() {
  try {
    const mediaQuery = storyIds.length
      ? await admin.from("campus_story_media").select("object_path").in("story_id", storyIds)
      : { data: [], error: null };
    if (mediaQuery.error) cleanupErrors.push("could not enumerate Story media for cleanup");
    const paths = [
      ...directUploadPaths,
      ...(mediaQuery.data || []).map((row) => row.object_path).filter(Boolean),
    ];
    if (paths.length) {
      const removed = await admin.storage.from(BUCKET).remove([...new Set(paths)]);
      if (removed.error) cleanupErrors.push("private Story object cleanup failed");
    }
    if (storyIds.length) {
      const approvals = await admin.from("campus_story_media_scan_approvals").delete().in("story_id", storyIds);
      if (approvals.error) cleanupErrors.push("Story scan approval cleanup failed");
      const media = await admin.from("campus_story_media").delete().in("story_id", storyIds);
      if (media.error) cleanupErrors.push("Story media metadata cleanup failed");
      const stories = await admin.from("campus_stories").delete().in("id", storyIds);
      if (stories.error) cleanupErrors.push("Story cleanup failed");
    }
    if (confessionIds.length) {
      const confessions = await admin.from("campus_confessions").delete().in("id", confessionIds);
      if (confessions.error) cleanupErrors.push("Confession cleanup failed");
    }
    if (groupIds.length) {
      const groups = await admin.from("campus_groups").delete().in("id", groupIds);
      if (groups.error) cleanupErrors.push("Study Circle cleanup failed");
    }
    if (courseIds.length) {
      const courses = await admin.from("campus_courses").delete().in("id", courseIds);
      if (courses.error) cleanupErrors.push("Synthetic course cleanup failed");
    }
    for (const user of createdUsers) {
      const community = await admin.from("community_profiles").delete().eq("user_id", user.id);
      if (community.error) cleanupErrors.push("campus username cleanup failed");
      const membership = await admin.from("campus_memberships").delete().eq("user_id", user.id);
      if (membership.error) cleanupErrors.push("campus membership cleanup failed");
      const profile = await admin.from("profiles").delete().eq("id", user.id);
      if (profile.error) cleanupErrors.push("profile cleanup failed");
      const deleted = await admin.auth.admin.deleteUser(user.id);
      if (deleted.error && !/not found|does not exist/i.test(deleted.error.message || "")) {
        cleanupErrors.push("synthetic auth-user cleanup failed");
      }
    }
  } catch {
    cleanupErrors.push("unexpected cleanup failure");
  }
  if (cleanupErrors.length) {
    throw new Error(`Staging E2E cleanup failed (${cleanupErrors.length} operation(s)); inspect temporary synthetic test records before retrying.`);
  }
}

async function run() {
  const universities = await admin.from("campus_universities")
    .select("id,name")
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(500);
  mustSucceed(universities.error, "Load active staging universities");
  assert.ok((universities.data || []).length >= 2, "Staging needs two active universities for cross-campus isolation tests");
  const first = universities.data.find((u) => /babcock/i.test(u.name)) || universities.data[0];
  const second = universities.data.find((u) => u.id !== first.id);
  assert.ok(first?.id && second?.id, "Two distinct staging universities must be available");

  const student = await createUser("student", first);
  const moderator = await createUser("moderator", first);
  const outsider = await createUser("outsider", second);

  // The private approval table must not be writable by authenticated app sessions.
  const forgedApproval = await student.client.from("campus_story_media_scan_approvals").insert({
    story_id: randomUUID(),
    university_id: first.id,
    uploader_id: student.id,
    object_path: `${first.id}/${randomUUID()}/forged.png`,
    file_sha256: "a".repeat(64),
    mime_type: "image/png",
    byte_size: PNG.byteLength,
    scan_status: "clean",
  });
  assert.ok(forgedApproval.error, "Authenticated users cannot forge a clean-scan approval");

  const cleanStoryId = await createStory(student, "Synthetic E2E: clean Story attachment and moderator review.");
  const directPath = `${first.id}/${cleanStoryId}/direct-bypass.png`;
  const directUpload = await student.client.storage.from(BUCKET).upload(directPath, PNG, {
    contentType: "image/png",
    upsert: false,
  });
  if (!directUpload.error) {
    directUploadPaths.push(directPath);
    throw new Error("SECURITY FAILURE: direct authenticated upload bypassed the Story malware-scanning function.");
  }

  const cleanUpload = await callStoryUpload(student, cleanStoryId, PNG, "clean.png");
  mustSucceed(cleanUpload.error, "Authenticated clean Story upload through ClamAV scanner");
  assert.equal(cleanUpload.data?.status, "clean", "ClamAV confirms the clean Story sample");

  const media = await admin.from("campus_story_media")
    .select("story_id,object_path,mime_type,byte_size,uploader_id")
    .eq("story_id", cleanStoryId)
    .single();
  mustSucceed(media.error, "Read clean Story media metadata");
  assert.equal(media.data.uploader_id, student.id, "Storage owner and metadata uploader remain the authenticated student");
  assert.equal(media.data.mime_type, "image/png");
  assert.equal(media.data.byte_size, PNG.byteLength);

  const approval = await admin.from("campus_story_media_scan_approvals")
    .select("scan_status,consumed_at,file_sha256")
    .eq("object_path", media.data.object_path)
    .single();
  mustSucceed(approval.error, "Read one-time scan approval");
  assert.equal(approval.data.scan_status, "clean");
  assert.ok(approval.data.consumed_at, "The clean approval is consumed by the attachment RPC");
  assert.match(approval.data.file_sha256, /^[0-9a-f]{64}$/);

  const studentModeration = await student.client.rpc("moderate_campus_story", {
    p_story_id: cleanStoryId,
    p_decision: "publish",
  });
  assert.ok(studentModeration.error, "A student cannot moderate a Campus Story");

  const moderationQueue = await moderator.client.rpc("list_campus_story_moderation");
  mustSucceed(moderationQueue.error, "Load the campus moderation queue");
  assert.ok((moderationQueue.data || []).some((row) => row.story_id === cleanStoryId), "Moderator sees the pending Story in the same campus");

  const publish = await moderator.client.rpc("moderate_campus_story", {
    p_story_id: cleanStoryId,
    p_decision: "publish",
  });
  mustSucceed(publish.error, "Authorized moderator publishes the clean Story");
  const feed = await student.client.rpc("list_campus_stories");
  mustSucceed(feed.error, "Read published Stories as the author");
  assert.ok((feed.data || []).some((row) => row.story_id === cleanStoryId), "Published Story is visible in its university");

  // EICAR inside a PNG container is an antivirus test fixture, not executable malware.
  const infectedStoryId = await createStory(student, "Synthetic E2E: infected Story attachment must be rejected.");
  const infectedUpload = await callStoryUpload(student, infectedStoryId, INFECTED_PNG, "eicar.png");
  const infectedResponse = await responsePayload(infectedUpload.error);
  assert.equal(infectedResponse.status, 422, "ClamAV must reject the EICAR sample with HTTP 422");
  assert.equal(infectedResponse.body?.status, "infected", "ClamAV identifies the fixture as infected");
  const infectedMedia = await admin.from("campus_story_media").select("id").eq("story_id", infectedStoryId);
  mustSucceed(infectedMedia.error, "Check that infected media was not attached");
  assert.equal((infectedMedia.data || []).length, 0, "An infected file is never attached to a Story");
  const infectedApproval = await admin.from("campus_story_media_scan_approvals").select("id")
    .eq("story_id", infectedStoryId);
  mustSucceed(infectedApproval.error, "Check that infected sample created no clean approval");
  assert.equal((infectedApproval.data || []).length, 0, "An infected file receives no clean-scan approval");

  // A user at another university cannot view or attach media to the first campus' Story.
  const outsiderFeed = await outsider.client.rpc("list_campus_stories");
  mustSucceed(outsiderFeed.error, "Read Stories from a different university");
  assert.ok(!(outsiderFeed.data || []).some((row) => row.story_id === cleanStoryId), "Cross-university Story feed isolation holds");
  const crossCampusUpload = await callStoryUpload(outsider, cleanStoryId, PNG, "cross-campus.png");
  const crossCampusResponse = await responsePayload(crossCampusUpload.error);
  assert.equal(crossCampusResponse.status, 403, "Cross-university Story media upload is denied before scanning");

  // Anonymous confession moderation remains campus-scoped and never returns authorship.
  const confession = await student.client.rpc("create_campus_confession", {
    p_category: "academic_stress",
    p_body: "Synthetic E2E confession for moderation and campus isolation checks.",
  });
  mustSucceed(confession.error, "Create a synthetic anonymous confession");
  confessionIds.push(confession.data);
  const confessionQueue = await moderator.client.rpc("list_campus_confession_moderation");
  mustSucceed(confessionQueue.error, "Load anonymous confession moderation queue");
  assert.ok((confessionQueue.data || []).some((row) => row.confession_id === confession.data), "Moderator can review a pending confession");
  const unauthorizedConfessionReview = await student.client.rpc("moderate_campus_confession", {
    p_confession_id: confession.data,
    p_decision: "publish",
  });
  assert.ok(unauthorizedConfessionReview.error, "Students cannot moderate anonymous confessions");
  const publishConfession = await moderator.client.rpc("moderate_campus_confession", {
    p_confession_id: confession.data,
    p_decision: "publish",
  });
  mustSucceed(publishConfession.error, "Authorized moderator publishes anonymous confession");
  const confessionFeed = await student.client.rpc("list_campus_confessions");
  mustSucceed(confessionFeed.error, "Read published anonymous confessions");
  const publicConfession = (confessionFeed.data || []).find((row) => row.confession_id === confession.data);
  assert.ok(publicConfession, "Published confession is visible to its campus");
  assert.ok(!Object.hasOwn(publicConfession, "author_id"), "Public confession feed never exposes author id");
  const outsiderConfessions = await outsider.client.rpc("list_campus_confessions");
  mustSucceed(outsiderConfessions.error, "Read confessions from another university");
  assert.ok(!(outsiderConfessions.data || []).some((row) => row.confession_id === confession.data), "Cross-university confession isolation holds");

  // Exercise Study Circle/course-group creation, approval, membership and live discussion.
  const courseCode = `E2E${RUN_ID.slice(0, 8).toUpperCase()}`;
  const course = await admin.from("campus_courses").insert({
    university_id: first.id,
    course_code: courseCode,
    title: "Synthetic Study Circle E2E Course",
    level: "all",
    summary: "Temporary course fixture for authenticated Study Circle verification.",
    status: "published",
    created_by: moderator.id,
    reviewed_by: moderator.id,
    reviewed_at: new Date().toISOString(),
  }).select("id").single();
  mustSucceed(course.error, "Create synthetic staging course fixture");
  courseIds.push(course.data.id);

  const circle = await student.client.rpc("create_campus_course_group", {
    p_course_id: course.data.id,
    p_description: "Synthetic Study Circle created by authenticated staging E2E.",
  });
  mustSucceed(circle.error, "Create Study Circle as an authenticated student");
  const circleRow = Array.isArray(circle.data) ? circle.data[0] : circle.data;
  assert.ok(circleRow?.group_id, "Study Circle returns its existing Campus Group id");
  assert.equal(circleRow.group_status, "pending");
  groupIds.push(circleRow.group_id);

  const approveCircle = await moderator.client.rpc("review_campus_content", {
    p_content_type: "group",
    p_content_id: circleRow.group_id,
    p_decision: "publish",
  });
  mustSucceed(approveCircle.error, "Campus moderator approves the Study Circle");
  const moderatorJoin = await moderator.client.rpc("join_campus_group", { p_group_id: circleRow.group_id });
  mustSucceed(moderatorJoin.error, "Moderator joins the approved Study Circle");
  const sentMessage = await student.client.rpc("send_campus_course_community_message", {
    p_group_id: circleRow.group_id,
    p_body: "Synthetic E2E Study Circle message.",
  });
  mustSucceed(sentMessage.error, "Student sends a Study Circle discussion message");
  const discussion = await moderator.client.rpc("list_campus_course_community_messages", {
    p_group_id: circleRow.group_id,
  });
  mustSucceed(discussion.error, "Moderator reads Study Circle discussion messages");
  assert.ok((discussion.data || []).some((row) => row.id === sentMessage.data), "Study Circle message is visible to an approved member");

  const outsiderJoin = await outsider.client.rpc("join_campus_group", { p_group_id: circleRow.group_id });
  assert.ok(outsiderJoin.error, "A student from another university cannot join the Study Circle");

  console.log("PASS: direct Story Storage upload bypass is blocked for authenticated users.");
  console.log("PASS: clean Story media is virus-scanned, approved once, uploaded as the student, and attached.");
  console.log("PASS: EICAR-infected Story media is rejected and receives no approval or attachment.");
  console.log("PASS: student moderation is denied; authorized campus moderator can publish Stories and Confessions.");
  console.log("PASS: confession feeds do not expose author identity.");
  console.log("PASS: cross-university Story, Confession and Study Circle access is denied.");
  console.log("PASS: authenticated Study Circle create, moderator approval, membership and discussion message flow.");
}

let testError;
try {
  await run();
} catch (error) {
  testError = error;
} finally {
  try { await cleanup(); } catch (error) { if (!testError) testError = error; }
}
if (testError) throw testError;
