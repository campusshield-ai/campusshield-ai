-- Production-derived schema-contract fixture generated from live catalog metadata on 2026-11-04T15:31:07.363072+00:00.
-- Source: CampusShield Production PostgreSQL 17.11.
-- No user rows, auth secrets, billing records, Storage objects or application content are exported.
-- This is a dependency-scope schema snapshot, not a full database dump.
-- Synthetic rows below exercise the exact base table constraints, grants and RLS policies used by the candidate.

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS private;
CREATE SCHEMA IF NOT EXISTS storage;

DO $roles$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $roles$;
DO $roles$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $roles$;
DO $roles$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $roles$;
ALTER ROLE service_role BYPASSRLS;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;
GRANT USAGE ON SCHEMA private TO authenticated,service_role;

CREATE TABLE auth.users (id uuid PRIMARY KEY,email text UNIQUE);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE SET search_path=''
AS $fn$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid; $fn$;
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb LANGUAGE sql STABLE SET search_path=''
AS $fn$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb); $fn$;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;
GRANT EXECUTE ON FUNCTION auth.jwt() TO PUBLIC;


CREATE TABLE "public"."campus_universities" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "ownership" text NOT NULL,
  "state" text NOT NULL,
  "source_url" text DEFAULT 'https://enuc.nuc.edu.ng/nus'::text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "official_website" text,
  CONSTRAINT "campus_universities_name_check" CHECK (char_length(btrim(name)) >= 2 AND char_length(btrim(name)) <= 180),
  CONSTRAINT "campus_universities_ownership_check" CHECK (ownership = ANY (ARRAY['Federal'::text, 'State'::text, 'Private'::text])),
  CONSTRAINT "campus_universities_pkey" PRIMARY KEY (id),
  CONSTRAINT "campus_universities_slug_check" CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text),
  CONSTRAINT "campus_universities_slug_key" UNIQUE (slug),
  CONSTRAINT "campus_universities_state_check" CHECK (char_length(btrim(state)) >= 2 AND char_length(btrim(state)) <= 80)
);

CREATE TABLE "public"."profiles" (
  "id" uuid NOT NULL,
  "display_name" text,
  "role" text DEFAULT 'student'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "requested_role" text DEFAULT 'student'::text NOT NULL,
  "verification_status" text DEFAULT 'pending'::text NOT NULL,
  "last_profile_edit_at" timestamp with time zone,
  "avatar_path" text,
  CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "profiles_pkey" PRIMARY KEY (id),
  CONSTRAINT "profiles_requested_role_check" CHECK (requested_role = ANY (ARRAY['student'::text, 'teacher'::text])),
  CONSTRAINT "profiles_role_check" CHECK (role = ANY (ARRAY['student'::text, 'teacher'::text, 'security'::text, 'admin'::text])),
  CONSTRAINT "profiles_verification_status_check" CHECK (verification_status = ANY (ARRAY['pending'::text, 'verified'::text, 'rejected'::text]))
);

CREATE TABLE "public"."campus_memberships" (
  "user_id" uuid NOT NULL,
  "university_id" uuid NOT NULL,
  "faculty" text,
  "department" text,
  "course" text,
  "year_of_study" text,
  "membership_status" text DEFAULT 'active'::text NOT NULL,
  "verification_status" text DEFAULT 'unverified'::text NOT NULL,
  "campus_role" text DEFAULT 'student'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "campus_memberships_campus_role_check" CHECK (campus_role = ANY (ARRAY['student'::text, 'teacher'::text, 'security'::text, 'admin'::text])),
  CONSTRAINT "campus_memberships_course_len" CHECK (course IS NULL OR char_length(btrim(course)) <= 120),
  CONSTRAINT "campus_memberships_department_len" CHECK (department IS NULL OR char_length(btrim(department)) <= 120),
  CONSTRAINT "campus_memberships_faculty_len" CHECK (faculty IS NULL OR char_length(btrim(faculty)) <= 120),
  CONSTRAINT "campus_memberships_membership_status_check" CHECK (membership_status = ANY (ARRAY['active'::text, 'suspended'::text])),
  CONSTRAINT "campus_memberships_pkey" PRIMARY KEY (user_id),
  CONSTRAINT "campus_memberships_university_id_fkey" FOREIGN KEY (university_id) REFERENCES campus_universities(id) ON DELETE RESTRICT,
  CONSTRAINT "campus_memberships_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT "campus_memberships_verification_status_check" CHECK (verification_status = ANY (ARRAY['unverified'::text, 'pending'::text, 'verified'::text, 'rejected'::text])),
  CONSTRAINT "campus_memberships_year_len" CHECK (year_of_study IS NULL OR char_length(btrim(year_of_study)) <= 30)
);

