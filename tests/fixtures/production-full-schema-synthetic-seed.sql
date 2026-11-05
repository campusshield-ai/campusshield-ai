-- Synthetic identities and campus membership records for the full-schema clone only.
-- This file is executed only against the disposable PostgreSQL database created by
-- production-full-schema-compatibility.yml. Never run it against a Supabase project.

begin;

insert into public.campus_universities
  (id,name,slug,ownership,state,official_website)
values
  ('11111111-1111-4111-8111-111111111111','Synthetic Campus A','synthetic-test-campus-a','Private','Ogun','https://example.invalid/campus-a'),
  ('11111111-1111-4111-8111-222222222222','Synthetic Campus B','synthetic-test-campus-b','Private','Lagos','https://example.invalid/campus-b')
on conflict (id) do nothing;

-- The Production auth.users trigger creates a default pending student profile.
-- The following profile upsert changes only these reserved synthetic IDs.
insert into auth.users
  (id,aud,role,email,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
values
  ('22222222-2222-4222-8222-000000000001','authenticated','authenticated','admin-a@example.invalid',now(),now(),now(),'{}'::jsonb,'{"display_name":"Synthetic Admin A","username":"qa_admin_a"}'::jsonb),
  ('22222222-2222-4222-8222-000000000002','authenticated','authenticated','student-a@example.invalid',now(),now(),now(),'{}'::jsonb,'{"display_name":"Synthetic Student A","username":"qa_student_a"}'::jsonb),
  ('22222222-2222-4222-8222-000000000003','authenticated','authenticated','unapproved-student-a@example.invalid',now(),now(),now(),'{}'::jsonb,'{"display_name":"Synthetic Unapproved Student A","username":"qa_unapproved_a"}'::jsonb),
  ('22222222-2222-4222-8222-000000000004','authenticated','authenticated','teacher-a@example.invalid',now(),now(),now(),'{}'::jsonb,'{"display_name":"Synthetic Teacher A","username":"qa_teacher_a"}'::jsonb),
  ('22222222-2222-4222-8222-000000000005','authenticated','authenticated','student-b@example.invalid',now(),now(),now(),'{}'::jsonb,'{"display_name":"Synthetic Student B","username":"qa_student_b"}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles
  (id,display_name,role,verification_status,requested_role)
values
  ('22222222-2222-4222-8222-000000000001','Synthetic Admin A','admin','verified','student'),
  ('22222222-2222-4222-8222-000000000002','Synthetic Student A','student','verified','student'),
  ('22222222-2222-4222-8222-000000000003','Synthetic Unapproved Student A','student','verified','student'),
  ('22222222-2222-4222-8222-000000000004','Synthetic Teacher A','teacher','verified','teacher'),
  ('22222222-2222-4222-8222-000000000005','Synthetic Student B','student','verified','student')
on conflict (id) do update set
  display_name=excluded.display_name,
  role=excluded.role,
  verification_status=excluded.verification_status,
  requested_role=excluded.requested_role;

insert into public.campus_memberships
  (user_id,university_id,membership_status,verification_status,campus_role)
values
  ('22222222-2222-4222-8222-000000000001','11111111-1111-4111-8111-111111111111','active','verified','admin'),
  ('22222222-2222-4222-8222-000000000002','11111111-1111-4111-8111-111111111111','active','verified','student'),
  ('22222222-2222-4222-8222-000000000003','11111111-1111-4111-8111-111111111111','active','verified','student'),
  ('22222222-2222-4222-8222-000000000004','11111111-1111-4111-8111-111111111111','active','verified','teacher'),
  ('22222222-2222-4222-8222-000000000005','11111111-1111-4111-8111-222222222222','active','verified','student')
on conflict (user_id) do update set
  university_id=excluded.university_id,
  membership_status=excluded.membership_status,
  verification_status=excluded.verification_status,
  campus_role=excluded.campus_role,
  updated_at=now();

insert into public.student_identity_verifications
  (user_id,institution_name,student_number,object_path,status,confirmed_fraud)
values
  ('22222222-2222-4222-8222-000000000002','Synthetic Campus A','TEST-A-001','22222222-2222-4222-8222-000000000002/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf','approved',false),
  ('22222222-2222-4222-8222-000000000005','Synthetic Campus B','TEST-B-001','22222222-2222-4222-8222-000000000005/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.pdf','approved',false)
on conflict (user_id) do update set
  institution_name=excluded.institution_name,
  student_number=excluded.student_number,
  object_path=excluded.object_path,
  status=excluded.status,
  confirmed_fraud=false;

commit;

-- Assert the four access contexts the downstream role tests rely on.
do $seed_assertions$
begin
  if (select count(*) from public.campus_memberships
      where user_id in (
        '22222222-2222-4222-8222-000000000001',
        '22222222-2222-4222-8222-000000000002',
        '22222222-2222-4222-8222-000000000003',
        '22222222-2222-4222-8222-000000000004',
        '22222222-2222-4222-8222-000000000005'
      )) <> 5 then
    raise exception 'Synthetic campus membership seed is incomplete.';
  end if;
end
$seed_assertions$;
