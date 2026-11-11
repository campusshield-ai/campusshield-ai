import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";

const EXPECTED_STAGING_REF = "hywcpnoqqhxvujnimhxl";
const LIVEKIT_CLIENT_URL = "https://cdn.jsdelivr.net/npm/livekit-client@2.23.0/dist/livekit-client.umd.min.js";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Missing required Staging workflow value: " + name);
  return value;
}

const supabaseUrl = requiredEnv("SUPABASE_STAGING_URL");
const publishableKey = requiredEnv("SUPABASE_STAGING_ANON_KEY");
const serviceRoleKey = requiredEnv("SUPABASE_STAGING_SERVICE_ROLE_KEY");
const parsedUrl = new URL(supabaseUrl);
if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== EXPECTED_STAGING_REF + ".supabase.co") {
  throw new Error("Refusing Live Classroom media E2E: only the approved Staging Supabase project is allowed.");
}

const runId = randomUUID().replaceAll("-", "");
const emailPrefix = "campusshieldaitechnologies+liveclass-e2e-" + runId;
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});
const anonymous = () => createClient(supabaseUrl, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});
const createdUsers = new Map();
const cleanupErrors = [];
let classroomId = null;
let sessionId = null;
let teacher = null;
let student = null;
let campusAdminUser = null;
let adminSessionId = null;
let browser = null;
let teacherContext = null;
let studentContext = null;
let teacherPage = null;
let studentPage = null;
let server = null;
let serverUrl = null;
let classroomEnded = false;

function mustSucceed(error, message) {
  if (error) throw new Error(message + ": " + (error.message || String(error)));
}

function firstRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

function strongSyntheticPassword() {
  return "Cs-LiveClass-E2E!" + randomBytes(32).toString("base64url") + "-9aA";
}

async function errorDetails(error) {
  let message = error?.message || String(error);
  const context = error?.context;
  if (context && typeof context.clone === "function") {
    const payload = await context.clone().json().catch(() => null);
    if (payload?.error) message += ": " + payload.error;
    if (payload?.reason) message += " [provider reason: " + String(payload.reason).slice(0, 60) + "]";
    if (payload?.providerCode) message += " [provider code: " + String(payload.providerCode).slice(0, 60) + "]";
    if (payload?.providerStatus) message += " [provider status: " + Number(payload.providerStatus) + "]";
    if (payload?.providerErrorName) message += " [provider error: " + String(payload.providerErrorName).slice(0, 60) + "]";
    if (payload?.serverHost) message += " [LiveKit host: " + String(payload.serverHost).slice(0, 255) + "]";
    if (context.status) message += " (HTTP " + context.status + ")";
  }
  return message;
}

async function createSyntheticUser(spec, university) {
  const email = emailPrefix + "-" + spec.key + "@gmail.com";
  const password = strongSyntheticPassword();
  const generated = await admin.auth.admin.generateLink({ type: "signup", email, password });
  mustSucceed(generated.error, "Generate confirmation token for synthetic " + spec.key);
  const user = generated.data?.user;
  const properties = generated.data?.properties;
  assert.ok(user?.id, "Supabase must create the synthetic " + spec.key + " account");
  createdUsers.set(user.id, spec.key);
  assert.ok(properties?.hashed_token, "Supabase must return a confirmation token hash");

  const metadata = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      display_name: spec.displayName,
      campusshield_live_class_e2e_run_id: runId,
      campusshield_live_class_e2e_synthetic: true,
    },
  });
  mustSucceed(metadata.error, "Mark synthetic account for run-scoped cleanup");

  const client = anonymous();
  const confirmation = await client.auth.verifyOtp({
    token_hash: properties.hashed_token,
    type: properties.verification_type || "signup",
  });
  mustSucceed(confirmation.error, "Confirm synthetic " + spec.key + " account");
  assert.equal(confirmation.data.user?.id, user.id);
  assert.ok(confirmation.data.session?.access_token, "Synthetic account must receive a real authenticated JWT");

  const profile = await admin.from("profiles").upsert({
    id: user.id,
    display_name: spec.displayName,
    role: spec.profileRole,
    requested_role: spec.profileRole,
    verification_status: "verified",
  }, { onConflict: "id" });
  mustSucceed(profile.error, "Provision synthetic profile for " + spec.key);

  const membership = await admin.from("campus_memberships").upsert({
    user_id: user.id,
    university_id: university.id,
    faculty: "Synthetic Live Classroom E2E Faculty",
    department: "Synthetic Live Classroom E2E Department",
    course: "Synthetic Live Classroom E2E Programme",
    membership_status: "active",
    verification_status: "verified",
    campus_role: spec.campusRole,
  }, { onConflict: "user_id" });
  mustSucceed(membership.error, "Provision synthetic campus membership for " + spec.key);

  return { id: user.id, email, client, key: spec.key };
}

