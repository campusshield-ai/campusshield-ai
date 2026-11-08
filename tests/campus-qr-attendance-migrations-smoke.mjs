import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const core = read("../supabase/migrations/20261108115155_campus_class_qr_attendance.sql");
const deny = read("../supabase/migrations/20261108115319_deny_direct_access_to_private_attendance_qr_tokens.sql");
const controls = read("../supabase/migrations/20261108120238_campus_class_attendance_session_controls.sql");
const roleControls = read("../supabase/migrations/20261108130235_campus_attendance_admin_and_teacher_controls.sql");
const manualAdjustments = read("../supabase/migrations/20261108131000_campus_attendance_manual_adjustments_with_reason.sql");
const legacyRpcLock = read("../supabase/migrations/20261108131500_restrict_legacy_attendance_mark_rpc.sql");
const teacherAdminOnly = read("../supabase/migrations/20261108132000_restrict_attendance_controls_to_verified_teachers_and_admins.sql");
const invokerWrapper = read("../supabase/migrations/20261108132500_wrap_manual_attendance_rpc_as_invoker.sql");
const migrations = [core, deny, controls, roleControls, manualAdjustments, legacyRpcLock, teacherAdminOnly, invokerWrapper];
const combined = migrations.join("\n");

assert.match(core, /ADD COLUMN IF NOT EXISTS attendance_window_ends_at/);
assert.match(core, /ADD COLUMN IF NOT EXISTS attendance_closed_at/);
assert.match(core, /ADD COLUMN IF NOT EXISTS late_after_minutes/);
assert.match(core, /ADD COLUMN IF NOT EXISTS attendance_method/);
assert.match(core, /CREATE TABLE IF NOT EXISTS private\.campus_class_attendance_qr_tokens/);
assert.match(core, /token_hash bytea NOT NULL/);
assert.match(core, /extensions\.gen_random_bytes\(32\)/);
assert.match(core, /extensions\.digest\(convert_to\(p_qr_token/);
assert.match(core, /ON CONFLICT \(session_id, student_id\) DO NOTHING/);
assert.match(deny, /DROP POLICY IF EXISTS campus_class_attendance_qr_tokens_deny_direct_access/);
assert.match(deny, /USING \(false\)/);
assert.match(deny, /WITH CHECK \(false\)/);
assert.match(controls, /p_late_after_minutes >= p_window_minutes/);
assert.match(controls, /Only an enrolled, verified student can view their attendance/);
assert.match(roleControls, /is_verified_campus_admin_for_classroom/);
assert.match(roleControls, /campus_class_attendance_select_authorized/);
assert.match(roleControls, /campus_class_attendance_audit_select_teacher/);
assert.match(manualAdjustments, /ADD COLUMN IF NOT EXISTS change_reason/);
assert.match(manualAdjustments, /set_campus_class_attendance_status/);
assert.match(manualAdjustments, /set_config/);
assert.match(manualAdjustments, /GRANT EXECUTE/);
assert.match(legacyRpcLock, /REVOKE ALL ON FUNCTION public\.mark_campus_class_attendance/);
assert.match(teacherAdminOnly, /is_verified_classroom_teacher[\s\S]*is_verified_campus_admin_for_classroom/);
assert.doesNotMatch(teacherAdminOnly, /assistant_student_id/);
assert.match(invokerWrapper, /set_campus_class_attendance_status_impl/);
assert.match(invokerWrapper, /GRANT EXECUTE ON FUNCTION[\s\S]*set_campus_class_attendance_status_impl/);
assert.match(invokerWrapper, /CREATE OR REPLACE FUNCTION[\s\S]*set_campus_class_attendance_status/);

assert.doesNotMatch(combined, /\(undefined\)/i, "Function ACLs must use concrete PostgreSQL signatures.");
for (const sql of migrations) {
  const starts = (sql.match(/AS \$function\$/g) || []).length;
  const ends = (sql.match(/^\$function\$;/gm) || []).length;
  assert.equal(ends, starts, "Every CREATE FUNCTION body must terminate with a semicolon.");
}
assert.ok(!/GRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE)\s+ON\s+TABLE\s+private\.campus_class_attendance_qr_tokens\s+TO\s+(?:PUBLIC|anon|authenticated)/i.test(combined),
  "Private QR token storage must never be exposed to browser roles.");
assert.match(core, /REVOKE ALL ON TABLE private\.campus_class_attendance_qr_tokens FROM PUBLIC, anon, authenticated/);
console.log("Campus QR attendance migration source checks passed.");