CREATE TABLE "public"."student_identity_verifications" (
  "user_id" uuid NOT NULL,
  "institution_name" text NOT NULL,
  "student_number" text NOT NULL,
  "object_path" text NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "rejection_reason" text,
  "reviewed_by" uuid,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "confirmed_fraud" boolean DEFAULT false NOT NULL,
  "fraud_lock_at" timestamp with time zone,
  "fraud_decision_reason" text,
  "fraud_decided_by" uuid,
  "fraud_decided_at" timestamp with time zone,
  "fraud_notice_at" timestamp with time zone,
  CONSTRAINT "student_identity_institution_length" CHECK (char_length(btrim(institution_name)) >= 2 AND char_length(btrim(institution_name)) <= 180),
  CONSTRAINT "student_identity_number_length" CHECK (char_length(btrim(student_number)) >= 2 AND char_length(btrim(student_number)) <= 80),
  CONSTRAINT "student_identity_rejection_reason_length" CHECK (rejection_reason IS NULL OR char_length(rejection_reason) <= 1000),
  CONSTRAINT "student_identity_safe_path_check" CHECK (object_path ~ (('^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}'::text || chr(92)) || '.(jpg|jpeg|png|pdf)$'::text)),
  CONSTRAINT "student_identity_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
  CONSTRAINT "student_identity_verifications_fraud_decided_by_fkey" FOREIGN KEY (fraud_decided_by) REFERENCES profiles(id),
  CONSTRAINT "student_identity_verifications_object_path_key" UNIQUE (object_path),
  CONSTRAINT "student_identity_verifications_pkey" PRIMARY KEY (user_id),
  CONSTRAINT "student_identity_verifications_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT "student_identity_verifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE "public"."community_profiles" (
  "user_id" uuid NOT NULL,
  "username" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "username_changed_at" timestamp with time zone,
  CONSTRAINT "community_profiles_pkey" PRIMARY KEY (user_id),
  CONSTRAINT "community_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT "community_profiles_username_format" CHECK (username ~ '^[a-z0-9_]{3,20}$'::text)
);

CREATE TABLE "public"."incidents" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "reporter_id" uuid NOT NULL,
  "category" text NOT NULL,
  "severity" text NOT NULL,
  "location" text NOT NULL,
  "description" text NOT NULL,
  "status" text DEFAULT 'Open'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "incidents_category_check" CHECK (char_length(category) >= 1 AND char_length(category) <= 100),
  CONSTRAINT "incidents_description_check" CHECK (char_length(description) >= 1 AND char_length(description) <= 5000),
  CONSTRAINT "incidents_location_check" CHECK (char_length(location) >= 1 AND char_length(location) <= 250),
  CONSTRAINT "incidents_pkey" PRIMARY KEY (id),
  CONSTRAINT "incidents_reporter_id_fkey" FOREIGN KEY (reporter_id) REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT "incidents_severity_check" CHECK (severity = ANY (ARRAY['Low'::text, 'Medium'::text, 'High'::text])),
  CONSTRAINT "incidents_status_check" CHECK (status = ANY (ARRAY['Open'::text, 'In Progress'::text, 'Resolved'::text]))
);

CREATE TABLE "public"."campus_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "university_id" uuid NOT NULL,
  "created_by" uuid NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "category" text NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone,
  "location" text,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "organizer_username" text,
  CONSTRAINT "campus_events_category_check" CHECK (category = ANY (ARRAY['academic'::text, 'sports'::text, 'society'::text, 'career'::text, 'faith'::text, 'social'::text, 'safety'::text, 'other'::text])),
  CONSTRAINT "campus_events_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT "campus_events_description_check" CHECK (description IS NULL OR char_length(btrim(description)) <= 2000),
  CONSTRAINT "campus_events_end_after_start" CHECK (ends_at IS NULL OR ends_at >= starts_at),
  CONSTRAINT "campus_events_location_check" CHECK (location IS NULL OR char_length(btrim(location)) <= 180),
  CONSTRAINT "campus_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "campus_events_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'published'::text, 'cancelled'::text, 'hidden'::text])),
  CONSTRAINT "campus_events_title_check" CHECK (char_length(btrim(title)) >= 3 AND char_length(btrim(title)) <= 120),
  CONSTRAINT "campus_events_university_id_fkey" FOREIGN KEY (university_id) REFERENCES campus_universities(id) ON DELETE CASCADE
);