async function validateLiveKitServerCredentials(account, sessionId) {
  const result = await account.client.functions.invoke("campus-live-class-token", {
    body: { session_id: sessionId, diagnostic: true },
  });
  if (result.error) {
    const details = await errorDetails(result.error);
    throw new Error("Staging LiveKit server credential probe failed: " + details);
  }
  assert.equal(result.data?.diagnostic, true, "Staging token function must complete the server credential diagnostic");
  assert.equal(
    result.data?.credentialsAccepted,
    true,
    "LiveKit must accept the configured Staging server URL and API key/secret pair before media tokens are tested"
  );
  return result.data.serverHost;
}

async function requestRoomToken(account, role) {
  const result = await account.client.functions.invoke("campus-live-class-token", {
    body: { session_id: sessionId },
  });
  if (result.error) {
    const details = await errorDetails(result.error);
    if (/not configured|service is not configured|invalid server address/i.test(details)) {
      throw new Error(
        "Staging LiveKit is not configured for authenticated " + role + " token issuance. " +
        "Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET in the Staging Supabase Edge Function Secrets page, then rerun this test. " +
        "The values remain in Supabase and are not required in GitHub. Provider response: " + details
      );
    }
    throw new Error("Staging Live Classroom token request failed for " + role + ": " + details);
  }
  assert.ok(result.data?.token, role + " token must be returned by the authenticated Staging Edge Function");
  assert.ok(result.data?.serverUrl, role + " LiveKit URL must be returned");
  const protocol = new URL(result.data.serverUrl).protocol;
  assert.ok(protocol === "wss:" || protocol === "ws:", "LiveKit URL must use WebSocket transport");
  return { token: result.data.token, serverUrl: result.data.serverUrl, room: result.data.room };
}

function inspectAccessToken(account, access, role) {
  const parts = String(access?.token || "").split(".");
  assert.equal(parts.length, 3, role + " LiveKit access token must be a JWT");
  let header;
  let claims;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new Error(role + " LiveKit access token could not be decoded as a JWT.");
  }
  const now = Math.floor(Date.now() / 1000);
  assert.equal(header.alg, "HS256", role + " token must use the LiveKit HS256 signing algorithm");
  assert.equal(typeof claims.iss, "string", role + " token must contain a LiveKit API-key issuer");
  assert.ok(claims.iss.length > 0, role + " token issuer must not be empty");
  assert.equal(claims.sub, account.id, role + " token subject must match the authenticated Staging user");
  assert.ok(Number.isFinite(claims.exp) && claims.exp > now + 60, role + " token must not be expired");
  assert.ok(!Number.isFinite(claims.nbf) || claims.nbf <= now + 30, role + " token must already be valid");
  assert.equal(claims.video?.roomJoin, true, role + " token must grant roomJoin");
  assert.equal(typeof claims.video?.room, "string", role + " token must contain a room name");
  assert.ok(claims.video.room.length > 0, role + " token room name must not be empty");
  assert.equal(claims.video?.canPublish, true, role + " token must allow microphone, camera and screen publication");
  assert.equal(claims.video?.canSubscribe, true, role + " token must allow receiving participant tracks");
  return { issuer: claims.iss, room: claims.video.room };
}

