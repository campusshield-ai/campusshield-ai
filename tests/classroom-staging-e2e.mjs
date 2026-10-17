import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config = await readFile(new URL("../supabase-config.js", import.meta.url), "utf8");
const url = config.match(/url:\s*"([^"]+)"/)?.[1];
const apiKey = config.match(/publishableKey:\s*"([^"]+)"/)?.[1];
assert.ok(url?.includes("hywcpnoqqhxvujnimhxl.supabase.co"), "E2E tests must target staging");
assert.ok(!url.includes("fvgtnujjnvdkhzqqcaqe"), "production must never be used by this test");
assert.ok(apiKey?.startsWith("sb_publishable_"), "staging publishable key is required");

const required = [
  "CAMPUSSHIELD_TEST_TEACHER_EMAIL",
  "CAMPUSSHIELD_TEST_TEACHER_PASSWORD",
  "CAMPUSSHIELD_TEST_STUDENT_EMAIL",
  "CAMPUSSHIELD_TEST_STUDENT_PASSWORD",
  "CAMPUSSHIELD_TEST_OUTSIDER_EMAIL",
  "CAMPUSSHIELD_TEST_OUTSIDER_PASSWORD"
];
for (const name of required) assert.ok(process.env[name], "Set " + name + " to a fictional staging account");
for (const name of required.filter(name => name.endsWith("_EMAIL"))) {
  assert.ok(process.env[name].toLowerCase().endsWith("@example.com"), name + " must use a reserved fictional example.com address");
}

