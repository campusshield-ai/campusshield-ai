
-- Allow verified campus administrators to supervise attendance within their own university.
-- Teachers retain control of their own classrooms; students retain their enrolled-class access.

CREATE OR REPLACE FUNCTION private.can_access_classroom(p_classroom_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    private.is_verified_classroom_teacher(p_classroom_id)
    OR private.is_verified_campus_admin_for_classroom(p_classroom_id)
    OR EXISTS (
      SELECT 1
      FROM public.campus_classrooms c
      JOIN public.profiles p ON p.id = (SELECT auth.uid())
      JOIN public.campus_memberships m
        ON m.user_id = p.id
       AND m.university_id = c.university_id
      WHERE c.id = p_classroom_id
        AND p.role = 'student'
        AND p.verification_status = 'verified'
        AND m.campus_role = 'student'
        AND m.membership_status = 'active'
        AND m.verification_status = 'verified'
        AND (
          c.assistant_student_id = p.id
          OR EXISTS (
            SELECT 1
            FROM public.campus_classroom_enrollments e
            WHERE e.classroom_id = c.id
              AND e.student_id = p.id
          )
        )
    );
$function$;

CREATE OR REPLACE FUNCTION private.can_manage_class_attendance(p_classroom_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    private.is_verified_classroom_teacher(p_classroom_id)
    OR private.is_verified_campus_admin_for_classroom(p_classroom_id)
    OR EXISTS (
      SELECT 1
      FROM public.campus_classrooms c
      JOIN public.profiles p ON p.id = (SELECT auth.uid())
      JOIN public.campus_memberships m
        ON m.user_id = p.id
       AND m.university_id = c.university_id
      JOIN public.campus_classroom_enrollments e
        ON e.classroom_id = c.id
       AND e.student_id = p.id
      WHERE c.id = p_classroom_id
        AND p.role = 'student'
        AND p.verification_status = 'verified'
        AND m.campus_role = 'student'
        AND m.membership_status = 'active'
        AND m.verification_status = 'verified'
        AND c.assistant_student_id = p.id
    );
$function$;

DROP POLICY IF EXISTS campus_class_attendance_select_authorized
  ON public.campus_class_attendance;
CREATE POLICY campus_class_attendance_select_authorized
  ON public.campus_class_attendance
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.campus_class_sessions s
      WHERE s.id = campus_class_attendance.session_id
        AND (
          private.is_verified_classroom_teacher(s.classroom_id)
          OR private.is_verified_campus_admin_for_classroom(s.classroom_id)
          OR (
            campus_class_attendance.student_id = (SELECT auth.uid())
            AND private.can_access_classroom(s.classroom_id)
          )
        )
    )
  );

DROP POLICY IF EXISTS campus_class_attendance_audit_select_teacher
  ON public.campus_class_attendance_audit;
CREATE POLICY campus_class_attendance_audit_select_teacher
  ON public.campus_class_attendance_audit
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.campus_class_sessions s
      WHERE s.id = campus_class_attendance_audit.session_id
        AND (
          private.is_verified_classroom_teacher(s.classroom_id)
          OR private.is_verified_campus_admin_for_classroom(s.classroom_id)
        )
    )
  );
