-- Disposable PostgreSQL 17 schema-contract fixture.
-- Synthetic rows only. This is deliberately NOT a full Production database clone.
-- It models only the base relations/functions that the forward candidate SQL depends on.
-- Never point this fixture or its test workflow at a Supabase project.

CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE SCHEMA storage;

DO $roles$
BEGIN
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$roles$;
ALTER ROLE service_role BYPASSRLS;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text UNIQUE
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql STABLE
SET search_path = ''
AS $fn$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$fn$;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = ''
AS $fn$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$fn$;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;
GRANT EXECUTE ON FUNCTION auth.jwt() TO PUBLIC;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  role text NOT NULL DEFAULT 'student' CHECK (role IN ('student','teacher','security','admin')),
  requested_role text NOT NULL DEFAULT 'student' CHECK (requested_role IN ('student','teacher')),
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.campus_universities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 180),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ownership text NOT NULL CHECK (ownership IN ('Federal','State','Private')),
  state text NOT NULL,
  source_url text NOT NULL DEFAULT 'https://enuc.nuc.edu.ng/nus',
  is_active boolean NOT NULL DEFAULT true,
  official_website text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.campus_memberships (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  university_id uuid NOT NULL REFERENCES public.campus_universities(id) ON DELETE RESTRICT,
  faculty text,
  department text,
  course text,
  year_of_study text,
  membership_status text NOT NULL DEFAULT 'active' CHECK (membership_status IN ('active','suspended')),
  verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified','pending','verified','rejected')),
  campus_role text NOT NULL DEFAULT 'student' CHECK (campus_role IN ('student','teacher','security','admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  category text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('Low','Medium','High')),
  location text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','In Progress','Resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.student_identity_verifications (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  institution_name text NOT NULL DEFAULT 'Synthetic University',
  student_number text NOT NULL DEFAULT 'TEST-001',
  object_path text NOT NULL DEFAULT 'synthetic/test.pdf',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  confirmed_fraud boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.community_profiles (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_]{3,20}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.campus_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL REFERENCES public.campus_universities(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'academic',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  location text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  organizer_username text
);

-- Production-only relations: the candidates must preserve these untouched.
CREATE TABLE public.campus_institutional_billing_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.campus_opportunity_bookmarks (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.shieldmind_payment_orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid());

CREATE TABLE private.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean NOT NULL DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  name text NOT NULL,
  owner_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION storage.foldername(p_name text)
RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $fn$
  SELECT string_to_array(p_name, '/');
$fn$;

-- These five helpers intentionally mirror the current Production definitions.
-- The test workflow hashes them before/after the candidate phases to detect changes.
CREATE OR REPLACE FUNCTION private.current_campus_university_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
  SELECT cm.university_id
  FROM public.campus_memberships cm
  WHERE cm.user_id = (SELECT auth.uid())
    AND cm.membership_status = 'active'
  LIMIT 1;
$fn$;

CREATE OR REPLACE FUNCTION private.current_campus_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
  SELECT p.role::text
  FROM public.profiles p
  JOIN public.campus_memberships cm ON cm.user_id = p.id
  WHERE p.id = (SELECT auth.uid())
    AND p.verification_status = 'verified'
    AND cm.membership_status = 'active'
    AND cm.verification_status = 'verified'
  LIMIT 1;
$fn$;

CREATE OR REPLACE FUNCTION private.current_user_can_use_restricted_features()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
  SELECT COALESCE((
    SELECT CASE
      WHEN p.verification_status <> 'verified' THEN false
      WHEN p.role IN ('admin','security','teacher') THEN true
      WHEN p.role = 'student' THEN EXISTS (
        SELECT 1 FROM public.student_identity_verifications siv
        WHERE siv.user_id = p.id AND siv.status = 'approved'
      )
      ELSE false
    END
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
  ), false);
$fn$;

CREATE OR REPLACE FUNCTION private.current_user_has_verified_campus_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
  SELECT COALESCE((SELECT private.current_user_can_use_restricted_features()), false)
     AND EXISTS (
       SELECT 1 FROM public.campus_memberships cm
       WHERE cm.user_id = (SELECT auth.uid())
         AND cm.membership_status = 'active'
         AND cm.verification_status = 'verified'
     );
$fn$;

CREATE OR REPLACE FUNCTION private.is_campusshield_owner_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
  SELECT
    lower(coalesce((SELECT auth.jwt() ->> 'email'), '')) = 'campusshieldaitechnologies@gmail.com'
    AND EXISTS (
      SELECT 1 FROM private.platform_admins pa
      WHERE pa.user_id = (SELECT auth.uid())
    );
$fn$;

GRANT EXECUTE ON FUNCTION private.current_campus_university_id() TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_campus_role() TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_user_can_use_restricted_features() TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_user_has_verified_campus_access() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_campusshield_owner_admin() TO authenticated;

-- Minimal base-table grants and owner-scoped policies to make role tests meaningful.
GRANT SELECT ON public.profiles, public.campus_universities, public.campus_memberships,
  public.student_identity_verifications, public.community_profiles, public.campus_events
TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profile_self_read ON public.profiles
  FOR SELECT TO authenticated USING (id = (SELECT auth.uid()));

ALTER TABLE public.campus_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY membership_self_read ON public.campus_memberships
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

ALTER TABLE public.student_identity_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY identity_self_read ON public.student_identity_verifications
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

ALTER TABLE public.community_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY community_profile_self_read ON public.community_profiles
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

ALTER TABLE public.campus_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_verified_campus_read ON public.campus_events
  FOR SELECT TO authenticated USING (
    status = 'published'
    AND EXISTS (
      SELECT 1 FROM public.campus_memberships cm
      WHERE cm.user_id = (SELECT auth.uid())
        AND cm.university_id = campus_events.university_id
        AND cm.membership_status = 'active'
    )
  );

-- Deterministic synthetic campus, staff and students. No real user records or secrets.
INSERT INTO public.campus_universities (id,name,slug,ownership,state,official_website)
VALUES
 ('11111111-1111-4111-8111-111111111111','Babcock University','babcock-university','Private','Ogun','https://www.babcock.edu.ng'),
 ('11111111-1111-4111-8111-222222222222','Synthetic Second University','synthetic-second-university','Private','Lagos','https://example.invalid');

INSERT INTO auth.users (id,email) VALUES
 ('22222222-2222-4222-8222-000000000001','admin-a@example.invalid'),
 ('22222222-2222-4222-8222-000000000002','student-a@example.invalid'),
 ('22222222-2222-4222-8222-000000000003','unapproved-student-a@example.invalid'),
 ('22222222-2222-4222-8222-000000000004','teacher-a@example.invalid'),
 ('22222222-2222-4222-8222-000000000005','student-b@example.invalid');

INSERT INTO public.profiles (id,display_name,role,verification_status) VALUES
 ('22222222-2222-4222-8222-000000000001','Synthetic Admin A','admin','verified'),
 ('22222222-2222-4222-8222-000000000002','Synthetic Student A','student','verified'),
 ('22222222-2222-4222-8222-000000000003','Synthetic Unapproved Student A','student','verified'),
 ('22222222-2222-4222-8222-000000000004','Synthetic Teacher A','teacher','verified'),
 ('22222222-2222-4222-8222-000000000005','Synthetic Student B','student','verified');

INSERT INTO public.campus_memberships (user_id,university_id,membership_status,verification_status,campus_role) VALUES
 ('22222222-2222-4222-8222-000000000001','11111111-1111-4111-8111-111111111111','active','verified','admin'),
 ('22222222-2222-4222-8222-000000000002','11111111-1111-4111-8111-111111111111','active','verified','student'),
 ('22222222-2222-4222-8222-000000000003','11111111-1111-4111-8111-111111111111','active','verified','student'),
 ('22222222-2222-4222-8222-000000000004','11111111-1111-4111-8111-111111111111','active','verified','teacher'),
 ('22222222-2222-4222-8222-000000000005','11111111-1111-4111-8111-222222222222','active','verified','student');

INSERT INTO public.student_identity_verifications (user_id,institution_name,student_number,object_path,status) VALUES
 ('22222222-2222-4222-8222-000000000002','Babcock University','TEST-A-001','synthetic/a.pdf','approved'),
 ('22222222-2222-4222-8222-000000000005','Synthetic Second University','TEST-B-001','synthetic/b.pdf','approved');

INSERT INTO public.community_profiles (user_id,username) VALUES
 ('22222222-2222-4222-8222-000000000001','admin_a'),
 ('22222222-2222-4222-8222-000000000002','student_a'),
 ('22222222-2222-4222-8222-000000000003','student_a_unapproved'),
 ('22222222-2222-4222-8222-000000000004','teacher_a'),
 ('22222222-2222-4222-8222-000000000005','student_b');

INSERT INTO public.campus_events (id,university_id,created_by,title,category,starts_at,status)
VALUES
 ('33333333-3333-4333-8333-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-000000000001','Synthetic Babcock Event','academic',now()+interval '14 days','published'),
 ('33333333-3333-4333-8333-000000000002','11111111-1111-4111-8111-222222222222','22222222-2222-4222-8222-000000000005','Synthetic Second Campus Event','academic',now()+interval '14 days','published');

