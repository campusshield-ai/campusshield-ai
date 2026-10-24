
-- Restore the directory, self-scoped campus context, and ShieldMind server-side controls.
-- Existing users do NOT become verified automatically by this migration.

CREATE TABLE IF NOT EXISTS public.campus_universities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 180),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ownership text NOT NULL CHECK (ownership IN ('Federal','State','Private')),
  state text NOT NULL CHECK (char_length(btrim(state)) BETWEEN 2 AND 80),
  source_url text NOT NULL DEFAULT 'https://enuc.nuc.edu.ng/nus',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  official_website text
);
ALTER TABLE public.campus_universities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS campus_universities_read_active ON public.campus_universities;
CREATE POLICY campus_universities_read_active ON public.campus_universities
  FOR SELECT TO anon, authenticated USING (is_active = true);
GRANT SELECT ON public.campus_universities TO anon, authenticated;
CREATE INDEX IF NOT EXISTS campus_universities_active_name_idx ON public.campus_universities(name) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS campus_universities_active_state_idx ON public.campus_universities(state) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.campus_memberships (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  university_id uuid NOT NULL REFERENCES public.campus_universities(id) ON DELETE RESTRICT,
  faculty text, department text, course text, year_of_study text,
  membership_status text NOT NULL DEFAULT 'active' CHECK (membership_status IN ('active','suspended')),
  verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified','pending','verified','rejected')),
  campus_role text NOT NULL DEFAULT 'student' CHECK (campus_role IN ('student','teacher','security','admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campus_memberships_faculty_len CHECK (faculty IS NULL OR char_length(btrim(faculty)) <= 120),
  CONSTRAINT campus_memberships_department_len CHECK (department IS NULL OR char_length(btrim(department)) <= 120),
  CONSTRAINT campus_memberships_course_len CHECK (course IS NULL OR char_length(btrim(course)) <= 120),
  CONSTRAINT campus_memberships_year_len CHECK (year_of_study IS NULL OR char_length(btrim(year_of_study)) <= 30)
);
ALTER TABLE public.campus_memberships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS campus_memberships_read_own ON public.campus_memberships;
CREATE POLICY campus_memberships_read_own ON public.campus_memberships FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
GRANT SELECT ON public.campus_memberships TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.campus_memberships FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS campus_memberships_university_id_idx ON public.campus_memberships(university_id);

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS private.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.platform_admins FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_campus_context()
RETURNS TABLE(university_id uuid, university_name text, university_slug text, state text, ownership text,
 membership_status text, verification_status text, faculty text, department text, course text, year_of_study text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
 SELECT u.id,u.name,u.slug,u.state,u.ownership,cm.membership_status,cm.verification_status,
        cm.faculty,cm.department,cm.course,cm.year_of_study
 FROM public.campus_memberships cm JOIN public.campus_universities u ON u.id=cm.university_id
 WHERE cm.user_id=(SELECT auth.uid()) LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.get_my_campus_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_campus_context() TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM private.platform_admins pa WHERE pa.user_id=(SELECT auth.uid()));
$function$;
REVOKE ALL ON FUNCTION public.platform_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_is_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_my_campus_membership(
 p_university_id uuid,p_faculty text DEFAULT NULL,p_department text DEFAULT NULL,
 p_course text DEFAULT NULL,p_year_of_study text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_user_id uuid := (SELECT auth.uid()); v_profile_status text; v_existing_university uuid;
BEGIN
 IF v_user_id IS NULL THEN RAISE EXCEPTION 'Sign in before choosing your university.'; END IF;
 SELECT p.verification_status INTO v_profile_status FROM public.profiles p WHERE p.id=v_user_id;
 IF v_profile_status IS NULL OR v_profile_status='rejected' THEN RAISE EXCEPTION 'This account cannot join a campus community.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.campus_universities u WHERE u.id=p_university_id AND u.is_active) THEN RAISE EXCEPTION 'Choose a university from the directory.'; END IF;
 IF p_faculty IS NOT NULL AND char_length(btrim(p_faculty))>120 THEN RAISE EXCEPTION 'Faculty must be 120 characters or fewer.'; END IF;
 IF p_department IS NOT NULL AND char_length(btrim(p_department))>120 THEN RAISE EXCEPTION 'Department must be 120 characters or fewer.'; END IF;
 IF p_course IS NOT NULL AND char_length(btrim(p_course))>120 THEN RAISE EXCEPTION 'Course must be 120 characters or fewer.'; END IF;
 IF p_year_of_study IS NOT NULL AND char_length(btrim(p_year_of_study))>30 THEN RAISE EXCEPTION 'Year of study must be 30 characters or fewer.'; END IF;
 SELECT cm.university_id INTO v_existing_university FROM public.campus_memberships cm WHERE cm.user_id=v_user_id;
 IF FOUND THEN
   IF v_existing_university<>p_university_id THEN RAISE EXCEPTION 'Your university is locked to protect campus privacy. Contact support to request a transfer.'; END IF;
   UPDATE public.campus_memberships SET
      faculty=COALESCE(NULLIF(btrim(COALESCE(p_faculty,'')),''),faculty),
      department=COALESCE(NULLIF(btrim(COALESCE(p_department,'')),''),department),
      course=COALESCE(NULLIF(btrim(COALESCE(p_course,'')),''),course),
      year_of_study=COALESCE(NULLIF(btrim(COALESCE(p_year_of_study,'')),''),year_of_study),
      updated_at=now()
   WHERE user_id=v_user_id AND university_id=p_university_id;
   RETURN v_existing_university;
 END IF;
 INSERT INTO public.campus_memberships(user_id,university_id,faculty,department,course,year_of_study,membership_status,verification_status,campus_role)
 VALUES(v_user_id,p_university_id,NULLIF(btrim(COALESCE(p_faculty,'')),''),
   NULLIF(btrim(COALESCE(p_department,'')),''),NULLIF(btrim(COALESCE(p_course,'')),''),
   NULLIF(btrim(COALESCE(p_year_of_study,'')),''),'active','unverified',
   CASE WHEN EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=v_user_id AND p.role='teacher') THEN 'teacher' ELSE 'student' END)
 RETURNING university_id INTO v_existing_university;
 RETURN v_existing_university;
END;
$function$;
REVOKE ALL ON FUNCTION public.set_my_campus_membership(uuid,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_campus_membership(uuid,text,text,text,text) TO authenticated;

-- ShieldMind quotas are durable and server-only.
CREATE TABLE IF NOT EXISTS private.shieldmind_usage_windows (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 window_type text NOT NULL CHECK(window_type IN ('minute','day')),
 window_start timestamptz NOT NULL,
 request_count integer NOT NULL DEFAULT 0 CHECK(request_count>=0),
 PRIMARY KEY(user_id,window_type,window_start)
);
CREATE TABLE IF NOT EXISTS private.shieldmind_session_windows (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 session_started_at timestamptz,cooldown_until timestamptz,updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS private.shieldmind_image_usage_windows (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 month_start timestamptz NOT NULL,upload_count integer NOT NULL DEFAULT 0 CHECK(upload_count>=0),
 PRIMARY KEY(user_id,month_start)
);
REVOKE ALL ON private.shieldmind_usage_windows,private.shieldmind_session_windows,private.shieldmind_image_usage_windows FROM PUBLIC,anon,authenticated;

-- Subscription records start at free. No premium entitlements are created by this migration.
CREATE TABLE IF NOT EXISTS public.shieldmind_subscriptions (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 plan text NOT NULL DEFAULT 'free' CHECK(plan IN ('free','starter','plus','pro','ultra','max','premium')),
 status text NOT NULL DEFAULT 'free' CHECK(status IN ('free','pending','active','expired','failed')),
 billing_period text CHECK(billing_period IN ('monthly','annual')),
 provider text CHECK(provider='paystack'),
 provider_reference text UNIQUE,
 amount_kobo integer CHECK(amount_kobo IS NULL OR amount_kobo>0),
 currency text NOT NULL DEFAULT 'NGN' CHECK(currency='NGN'),
 started_at timestamptz, expires_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now(),
 image_upload_limit integer NOT NULL DEFAULT 0 CHECK(image_upload_limit>=0),
 provider_subscription_code text,provider_customer_code text,
 renewal_status text NOT NULL DEFAULT 'unknown' CHECK(renewal_status IN ('unknown','active','non-renewing','attention','cancelled','completed')),
 last_payment_reference text,last_payment_at timestamptz,
 CONSTRAINT premium_has_period CHECK(plan<>'premium' OR billing_period IS NOT NULL)
);
ALTER TABLE public.shieldmind_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shieldmind_subscription_read_own ON public.shieldmind_subscriptions;
CREATE POLICY shieldmind_subscription_read_own ON public.shieldmind_subscriptions
 FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
GRANT SELECT ON public.shieldmind_subscriptions TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.shieldmind_subscriptions FROM anon,authenticated;

CREATE OR REPLACE FUNCTION private.shieldmind_require_eligible_caller()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
 v_uid uuid := (SELECT auth.uid()); v_role text; v_requested_role text; v_university_id uuid;
 v_membership_status text; v_membership_verification text; v_identity_status text;
 v_identity_university_id uuid; v_confirmed_fraud boolean; v_fraud_lock_at timestamptz;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 SELECT p.role,p.requested_role INTO v_role,v_requested_role FROM public.profiles p
 WHERE p.id=v_uid AND p.verification_status='verified';
 IF NOT FOUND THEN RAISE EXCEPTION 'A verified campus account is required'; END IF;
 SELECT c.university_id,c.membership_status,c.verification_status INTO v_university_id,v_membership_status,v_membership_verification
 FROM public.get_my_campus_context() c LIMIT 1;
 IF v_university_id IS NULL OR v_membership_status<>'active' OR v_membership_verification<>'verified' THEN
   RAISE EXCEPTION 'An active verified campus membership is required';
 END IF;
 IF COALESCE(v_requested_role,v_role)='student' THEN
   SELECT s.status,s.university_id,COALESCE(s.confirmed_fraud,false),s.fraud_lock_at
   INTO v_identity_status,v_identity_university_id,v_confirmed_fraud,v_fraud_lock_at
   FROM public.student_identity_verifications s WHERE s.user_id=v_uid LIMIT 1;
   IF NOT FOUND OR v_identity_status<>'approved' OR v_identity_university_id IS DISTINCT FROM v_university_id
      OR v_confirmed_fraud OR v_fraud_lock_at IS NOT NULL THEN
     RAISE EXCEPTION 'Approved student identity for the active campus is required';
   END IF;
 END IF;
END;
$function$;
REVOKE ALL ON FUNCTION private.shieldmind_require_eligible_caller() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.consume_shieldmind_quota()
RETURNS TABLE(allowed boolean,remaining integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
 v_user_id uuid := (SELECT auth.uid()); v_now timestamptz := clock_timestamp();
 v_minute_start timestamptz := date_trunc('minute',clock_timestamp());
 v_day_start timestamptz := date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
 v_plan text := 'free'; v_minute_limit integer:=5; v_day_limit integer:=80;
 v_minute_count integer; v_day_count integer; v_session private.shieldmind_session_windows%rowtype;
BEGIN
 PERFORM private.shieldmind_require_eligible_caller();
 SELECT s.plan INTO v_plan FROM public.shieldmind_subscriptions s
 WHERE s.user_id=v_user_id AND s.status='active' AND s.expires_at>v_now
 AND s.plan IN ('starter','plus','pro','ultra','max','premium') LIMIT 1;
 CASE COALESCE(v_plan,'free')
  WHEN 'starter' THEN v_minute_limit:=10;v_day_limit:=250;
  WHEN 'plus' THEN v_minute_limit:=15;v_day_limit:=700;
  WHEN 'pro' THEN v_minute_limit:=25;v_day_limit:=1500;
  WHEN 'ultra' THEN v_minute_limit:=35;v_day_limit:=2500;
  WHEN 'max' THEN v_minute_limit:=50;v_day_limit:=4000;
  WHEN 'premium' THEN v_minute_limit:=10;v_day_limit:=250;
  ELSE v_minute_limit:=5;v_day_limit:=80;
 END CASE;
 INSERT INTO private.shieldmind_session_windows(user_id,session_started_at,cooldown_until,updated_at)
 VALUES(v_user_id,NULL,NULL,v_now) ON CONFLICT(user_id) DO NOTHING;
 SELECT * INTO v_session FROM private.shieldmind_session_windows WHERE user_id=v_user_id FOR UPDATE;
 IF v_session.cooldown_until IS NOT NULL AND v_now<v_session.cooldown_until THEN RETURN QUERY SELECT false,0;RETURN;END IF;
 IF v_session.session_started_at IS NOT NULL AND v_now>=v_session.session_started_at+interval '8 hours' THEN
  UPDATE private.shieldmind_session_windows SET session_started_at=NULL,cooldown_until=v_now+interval '1 hour',updated_at=v_now WHERE user_id=v_user_id;
  RETURN QUERY SELECT false,0;RETURN;
 END IF;
 IF v_session.session_started_at IS NULL THEN UPDATE private.shieldmind_session_windows SET session_started_at=v_now,cooldown_until=NULL,updated_at=v_now WHERE user_id=v_user_id;END IF;
 INSERT INTO private.shieldmind_usage_windows(user_id,window_type,window_start,request_count) VALUES(v_user_id,'minute',v_minute_start,1)
 ON CONFLICT(user_id,window_type,window_start) DO UPDATE SET request_count=private.shieldmind_usage_windows.request_count+1
 WHERE private.shieldmind_usage_windows.request_count<v_minute_limit RETURNING request_count INTO v_minute_count;
 IF NOT FOUND THEN RETURN QUERY SELECT false,0;RETURN;END IF;
 INSERT INTO private.shieldmind_usage_windows(user_id,window_type,window_start,request_count) VALUES(v_user_id,'day',v_day_start,1)
 ON CONFLICT(user_id,window_type,window_start) DO UPDATE SET request_count=private.shieldmind_usage_windows.request_count+1
 WHERE private.shieldmind_usage_windows.request_count<v_day_limit RETURNING request_count INTO v_day_count;
 IF NOT FOUND THEN RETURN QUERY SELECT false,0;RETURN;END IF;
 DELETE FROM private.shieldmind_usage_windows WHERE window_start<v_now-interval '2 days';
 RETURN QUERY SELECT true,greatest(0,least(v_minute_limit-v_minute_count,v_day_limit-v_day_count));
END;
$function$;
REVOKE ALL ON FUNCTION public.consume_shieldmind_quota() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.consume_shieldmind_quota() TO authenticated;

CREATE OR REPLACE FUNCTION public.consume_shieldmind_image_upload()
RETURNS TABLE(allowed boolean,remaining integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
 v_user_id uuid := (SELECT auth.uid()); v_now timestamptz:=clock_timestamp();
 v_month_start timestamptz:=date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
 v_limit integer:=0;v_count integer;
BEGIN
 PERFORM private.shieldmind_require_eligible_caller();
 SELECT COALESCE(s.image_upload_limit,0) INTO v_limit FROM public.shieldmind_subscriptions s
 WHERE s.user_id=v_user_id AND s.status='active' AND s.expires_at>v_now AND s.plan IN ('starter','plus','pro','ultra','max','premium') LIMIT 1;
 IF COALESCE(v_limit,0)<=0 THEN RETURN QUERY SELECT false,0;RETURN;END IF;
 INSERT INTO private.shieldmind_image_usage_windows(user_id,month_start,upload_count) VALUES(v_user_id,v_month_start,1)
 ON CONFLICT(user_id,month_start) DO UPDATE SET upload_count=private.shieldmind_image_usage_windows.upload_count+1
 WHERE private.shieldmind_image_usage_windows.upload_count<v_limit RETURNING upload_count INTO v_count;
 IF NOT FOUND THEN RETURN QUERY SELECT false,0;RETURN;END IF;
 DELETE FROM private.shieldmind_image_usage_windows WHERE month_start<v_now-interval '62 days';
 RETURN QUERY SELECT true,greatest(0,v_limit-v_count);
END;
$function$;
REVOKE ALL ON FUNCTION public.consume_shieldmind_image_upload() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.consume_shieldmind_image_upload() TO authenticated;

CREATE TABLE IF NOT EXISTS public.campus_knowledge_sources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 university_id uuid NOT NULL REFERENCES public.campus_universities(id) ON DELETE CASCADE,
 title text NOT NULL,base_url text NOT NULL,domain text NOT NULL,status text NOT NULL DEFAULT 'approved',
 created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 last_crawled_at timestamptz,last_crawl_status text
);
CREATE TABLE IF NOT EXISTS public.campus_knowledge_pages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),university_id uuid NOT NULL REFERENCES public.campus_universities(id) ON DELETE CASCADE,
 source_id uuid NOT NULL REFERENCES public.campus_knowledge_sources(id) ON DELETE CASCADE,url text NOT NULL,
 title text NOT NULL DEFAULT '',body_text text NOT NULL CHECK(char_length(body_text)<=40000),content_hash text NOT NULL,
 status text NOT NULL DEFAULT 'published' CHECK(status IN ('published','hidden')),
 fetched_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(university_id,url)
);
ALTER TABLE public.campus_knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_knowledge_pages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campus_knowledge_sources,public.campus_knowledge_pages FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.campus_knowledge_sources,public.campus_knowledge_pages TO authenticated;
DROP POLICY IF EXISTS campus_knowledge_pages_read_same_campus ON public.campus_knowledge_pages;
CREATE POLICY campus_knowledge_pages_read_same_campus ON public.campus_knowledge_pages FOR SELECT TO authenticated
USING(EXISTS(SELECT 1 FROM public.get_my_campus_context() c WHERE c.university_id=campus_knowledge_pages.university_id AND c.membership_status='active' AND c.verification_status='verified'));
DROP POLICY IF EXISTS campus_knowledge_sources_read_same_campus ON public.campus_knowledge_sources;
CREATE POLICY campus_knowledge_sources_read_same_campus ON public.campus_knowledge_sources FOR SELECT TO authenticated
USING(EXISTS(SELECT 1 FROM public.get_my_campus_context() c WHERE c.university_id=campus_knowledge_sources.university_id AND c.membership_status='active' AND c.verification_status='verified'));

CREATE INDEX IF NOT EXISTS campus_knowledge_sources_university_id_idx ON public.campus_knowledge_sources(university_id);
CREATE INDEX IF NOT EXISTS campus_knowledge_pages_university_id_idx ON public.campus_knowledge_pages(university_id);
CREATE INDEX IF NOT EXISTS campus_knowledge_pages_source_id_idx ON public.campus_knowledge_pages(source_id);