async function createLocalOrigin() {
  server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    response.end("<!doctype html><html><head><meta charset=\"utf-8\"><title>Live Classroom media test</title></head><body><main>CampusShield synthetic media acceptance test</main></body></html>");
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not start local browser test origin.");
  serverUrl = "http://127.0.0.1:" + address.port;
}

async function createLiveRoomPage(context, access, localRole) {
  const page = await context.newPage();
  await page.goto(serverUrl, { waitUntil: "domcontentloaded" });
  await page.addScriptTag({ url: LIVEKIT_CLIENT_URL });
  await page.waitForFunction(() => Boolean(window.LivekitClient?.Room && window.LivekitClient?.RoomEvent));
  try {
    await page.evaluate(async ({ token, url, role }) => {
    const sdk = window.LivekitClient;
    const room = new sdk.Room({ adaptiveStream: false, dynacast: false });
    const stats = { remoteTracks: [], participants: [], disconnected: false };
    room.on(sdk.RoomEvent.TrackSubscribed, (track, publication, participant) => {
      stats.remoteTracks.push({
        identity: participant.identity,
        kind: String(track.kind || ""),
        source: String(publication?.source || ""),
      });
    });
    room.on(sdk.RoomEvent.ParticipantConnected, participant => {
      stats.participants.push(participant.identity);
    });
    room.on(sdk.RoomEvent.Disconnected, () => {
      stats.disconnected = true;
    });
    window.__campusLiveRoom = room;
    window.__campusLiveStats = stats;
    window.__campusLiveRole = role;
    await room.connect(url, token);
    await room.localParticipant.setMicrophoneEnabled(true);
    await room.localParticipant.setCameraEnabled(true);
    }, { token: access.token, url: access.serverUrl, role: localRole });
  } catch (error) {
    const message = error?.message || String(error);
    if (/invalid token|unauthorized|not authorized/i.test(message)) {
      throw new Error(
        "LiveKit rejected the token minted by the Staging Edge Function. The JWT shape and claims were checked before connect; verify LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET are the matching values from one LiveKit project. LiveKit response: " + message
      );
    }
    throw error;
  }
  return page;
}

async function enableFakeScreenShare(page) {
  await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const context = canvas.getContext("2d");
    let frame = 0;
    const paint = () => {
      if (!context) return;
      context.fillStyle = "#17313a";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#42d6ac";
      context.font = "bold 28px sans-serif";
      context.fillText("CampusShield synthetic screen " + frame++, 24, 60);
      requestAnimationFrame(paint);
    };
    paint();
    Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
      configurable: true,
      value: async () => canvas.captureStream(15),
    });
  });
  await page.evaluate(async () => {
    await window.__campusLiveRoom.localParticipant.setScreenShareEnabled(true);
  });
}