async function request(path, token, { method = "GET", body, prefer } = {}) {
  const headers = { apikey: apiKey, "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(url + path, {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  return { response, data, raw };
}
async function signIn(email, password) {
  const result = await request("/auth/v1/token?grant_type=password", null, {
    method: "POST", body: { email, password }
  });
  assert.equal(result.response.status, 200, "Staging sign-in failed for fictional account " + email + ": " + result.raw);
  assert.ok(result.data?.access_token, "No access token returned for " + email);
  return { token: result.data.access_token, user: result.data.user, email };
}
async function rpc(account, name, args, { allowFailure = false } = {}) {
  const result = await request("/rest/v1/rpc/" + name, account?.token, { method: "POST", body: args });
  if (!allowFailure) assert.ok(result.response.ok, name + " failed (" + result.response.status + "): " + result.raw);
  return result;
}
async function rows(account, table, query) {
  const result = await request("/rest/v1/" + table + "?" + query, account.token);
  assert.ok(result.response.ok, "Reading " + table + " failed (" + result.response.status + "): " + result.raw);
  return result.data;
}
async function insert(account, table, body) {
  const result = await request("/rest/v1/" + table, account.token, {
    method: "POST", body, prefer: "return=representation"
  });
  assert.ok(result.response.ok, "Insert into " + table + " failed (" + result.response.status + "): " + result.raw);
  return Array.isArray(result.data) ? result.data[0] : result.data;
}
async function expectDenied(label, action) {
  const result = await action();
  assert.ok(!result.response.ok, label + " should be denied but returned HTTP " + result.response.status);
  console.log("PASS denied: " + label + " (HTTP " + result.response.status + ")");
}

const teacher = await signIn(process.env.CAMPUSSHIELD_TEST_TEACHER_EMAIL, process.env.CAMPUSSHIELD_TEST_TEACHER_PASSWORD);
const student = await signIn(process.env.CAMPUSSHIELD_TEST_STUDENT_EMAIL, process.env.CAMPUSSHIELD_TEST_STUDENT_PASSWORD);
const outsider = await signIn(process.env.CAMPUSSHIELD_TEST_OUTSIDER_EMAIL, process.env.CAMPUSSHIELD_TEST_OUTSIDER_PASSWORD);

const [teacherProfiles, studentProfiles, outsiderProfiles] = await Promise.all([
  rows(teacher, "profiles", "id=eq." + teacher.user.id + "&select=id,role,verification_status"),
  rows(student, "profiles", "id=eq." + student.user.id + "&select=id,role,verification_status"),
  rows(outsider, "profiles", "id=eq." + outsider.user.id + "&select=id,role,verification_status")
]);
assert.equal(teacherProfiles[0]?.role, "teacher", "teacher fixture must have teacher role");
assert.equal(teacherProfiles[0]?.verification_status, "verified", "teacher fixture must be verified");
assert.equal(studentProfiles[0]?.role, "student", "student fixture must have student role");
assert.equal(studentProfiles[0]?.verification_status, "verified", "student fixture must be verified");
assert.equal(outsiderProfiles[0]?.role, "student", "outsider fixture must be a student");
assert.equal(outsiderProfiles[0]?.verification_status, "verified", "outsider fixture must be verified");

const [teacherMemberships, studentMemberships, outsiderMemberships] = await Promise.all([
  rows(teacher, "campus_memberships", "user_id=eq." + teacher.user.id + "&select=university_id,campus_role,membership_status,verification_status"),
  rows(student, "campus_memberships", "user_id=eq." + student.user.id + "&select=university_id,campus_role,membership_status,verification_status"),
  rows(outsider, "campus_memberships", "user_id=eq." + outsider.user.id + "&select=university_id,campus_role,membership_status,verification_status")
]);
const tm = teacherMemberships.find(x => x.campus_role === "teacher" && x.membership_status === "active" && x.verification_status === "verified");
const sm = studentMemberships.find(x => x.campus_role === "student" && x.membership_status === "active" && x.verification_status === "verified");
const om = outsiderMemberships.find(x => x.campus_role === "student" && x.membership_status === "active" && x.verification_status === "verified");
assert.ok(tm, "teacher fixture needs an active verified teacher campus membership");
assert.ok(sm, "student fixture needs an active verified student campus membership");
assert.ok(om, "outsider fixture needs an active verified student campus membership");
assert.equal(tm.university_id, sm.university_id, "teacher and student must be in the same staging campus");
assert.notEqual(tm.university_id, om.university_id, "outsider must belong to a different staging campus");

const runId = String(Date.now());
const className = "CSAI E2E " + runId;
const created = await rpc(teacher, "create_campus_classroom", {
  p_name: className, p_subject: "E2E Test", p_description: "Fictional staging-only workflow test"
});
const classroom = created.data;
const classroomId = classroom?.id || classroom?.create_campus_classroom?.id;
assert.ok(classroomId, "Classroom creation did not return an ID: " + JSON.stringify(classroom));
console.log("CREATED staging test classroom " + classroomId + "; label " + className);

const codeResult = await rpc(teacher, "get_campus_classroom_join_code", { p_classroom_id: classroomId });
const joinCode = typeof codeResult.data === "string" ? codeResult.data : codeResult.data?.get_campus_classroom_join_code;
assert.ok(joinCode, "teacher must be able to retrieve their own join code");

await expectDenied("cross-campus student joining with a valid join code", () =>
  rpc(outsider, "join_campus_classroom", { p_join_code: joinCode }, { allowFailure: true })
);
const outsiderVisible = await rows(outsider, "campus_classrooms", "id=eq." + classroomId + "&select=id,name");
assert.equal(outsiderVisible.length, 0, "cross-campus student must not see the classroom");

const joined = await rpc(student, "join_campus_classroom", { p_join_code: joinCode });
assert.equal(joined.data, classroomId, "student should join the teacher's classroom");
await expectDenied("enrolled student creating an attendance session before appointment", () =>
  rpc(student, "create_campus_class_session", {
    p_classroom_id: classroomId, p_title: "Pre-appointment denial", p_session_date: new Date().toISOString().slice(0, 10)
  }, { allowFailure: true })
);

const announcement = await insert(teacher, "campus_classroom_announcements", {
  classroom_id: classroomId, author_id: teacher.user.id,
  title: "Fictional E2E announcement", body: "This announcement is only for the staging test."
});
assert.ok(announcement?.id, "teacher announcement should be created");
const material = await insert(teacher, "campus_classroom_materials", {
  classroom_id: classroomId, uploaded_by: teacher.user.id,
  title: "Fictional E2E material", description: "Test resource only.",
  resource_url: "https://example.com/campusshield-staging-test"
});
assert.ok(material?.id, "teacher material should be created");
const [studentAnnouncements, studentMaterials] = await Promise.all([
  rows(student, "campus_classroom_announcements", "classroom_id=eq." + classroomId + "&select=id,title,body"),
  rows(student, "campus_classroom_materials", "classroom_id=eq." + classroomId + "&select=id,title,resource_url")
]);
assert.ok(studentAnnouncements.some(x => x.id === announcement.id), "enrolled student should see the announcement");
assert.ok(studentMaterials.some(x => x.id === material.id), "enrolled student should see the material");

await rpc(teacher, "set_campus_class_assistant", {
  p_classroom_id: classroomId, p_student_id: student.user.id
});
await expectDenied("appointed assistant publishing a teacher-only announcement", async () =>
  request("/rest/v1/campus_classroom_announcements", student.token, {
    method: "POST",
    body: { classroom_id: classroomId, author_id: student.user.id, title: "Should be rejected", body: "Assistant cannot publish this." },
    prefer: "return=representation"
  })
);
const sessionResult = await rpc(student, "create_campus_class_session", {
  p_classroom_id: classroomId, p_title: "Fictional E2E attendance", p_session_date: new Date().toISOString().slice(0, 10)
});
const sessionId = typeof sessionResult.data === "string" ? sessionResult.data : sessionResult.data?.create_campus_class_session;
assert.ok(sessionId, "assistant session creation did not return an ID: " + JSON.stringify(sessionResult.data));
const attendance = await rpc(student, "mark_campus_class_attendance", {
  p_session_id: sessionId, p_student_id: student.user.id, p_status: "present"
});
assert.ok(attendance.response.ok, "appointed assistant should be allowed to mark attendance");

await rpc(teacher, "set_campus_class_assistant", { p_classroom_id: classroomId, p_student_id: null });
await expectDenied("former assistant recording attendance after removal", () =>
  rpc(student, "create_campus_class_session", {
    p_classroom_id: classroomId, p_title: "Post-revocation denial", p_session_date: new Date().toISOString().slice(0, 10)
  }, { allowFailure: true })
);

console.log("PASS verified teacher creates a class and retrieves its private join code");
console.log("PASS same-campus verified student joins using the code");
console.log("PASS teacher announcement and material are visible to the enrolled student");
console.log("PASS unappointed student cannot create attendance sessions");
console.log("PASS assistant appointment grants attendance-only capability");
console.log("PASS assistant cannot publish teacher-only announcements");
console.log("PASS assistant can create an attendance session and mark attendance");
console.log("PASS removing assistant revokes attendance-session access");
console.log("PASS cross-campus join and classroom visibility are denied");
console.log("CLEANUP_REQUIRED classroom_id=" + classroomId + " name=" + className);
console.log("No production project was contacted. Test records were created in staging and require cleanup after reviewing results.");
