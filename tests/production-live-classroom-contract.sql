-- Synthetic Production-schema role contract for Live Classroom. Disposable clone only.
-- This script must never be run directly against a Supabase project.

-- Admin A creates and starts a live class using the Production SECURITY INVOKER wrapper.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-000000000001',true);
DO $live_admin_create$
DECLARE
  v_classroom_id uuid;
  v_session_id uuid;
BEGIN
  SELECT c.id INTO v_classroom_id
  FROM public.create_campus_classroom('Synthetic Live Classroom A','Production QA','Disposable full-schema contract test') AS c;

  IF v_classroom_id IS NULL THEN
    RAISE EXCEPTION 'Verified same-campus admin could not create an owned classroom.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.campus_classrooms WHERE id=v_classroom_id AND teacher_id='22222222-2222-4222-8222-000000000001' AND university_id='11111111-1111-4111-8111-111111111111') THEN
    RAISE EXCEPTION 'Admin-created classroom ownership or campus scope is incorrect.';
  END IF;
  IF NOT public.get_campus_live_classroom_capabilities(v_classroom_id) THEN
    RAISE EXCEPTION 'Verified same-campus admin cannot manage the classroom they created.';
  END IF;

  v_session_id := public.create_campus_live_class_session(
    v_classroom_id,'Synthetic Live Session','Production-schema role test',now()+interval '5 minutes',60,null
  );
  PERFORM public.start_campus_live_class_session(v_session_id);
  PERFORM set_config('qa.live_classroom_id',v_classroom_id::text,false);
  PERFORM set_config('qa.live_session_id',v_session_id::text,false);
END
$live_admin_create$;
COMMIT;

-- Enroll only the approved Campus A student in the class created above.
INSERT INTO public.campus_classroom_enrollments(classroom_id,student_id)
VALUES (current_setting('qa.live_classroom_id')::uuid,'22222222-2222-4222-8222-000000000002')
ON CONFLICT (classroom_id,student_id) DO NOTHING;

-- Enrolled student can list and join; the student cannot manage or create classes.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-000000000002',true);
DO $live_student_access$
DECLARE
  v_role text;
  v_visible integer;
BEGIN
  SELECT count(*) INTO v_visible
  FROM public.list_campus_live_class_sessions(current_setting('qa.live_classroom_id')::uuid);
  IF v_visible <> 1 THEN
    RAISE EXCEPTION 'Enrolled same-campus student should see the scheduled live session; got %.',v_visible;
  END IF;
  IF public.get_campus_live_classroom_capabilities(current_setting('qa.live_classroom_id')::uuid) THEN
    RAISE EXCEPTION 'Student was incorrectly granted live-class management capabilities.';
  END IF;
  SELECT participant_role INTO v_role
  FROM public.get_campus_live_class_token_context(current_setting('qa.live_session_id')::uuid);
  IF v_role IS DISTINCT FROM 'student' THEN
    RAISE EXCEPTION 'Student token context must be student, got %.',v_role;
  END IF;

  BEGIN
    PERFORM * FROM public.create_campus_classroom('Student must not create','Production QA','Denied test');
    RAISE EXCEPTION 'A student was allowed to create a campus classroom.';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$live_student_access$;
COMMIT;

-- A student from another university and an un-enrolled/unapproved Campus A student cannot inspect the room.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-000000000005',true);
DO $live_cross_campus_denial$
DECLARE v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM * FROM public.list_campus_live_class_sessions(current_setting('qa.live_classroom_id')::uuid);
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Cross-campus student was allowed to inspect a live classroom.';
  END IF;
END
$live_cross_campus_denial$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-000000000003',true);
DO $live_unenrolled_denial$
DECLARE v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM * FROM public.list_campus_live_class_sessions(current_setting('qa.live_classroom_id')::uuid);
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Un-enrolled student was allowed to inspect a live classroom.';
  END IF;
END
$live_unenrolled_denial$;
COMMIT;

-- Teacher creation remains supported after broadening class creation to admins.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-000000000004',true);
DO $live_teacher_creation$
DECLARE v_classroom_id uuid;
BEGIN
  SELECT c.id INTO v_classroom_id
  FROM public.create_campus_classroom('Synthetic Teacher Classroom','Production QA','Teacher regression test') AS c;
  IF v_classroom_id IS NULL OR NOT public.get_campus_live_classroom_capabilities(v_classroom_id) THEN
    RAISE EXCEPTION 'Verified teacher classroom creation or management regressed.';
  END IF;
END
$live_teacher_creation$;
COMMIT;

SELECT 'Live Classroom Production clone role and campus-isolation tests passed.' AS result;
