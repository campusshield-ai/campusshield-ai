-- Private authorization helpers and trigger-only audit function are not browser RPCs.
REVOKE ALL ON FUNCTION private.is_verified_campus_admin_for_classroom(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_verified_campus_admin_for_classroom(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.audit_campus_class_attendance() FROM PUBLIC, anon, authenticated;