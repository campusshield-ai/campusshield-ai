ALTER TABLE public.campus_class_attendance_audit
  ADD COLUMN IF NOT EXISTS change_reason text;

CREATE OR REPLACE FUNCTION public.audit_campus_class_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.campus_class_attendance_audit(
    attendance_id, session_id, student_id, old_status, new_status, changed_by, change_reason
  )
  VALUES (
    NEW.id, NEW.session_id, NEW.student_id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
    NEW.status, NEW.marked_by,
    NULLIF(BTRIM(current_setting('app.attendance_change_reason', true)), '')
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_campus_class_attendance_status(
  p_session_id uuid, p_student_id uuid, p_status text, p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_classroom_id uuid;
  v_attendance_id uuid;
  v_reason text := BTRIM(COALESCE(p_reason, ''));
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Sign in is required.' USING errcode = '28000';
  END IF;
  IF p_status NOT IN ('present', 'absent', 'late') THEN
    RAISE EXCEPTION 'Choose present, absent or late.' USING errcode = '22023';
  END IF;
  IF char_length(v_reason) NOT BETWEEN 5 AND 250 THEN
    RAISE EXCEPTION 'Enter a reason between 5 and 250 characters for the attendance change.' USING errcode = '22023';
  END IF;
  SELECT s.classroom_id INTO v_classroom_id
  FROM public.campus_class_sessions s
  WHERE s.id = p_session_id
  FOR UPDATE;
  IF v_classroom_id IS NULL THEN
    RAISE EXCEPTION 'Attendance session not found.' USING errcode = 'P0002';
  END IF;
  IF NOT private.can_manage_class_attendance(v_classroom_id) THEN
    RAISE EXCEPTION 'Only the verified class teacher or a verified campus administrator for this university can edit attendance.' USING errcode = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.campus_classroom_enrollments e
    WHERE e.classroom_id = v_classroom_id AND e.student_id = p_student_id
  ) THEN
    RAISE EXCEPTION 'Attendance can only be recorded for students enrolled in this classroom.' USING errcode = '22023';
  END IF;
  PERFORM set_config('app.attendance_change_reason', v_reason, true);
  INSERT INTO public.campus_class_attendance(
    session_id, student_id, status, attendance_method, marked_by, marked_at, updated_at
  )
  VALUES (p_session_id, p_student_id, p_status, 'manual', (SELECT auth.uid()), now(), now())
  ON CONFLICT (session_id, student_id)
  DO UPDATE SET
    status = EXCLUDED.status, attendance_method = 'manual',
    marked_by = EXCLUDED.marked_by, marked_at = now(), updated_at = now()
  RETURNING id INTO v_attendance_id;
  RETURN v_attendance_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_campus_class_attendance_status(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_campus_class_attendance_status(uuid, uuid, text, text) TO authenticated;