async function cleanup() {
  if (sessionId && teacher?.client && !classroomEnded) {
    try {
      const ended = await teacher.client.functions.invoke("campus-live-class-end", {
        body: { session_id: sessionId },
      });
      if (ended.error) cleanupErrors.push("live room shutdown");
      else classroomEnded = true;
    } catch {
      cleanupErrors.push("live room shutdown");
    }
  }

  for (const page of [teacherPage, studentPage]) {
    try { await page?.close(); } catch { cleanupErrors.push("browser page shutdown"); }
  }
  try { await teacherContext?.close(); } catch { cleanupErrors.push("teacher browser context shutdown"); }
  try { await studentContext?.close(); } catch { cleanupErrors.push("student browser context shutdown"); }
  try { await browser?.close(); } catch { cleanupErrors.push("browser shutdown"); }
  if (server) {
    try { await new Promise(resolve => server.close(resolve)); } catch { cleanupErrors.push("local test server shutdown"); }
  }

  if (sessionId) {
    const deleted = await admin.from("campus_live_class_sessions").delete().eq("id", sessionId);
    if (deleted.error) cleanupErrors.push("synthetic live session");
  }
  if (adminSessionId) {
    const deleted = await admin.from("campus_live_class_sessions").delete().eq("id", adminSessionId);
    if (deleted.error) cleanupErrors.push("synthetic campus-admin live session");
  }
  if (classroomId) {
    const enrollments = await admin.from("campus_classroom_enrollments").delete().eq("classroom_id", classroomId);
    if (enrollments.error) cleanupErrors.push("synthetic classroom enrollment");
    const classroom = await admin.from("campus_classrooms").delete().eq("id", classroomId);
    if (classroom.error) cleanupErrors.push("synthetic classroom");
  }
  const userIds = [...createdUsers.keys()];
  if (userIds.length) {
    const memberships = await admin.from("campus_memberships").delete().in("user_id", userIds);
    if (memberships.error) cleanupErrors.push("synthetic campus memberships");
    const profiles = await admin.from("profiles").delete().in("id", userIds);
    if (profiles.error) cleanupErrors.push("synthetic profiles");
  }
  for (const userId of userIds) {
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error && !/not found|does not exist/i.test(deleted.error.message || "")) {
      cleanupErrors.push("synthetic Auth accounts");
    }
  }
  if (cleanupErrors.length) {
    throw new Error("Staging Live Classroom cleanup needs review (" + cleanupErrors.join(", ") + ").");
  }
}

