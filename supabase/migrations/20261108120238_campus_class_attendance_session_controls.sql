-- Lecturer controls and student-scoped attendance receipt.
CREATE OR REPLACE FUNCTION private.create_campus_class_attendance_session_impl(p_classroom_id uuid, p_title text, p_session_date date, p_window_minutes integer, p_late_after_minutes integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_session_id uuid;
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Sign in is required.' USING errcode = '28000';
  END IF;

  IF NOT private.can_manage_class_attendance(p_classroom_id) THEN
    RAISE EXCEPTION 'Only the verified teacher or appointed class assistant can create attendance sessions.' USING errcode = '42501';
  END IF;

  IF char_length(btrim(coalesce(p_title, ''))) NOT BETWEEN 2 AND 160
     OR coalesce(p_window_minutes, 0) NOT BETWEEN 15 AND 240
     OR coalesce(p_late_after_minutes, 0) NOT BETWEEN 1 AND 60
     OR p_late_after_minutes >= p_window_minutes THEN
    RAISE EXCEPTION 'Enter a valid session title, a 15–240 minute window and a late threshold shorter than the window.' USING errcode = '22023';
  END IF;

  INSERT INTO public.campus_class_sessions (
    classroom_id, session_date, title, recorded_by,
    attendance_window_ends_at, late_after_minutes
  )
  VALUES (
    p_classroom_id, coalesce(p_session_date, current_date), btrim(p_title),
    (select auth.uid()), now() + make_interval(mins => p_window_minutes),
    p_late_after_minutes
  )
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.create_campus_class_attendance_session(p_classroom_id uuid, p_title text, p_session_date date DEFAULT CURRENT_DATE, p_window_minutes integer DEFAULT 120, p_late_after_minutes integer DEFAULT 15)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  SELECT private.create_campus_class_attendance_session_impl(
    p_classroom_id, p_title, p_session_date, p_window_minutes, p_late_after_minutes
  );
$function$;
CREATE OR REPLACE FUNCTION private.get_my_campus_class_attendance_impl(p_classroom_id uuid)
 RETURNS TABLE(session_id uuid, title text, session_date date, created_at timestamp with time zone, attendance_window_ends_at timestamp with time zone, attendance_closed_at timestamp with time zone, status text, marked_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := (select auth.uid());
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sign in is required.' USING errcode = '28000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.campus_classroom_enrollments e
    JOIN public.campus_classrooms c ON c.id = e.classroom_id
    JOIN public.profiles p ON p.id = e.student_id
    JOIN public.campus_memberships m
      ON m.user_id = p.id
     AND m.university_id = c.university_id
    WHERE e.classroom_id = p_classroom_id
      AND e.student_id = v_user
      AND p.role = 'student'
      AND p.verification_status = 'verified'
      AND m.campus_role = 'student'
      AND m.membership_status = 'active'
      AND m.verification_status = 'verified'
  ) THEN
    RAISE EXCEPTION 'Only an enrolled, verified student can view their attendance for this class.' USING errcode = '42501';
  END IF;

  RETURN QUERY
    SELECT s.id, s.title, s.session_date, s.created_at,
           s.attendance_window_ends_at, s.attendance_closed_at,
           a.status, a.marked_at
    FROM public.campus_class_sessions s
    LEFT JOIN public.campus_class_attendance a
      ON a.session_id = s.id
     AND a.student_id = v_user
    WHERE s.classroom_id = p_classroom_id
    ORDER BY s.created_at DESC
    LIMIT 30;
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_my_campus_class_attendance(p_classroom_id uuid)
 RETURNS TABLE(session_id uuid, title text, session_date date, created_at timestamp with time zone, attendance_window_ends_at timestamp with time zone, attendance_closed_at timestamp with time zone, status text, marked_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT * FROM private.get_my_campus_class_attendance_impl(p_classroom_id);
$function$;
REVOKE ALL ON FUNCTION private.create_campus_class_attendance_session_impl(uuid, text, date, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.create_campus_class_attendance_session_impl(uuid, text, date, integer, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.create_campus_class_attendance_session(uuid, text, date, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_campus_class_attendance_session(uuid, text, date, integer, integer) TO authenticated;
REVOKE ALL ON FUNCTION private.get_my_campus_class_attendance_impl(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_my_campus_class_attendance_impl(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_campus_class_attendance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_campus_class_attendance(uuid) TO authenticated;

