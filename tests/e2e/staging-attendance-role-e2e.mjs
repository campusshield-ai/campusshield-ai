import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const EXPECTED_STAGING_REF = "hywcpnoqqhxvujnimhxl";
function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Missing required staging workflow value: " + name);
  return value;
}
const supabaseUrl = requiredEnv("SUPABASE_STAGING_URL");
const publishableKey = requiredEnv("SUPABASE_STAGING_ANON_KEY");
const serviceRoleKey = requiredEnv("SUPABASE_STAGING_SERVICE_ROLE_KEY");
const parsedUrl = new URL(supabaseUrl);
if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== EXPECTED_STAGING_REF + ".supabase.co") {
  throw new Error("Refusing attendance E2E: only the approved Staging project is allowed. No test writes were made.");
}

const runId = randomUUID().replaceAll("-", "");
const emailPrefix = "campusshieldaitechnologies+attendance-e2e-" + runId;
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
let runFailure = null;

function mustSucceed(error, message) {
  if (error) throw new Error(message + ": " + (error.message || String(error)));
}
function firstRow(data) {
  return Array.isArray(data) ? data[0] : data;
}
function expectDenied(result, message) {
  assert.ok(result.error, message + " must be denied by the Staging authorization layer.");
  return result.error;
}
function strongSyntheticPassword() {
  return "Cs-Attendance-E2E!" + randomBytes(32).toString("base64url") + "-9aA";
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
      campusshield_attendance_e2e_run_id: runId,
      campusshield_attendance_e2e_synthetic: true,
    },
  });
  mustSucceed(metadata.error, "Mark synthetic account for run-scoped cleanup");

  const client = anonymous();
  const confirmation = await client.auth.verifyOtp({
    token_hash: properties.hashed_token,
    type: properties.verification_type || "signup",
  });
  mustSucceed(confirmation.error, "Confirm synthetic " + spec.key + " account");
  assert.equal(confirmation.data.user?.id, user.id, "Confirmed identity must match the generated synthetic account");
  assert.ok(confirmation.data.session?.access_token, "Synthetic account must receive a real authenticated JWT");
  const userLookup = await client.auth.getUser();
  mustSucceed(userLookup.error, "Read confirmed synthetic identity");
  assert.equal(Boolean(userLookup.data.user?.email_confirmed_at), true, "Synthetic identity must be email-confirmed");

  const profile = await admin.from("profiles").upsert({
    id: user.id,
    display_name: spec.displayName,
    role: spec.profileRole,
    requested_role: spec.requestedRole,
    verification_status: spec.profileVerification,
  }, { onConflict: "id" });
  mustSucceed(profile.error, "Provision synthetic profile for " + spec.key);

  const membership = await admin.from("campus_memberships").upsert({
    user_id: user.id,
    university_id: university.id,
    faculty: "Synthetic Attendance E2E Faculty",
    department: "Synthetic Attendance E2E Department",
    course: "Synthetic Attendance E2E Programme",
    membership_status: "active",
    verification_status: spec.membershipVerification,
    campus_role: spec.campusRole,
  }, { onConflict: "user_id" });
  mustSucceed(membership.error, "Provision synthetic campus membership for " + spec.key);
  return { id: user.id, email, client, key: spec.key };
}

async function cleanup() {
  const userIds = [...createdUsers.keys()];
  if (sessionId) {
    const audit = await admin.from("campus_class_attendance_audit").delete().eq("session_id", sessionId);
    if (audit.error) cleanupErrors.push("attendance audit rows");
    const records = await admin.from("campus_class_attendance").delete().eq("session_id", sessionId);
    if (records.error) cleanupErrors.push("attendance rows");
  }
  if (classroomId) {
    const sessions = await admin.from("campus_class_sessions").delete().eq("classroom_id", classroomId);
    if (sessions.error) cleanupErrors.push("attendance sessions");
    const enrollments = await admin.from("campus_classroom_enrollments").delete().eq("classroom_id", classroomId);
    if (enrollments.error) cleanupErrors.push("classroom enrollments");
    const classroom = await admin.from("campus_classrooms").delete().eq("id", classroomId);
    if (classroom.error) cleanupErrors.push("synthetic classroom");
  }
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
    throw new Error("Staging attendance E2E cleanup needs review (" + cleanupErrors.length + " cleanup categories failed).");
  }
}