CREATE TABLE "private"."platform_admins" (
  "user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "platform_admins_pkey" PRIMARY KEY (user_id),
  CONSTRAINT "platform_admins_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TYPE storage.buckettype AS ENUM ('STANDARD','ANALYTICS','VECTOR');

CREATE TABLE "storage"."buckets" (
  "id" text NOT NULL,
  "name" text NOT NULL,
  "owner" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "public" boolean DEFAULT false,
  "avif_autodetection" boolean DEFAULT false,
  "file_size_limit" bigint,
  "allowed_mime_types" text[],
  "owner_id" text,
  "type" storage.buckettype DEFAULT 'STANDARD'::storage.buckettype NOT NULL,
  "versioning_status" text DEFAULT 'DISABLED'::text NOT NULL,
  "lifecycle_configuration" jsonb,
  "lifecycle_configuration_generation" uuid,
  CONSTRAINT "buckets_lifecycle_configuration_pair_check" CHECK ((lifecycle_configuration IS NULL) = (lifecycle_configuration_generation IS NULL)),
  CONSTRAINT "buckets_lifecycle_configuration_shape_check" CHECK (lifecycle_configuration IS NULL OR jsonb_typeof(lifecycle_configuration) = 'object'::text AND lifecycle_configuration ? 'rules'::text AND
CASE
    WHEN jsonb_typeof(lifecycle_configuration -> 'rules'::text) = 'array'::text THEN jsonb_array_length(lifecycle_configuration -> 'rules'::text) >= 1 AND jsonb_array_length(lifecycle_configuration -> 'rules'::text) <= 1000
    ELSE false
END),
  CONSTRAINT "buckets_lifecycle_configuration_standard_only_check" CHECK (type = 'STANDARD'::storage.buckettype OR lifecycle_configuration IS NULL AND lifecycle_configuration_generation IS NULL),
  CONSTRAINT "buckets_pkey" PRIMARY KEY (id),
  CONSTRAINT "buckets_versioning_standard_only_check" CHECK (type = 'STANDARD'::storage.buckettype OR versioning_status = 'DISABLED'::text),
  CONSTRAINT "buckets_versioning_status_check" CHECK (versioning_status = ANY (ARRAY['DISABLED'::text, 'ENABLED'::text, 'SUSPENDED'::text]))
);

CREATE TABLE "storage"."objects" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "bucket_id" text,
  "name" text,
  "owner" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "last_accessed_at" timestamp with time zone DEFAULT now(),
  "metadata" jsonb,
  "path_tokens" text[] GENERATED ALWAYS AS (string_to_array(name, '/'::text)) STORED,
  "version" text,
  "owner_id" text,
  "user_metadata" jsonb,
  "archived_at" timestamp with time zone,
  "is_delete_marker" boolean DEFAULT false NOT NULL,
  "is_versioned" boolean DEFAULT false NOT NULL,
  CONSTRAINT "objects_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id),
  CONSTRAINT "objects_pkey" PRIMARY KEY (id)
);

CREATE INDEX campus_events_campus_start_idx ON public.campus_events USING btree (university_id, status, starts_at);

CREATE INDEX idxfk_campus_events_created_by_635d08 ON public.campus_events USING btree (created_by);

CREATE INDEX idxfk_campus_memberships_university_id_875fb9 ON public.campus_memberships USING btree (university_id);

CREATE INDEX campus_universities_active_name_idx ON public.campus_universities USING btree (name) WHERE (is_active = true);

CREATE INDEX campus_universities_active_state_idx ON public.campus_universities USING btree (state) WHERE (is_active = true);

CREATE UNIQUE INDEX community_profiles_username_lower_uidx ON public.community_profiles USING btree (lower(username));

CREATE INDEX incidents_created_at_idx ON public.incidents USING btree (created_at DESC);

CREATE INDEX incidents_reporter_id_idx ON public.incidents USING btree (reporter_id);

CREATE INDEX incidents_severity_status_idx ON public.incidents USING btree (severity, status);

CREATE INDEX idxfk_student_identity_verifications_fraud_decided_b_61cde3 ON public.student_identity_verifications USING btree (fraud_decided_by);

CREATE INDEX idxfk_student_identity_verifications_reviewed_by_5c8d1b ON public.student_identity_verifications USING btree (reviewed_by);

CREATE UNIQUE INDEX bname ON storage.buckets USING btree (name);

CREATE INDEX idx_objects_bucket_id_name ON storage.objects USING btree (bucket_id, name COLLATE "C");

CREATE INDEX idx_objects_bucket_id_name_lower ON storage.objects USING btree (bucket_id, lower(name) COLLATE "C");

CREATE UNIQUE INDEX idx_objects_current_version ON storage.objects USING btree (bucket_id, name COLLATE "C") WHERE (archived_at IS NULL);

CREATE INDEX idx_objects_delete_markers ON storage.objects USING btree (bucket_id, name COLLATE "C") WHERE is_delete_marker;