async function run() {
  try {
    const serviceRoleCheck = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (serviceRoleCheck.error) {
    throw new Error("Could not validate SUPABASE_STAGING_SERVICE_ROLE_KEY. Check that it is the current Staging server-side key. No test fixtures were created.");
  }

  const universityResult = await admin.from("campus_universities")
    .select("id,name").eq("is_active", true).order("name", { ascending: true }).limit(1).single();
  mustSucceed(universityResult.error, "Find an active Staging university");
  const university = universityResult.data;

  teacher = await createSyntheticUser({
    key: "lecturer",
    displayName: "CampusShield Synthetic Live Classroom Lecturer",
    profileRole: "teacher",
    campusRole: "teacher",
  }, university);
  student = await createSyntheticUser({
    key: "enrolled-student",
    displayName: "CampusShield Synthetic Live Classroom Student",
    profileRole: "student",
    campusRole: "student",
  }, university);

  campusAdminUser = await createSyntheticUser({
    key: "campus-admin",
    displayName: "CampusShield Synthetic Live Classroom Campus Admin",
    profileRole: "admin",
    campusRole: "admin",
  }, university);

    const classResult = await teacher.client.rpc("create_campus_classroom", {
      p_name: "Live Media E2E " + runId.slice(0, 8),
      p_subject: "Synthetic Live Classroom",
      p_description: "Temporary class created by the Staging two-user LiveKit media acceptance test.",
    });
    mustSucceed(classResult.error, "Verified lecturer creates a Staging classroom");
    const classroom = firstRow(classResult.data);
    classroomId = classroom?.id;
    assert.ok(classroomId, "Lecturer classroom creation must return an ID");

    const enrollment = await admin.from("campus_classroom_enrollments").insert({
      classroom_id: classroomId,
      student_id: student.id,
    });
    mustSucceed(enrollment.error, "Enroll the synthetic Staging student");

    const teacherCapabilities = await teacher.client.rpc("get_campus_live_classroom_capabilities", {
      p_classroom_id: classroomId,
    });
    mustSucceed(teacherCapabilities.error, "Lecturer can read classroom capabilities");
    assert.equal(teacherCapabilities.data, true, "Lecturer can manage their own classroom");

    const teacherClassrooms = await teacher.client.rpc("list_campus_live_classrooms");
    mustSucceed(teacherClassrooms.error, "Lecturer can list their accessible classrooms");
    assert.ok((teacherClassrooms.data || []).some(row => row.id === classroomId), "Lecturer sees their assigned classroom");

    const adminClassrooms = await campusAdminUser.client.rpc("list_campus_live_classrooms");
    mustSucceed(adminClassrooms.error, "Campus admin can list classrooms at their verified university");
    assert.ok((adminClassrooms.data || []).some(row => row.id === classroomId), "Campus admin sees the lecturer-created classroom");

    const adminCapabilities = await campusAdminUser.client.rpc("get_campus_live_classroom_capabilities", {
      p_classroom_id: classroomId,
    });
    mustSucceed(adminCapabilities.error, "Campus admin can read classroom management capabilities");
    assert.equal(adminCapabilities.data, true, "Verified campus admin can manage classrooms at their own university");

    const studentCapabilities = await student.client.rpc("get_campus_live_classroom_capabilities", {
      p_classroom_id: classroomId,
    });
    mustSucceed(studentCapabilities.error, "Enrolled student can read classroom capabilities");
    assert.equal(studentCapabilities.data, false, "Enrolled student cannot manage the classroom");

    const sessionResult = await teacher.client.rpc("create_campus_live_class_session", {
      p_classroom_id: classroomId,
      p_title: "Synthetic two-user video test",
      p_description: "Temporary authenticated lecturer/student media session.",
      p_scheduled_at: new Date(Date.now() + 60_000).toISOString(),
      p_duration_minutes: 60,
      p_external_meeting_url: null,
    });
    mustSucceed(sessionResult.error, "Lecturer schedules a live session");
    sessionId = sessionResult.data;
    assert.ok(sessionId, "The live session RPC must return an ID");

    const adminVisibleSessions = await campusAdminUser.client.rpc("list_campus_live_class_sessions", {
      p_classroom_id: classroomId,
    });
    mustSucceed(adminVisibleSessions.error, "Campus admin can list sessions for a lecturer-created classroom");
    assert.ok((adminVisibleSessions.data || []).some(row => row.id === sessionId && row.can_manage === true), "Campus admin receives management controls for the lecturer's session");

    const adminSessionResult = await campusAdminUser.client.rpc("create_campus_live_class_session", {
      p_classroom_id: classroomId,
      p_title: "Synthetic campus-admin controls test",
      p_description: "Temporary session proving campus-admin schedule/start/end permissions.",
      p_scheduled_at: new Date(Date.now() + 60_000).toISOString(),
      p_duration_minutes: 30,
      p_external_meeting_url: null,
    });
    mustSucceed(adminSessionResult.error, "Verified campus admin schedules a live class");
    adminSessionId = adminSessionResult.data;
    assert.ok(adminSessionId, "Campus-admin session creation must return an ID");

    const adminStarted = await campusAdminUser.client.rpc("start_campus_live_class_session", {
      p_session_id: adminSessionId,
    });
    mustSucceed(adminStarted.error, "Campus admin starts a scheduled live class");

    const adminEnded = await campusAdminUser.client.rpc("end_campus_live_class_session", {
      p_session_id: adminSessionId,
    });
    mustSucceed(adminEnded.error, "Campus admin ends their scheduled test session");

    const started = await teacher.client.rpc("start_campus_live_class_session", { p_session_id: sessionId });
    mustSucceed(started.error, "Lecturer starts the live session");

    const visible = await student.client.rpc("list_campus_live_class_sessions", { p_classroom_id: classroomId });
    mustSucceed(visible.error, "Enrolled student can list the live session");
    assert.ok((visible.data || []).some(row => row.id === sessionId && row.status === "live"));

    const studentCannotEnd = await student.client.functions.invoke("campus-live-class-end", {
      body: { session_id: sessionId },
    });
    assert.ok(studentCannotEnd.error, "Enrolled student must not be allowed to end the live class");

    const livekitHost = await validateLiveKitServerCredentials(teacher, sessionId);
    console.log("PASS: Staging LiveKit server accepted its server-side API key/secret pair for " + livekitHost + ".");

    const [teacherAccess, studentAccess] = await Promise.all([
      requestRoomToken(teacher, "lecturer"),
      requestRoomToken(student, "student"),
    ]);
    assert.equal(teacherAccess.serverUrl, studentAccess.serverUrl, "Both participants must receive the same LiveKit server URL");
    const teacherClaims = inspectAccessToken(teacher, teacherAccess, "Lecturer");
    const studentClaims = inspectAccessToken(student, studentAccess, "Student");
    assert.equal(teacherClaims.issuer, studentClaims.issuer, "Both tokens must be issued by the same LiveKit API key");
    assert.equal(teacherClaims.room, studentClaims.room, "Both tokens must authorize the same LiveKit room");
    console.log("PASS: both Staging room tokens have valid structure, future expiry, correct user identities, matching issuer/room and publish/subscribe grants.");

    await createLocalOrigin();
    browser = await chromium.launch({
      headless: true,
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
      ],
    });
    teacherContext = await browser.newContext();
    studentContext = await browser.newContext();
    await teacherContext.grantPermissions(["camera", "microphone"], { origin: serverUrl });
    await studentContext.grantPermissions(["camera", "microphone"], { origin: serverUrl });

    teacherPage = await createLiveRoomPage(teacherContext, teacherAccess, "lecturer");
    studentPage = await createLiveRoomPage(studentContext, studentAccess, "student");

    await teacherPage.waitForFunction((id) =>
      window.__campusLiveStats.remoteTracks.some(track => track.identity === id && track.kind === "audio"), student.id,
      { timeout: 30_000 });
    await teacherPage.waitForFunction((id) =>
      window.__campusLiveStats.remoteTracks.some(track => track.identity === id && track.kind === "video"), student.id,
      { timeout: 30_000 });
    await studentPage.waitForFunction((id) =>
      window.__campusLiveStats.remoteTracks.some(track => track.identity === id && track.kind === "audio"), teacher.id,
      { timeout: 30_000 });
    await studentPage.waitForFunction((id) =>
      window.__campusLiveStats.remoteTracks.some(track => track.identity === id && track.kind === "video"), teacher.id,
      { timeout: 30_000 });

    await enableFakeScreenShare(teacherPage);
    await studentPage.waitForFunction((id) =>
      window.__campusLiveStats.remoteTracks.some(track =>
        track.identity === id && track.kind === "video" && track.source.toLowerCase().includes("screen")
      ), teacher.id, { timeout: 30_000 });

    const ended = await campusAdminUser.client.functions.invoke("campus-live-class-end", {
      body: { session_id: sessionId },
    });
    if (ended.error) throw new Error("Verified campus admin could not end the lecturer's LiveKit room: " + await errorDetails(ended.error));
    assert.equal(ended.data?.ended, true, "Lecturer end function must mark the session ended");
    assert.equal(ended.data?.roomClosed, true, "LiveKit server must confirm room deletion");
    classroomEnded = true;

    await teacherPage.waitForFunction(() => window.__campusLiveStats.disconnected === true, null, { timeout: 20_000 });
    await studentPage.waitForFunction(() => window.__campusLiveStats.disconnected === true, null, { timeout: 20_000 });

    const finalSession = await admin.from("campus_live_class_sessions")
      .select("status").eq("id", sessionId).single();
    mustSucceed(finalSession.error, "Read ended Staging live session");
    assert.equal(finalSession.data.status, "ended");

    console.log("PASS: verified lecturer sees and manages their assigned classroom.");
    console.log("PASS: verified campus admin sees lecturer-created classes and can schedule, start and end a session.");
    console.log("PASS: enrolled synthetic student cannot manage or end a live class.");
    console.log("PASS: enrolled synthetic student received an authenticated room token; unauthorized student end was denied.");
    console.log("PASS: two separate browser participants connected to the same LiveKit room.");
    console.log("PASS: both participants published microphone and camera tracks and received the other participant's tracks.");
    console.log("PASS: lecturer screen-share track reached the enrolled student.");
    console.log("PASS: campus admin ended the lecturer's live class, LiveKit room deletion was confirmed, and both browser participants disconnected.");
  } finally {
    await cleanup();
  }
}

await run();
