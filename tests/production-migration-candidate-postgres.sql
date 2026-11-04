-- Role/RLS contract tests for the isolated synthetic PostgreSQL fixture only.
-- No connection to Supabase or Production is used by this script.

DO $identity_helpers$
BEGIN
  PERFORM set_config('request.jwt.claim.sub','22222222-2222-4222-8222-000000000001',true);
  IF NOT private.current_user_has_verified_campus_access() THEN
    RAISE EXCEPTION 'Verified campus admin should pass the Production access helper.';
  END IF;

  PERFORM set_config('request.jwt.claim.sub','22222222-2222-4222-8222-000000000004',true);
  IF NOT private.current_user_has_verified_campus_access() THEN
    RAISE EXCEPTION 'Verified teacher should pass the Production access helper.';
  END IF;

  PERFORM set_config('request.jwt.claim.sub','22222222-2222-4222-8222-000000000002',true);
  IF NOT private.current_user_has_verified_campus_access() THEN
    RAISE EXCEPTION 'Student with approved identity should pass the Production access helper.';
  END IF;

  PERFORM set_config('request.jwt.claim.sub','22222222-2222-4222-8222-000000000003',true);
  IF private.current_user_has_verified_campus_access() THEN
    RAISE EXCEPTION 'Student without approved identity must fail the Production access helper.';
  END IF;
END
$identity_helpers$;

-- Create one CampusMap draft per university and one published location on campus B.
INSERT INTO public.campus_map_features
  (university_id,campus_name,campus_slug,feature_type,name,verification_status,is_published,metadata)
VALUES
  ('11111111-1111-4111-8111-111111111111','Main Campus','main-campus','building','Campus A private draft','pending',false,'{}'),
  ('11111111-1111-4111-8111-222222222222','Main Campus','main-campus','building','Campus B private draft','pending',false,'{}');

INSERT INTO public.campus_map_features
  (university_id,campus_name,campus_slug,feature_type,name,latitude,longitude,source_url,
   verification_status,verified_by,verified_at,is_published,metadata)
VALUES
  ('11111111-1111-4111-8111-222222222222','Main Campus','main-campus','building',
   'Campus B published building',6.5,3.2,'https://example.invalid/evidence',
   'verified','22222222-2222-4222-8222-000000000001',now(),true,'{}');

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-000000000001',true);
DO $map_admin_scope$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.campus_map_features
  WHERE name IN ('Campus A private draft','Campus B private draft','Campus B published building');
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'CampusMap admin should see only its own draft plus published map points; got % rows.',v_count;
  END IF;
END
$map_admin_scope$;
COMMIT;

BEGIN;
SET LOCAL ROLE anon;
DO $map_public_scope$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.campus_map_features;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Anonymous map reader should see published locations only; got % rows.',v_count;
  END IF;
END
$map_public_scope$;
COMMIT;

-- Insert CampusPulse records as two approved students on different universities.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-000000000002',true);
INSERT INTO public.campus_collab_listings (title,category,description)
VALUES ('Campus A study partners','study','Looking for classmates to revise together.');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-000000000005',true);
INSERT INTO public.campus_collab_listings (title,category,description)
VALUES ('Campus B study partners','study','Looking for classmates to revise together.');
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-000000000003',true);
DO $unapproved_social_write$
DECLARE v_rejected boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.campus_collab_listings (title,category,description)
    VALUES ('Unapproved student listing','study','This insert must be blocked without approved identity.');
  EXCEPTION WHEN OTHERS THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'CampusPulse accepted a student without approved identity.';
  END IF;
END
$unapproved_social_write$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-000000000002',true);
DO $campus_a_isolation$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.campus_collab_listings;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Campus A student should see one Campus A listing, not cross-campus rows; got %.',v_count;
  END IF;
END
$campus_a_isolation$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-000000000005',true);
DO $campus_b_isolation$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.campus_collab_listings;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Campus B student should see one Campus B listing, not cross-campus rows; got %.',v_count;
  END IF;
END
$campus_b_isolation$;
COMMIT;

-- A direct browser query must not expose the private member-block table.
DO $member_block_privileges$
BEGIN
  IF has_table_privilege('anon','public.campus_member_blocks','SELECT')
     OR has_table_privilege('authenticated','public.campus_member_blocks','SELECT') THEN
    RAISE EXCEPTION 'Campus member-block rows have unintended direct client SELECT access.';
  END IF;
END
$member_block_privileges$;