CREATE UNIQUE INDEX idx_objects_null_version ON storage.objects USING btree (bucket_id, name COLLATE "C") WHERE (NOT is_versioned);

CREATE INDEX name_prefix_search ON storage.objects USING btree (name text_pattern_ops);

CREATE INDEX objects_archived_due_idx ON storage.objects USING btree (bucket_id, archived_at, name COLLATE "C") INCLUDE (id, version, is_delete_marker) WHERE (archived_at IS NOT NULL);

CREATE UNIQUE INDEX objects_archived_order_uq ON storage.objects USING btree (bucket_id, name COLLATE "C", archived_at) WHERE (archived_at IS NOT NULL);

CREATE UNIQUE INDEX objects_bucket_id_name_version_key ON storage.objects USING btree (bucket_id, name COLLATE "C", version) NULLS NOT DISTINCT;

ALTER TABLE "public"."campus_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."campus_memberships" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."campus_universities" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."community_profiles" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."incidents" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."student_identity_verifications" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "storage"."buckets" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "storage"."objects" ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.current_campus_account_status()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.verification_status::text
  from public.profiles p where p.id = (select auth.uid()) limit 1;
$function$
;
GRANT EXECUTE ON FUNCTION private."current_campus_account_status"() TO "authenticated";

CREATE OR REPLACE FUNCTION private.current_campus_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.role::text
  from public.profiles p
  join public.campus_memberships cm on cm.user_id = p.id
  where p.id = (select auth.uid())
    and p.verification_status = 'verified'
    and cm.membership_status = 'active'
    and cm.verification_status = 'verified'
  limit 1;
$function$
;
GRANT EXECUTE ON FUNCTION private."current_campus_role"() TO "authenticated";

CREATE OR REPLACE FUNCTION private.current_campus_university_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select cm.university_id
  from public.campus_memberships cm
  where cm.user_id = (select auth.uid())
    and cm.membership_status = 'active'
  limit 1;
$function$
;
GRANT EXECUTE ON FUNCTION private."current_campus_university_id"() TO "authenticated";

CREATE OR REPLACE FUNCTION private.current_user_can_use_restricted_features()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((
    select case
      when p.verification_status <> 'verified' then false
      when p.role in ('admin','security','teacher') then true
      when p.role = 'student' then exists (
        select 1 from public.student_identity_verifications siv
        where siv.user_id = p.id and siv.status = 'approved'
      )
      else false
    end
    from public.profiles p
    where p.id = (select auth.uid())
  ), false);
$function$
;
GRANT EXECUTE ON FUNCTION private."current_user_can_use_restricted_features"() TO "authenticated";

CREATE OR REPLACE FUNCTION private.current_user_has_verified_campus_access()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((select private.current_user_can_use_restricted_features()), false)
     and exists (
       select 1 from public.campus_memberships cm
       where cm.user_id = (select auth.uid())
         and cm.membership_status = 'active'
         and cm.verification_status = 'verified'
     );
$function$
;
GRANT EXECUTE ON FUNCTION private."current_user_has_verified_campus_access"() TO "authenticated";

CREATE OR REPLACE FUNCTION private.is_campusshield_owner_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT
    lower(coalesce((SELECT auth.jwt() ->> 'email'), '')) = 'campusshieldaitechnologies@gmail.com'
    AND EXISTS (
      SELECT 1
      FROM private.platform_admins pa
      WHERE pa.user_id = (SELECT auth.uid())
    );
$function$
;
GRANT EXECUTE ON FUNCTION private."is_campusshield_owner_admin"() TO "authenticated";

