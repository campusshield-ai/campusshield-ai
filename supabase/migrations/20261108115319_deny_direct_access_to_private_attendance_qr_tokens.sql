-- Explicit deny policy: private QR credentials are accessed only inside guarded server-side RPCs.
CREATE POLICY campus_class_attendance_qr_tokens_deny_direct_access
ON private.campus_class_attendance_qr_tokens
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);