INSERT INTO public.campus_member_blocks (blocker_id,blocked_id,university_id)
VALUES (
 '22222222-2222-4222-8222-000000000002',
 '22222222-2222-4222-8222-000000000005',
 '11111111-1111-4111-8111-111111111111'
);

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-000000000002',true);
DO $member_block_helper$
BEGIN
  IF NOT private.is_campus_member_blocked(
    '22222222-2222-4222-8222-000000000005',
    '11111111-1111-4111-8111-111111111111'
  ) THEN
    RAISE EXCEPTION 'Private member-block helper did not enforce the synthetic block.';
  END IF;
END
$member_block_helper$;
COMMIT;

-- Seed approved Past Questions and answer keys in two campuses.
INSERT INTO public.past_question_papers
  (id,university_id,department,course_code,course_title,academic_level,semester,exam_year,title,
   source_type,source_url,rights_confirmed,status,submitted_by)
VALUES
 ('44444444-4444-4444-8444-000000000001','11111111-1111-4111-8111-111111111111',
  'Computer Science','CSC101','Introduction to Computing','100','first',2025,
  'Synthetic Campus A paper','official_source','https://example.invalid/a-paper',true,'approved',
  '22222222-2222-4222-8222-000000000001'),
 ('44444444-4444-4444-8444-000000000002','11111111-1111-4111-8111-222222222222',
  'Computer Science','CSC101','Introduction to Computing','100','first',2025,
  'Synthetic Campus B paper','official_source','https://example.invalid/b-paper',true,'approved',
  '22222222-2222-4222-8222-000000000005');

INSERT INTO public.past_question_items
  (id,paper_id,sort_order,question_text,question_type,options,topic,marks)
VALUES
 ('55555555-5555-4555-8555-000000000001','44444444-4444-4444-8444-000000000001',
  1,'Define an algorithm.','written','[]','Algorithms',5),
 ('55555555-5555-4555-8555-000000000002','44444444-4444-4444-8444-000000000002',
  1,'Define a database.','written','[]','Databases',5);

INSERT INTO public.past_question_answer_keys (question_id,answer_text,explanation,grading_rubric,answer_source,reviewed_by)
VALUES
 ('55555555-5555-4555-8555-000000000001','A finite sequence of steps.','','','staff_verified','22222222-2222-4222-8222-000000000004'),
 ('55555555-5555-4555-8555-000000000002','An organised collection of data.','','','staff_verified','22222222-2222-4222-8222-000000000004');

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-000000000002',true);
DO $past_question_campus_a$
DECLARE v_papers integer; v_keys integer;
BEGIN
  SELECT count(*) INTO v_papers FROM public.past_question_papers;
  SELECT count(*) INTO v_keys FROM public.past_question_answer_keys;
  IF v_papers <> 1 THEN
    RAISE EXCEPTION 'Campus A student should see only its approved campus paper; got %.',v_papers;
  END IF;
  IF v_keys <> 0 THEN
    RAISE EXCEPTION 'Student could read answer keys; got % visible keys.',v_keys;
  END IF;
END
$past_question_campus_a$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-000000000003',true);
DO $unapproved_past_questions$
DECLARE v_papers integer;
BEGIN
  SELECT count(*) INTO v_papers FROM public.past_question_papers;
  IF v_papers <> 0 THEN
    RAISE EXCEPTION 'Student without approved identity can see % Past Questions papers.',v_papers;
  END IF;
END
$unapproved_past_questions$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-000000000004',true);
DO $teacher_answer_keys$
DECLARE v_papers integer; v_keys integer;
BEGIN
  SELECT count(*) INTO v_papers FROM public.past_question_papers;
  SELECT count(*) INTO v_keys FROM public.past_question_answer_keys;
  IF v_papers <> 1 THEN
    RAISE EXCEPTION 'Campus A teacher should see one campus paper; got %.',v_papers;
  END IF;
  IF v_keys <> 1 THEN
    RAISE EXCEPTION 'Verified Campus A teacher should see one campus answer key; got %.',v_keys;
  END IF;
END
$teacher_answer_keys$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-000000000005',true);
DO $past_question_campus_b$
DECLARE v_papers integer; v_keys integer;
BEGIN
  SELECT count(*) INTO v_papers FROM public.past_question_papers;
  SELECT count(*) INTO v_keys FROM public.past_question_answer_keys;
  IF v_papers <> 1 THEN
    RAISE EXCEPTION 'Campus B student should see only its own campus paper; got %.',v_papers;
  END IF;
  IF v_keys <> 0 THEN
    RAISE EXCEPTION 'Campus B student could read a reviewer-only answer key; got % visible.',v_keys;
  END IF;
END
$past_question_campus_b$;
COMMIT;

SELECT 'synthetic PostgreSQL contract and role-isolation tests passed' AS result;