GRANT DELETE ON TABLE "public"."campus_events" TO "anon";
GRANT INSERT ON TABLE "public"."campus_events" TO "anon";
GRANT MAINTAIN ON TABLE "public"."campus_events" TO "anon";
GRANT REFERENCES ON TABLE "public"."campus_events" TO "anon";
GRANT SELECT ON TABLE "public"."campus_events" TO "anon";
GRANT TRIGGER ON TABLE "public"."campus_events" TO "anon";
GRANT TRUNCATE ON TABLE "public"."campus_events" TO "anon";
GRANT UPDATE ON TABLE "public"."campus_events" TO "anon";
GRANT DELETE ON TABLE "public"."campus_events" TO "authenticated";
GRANT INSERT ON TABLE "public"."campus_events" TO "authenticated";
GRANT MAINTAIN ON TABLE "public"."campus_events" TO "authenticated";
GRANT REFERENCES ON TABLE "public"."campus_events" TO "authenticated";
GRANT SELECT ON TABLE "public"."campus_events" TO "authenticated";
GRANT TRIGGER ON TABLE "public"."campus_events" TO "authenticated";
GRANT TRUNCATE ON TABLE "public"."campus_events" TO "authenticated";
GRANT UPDATE ON TABLE "public"."campus_events" TO "authenticated";
GRANT DELETE ON TABLE "public"."campus_events" TO "service_role";
GRANT INSERT ON TABLE "public"."campus_events" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."campus_events" TO "service_role";
GRANT REFERENCES ON TABLE "public"."campus_events" TO "service_role";
GRANT SELECT ON TABLE "public"."campus_events" TO "service_role";
GRANT TRIGGER ON TABLE "public"."campus_events" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."campus_events" TO "service_role";
GRANT UPDATE ON TABLE "public"."campus_events" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."campus_memberships" TO "anon";
GRANT REFERENCES ON TABLE "public"."campus_memberships" TO "anon";
GRANT SELECT ON TABLE "public"."campus_memberships" TO "anon";
GRANT TRIGGER ON TABLE "public"."campus_memberships" TO "anon";
GRANT TRUNCATE ON TABLE "public"."campus_memberships" TO "anon";
GRANT DELETE ON TABLE "public"."campus_memberships" TO "authenticated";
GRANT INSERT ON TABLE "public"."campus_memberships" TO "authenticated";
GRANT MAINTAIN ON TABLE "public"."campus_memberships" TO "authenticated";
GRANT REFERENCES ON TABLE "public"."campus_memberships" TO "authenticated";
GRANT SELECT ON TABLE "public"."campus_memberships" TO "authenticated";
GRANT TRIGGER ON TABLE "public"."campus_memberships" TO "authenticated";
GRANT TRUNCATE ON TABLE "public"."campus_memberships" TO "authenticated";
GRANT UPDATE ON TABLE "public"."campus_memberships" TO "authenticated";
GRANT DELETE ON TABLE "public"."campus_memberships" TO "service_role";
GRANT INSERT ON TABLE "public"."campus_memberships" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."campus_memberships" TO "service_role";
GRANT REFERENCES ON TABLE "public"."campus_memberships" TO "service_role";
GRANT SELECT ON TABLE "public"."campus_memberships" TO "service_role";
GRANT TRIGGER ON TABLE "public"."campus_memberships" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."campus_memberships" TO "service_role";
GRANT UPDATE ON TABLE "public"."campus_memberships" TO "service_role";
GRANT DELETE ON TABLE "public"."campus_universities" TO "anon";
GRANT INSERT ON TABLE "public"."campus_universities" TO "anon";
GRANT MAINTAIN ON TABLE "public"."campus_universities" TO "anon";
GRANT REFERENCES ON TABLE "public"."campus_universities" TO "anon";
GRANT SELECT ON TABLE "public"."campus_universities" TO "anon";
GRANT TRIGGER ON TABLE "public"."campus_universities" TO "anon";
GRANT TRUNCATE ON TABLE "public"."campus_universities" TO "anon";
GRANT UPDATE ON TABLE "public"."campus_universities" TO "anon";
GRANT DELETE ON TABLE "public"."campus_universities" TO "authenticated";
GRANT INSERT ON TABLE "public"."campus_universities" TO "authenticated";
GRANT MAINTAIN ON TABLE "public"."campus_universities" TO "authenticated";
GRANT REFERENCES ON TABLE "public"."campus_universities" TO "authenticated";
GRANT SELECT ON TABLE "public"."campus_universities" TO "authenticated";
GRANT TRIGGER ON TABLE "public"."campus_universities" TO "authenticated";
GRANT TRUNCATE ON TABLE "public"."campus_universities" TO "authenticated";
GRANT UPDATE ON TABLE "public"."campus_universities" TO "authenticated";
GRANT DELETE ON TABLE "public"."campus_universities" TO "service_role";
GRANT INSERT ON TABLE "public"."campus_universities" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."campus_universities" TO "service_role";
GRANT REFERENCES ON TABLE "public"."campus_universities" TO "service_role";
GRANT SELECT ON TABLE "public"."campus_universities" TO "service_role";
GRANT TRIGGER ON TABLE "public"."campus_universities" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."campus_universities" TO "service_role";
GRANT UPDATE ON TABLE "public"."campus_universities" TO "service_role";
GRANT DELETE ON TABLE "public"."community_profiles" TO "authenticated";
GRANT INSERT ON TABLE "public"."community_profiles" TO "authenticated";
GRANT SELECT ON TABLE "public"."community_profiles" TO "authenticated";
GRANT UPDATE ON TABLE "public"."community_profiles" TO "authenticated";
GRANT DELETE ON TABLE "public"."community_profiles" TO "service_role";
GRANT INSERT ON TABLE "public"."community_profiles" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."community_profiles" TO "service_role";
GRANT REFERENCES ON TABLE "public"."community_profiles" TO "service_role";
GRANT SELECT ON TABLE "public"."community_profiles" TO "service_role";
GRANT TRIGGER ON TABLE "public"."community_profiles" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."community_profiles" TO "service_role";
GRANT UPDATE ON TABLE "public"."community_profiles" TO "service_role";
GRANT DELETE ON TABLE "public"."incidents" TO "authenticated";
GRANT INSERT ON TABLE "public"."incidents" TO "authenticated";
GRANT SELECT ON TABLE "public"."incidents" TO "authenticated";
GRANT UPDATE ON TABLE "public"."incidents" TO "authenticated";
GRANT DELETE ON TABLE "public"."incidents" TO "service_role";
GRANT INSERT ON TABLE "public"."incidents" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."incidents" TO "service_role";
GRANT REFERENCES ON TABLE "public"."incidents" TO "service_role";
GRANT SELECT ON TABLE "public"."incidents" TO "service_role";
GRANT TRIGGER ON TABLE "public"."incidents" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."incidents" TO "service_role";
GRANT UPDATE ON TABLE "public"."incidents" TO "service_role";
GRANT DELETE ON TABLE "public"."profiles" TO "authenticated";
GRANT INSERT ON TABLE "public"."profiles" TO "authenticated";
GRANT SELECT ON TABLE "public"."profiles" TO "authenticated";
GRANT UPDATE ON TABLE "public"."profiles" TO "authenticated";
GRANT DELETE ON TABLE "public"."profiles" TO "service_role";
GRANT INSERT ON TABLE "public"."profiles" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."profiles" TO "service_role";
GRANT REFERENCES ON TABLE "public"."profiles" TO "service_role";
GRANT SELECT ON TABLE "public"."profiles" TO "service_role";
GRANT TRIGGER ON TABLE "public"."profiles" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."profiles" TO "service_role";
GRANT UPDATE ON TABLE "public"."profiles" TO "service_role";
GRANT DELETE ON TABLE "public"."student_identity_verifications" TO "authenticated";
GRANT INSERT ON TABLE "public"."student_identity_verifications" TO "authenticated";
GRANT SELECT ON TABLE "public"."student_identity_verifications" TO "authenticated";
GRANT UPDATE ON TABLE "public"."student_identity_verifications" TO "authenticated";
GRANT DELETE ON TABLE "public"."student_identity_verifications" TO "service_role";
GRANT INSERT ON TABLE "public"."student_identity_verifications" TO "service_role";
GRANT MAINTAIN ON TABLE "public"."student_identity_verifications" TO "service_role";
GRANT REFERENCES ON TABLE "public"."student_identity_verifications" TO "service_role";
GRANT SELECT ON TABLE "public"."student_identity_verifications" TO "service_role";
GRANT TRIGGER ON TABLE "public"."student_identity_verifications" TO "service_role";
GRANT TRUNCATE ON TABLE "public"."student_identity_verifications" TO "service_role";
GRANT UPDATE ON TABLE "public"."student_identity_verifications" TO "service_role";
GRANT DELETE ON TABLE "storage"."buckets" TO "anon";
GRANT INSERT ON TABLE "storage"."buckets" TO "anon";
GRANT SELECT ON TABLE "storage"."buckets" TO "anon";
GRANT UPDATE ON TABLE "storage"."buckets" TO "anon";
GRANT DELETE ON TABLE "storage"."buckets" TO "authenticated";
GRANT INSERT ON TABLE "storage"."buckets" TO "authenticated";
GRANT SELECT ON TABLE "storage"."buckets" TO "authenticated";
GRANT UPDATE ON TABLE "storage"."buckets" TO "authenticated";
GRANT DELETE ON TABLE "storage"."buckets" TO "service_role";
GRANT INSERT ON TABLE "storage"."buckets" TO "service_role";
GRANT MAINTAIN ON TABLE "storage"."buckets" TO "service_role";
GRANT REFERENCES ON TABLE "storage"."buckets" TO "service_role";
GRANT SELECT ON TABLE "storage"."buckets" TO "service_role";
GRANT TRIGGER ON TABLE "storage"."buckets" TO "service_role";
GRANT TRUNCATE ON TABLE "storage"."buckets" TO "service_role";
GRANT UPDATE ON TABLE "storage"."buckets" TO "service_role";
GRANT DELETE ON TABLE "storage"."objects" TO "anon";
GRANT INSERT ON TABLE "storage"."objects" TO "anon";
GRANT SELECT ON TABLE "storage"."objects" TO "anon";
GRANT UPDATE ON TABLE "storage"."objects" TO "anon";
GRANT DELETE ON TABLE "storage"."objects" TO "authenticated";
GRANT INSERT ON TABLE "storage"."objects" TO "authenticated";
GRANT SELECT ON TABLE "storage"."objects" TO "authenticated";
GRANT UPDATE ON TABLE "storage"."objects" TO "authenticated";
GRANT DELETE ON TABLE "storage"."objects" TO "service_role";
GRANT INSERT ON TABLE "storage"."objects" TO "service_role";
GRANT MAINTAIN ON TABLE "storage"."objects" TO "service_role";
GRANT REFERENCES ON TABLE "storage"."objects" TO "service_role";
GRANT SELECT ON TABLE "storage"."objects" TO "service_role";
GRANT TRIGGER ON TABLE "storage"."objects" TO "service_role";
GRANT TRUNCATE ON TABLE "storage"."objects" TO "service_role";
GRANT UPDATE ON TABLE "storage"."objects" TO "service_role";

