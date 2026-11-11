-- Run only in the disposable PostgreSQL clone created by
-- production-live-classroom-schema-compatibility.yml. Never run against Supabase.
-- All fixture identities and classes are synthetic.

BEGIN;

-- Add a second-campus teacher so both campuses have a legitimate class owner.
INSERT INTO auth.users
  (id,aud,role,email,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
VALUES
  ('22222222-2222-4222-8222-000000000006','authenticated','authenticated',
   'teacher-b@example.invalid',now(),now(),now(),'{}'::jsonb,
   '{"display_name":"Synthetic Teacher B","username":"qa_teacher_b"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles
  (id,display_name,role,verification_status,requested_role)
VALUES
  ('22222222-2222-4222-8222-000000000006','Synthetic Teacher B','teacher','verified','teacher')
ON CONFLICT (id) DO UPDATE SET
  display_name=excluded.display_name,
  role=excluded.role,
  verification_status=excluded.verification_status,
  requested_role=excluded.requested_role;

INSERT INTO public.campus_memberships
  (user_id,university_id,membership_status,verification_status,campus_role)
VALUES
  ('22222222-2222-4222-8222-000000000006','11111111-1111-4111-8111-222222222222','active','verified','teacher')
ON CONFLICT (user_id) DO UPDATE SET
  university_id=excluded.university_id,
  membership_status=excluded.membership_status,
  verification_status=excluded.verification_status,
  campus_role=excluded.campus_role,
  updated_at=now();

-- One class per university; users enroll only in their own-campus class.
INSERT INTO public.campus_classrooms
  (id,university_id,teacher_id,name,subject,description,join_code)
VALUES
  ('33333333-3333-4333-8333-000000000001','11111111-1111-4111-8111-111111111111',
   '22222222-2222-4222-8222-000000000004','Synthetic Campus A Live Class','CSC101',
   'Disposable schema test class A','QA-LIVE-A-01'),
  ('33333333-3333-4333-8333-000000000002','11111111-1111-4111-8111-222222222222',
   '22222222-2222-4222-8222-000000000006','Synthetic Campus B Live Class','CSC201',
   'Disposable schema test class B','QA-LIVE-B-01')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.campus_classroom_enrollments (classroom_id,student_id)
VALUES
  ('33333333-3333-4333-8333-000000000001','22222222-2222-4222-8222-000000000002'),
  ('33333333-3333-4333-8333-000000000002','22222222-2222-4222-8222-000000000005')
ON CONFLICT DO NOTHING;

INSERT INTO public.campus_live_class_sessions
  (id,classroom_id,title,description,scheduled_at,duration_minutes,status,livekit_room_name,created_by)
VALUES
  ('44444444-4444-4444-8444-000000000001','33333333-3333-4333-8333-000000000001',
   'Synthetic Campus A Lecture','Disposable schema test',now(),60,'scheduled',
   'qa-live-room-campus-a','22222222-2222-4222-8222-000000000004'),
  ('44444444-4444-4444-8444-000000000002','33333333-3333-4333-8333-000000000002',
   'Synthetic Campus B Lecture','Disposable schema test',now(),60,'scheduled',
   'qa-live-room-campus-b','22222222-2222-4222-8222-000000000006')
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Direct table grants are denied; all browser access goes through scoped RPCs.
DO $live_class_acl$
DECLARE
  v_rls boolean;
  v_definer boolean;
BEGIN
  SELECT c.relrowsecurity INTO v_rls
  FROM pg_class c WHERE c.oid='public.campus_live_class_sessions'::regclass;
  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Live Classroom sessions table must have RLS enabled.';
  END IF;

  IF has_table_privilege('anon','public.campus_live_class_sessions','SELECT')
     OR has_table_privilege('authenticated','public.campus_live_class_sessions','SELECT')
     OR has_table_privilege('anon','public.campus_live_class_sessions','INSERT')
     OR has_table_privilege('authenticated','public.campus_live_class_sessions','INSERT')
     OR has_table_privilege('anon','public.campus_live_class_sessions','UPDATE')
     OR has_table_privilege('authenticated','public.campus_live_class_sessions','UPDATE')
     OR has_table_privilege('anon','public.campus_live_class_sessions','DELETE')
     OR has_table_privilege('authenticated','public.campus_live_class_sessions','DELETE') THEN
    RAISE EXCEPTION 'Live Classroom session table has unexpected direct client privileges.';
  END IF;

  IF has_function_privilege('anon','public.list_campus_live_classrooms()','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.list_campus_live_classrooms()','EXECUTE')
     OR has_function_privilege('anon','public.list_campus_live_class_sessions(uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.list_campus_live_class_sessions(uuid)','EXECUTE')
     OR has_function_privilege('anon','public.get_campus_live_class_token_context(uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.get_campus_live_class_token_context(uuid)','EXECUTE')
     OR has_function_privilege('anon','public.create_campus_live_class_session(uuid,text,text,timestamptz,integer,text)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.create_campus_live_class_session(uuid,text,text,timestamptz,integer,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Live Classroom public RPC grants do not match the authenticated-only contract.';
  END IF;

  SELECT p.prosecdef INTO v_definer
  FROM pg_proc p WHERE p.oid='private.can_access_live_classroom(uuid)'::regprocedure;
  IF v_definer IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Dedicated live access helper must be SECURITY DEFINER.';
  END IF;

  IF has_function_privilege('anon','private.can_access_live_classroom(uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','private.can_access_live_classroom(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Dedicated live access helper must be callable only by authenticated users.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid IN (
      'public.list_campus_live_classrooms()'::regprocedure,
      'public.list_campus_live_class_sessions(uuid)'::regprocedure,
      'public.get_campus_live_class_token_context(uuid)'::regprocedure,
      'public.create_campus_live_class_session(uuid,text,text,timestamptz,integer,text)'::regprocedure
    )
    AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'Public Live Classroom wrappers must remain SECURITY INVOKER.';
  END IF;
END
$live_class_acl$;

-- Verified teacher can manage a class at their own campus, create a session
-- through the guarded RPC, start a session and receive a teacher token context.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-000000000004',true);
DO $live_teacher$
DECLARE
  v_can_manage boolean;
  v_count integer;
  v_role text;
  v_new_session uuid;
BEGIN
  SELECT public.get_campus_live_classroom_capabilities(
    '33333333-3333-4333-8333-000000000001'
  ) INTO v_can_manage;
  IF v_can_manage IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Verified Campus A teacher should manage their own live classroom.';
  END IF;

  SELECT count(*) INTO v_count FROM public.list_campus_live_classrooms();
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Campus A teacher should see only their own campus class; got %.',v_count;
  END IF;

  v_new_session := public.create_campus_live_class_session(
    '33333333-3333-4333-8333-000000000001',
    'Teacher-created live class','Disposable schema test',
    now() + interval '30 minutes',60,NULL
  );
  IF v_new_session IS NULL THEN
    RAISE EXCEPTION 'Verified teacher could not create a live session.';
  END IF;

  PERFORM public.start_campus_live_class_session('44444444-4444-4444-8444-000000000001');
  SELECT participant_role INTO v_role
  FROM public.get_campus_live_class_token_context('44444444-4444-4444-8444-000000000001');
  IF v_role <> 'teacher' THEN
    RAISE EXCEPTION 'Teacher token context returned role %, expected teacher.',v_role;
  END IF;
END
$live_teacher$;
COMMIT;

-- A verified campus administrator can see and manage live sessions in their
-- own university without changing general classroom authorization.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-000000000001',true);
DO $live_admin$
DECLARE
  v_count integer;
  v_can_manage boolean;
  v_role text;
BEGIN
  SELECT count(*) INTO v_count FROM public.list_campus_live_classrooms();
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Campus A admin should see only Campus A live classrooms; got %.',v_count;
  END IF;

  SELECT public.get_campus_live_classroom_capabilities(
    '33333333-3333-4333-8333-000000000001'
  ) INTO v_can_manage;
  IF v_can_manage IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Verified Campus A admin should manage live sessions at their campus.';
  END IF;

  SELECT participant_role INTO v_role
  FROM public.get_campus_live_class_token_context('44444444-4444-4444-8444-000000000001');
  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'Campus admin token context returned role %, expected admin.',v_role;
  END IF;

  PERFORM public.end_campus_live_class_session('44444444-4444-4444-8444-000000000001');
  PERFORM public.set_campus_live_class_recording(
    '44444444-4444-4444-8444-000000000001',
    'https://example.invalid/recording-campus-a'
  );
END
$live_admin$;
COMMIT;

-- Verified enrolled student can join a session but cannot manage it.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-000000000002',true);
DO $live_student$
DECLARE
  v_can_manage boolean;
  v_role text;
  v_denied boolean := false;
BEGIN
  SELECT public.get_campus_live_classroom_capabilities(
    '33333333-3333-4333-8333-000000000001'
  ) INTO v_can_manage;
  IF v_can_manage IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Student must not receive live-session management permissions.';
  END IF;

  SELECT participant_role INTO v_role
  FROM public.get_campus_live_class_token_context('44444444-4444-4444-8444-000000000001');
  IF v_role <> 'student' THEN
    RAISE EXCEPTION 'Student token context returned role %, expected student.',v_role;
  END IF;

  BEGIN
    PERFORM public.create_campus_live_class_session(
      '33333333-3333-4333-8333-000000000001',
      'Unauthorized student session','Must be blocked',
      now() + interval '30 minutes',60,NULL
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Student was able to create a live class session.';
  END IF;
END
$live_student$;
COMMIT;

-- Campus B cannot see Campus A sessions, and Campus A admin cannot manage
-- Campus B sessions. An un-enrolled pending student sees neither campus class.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-000000000005',true);
DO $campus_b_student$
DECLARE
  v_count integer;
  v_denied boolean := false;
BEGIN
  SELECT count(*) INTO v_count FROM public.list_campus_live_classrooms();
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Campus B student should see only Campus B class; got %.',v_count;
  END IF;

  BEGIN
    PERFORM count(*) FROM public.list_campus_live_class_sessions(
      '33333333-3333-4333-8333-000000000001'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Campus B student accessed Campus A live sessions.';
  END IF;
END
$campus_b_student$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-000000000003',true);
DO $unapproved_student$
DECLARE
  v_count integer;
  v_denied boolean := false;
BEGIN
  SELECT count(*) INTO v_count FROM public.list_campus_live_classrooms();
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'An un-enrolled Campus A student should not see another class; got %.',v_count;
  END IF;

  BEGIN
    PERFORM count(*) FROM public.list_campus_live_class_sessions(
      '33333333-3333-4333-8333-000000000001'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'An un-enrolled student accessed Campus A live sessions.';
  END IF;
END
$unapproved_student$;
COMMIT;

SELECT 'Live Classroom Production-schema, role, and campus-isolation checks passed.' AS result;