async function run() {
  try {
    // Validate the privileged Staging credential before querying or creating fixtures.
    // A nonempty but revoked/incorrect secret must fail with an actionable message.
    const serviceRoleCheck = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (serviceRoleCheck.error) {
      const message = serviceRoleCheck.error.message || String(serviceRoleCheck.error);
      if (/invalid api key|unauthorized|forbidden|401|403/i.test(message)) {
        throw new Error("Supabase rejected SUPABASE_STAGING_SERVICE_ROLE_KEY. Update that GitHub Actions secret with the current Staging project's server-side service-role/secret key. No attendance test fixtures were created.");
      }
      throw new Error("Could not validate the Staging service-role credential: " + message);
    }

    const universities = await admin.from("campus_universities")
      .select("id,name").eq("is_active", true).order("name", { ascending: true }).limit(2);
    mustSucceed(universities.error, "Find active Staging universities");
    assert.ok(universities.data?.length >= 2, "Staging needs two active universities for campus-boundary tests");
    const homeUniversity = universities.data[0];
    const otherUniversity = universities.data[1];

    const adminA = await createSyntheticUser({
      key: "same-campus-admin", displayName: "CampusShield Synthetic Attendance Administrator",
      profileRole: "admin", requestedRole: "teacher", profileVerification: "verified",
      campusRole: "admin", membershipVerification: "verified",
    }, homeUniversity);
    const adminB = await createSyntheticUser({
      key: "other-campus-admin", displayName: "CampusShield Synthetic Other-University Administrator",
      profileRole: "admin", requestedRole: "teacher", profileVerification: "verified",
      campusRole: "admin", membershipVerification: "verified",
    }, otherUniversity);
    const teacher = await createSyntheticUser({
      key: "lecturer", displayName: "CampusShield Synthetic Verified Lecturer",
      profileRole: "teacher", requestedRole: "teacher", profileVerification: "verified",
      campusRole: "teacher", membershipVerification: "verified",
    }, homeUniversity);
    const student = await createSyntheticUser({
      key: "enrolled-student", displayName: "CampusShield Synthetic Enrolled Student",
      profileRole: "student", requestedRole: "student", profileVerification: "verified",
      campusRole: "student", membershipVerification: "verified",
    }, homeUniversity);
    const nonEnrolled = await createSyntheticUser({
      key: "non-enrolled-student", displayName: "CampusShield Synthetic Non-Enrolled Student",
      profileRole: "student", requestedRole: "student", profileVerification: "verified",
      campusRole: "student", membershipVerification: "verified",
    }, homeUniversity);
    const pendingStudent = await createSyntheticUser({
      key: "pending-student", displayName: "CampusShield Synthetic Pending Student",
      profileRole: "student", requestedRole: "student", profileVerification: "pending",
      campusRole: "student", membershipVerification: "pending",
    }, homeUniversity);

    const classroomWrite = await admin.from("campus_classrooms").insert({
      university_id: homeUniversity.id,
      teacher_id: teacher.id,
      name: "Attendance E2E " + runId.slice(0, 8),
      subject: "Synthetic Attendance",
      description: "Temporary synthetic classroom created by the Staging attendance role test.",
      join_code: randomBytes(6).toString("hex").toUpperCase(),
    }).select("id").single();
    mustSucceed(classroomWrite.error, "Create temporary Staging classroom");
    classroomId = classroomWrite.data.id;
    assert.ok(classroomId, "Staging must return a classroom ID");

    const enrollment = await admin.from("campus_classroom_enrollments").insert({
      classroom_id: classroomId,
      student_id: student.id,
    });
    mustSucceed(enrollment.error, "Enroll the synthetic student in the temporary classroom");

    const teacherCapabilities = firstRow((await teacher.client.rpc(
      "get_campus_class_attendance_capabilities", { p_classroom_id: classroomId }
    )).data);
    assert.equal(teacherCapabilities?.can_access, true, "Verified lecturer must access their classroom");
    assert.equal(teacherCapabilities?.can_manage, true, "Verified lecturer must manage their classroom");

    const adminCapabilitiesResult = await adminA.client.rpc(
      "get_campus_class_attendance_capabilities", { p_classroom_id: classroomId }
    );
    mustSucceed(adminCapabilitiesResult.error, "Same-university verified admin must access attendance controls");
    const adminCapabilities = firstRow(adminCapabilitiesResult.data);
    assert.equal(adminCapabilities?.can_access, true);
    assert.equal(adminCapabilities?.can_manage, true);

    expectDenied(await adminB.client.rpc(
      "get_campus_class_attendance_capabilities", { p_classroom_id: classroomId }
    ), "Cross-university admin classroom access");

    const studentCapabilitiesResult = await student.client.rpc(
      "get_campus_class_attendance_capabilities", { p_classroom_id: classroomId }
    );
    mustSucceed(studentCapabilitiesResult.error, "Enrolled verified student must access their classroom");
    const studentCapabilities = firstRow(studentCapabilitiesResult.data);
    assert.equal(studentCapabilities?.can_access, true);
    assert.equal(studentCapabilities?.can_manage, false);

    expectDenied(await nonEnrolled.client.rpc(
      "get_campus_class_attendance_capabilities", { p_classroom_id: classroomId }
    ), "Verified but non-enrolled student classroom access");
    expectDenied(await pendingStudent.client.rpc(
      "get_campus_class_attendance_capabilities", { p_classroom_id: classroomId }
    ), "Pending student classroom access");

    const sessionResult = await teacher.client.rpc("create_campus_class_attendance_session", {
      p_classroom_id: classroomId,
      p_title: "Attendance E2E " + runId.slice(0, 8),
      p_session_date: new Date().toISOString().slice(0, 10),
      p_window_minutes: 120,
      p_late_after_minutes: 15,
    });
    mustSucceed(sessionResult.error, "Verified lecturer must create an attendance session");
    sessionId = sessionResult.data;
    assert.ok(sessionId, "Attendance session must be created by the lecturer JWT");

    const teacherSessions = await teacher.client.rpc("list_campus_class_attendance_sessions", {
      p_classroom_id: classroomId,
    });
    mustSucceed(teacherSessions.error, "Lecturer must list sessions for their classroom");
    assert.ok((teacherSessions.data || []).some(row => row.session_id === sessionId));

    const adminSessions = await adminA.client.rpc("list_campus_class_attendance_sessions", {
      p_classroom_id: classroomId,
    });
    mustSucceed(adminSessions.error, "Same-university admin must list attendance sessions");

    expectDenied(await adminB.client.rpc("list_campus_class_attendance_sessions", {
      p_classroom_id: classroomId,
    }), "Cross-university admin attendance register access");
    expectDenied(await student.client.rpc("list_campus_class_attendance_sessions", {
      p_classroom_id: classroomId,
    }), "Student access to the full classroom register");
    expectDenied(await student.client.rpc("create_campus_class_attendance_session", {
      p_classroom_id: classroomId,
      p_title: "Unauthorized student session",
      p_session_date: new Date().toISOString().slice(0, 10),
      p_window_minutes: 120,
      p_late_after_minutes: 15,
    }), "Student creating an attendance session");

    const teacherRoster = await teacher.client.rpc("list_campus_class_attendance_roster", {
      p_session_id: sessionId,
    });
    mustSucceed(teacherRoster.error, "Lecturer must see enrolled class roster");
    assert.equal(teacherRoster.data?.length, 1, "Roster must contain only the enrolled synthetic student");
    assert.equal(teacherRoster.data[0].student_id, student.id);
    mustSucceed((await adminA.client.rpc("list_campus_class_attendance_roster", {
      p_session_id: sessionId,
    })).error, "Same-university admin must supervise the classroom roster");
    expectDenied(await adminB.client.rpc("list_campus_class_attendance_roster", {
      p_session_id: sessionId,
    }), "Cross-university admin roster access");
    expectDenied(await student.client.rpc("list_campus_class_attendance_roster", {
      p_session_id: sessionId,
    }), "Student roster access");

    const firstTokenResult = await teacher.client.rpc("issue_campus_class_attendance_qr_token", {
      p_session_id: sessionId,
    });
    mustSucceed(firstTokenResult.error, "Lecturer must issue a QR token");
    const firstToken = firstRow(firstTokenResult.data);
    assert.ok(firstToken?.qr_token && firstToken?.expires_at);

    const secondTokenResult = await teacher.client.rpc("issue_campus_class_attendance_qr_token", {
      p_session_id: sessionId,
    });
    mustSucceed(secondTokenResult.error, "Lecturer must rotate the QR token");
    const secondToken = firstRow(secondTokenResult.data);
    assert.ok(secondToken?.qr_token && secondToken?.expires_at);
    assert.notEqual(secondToken.qr_token, firstToken.qr_token, "QR rotation must replace the previous token");

    expectDenied(await student.client.rpc("issue_campus_class_attendance_qr_token", {
      p_session_id: sessionId,
    }), "Student issuing a QR token");
    expectDenied(await student.client.rpc("check_in_campus_class_attendance", {
      p_session_id: sessionId, p_qr_token: firstToken.qr_token,
    }), "Check-in using a QR token that has been rotated");
    expectDenied(await nonEnrolled.client.rpc("check_in_campus_class_attendance", {
      p_session_id: sessionId, p_qr_token: secondToken.qr_token,
    }), "Verified but non-enrolled student QR check-in");
    expectDenied(await pendingStudent.client.rpc("check_in_campus_class_attendance", {
      p_session_id: sessionId, p_qr_token: secondToken.qr_token,
    }), "Pending student QR check-in");

    const checkInResult = await student.client.rpc("check_in_campus_class_attendance", {
      p_session_id: sessionId, p_qr_token: secondToken.qr_token,
    });
    mustSucceed(checkInResult.error, "Enrolled verified student must check in with the current QR token");
    const checkIn = firstRow(checkInResult.data);
    assert.equal(checkIn?.already_recorded, false, "First QR scan must create the check-in");
    assert.ok(checkIn?.attendance_id);
    assert.ok(["present", "late"].includes(checkIn.status));

    const duplicateResult = await student.client.rpc("check_in_campus_class_attendance", {
      p_session_id: sessionId, p_qr_token: secondToken.qr_token,
    });
    mustSucceed(duplicateResult.error, "Repeated QR scan must return its existing receipt");
    assert.equal(firstRow(duplicateResult.data)?.already_recorded, true, "Repeated scan must not create a duplicate");

    const studentHistory = await student.client.rpc("get_my_campus_class_attendance", {
      p_classroom_id: classroomId,
    });
    mustSucceed(studentHistory.error, "Student must read their own classroom attendance history");
    assert.ok((studentHistory.data || []).some(row => row.session_id === sessionId && row.status === checkIn.status));
    expectDenied(await nonEnrolled.client.rpc("get_my_campus_class_attendance", {
      p_classroom_id: classroomId,
    }), "Non-enrolled student attendance history");

    const studentRows = await student.client.from("campus_class_attendance")
      .select("student_id,session_id,status").eq("session_id", sessionId);
    mustSucceed(studentRows.error, "Student must be able to read the row allowed by RLS");
    assert.equal(studentRows.data?.length, 1, "Student RLS view must expose only their single check-in");
    assert.equal(studentRows.data[0].student_id, student.id, "Student RLS view must never expose another student's row");

    const crossCampusRows = await adminB.client.from("campus_class_attendance")
      .select("student_id,session_id").eq("session_id", sessionId);
    mustSucceed(crossCampusRows.error, "Cross-campus admin attendance table read must be safely filtered");
    assert.equal(crossCampusRows.data?.length, 0, "RLS must hide another university's attendance rows");

    const studentAuditRows = await student.client.from("campus_class_attendance_audit")
      .select("student_id,change_reason").eq("session_id", sessionId);
    mustSucceed(studentAuditRows.error, "Student audit query must be safely filtered");
    assert.equal(studentAuditRows.data?.length, 0, "Students must not read lecturer/admin audit notes");

    const reason = "Lecturer confirmed the supervised register.";
    const correction = await teacher.client.rpc("set_campus_class_attendance_status", {
      p_session_id: sessionId, p_student_id: student.id,
      p_status: "late", p_reason: reason,
    });
    mustSucceed(correction.error, "Lecturer must correct attendance with an audit reason");

    const adminCorrection = await adminA.client.rpc("set_campus_class_attendance_status", {
      p_session_id: sessionId, p_student_id: student.id,
      p_status: "present", p_reason: "Campus administrator verified the supervised register.",
    });
    mustSucceed(adminCorrection.error, "Same-university campus admin must correct attendance with a reason");

    expectDenied(await adminB.client.rpc("set_campus_class_attendance_status", {
      p_session_id: sessionId, p_student_id: student.id,
      p_status: "absent", p_reason: "Unauthorized cross-university attempt.",
    }), "Cross-university administrator manual correction");
    expectDenied(await student.client.rpc("set_campus_class_attendance_status", {
      p_session_id: sessionId, p_student_id: student.id,
      p_status: "absent", p_reason: "Student must not edit the register.",
    }), "Student manual attendance correction");

    const audit = await admin.from("campus_class_attendance_audit")
      .select("student_id,new_status,change_reason,changed_by")
      .eq("session_id", sessionId).order("changed_at", { ascending: true });
    mustSucceed(audit.error, "Verify attendance audit history");
    assert.ok((audit.data || []).some(row =>
      row.student_id === student.id && row.new_status === "late" &&
      row.change_reason === reason && row.changed_by === teacher.id
    ), "Lecturer corrections must preserve actor and reason in audit history");

    const finalStudentHistory = await student.client.rpc("get_my_campus_class_attendance", {
      p_classroom_id: classroomId,
    });
    mustSucceed(finalStudentHistory.error, "Student must continue to read their own updated history");
    assert.ok((finalStudentHistory.data || []).some(row => row.session_id === sessionId));

    const closed = await adminA.client.rpc("close_campus_class_attendance_session", {
      p_session_id: sessionId,
    });
    mustSucceed(closed.error, "Same-university admin must close attendance");
    assert.equal(closed.data, true);
    expectDenied(await teacher.client.rpc("check_in_campus_class_attendance", {
      p_session_id: sessionId, p_qr_token: secondToken.qr_token,
    }), "Check-in after the campus admin has closed the session");
    expectDenied(await teacher.client.rpc("issue_campus_class_attendance_qr_token", {
      p_session_id: sessionId,
    }), "QR token issuance after the session is closed");

    const remaining = await admin.from("campus_class_attendance")
      .select("id,student_id,status").eq("session_id", sessionId);
    mustSucceed(remaining.error, "Verify final synthetic attendance row count");
    assert.equal(remaining.data?.length, 1, "Repeated scans and manual corrections must preserve one attendance row");

    console.log("PASS: synthetic lecturer and same-university administrator can manage attendance.");
    console.log("PASS: cross-university administrator cannot access sessions, roster, attendance or correction RPCs.");
    console.log("PASS: only enrolled, verified students can check in; pending and non-enrolled users are denied.");
    console.log("PASS: QR rotation invalidates the previous token and duplicate scans do not create duplicate rows.");
    console.log("PASS: students can read only their own attendance and cannot read audit notes or change the register.");
    console.log("PASS: lecturer and administrator corrections record the actor and reason in the audit history.");
    console.log("PASS: closed sessions reject further check-ins and QR issuance.");
  } catch (error) {
    runFailure = error;
    throw error;
  } finally {
    try {
      await cleanup();
      console.log("PASS: all synthetic Staging accounts, memberships, classroom and attendance records were removed.");
    } catch (cleanupError) {
      console.error(cleanupError.message || "Staging cleanup failed.");
      if (!runFailure) throw cleanupError;
    }
  }
}

await run();