CREATE POLICY "campus_events_create_same_campus" ON "public"."campus_events" AS PERMISSIVE FOR INSERT TO "authenticated"
  WITH CHECK (((private.current_campus_account_status() = ANY (ARRAY['pending'::text, 'verified'::text])) AND (created_by = ( SELECT auth.uid() AS uid)) AND (university_id = ( SELECT private.current_campus_university_id() AS current_campus_university_id)) AND (status = 'pending'::text)));

CREATE POLICY "campus_events_read_same_campus" ON "public"."campus_events" AS PERMISSIVE FOR SELECT TO "authenticated"
  USING (((university_id = ( SELECT private.current_campus_university_id() AS current_campus_university_id)) AND ((status = 'published'::text) OR (created_by = ( SELECT auth.uid() AS uid)) OR (private.current_campus_role() = ANY (ARRAY['admin'::text, 'security'::text, 'teacher'::text])))));

CREATE POLICY "platform_owner_full_access" ON "public"."campus_events" AS PERMISSIVE FOR ALL TO "authenticated"
  USING (private.is_campusshield_owner_admin())
  WITH CHECK (private.is_campusshield_owner_admin());

CREATE POLICY "campus_memberships_read_own" ON "public"."campus_memberships" AS PERMISSIVE FOR SELECT TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "platform_owner_full_access" ON "public"."campus_memberships" AS PERMISSIVE FOR ALL TO "authenticated"
  USING (private.is_campusshield_owner_admin())
  WITH CHECK (private.is_campusshield_owner_admin());

