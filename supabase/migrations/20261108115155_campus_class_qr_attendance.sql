-- CampusShield QR attendance: additive, private-token implementation.
-- Uses existing campus_class_sessions and campus_class_attendance tables.
ALTER TABLE public.campus_class_sessions
  ADD COLUMN IF NOT EXISTS attendance_window_ends_at timestamptz NOT NULL DEFAULT (now() + interval '2 hours'),
  ADD COLUMN IF NOT EXISTS attendance_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS late_after_minutes smallint NOT NULL DEFAULT 15;

ALTER TABLE public.campus_class_attendance
  ADD COLUMN IF NOT EXISTS attendance_method text NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.campus_class_sessions'::regclass AND conname='campus_class_sessions_late_after_minutes_check') THEN
    ALTER TABLE public.campus_class_sessions ADD CONSTRAINT campus_class_sessions_late_after_minutes_check CHECK (late_after_minutes BETWEEN 1 AND 60);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.campus_class_sessions'::regclass AND conname='campus_class_sessions_attendance_window_check') THEN
    ALTER TABLE public.campus_class_sessions ADD CONSTRAINT campus_class_sessions_attendance_window_check CHECK (attendance_window_ends_at > created_at);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.campus_class_attendance'::regclass AND conname='campus_class_attendance_method_check') THEN
    ALTER TABLE public.campus_class_attendance ADD CONSTRAINT campus_class_attendance_method_check CHECK (attendance_method IN ('manual','qr'));
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS private.campus_class_attendance_qr_tokens (
  session_id uuid PRIMARY KEY REFERENCES public.campus_class_sessions(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL,
  expires_at timestamptz NOT NULL,
  issued_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.campus_class_attendance_qr_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.campus_class_attendance_qr_tokens FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.check_in_campus_class_attendance_impl(p_session_id uuid, p_qr_token text)
 RETURNS TABLE(attendance_id uuid, status text, marked_at timestamp with time zone, already_recorded boolean, session_title text, classroom_title text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := (select auth.uid());
  v_classroom_id uuid;
  v_university_id uuid;
  v_session_created_at timestamptz;
  v_window_ends_at timestamptz;
  v_closed_at timestamptz;
  v_late_after_minutes smallint;
  v_session_title text;
  v_classroom_title text;
  v_token_hash bytea;
  v_token_expires_at timestamptz;
  v_recorded_status text;
  v_attendance_id uuid;
  v_marked_at timestamptz;
  v_already_recorded boolean := false;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sign in before checking in.' USING errcode = '28000';
  END IF;

  IF p_session_id IS NULL
     OR coalesce(p_qr_token, '') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'This QR code is not valid.' USING errcode = '22023';
  END IF;

  SELECT
    s.classroom_id,
    c.university_id,
    s.created_at,
    s.attendance_window_ends_at,
    s.attendance_closed_at,
    s.late_after_minutes,
    s.title,
    c.name
  INTO
    v_classroom_id,
    v_university_id,
    v_session_created_at,
    v_window_ends_at,
    v_closed_at,
    v_late_after_minutes,
    v_session_title,
    v_classroom_title
  FROM public.campus_class_sessions s
  JOIN public.campus_classrooms c ON c.id = s.classroom_id
  WHERE s.id = p_session_id
  FOR SHARE OF s;

  IF v_classroom_id IS NULL THEN
    RAISE EXCEPTION 'Attendance session not found.' USING errcode = 'P0002';
  END IF;

  IF NOT private.can_access_classroom(v_classroom_id) THEN
    RAISE EXCEPTION 'This classroom is not available to your account.' USING errcode = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.campus_memberships m
      ON m.user_id = p.id
     AND m.university_id = v_university_id
    JOIN public.campus_classroom_enrollments e
      ON e.classroom_id = v_classroom_id
     AND e.student_id = p.id
    WHERE p.id = v_user
      AND p.role = 'student'
      AND p.verification_status = 'verified'
      AND m.campus_role = 'student'
      AND m.membership_status = 'active'
      AND m.verification_status = 'verified'
  ) THEN
    RAISE EXCEPTION 'Only a verified, enrolled student from this university can check in.' USING errcode = '42501';
  END IF;

  IF v_closed_at IS NOT NULL OR v_window_ends_at <= now() THEN
    RAISE EXCEPTION 'Attendance for this class is closed.' USING errcode = '22023';
  END IF;

  SELECT t.token_hash, t.expires_at
    INTO v_token_hash, v_token_expires_at
  FROM private.campus_class_attendance_qr_tokens t
  WHERE t.session_id = p_session_id
  FOR SHARE;

  IF v_token_hash IS NULL OR v_token_expires_at <= now() THEN
    RAISE EXCEPTION 'This QR code has expired. Scan the lecturer''s current code.' USING errcode = '22023';
  END IF;

  IF extensions.digest(convert_to(p_qr_token, 'UTF8'), 'sha256') <> v_token_hash THEN
    RAISE EXCEPTION 'This QR code is no longer valid. Scan the latest code displayed by your lecturer.' USING errcode = '22023';
  END IF;

  v_recorded_status := CASE
    WHEN now() > v_session_created_at + make_interval(mins => v_late_after_minutes)
      THEN 'late'
    ELSE 'present'
  END;

  INSERT INTO public.campus_class_attendance AS inserted
    (session_id, student_id, status, marked_by, marked_at, updated_at, attendance_method)
  VALUES
    (p_session_id, v_user, v_recorded_status, v_user, now(), now(), 'qr')
  ON CONFLICT (session_id, student_id) DO NOTHING
  RETURNING inserted.id, inserted.status, inserted.marked_at
    INTO v_attendance_id, v_recorded_status, v_marked_at;

  IF v_attendance_id IS NULL THEN
    SELECT a.id, a.status, a.marked_at
      INTO v_attendance_id, v_recorded_status, v_marked_at
    FROM public.campus_class_attendance a
    WHERE a.session_id = p_session_id
      AND a.student_id = v_user;

    v_already_recorded := true;
  END IF;

  attendance_id := v_attendance_id;
  status := v_recorded_status;
  marked_at := v_marked_at;
  already_recorded := v_already_recorded;
  session_title := v_session_title;
  classroom_title := v_classroom_title;
  RETURN NEXT;
END;
$function$;
CREATE OR REPLACE FUNCTION public.check_in_campus_class_attendance(p_session_id uuid, p_qr_token text)
 RETURNS TABLE(attendance_id uuid, status text, marked_at timestamp with time zone, already_recorded boolean, session_title text, classroom_title text)
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  SELECT * FROM private.check_in_campus_class_attendance_impl(p_session_id, p_qr_token);
$function$;
CREATE OR REPLACE FUNCTION private.close_campus_class_attendance_session_impl(p_session_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_classroom_id uuid;
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Sign in is required.' USING errcode = '28000';
  END IF;

  SELECT s.classroom_id
    INTO v_classroom_id
  FROM public.campus_class_sessions s
  WHERE s.id = p_session_id
  FOR UPDATE;

  IF v_classroom_id IS NULL THEN
    RAISE EXCEPTION 'Attendance session not found.' USING errcode = 'P0002';
  END IF;

  IF NOT private.can_manage_class_attendance(v_classroom_id) THEN
    RAISE EXCEPTION 'Only the verified teacher or appointed class assistant can close attendance.' USING errcode = '42501';
  END IF;

  UPDATE public.campus_class_sessions
  SET attendance_closed_at = COALESCE(attendance_closed_at, now())
  WHERE id = p_session_id;

  DELETE FROM private.campus_class_attendance_qr_tokens
  WHERE session_id = p_session_id;

  RETURN true;
END;
$function$;
CREATE OR REPLACE FUNCTION public.close_campus_class_attendance_session(p_session_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  SELECT private.close_campus_class_attendance_session_impl(p_session_id);
$function$;
CREATE OR REPLACE FUNCTION private.get_campus_class_attendance_capabilities_impl(p_classroom_id uuid)
 RETURNS TABLE(can_manage boolean, can_access boolean, classroom_title text, classroom_subject text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'A signed-in campus account is required.' USING errcode = '28000';
  END IF;

  SELECT c.name, c.subject
    INTO classroom_title, classroom_subject
  FROM public.campus_classrooms c
  WHERE c.id = p_classroom_id;

  IF classroom_title IS NULL OR NOT private.can_access_classroom(p_classroom_id) THEN
    RAISE EXCEPTION 'This classroom is not available to your account.' USING errcode = '42501';
  END IF;

  can_manage := private.can_manage_class_attendance(p_classroom_id);
  can_access := true;
  RETURN NEXT;
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_campus_class_attendance_capabilities(p_classroom_id uuid)
 RETURNS TABLE(can_manage boolean, can_access boolean, classroom_title text, classroom_subject text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT * FROM private.get_campus_class_attendance_capabilities_impl(p_classroom_id);
$function$;
CREATE OR REPLACE FUNCTION private.issue_campus_class_attendance_qr_token_impl(p_session_id uuid)
 RETURNS TABLE(qr_token text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := (select auth.uid());
  v_classroom_id uuid;
  v_closed_at timestamptz;
  v_window_ends_at timestamptz;
  v_token text;
  v_expires_at timestamptz;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sign in is required.' USING errcode = '28000';
  END IF;

  SELECT s.classroom_id, s.attendance_closed_at, s.attendance_window_ends_at
    INTO v_classroom_id, v_closed_at, v_window_ends_at
  FROM public.campus_class_sessions s
  WHERE s.id = p_session_id
  FOR UPDATE;

  IF v_classroom_id IS NULL THEN
    RAISE EXCEPTION 'Attendance session not found.' USING errcode = 'P0002';
  END IF;

  IF NOT private.can_manage_class_attendance(v_classroom_id) THEN
    RAISE EXCEPTION 'Only the verified teacher or appointed class assistant can issue an attendance QR.' USING errcode = '42501';
  END IF;

  IF v_closed_at IS NOT NULL OR v_window_ends_at <= now() THEN
    RAISE EXCEPTION 'The attendance window is closed.' USING errcode = '22023';
  END IF;

  v_token := lower(encode(extensions.gen_random_bytes(32), 'hex'));
  v_expires_at := LEAST(now() + interval '45 seconds', v_window_ends_at);

  INSERT INTO private.campus_class_attendance_qr_tokens
    (session_id, token_hash, expires_at, issued_by, created_at)
  VALUES
    (p_session_id, extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), v_expires_at, v_user, now())
  ON CONFLICT (session_id) DO UPDATE
    SET token_hash = EXCLUDED.token_hash,
        expires_at = EXCLUDED.expires_at,
        issued_by = EXCLUDED.issued_by,
        created_at = now();

  qr_token := v_token;
  expires_at := v_expires_at;
  RETURN NEXT;
END;
$function$;
CREATE OR REPLACE FUNCTION public.issue_campus_class_attendance_qr_token(p_session_id uuid)
 RETURNS TABLE(qr_token text, expires_at timestamp with time zone)
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  SELECT * FROM private.issue_campus_class_attendance_qr_token_impl(p_session_id);
$function$;
CREATE OR REPLACE FUNCTION private.list_campus_class_attendance_roster_impl(p_session_id uuid)
 RETURNS TABLE(student_id uuid, display_name text, status text, marked_at timestamp with time zone, attendance_method text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_classroom_id uuid;
BEGIN
  SELECT s.classroom_id INTO v_classroom_id
  FROM public.campus_class_sessions s
  WHERE s.id = p_session_id;

  IF v_classroom_id IS NULL OR NOT private.can_manage_class_attendance(v_classroom_id) THEN
    RAISE EXCEPTION 'Only the verified teacher or appointed class assistant can view this attendance list.' USING errcode = '42501';
  END IF;

  RETURN QUERY
    SELECT
      e.student_id,
      coalesce(nullif(btrim(p.display_name), ''), 'Student'),
      a.status,
      a.marked_at,
      a.attendance_method
    FROM public.campus_classroom_enrollments e
    JOIN public.profiles p ON p.id = e.student_id
    LEFT JOIN public.campus_class_attendance a
      ON a.session_id = p_session_id
     AND a.student_id = e.student_id
    WHERE e.classroom_id = v_classroom_id
    ORDER BY coalesce(nullif(btrim(p.display_name), ''), 'Student');
END;
$function$;
CREATE OR REPLACE FUNCTION public.list_campus_class_attendance_roster(p_session_id uuid)
 RETURNS TABLE(student_id uuid, display_name text, status text, marked_at timestamp with time zone, attendance_method text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT * FROM private.list_campus_class_attendance_roster_impl(p_session_id);
$function$;
CREATE OR REPLACE FUNCTION private.list_campus_class_attendance_sessions_impl(p_classroom_id uuid)
 RETURNS TABLE(session_id uuid, title text, session_date date, created_at timestamp with time zone, attendance_window_ends_at timestamp with time zone, attendance_closed_at timestamp with time zone, late_after_minutes smallint, checked_in_count bigint, present_count bigint, late_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF (select auth.uid()) IS NULL OR NOT private.can_manage_class_attendance(p_classroom_id) THEN
    RAISE EXCEPTION 'Only the verified teacher or appointed class assistant can view the attendance register.' USING errcode = '42501';
  END IF;

  RETURN QUERY
    SELECT
      s.id,
      s.title,
      s.session_date,
      s.created_at,
      s.attendance_window_ends_at,
      s.attendance_closed_at,
      s.late_after_minutes,
      count(a.id),
      count(a.id) FILTER (WHERE a.status = 'present'),
      count(a.id) FILTER (WHERE a.status = 'late')
    FROM public.campus_class_sessions s
    LEFT JOIN public.campus_class_attendance a ON a.session_id = s.id
    WHERE s.classroom_id = p_classroom_id
    GROUP BY
      s.id, s.title, s.session_date, s.created_at,
      s.attendance_window_ends_at, s.attendance_closed_at, s.late_after_minutes
    ORDER BY s.created_at DESC
    LIMIT 30;
END;
$function$;
CREATE OR REPLACE FUNCTION public.list_campus_class_attendance_sessions(p_classroom_id uuid)
 RETURNS TABLE(session_id uuid, title text, session_date date, created_at timestamp with time zone, attendance_window_ends_at timestamp with time zone, attendance_closed_at timestamp with time zone, late_after_minutes smallint, checked_in_count bigint, present_count bigint, late_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT * FROM private.list_campus_class_attendance_sessions_impl(p_classroom_id);
$function$;
REVOKE ALL ON FUNCTION private.check_in_campus_class_attendance_impl(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.check_in_campus_class_attendance_impl(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.check_in_campus_class_attendance(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_in_campus_class_attendance(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION private.close_campus_class_attendance_session_impl(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.close_campus_class_attendance_session_impl(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.close_campus_class_attendance_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_campus_class_attendance_session(uuid) TO authenticated;
REVOKE ALL ON FUNCTION private.get_campus_class_attendance_capabilities_impl(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_campus_class_attendance_capabilities_impl(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_campus_class_attendance_capabilities(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_campus_class_attendance_capabilities(uuid) TO authenticated;
REVOKE ALL ON FUNCTION private.issue_campus_class_attendance_qr_token_impl(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.issue_campus_class_attendance_qr_token_impl(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.issue_campus_class_attendance_qr_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_campus_class_attendance_qr_token(uuid) TO authenticated;
REVOKE ALL ON FUNCTION private.list_campus_class_attendance_roster_impl(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.list_campus_class_attendance_roster_impl(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.list_campus_class_attendance_roster(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_campus_class_attendance_roster(uuid) TO authenticated;
REVOKE ALL ON FUNCTION private.list_campus_class_attendance_sessions_impl(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.list_campus_class_attendance_sessions_impl(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.list_campus_class_attendance_sessions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_campus_class_attendance_sessions(uuid) TO authenticated;