CREATE POLICY "campus_universities_read_active" ON "public"."campus_universities" AS PERMISSIVE FOR SELECT TO "anon", "authenticated"
  USING ((is_active = true));

CREATE POLICY "platform_owner_full_access" ON "public"."campus_universities" AS PERMISSIVE FOR ALL TO "authenticated"
  USING (private.is_campusshield_owner_admin())
  WITH CHECK (private.is_campusshield_owner_admin());

CREATE POLICY "community_profiles_read_own" ON "public"."community_profiles" AS PERMISSIVE FOR SELECT TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "platform_owner_full_access" ON "public"."community_profiles" AS PERMISSIVE FOR ALL TO "authenticated"
  USING (private.is_campusshield_owner_admin())
  WITH CHECK (private.is_campusshield_owner_admin());

CREATE POLICY "Approved students and verified staff can read incidents" ON "public"."incidents" AS PERMISSIVE FOR SELECT TO "authenticated"
  USING ((((reporter_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.current_user_can_use_restricted_features() AS current_user_can_use_restricted_features)) OR (( SELECT private.current_campus_role() AS current_campus_role) = ANY (ARRAY['security'::text, 'admin'::text]))));

CREATE POLICY "Only verified admins can delete incidents" ON "public"."incidents" AS PERMISSIVE FOR DELETE TO "authenticated"
  USING ((private.current_campus_role() = 'admin'::text));

CREATE POLICY "Only verified security and admins can update incidents" ON "public"."incidents" AS PERMISSIVE FOR UPDATE TO "authenticated"
  USING ((private.current_campus_role() = ANY (ARRAY['security'::text, 'admin'::text])))
  WITH CHECK ((private.current_campus_role() = ANY (ARRAY['security'::text, 'admin'::text])));

CREATE POLICY "Verified users can submit their own incidents" ON "public"."incidents" AS PERMISSIVE FOR INSERT TO "authenticated"
  WITH CHECK (((reporter_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.current_user_can_use_restricted_features() AS current_user_can_use_restricted_features)));

CREATE POLICY "platform_owner_full_access" ON "public"."incidents" AS PERMISSIVE FOR ALL TO "authenticated"
  USING (private.is_campusshield_owner_admin())
  WITH CHECK (private.is_campusshield_owner_admin());

CREATE POLICY "Users can read own profile; verified staff can read profiles" ON "public"."profiles" AS PERMISSIVE FOR SELECT TO "authenticated"
  USING (((id = ( SELECT auth.uid() AS uid)) OR (private.current_campus_role() = ANY (ARRAY['admin'::text, 'security'::text, 'teacher'::text]))));

CREATE POLICY "Users can update own pending requested role" ON "public"."profiles" AS PERMISSIVE FOR UPDATE TO "authenticated"
  USING (((id = ( SELECT auth.uid() AS uid)) AND (verification_status = 'pending'::text)))
  WITH CHECK (((id = ( SELECT auth.uid() AS uid)) AND (verification_status = 'pending'::text) AND (requested_role = ANY (ARRAY['student'::text, 'teacher'::text]))));

CREATE POLICY "platform_owner_full_access" ON "public"."profiles" AS PERMISSIVE FOR ALL TO "authenticated"
  USING (private.is_campusshield_owner_admin())
  WITH CHECK (private.is_campusshield_owner_admin());

CREATE POLICY "platform_owner_full_access" ON "public"."student_identity_verifications" AS PERMISSIVE FOR ALL TO "authenticated"
  USING (private.is_campusshield_owner_admin())
  WITH CHECK (private.is_campusshield_owner_admin());

CREATE POLICY "student_identity_read_own_or_verified_admin" ON "public"."student_identity_verifications" AS PERMISSIVE FOR SELECT TO "authenticated"
  USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM profiles administrator
  WHERE ((administrator.id = ( SELECT auth.uid() AS uid)) AND (administrator.role = 'admin'::text) AND (administrator.verification_status = 'verified'::text))))));
CREATE OR REPLACE FUNCTION storage.foldername(p_name text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=''
AS $fn$ SELECT string_to_array(p_name,'/'); $fn$;
GRANT EXECUTE ON FUNCTION storage.foldername(text) TO PUBLIC;

-- Synthetic test data only; IDs and emails are reserved fixture values.
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

INSERT INTO public.profiles (id,display_name,role,verification_status,requested_role) VALUES
 ('22222222-2222-4222-8222-000000000001','Synthetic Admin A','admin','verified','student'),
 ('22222222-2222-4222-8222-000000000002','Synthetic Student A','student','verified','student'),
 ('22222222-2222-4222-8222-000000000003','Synthetic Unapproved Student A','student','verified','student'),
 ('22222222-2222-4222-8222-000000000004','Synthetic Teacher A','teacher','verified','teacher'),
 ('22222222-2222-4222-8222-000000000005','Synthetic Student B','student','verified','student');

INSERT INTO public.campus_memberships (user_id,university_id,membership_status,verification_status,campus_role) VALUES
 ('22222222-2222-4222-8222-000000000001','11111111-1111-4111-8111-111111111111','active','verified','admin'),
 ('22222222-2222-4222-8222-000000000002','11111111-1111-4111-8111-111111111111','active','verified','student'),
 ('22222222-2222-4222-8222-000000000003','11111111-1111-4111-8111-111111111111','active','verified','student'),
 ('22222222-2222-4222-8222-000000000004','11111111-1111-4111-8111-111111111111','active','verified','teacher'),
 ('22222222-2222-4222-8222-000000000005','11111111-1111-4111-8111-222222222222','active','verified','student');

INSERT INTO public.student_identity_verifications
 (user_id,institution_name,student_number,object_path,status,confirmed_fraud)
VALUES
 ('22222222-2222-4222-8222-000000000002','Babcock University','TEST-A-001','22222222-2222-4222-8222-000000000002/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf','approved',false),
 ('22222222-2222-4222-8222-000000000005','Synthetic Second University','TEST-B-001','22222222-2222-4222-8222-000000000005/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.pdf','approved',false);

INSERT INTO public.community_profiles (user_id,username) VALUES
 ('22222222-2222-4222-8222-000000000001','admin_a'),
 ('22222222-2222-4222-8222-000000000002','student_a'),
 ('22222222-2222-4222-8222-000000000003','student_a_unapproved'),
 ('22222222-2222-4222-8222-000000000004','teacher_a'),
 ('22222222-2222-4222-8222-000000000005','student_b');

INSERT INTO public.campus_events (id,university_id,created_by,title,description,category,starts_at,status)
VALUES
 ('33333333-3333-4333-8333-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-000000000001','Synthetic Babcock Event','Synthetic event','academic',now()+interval '14 days','published'),
 ('33333333-3333-4333-8333-000000000002','11111111-1111-4111-8111-222222222222','22222222-2222-4222-8222-000000000005','Synthetic Second Campus Event','Synthetic event','academic',now()+interval '14 days','published');

