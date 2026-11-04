-- PRODUCTION CANDIDATE ONLY: CampusMap phase.
-- Do not move into supabase/migrations or apply before isolated schema/role tests.
-- Nullable incident additions; existing incident rows are intentionally not backfilled.
begin;
do $preflight$
declare v_target text; v_existing text[] := array[]::text[];
begin
  if to_regclass('public.profiles') is null or to_regclass('public.campus_universities') is null
     or to_regclass('public.campus_memberships') is null or to_regclass('public.incidents') is null then
    raise exception 'Required Production base tables are missing.';
  end if;
  if to_regprocedure('private.current_campus_university_id()') is null
     or to_regprocedure('private.current_campus_role()') is null
     or to_regprocedure('private.current_user_has_verified_campus_access()') is null
     or to_regprocedure('private.is_campusshield_owner_admin()') is null then
    raise exception 'Required Production role/security helpers are missing; stop for manual reconciliation.';
  end if;
  if not exists (select 1 from pg_constraint c where c.conrelid='public.campus_memberships'::regclass and c.contype='p' and pg_get_constraintdef(c.oid)='PRIMARY KEY (user_id)') then
    raise exception 'campus_memberships primary key changed; selected-campus helper assumptions are no longer valid.';
  end if;
  foreach v_target in array array['campus_map_features','campus_map_campuses','campus_map_buildings'] loop
    if to_regclass('public.'||v_target) is not null then v_existing:=array_append(v_existing,v_target); end if;
  end loop;
  if cardinality(v_existing)>0 then raise exception 'CampusMap target tables already exist; schema diff required: %',array_to_string(v_existing,', '); end if;
  if to_regclass('public.campus_institutional_billing_requests') is null
     or to_regclass('public.campus_opportunity_bookmarks') is null
     or to_regclass('public.shieldmind_payment_orders') is null then
    raise exception 'Production-only billing/payment tables changed since preflight; stop.';
  end if;
end
$preflight$;

alter table public.incidents
  add column if not exists university_id uuid,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

do $incident_fk$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.incidents'::regclass and conname='incidents_university_id_fkey') then
    alter table public.incidents add constraint incidents_university_id_fkey
      foreign key (university_id) references public.campus_universities(id) on delete set null;
  end if;
end
$incident_fk$;

-- Source migration: supabase/migrations/20261031115759_campus_map_verified_locations_and_emergency_layers.sql
-- CampusMap multi-university directory, verified location workflow and staff-only incident overlay.
-- Apply to CampusShield AI Staging first. No production database is changed.

CREATE TABLE IF NOT EXISTS public.campus_map_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL REFERENCES public.campus_universities(id) ON DELETE CASCADE,
  campus_name text NOT NULL DEFAULT 'Main Campus' CHECK (char_length(btrim(campus_name)) BETWEEN 2 AND 120),
  campus_slug text NOT NULL DEFAULT 'main-campus' CHECK (campus_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  feature_type text NOT NULL CHECK (feature_type IN ('building','lecture_hall','hostel','library','cafeteria','medical','security','gate','parking','sports','facility','assembly_point','accessible_entry','emergency_point')),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 180),
  description text CHECK (description IS NULL OR char_length(description) <= 1000),
  latitude double precision CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude double precision CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  source_url text,
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','rejected')),
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  is_published boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campus_map_feature_coordinate_pair CHECK ((latitude IS NULL) = (longitude IS NULL)),
  CONSTRAINT campus_map_feature_publish_gate CHECK (NOT is_published OR (verification_status='verified' AND latitude IS NOT NULL AND longitude IS NOT NULL AND source_url IS NOT NULL)),
  CONSTRAINT campus_map_feature_verified_evidence CHECK (verification_status <> 'verified' OR (latitude IS NOT NULL AND longitude IS NOT NULL AND source_url IS NOT NULL AND verified_by IS NOT NULL))
);

ALTER TABLE public.campus_map_features
  ADD COLUMN IF NOT EXISTS campus_name text NOT NULL DEFAULT 'Main Campus',
  ADD COLUMN IF NOT EXISTS campus_slug text NOT NULL DEFAULT 'main-campus',
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

ALTER TABLE public.campus_map_features ALTER COLUMN latitude DROP NOT NULL, ALTER COLUMN longitude DROP NOT NULL;
ALTER TABLE public.campus_map_features
  DROP CONSTRAINT IF EXISTS campus_map_feature_coordinate_pair,
  ADD CONSTRAINT campus_map_feature_coordinate_pair CHECK ((latitude IS NULL) = (longitude IS NULL)),
  DROP CONSTRAINT IF EXISTS campus_map_feature_publish_gate,
  ADD CONSTRAINT campus_map_feature_publish_gate CHECK (NOT is_published OR (verification_status='verified' AND latitude IS NOT NULL AND longitude IS NOT NULL AND source_url IS NOT NULL)),
  DROP CONSTRAINT IF EXISTS campus_map_feature_verified_evidence,
  ADD CONSTRAINT campus_map_feature_verified_evidence CHECK (verification_status <> 'verified' OR (latitude IS NOT NULL AND longitude IS NOT NULL AND source_url IS NOT NULL AND verified_by IS NOT NULL)),
  DROP CONSTRAINT IF EXISTS campus_map_features_feature_type_check,
  DROP CONSTRAINT IF EXISTS campus_map_features_verification_status_check,
  ADD CONSTRAINT campus_map_features_verification_status_check CHECK (verification_status IN ('pending','verified','rejected')),
  DROP CONSTRAINT IF EXISTS campus_map_features_campus_slug_check,
  ADD CONSTRAINT campus_map_features_campus_slug_check CHECK (campus_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  DROP CONSTRAINT IF EXISTS campus_map_features_campus_name_check,
  ADD CONSTRAINT campus_map_features_campus_name_check CHECK (char_length(btrim(campus_name)) BETWEEN 2 AND 120),
  ADD CONSTRAINT campus_map_features_feature_type_check CHECK (feature_type IN ('building','lecture_hall','hostel','library','cafeteria','medical','security','gate','parking','sports','facility','assembly_point','accessible_entry','emergency_point'));

CREATE INDEX IF NOT EXISTS campus_map_features_university_campus_published_idx ON public.campus_map_features(university_id,campus_slug,is_published,feature_type);
CREATE INDEX IF NOT EXISTS campus_map_features_university_verification_idx ON public.campus_map_features(university_id,verification_status,updated_at DESC);

ALTER TABLE public.campus_map_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_map_features FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS campus_map_features_read_published ON public.campus_map_features;
CREATE POLICY campus_map_features_read_published ON public.campus_map_features FOR SELECT TO anon,authenticated
USING (
  is_published = true OR (
    university_id = (SELECT private.current_campus_university_id())
    AND (SELECT private.current_campus_role()) = 'admin'
    AND (SELECT private.current_user_has_verified_campus_access())
  )
);
REVOKE ALL ON public.campus_map_features FROM anon,authenticated;
GRANT SELECT ON public.campus_map_features TO anon,authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.manage_campus_map_feature_impl(
 p_feature_id uuid,p_campus_name text,p_campus_slug text,p_feature_type text,p_name text,p_description text,
 p_latitude double precision,p_longitude double precision,p_source_url text,p_mark_verified boolean,p_publish boolean
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
 v_uid uuid := (SELECT auth.uid());
 v_university_id uuid;
 v_id uuid;
 v_verified boolean := COALESCE(p_mark_verified,false);
 v_publish boolean := COALESCE(p_publish,false);
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in is required.'; END IF;
 SELECT cm.university_id INTO v_university_id
 FROM public.campus_memberships cm JOIN public.profiles p ON p.id=cm.user_id
 WHERE cm.user_id=v_uid AND cm.campus_role='admin' AND cm.membership_status='active'
 AND cm.verification_status='verified' AND p.role='admin' AND p.verification_status='verified' LIMIT 1;
 IF v_university_id IS NULL THEN RAISE EXCEPTION 'A verified campus administrator is required to manage map locations.'; END IF;
 IF char_length(btrim(COALESCE(p_campus_name,''))) NOT BETWEEN 2 AND 120 OR COALESCE(p_campus_slug,'') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
   RAISE EXCEPTION 'Choose a valid campus name and campus identifier.';
 END IF;
 IF char_length(btrim(COALESCE(p_name,''))) NOT BETWEEN 2 AND 180 THEN RAISE EXCEPTION 'Location name must be between 2 and 180 characters.'; END IF;
 IF COALESCE(p_feature_type,'') NOT IN ('building','lecture_hall','hostel','library','cafeteria','medical','security','gate','parking','sports','facility','assembly_point','accessible_entry','emergency_point') THEN
   RAISE EXCEPTION 'Choose a supported campus location category.';
 END IF;
 IF (p_latitude IS NULL) <> (p_longitude IS NULL) THEN RAISE EXCEPTION 'Enter both latitude and longitude, or leave both blank.'; END IF;
 IF p_latitude IS NOT NULL AND (p_latitude NOT BETWEEN -90 AND 90 OR p_longitude NOT BETWEEN -180 AND 180) THEN RAISE EXCEPTION 'Coordinates are outside valid geographic ranges.'; END IF;
 IF p_source_url IS NOT NULL AND p_source_url !~ '^https://[^[:space:]]+$' THEN RAISE EXCEPTION 'Evidence source must be an HTTPS URL.'; END IF;
 IF v_verified AND (p_latitude IS NULL OR p_source_url IS NULL) THEN RAISE EXCEPTION 'To verify a map point, provide coordinates and an HTTPS evidence source.'; END IF;
 IF v_publish AND NOT v_verified THEN RAISE EXCEPTION 'Verify the location before publishing it to students.'; END IF;

 IF p_feature_id IS NOT NULL THEN
  UPDATE public.campus_map_features SET campus_name=btrim(p_campus_name),campus_slug=p_campus_slug,
   feature_type=p_feature_type,name=btrim(p_name),description=NULLIF(btrim(COALESCE(p_description,'')),''),
   latitude=p_latitude,longitude=p_longitude,source_url=p_source_url,
   verification_status=CASE WHEN v_verified THEN 'verified' ELSE 'pending' END,
   verified_by=CASE WHEN v_verified THEN v_uid ELSE NULL END,
   verified_at=CASE WHEN v_verified THEN now() ELSE NULL END,is_published=v_publish,updated_at=now()
  WHERE id=p_feature_id AND university_id=v_university_id RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'This map location does not belong to your university.'; END IF;
 ELSE
  INSERT INTO public.campus_map_features(university_id,campus_name,campus_slug,feature_type,name,description,latitude,longitude,source_url,verification_status,verified_by,verified_at,is_published)
  VALUES(v_university_id,btrim(p_campus_name),p_campus_slug,p_feature_type,btrim(p_name),NULLIF(btrim(COALESCE(p_description,'')),''),
   p_latitude,p_longitude,p_source_url,CASE WHEN v_verified THEN 'verified' ELSE 'pending' END,
   CASE WHEN v_verified THEN v_uid ELSE NULL END,CASE WHEN v_verified THEN now() ELSE NULL END,v_publish)
  RETURNING id INTO v_id;
 END IF;
 RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION private.manage_campus_map_feature_impl(uuid,text,text,text,text,text,double precision,double precision,text,boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.manage_campus_map_feature_impl(uuid,text,text,text,text,text,double precision,double precision,text,boolean,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.manage_campus_map_feature(
 p_feature_id uuid DEFAULT NULL,p_campus_name text DEFAULT 'Main Campus',p_campus_slug text DEFAULT 'main-campus',
 p_feature_type text DEFAULT 'building',p_name text DEFAULT NULL,p_description text DEFAULT NULL,
 p_latitude double precision DEFAULT NULL,p_longitude double precision DEFAULT NULL,p_source_url text DEFAULT NULL,
 p_mark_verified boolean DEFAULT false,p_publish boolean DEFAULT false
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $wrapper$
 SELECT private.manage_campus_map_feature_impl(p_feature_id,p_campus_name,p_campus_slug,p_feature_type,p_name,p_description,p_latitude,p_longitude,p_source_url,p_mark_verified,p_publish);
$wrapper$;
REVOKE ALL ON FUNCTION public.manage_campus_map_feature(uuid,text,text,text,text,text,double precision,double precision,text,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manage_campus_map_feature(uuid,text,text,text,text,text,double precision,double precision,text,boolean,boolean) TO authenticated;

ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS latitude double precision, ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE public.incidents
 DROP CONSTRAINT IF EXISTS incidents_coordinate_pair,
 ADD CONSTRAINT incidents_coordinate_pair CHECK ((latitude IS NULL) = (longitude IS NULL)),
 DROP CONSTRAINT IF EXISTS incidents_coordinate_range,
 ADD CONSTRAINT incidents_coordinate_range CHECK ((latitude IS NULL OR latitude BETWEEN -90 AND 90) AND (longitude IS NULL OR longitude BETWEEN -180 AND 180));
CREATE INDEX IF NOT EXISTS incidents_campus_map_coordinates_idx ON public.incidents(university_id,created_at DESC) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Official Babcock place names are seeded as pending/unpublished drafts with no guessed coordinates.
INSERT INTO public.campus_map_features(university_id,campus_name,campus_slug,feature_type,name,description,source_url,verification_status,is_published,metadata)
SELECT u.id,s.campus_name,s.campus_slug,s.feature_type,s.name,s.description,s.source_url,'pending',false,s.metadata
FROM public.campus_universities u
CROSS JOIN (VALUES
 ('Main Campus','main-campus','gate','University Gate','Main campus arrival point; administrator must confirm exact pin.','https://www.babcock.edu.ng/new-students-info','{}'::jsonb),
 ('Main Campus','main-campus','hostel','Hall of Residence','Confirm the specific hall name and pin before publishing.','https://www.babcock.edu.ng/new-students-info','{}'::jsonb),
 ('Main Campus','main-campus','facility','Amphitheatre','Official arrival and orientation location.','https://www.babcock.edu.ng/new-students-info','{}'::jsonb),
 ('Main Campus','main-campus','sports','University Stadium','Official student arrival and credential-verification location.','https://www.babcock.edu.ng/new-students-info','{}'::jsonb),
 ('Main Campus','main-campus','facility','Registry','Arrival verification office; exact map pin requires campus confirmation.','https://www.babcock.edu.ng/new-students-info','{}'::jsonb),
 ('Main Campus','main-campus','medical','Babcock University Teaching Hospital','Official hospital listing; administrator must confirm the exact campus entrance pin.','https://buth.babcock.edu.ng/emergency-services/','{"emergency_phone":"+2348118918368"}'::jsonb),
 ('Main Campus','main-campus','facility','Student Development','Official student services location; exact pin requires campus confirmation.','https://www.babcock.edu.ng/new-students-info','{}'::jsonb),
 ('Main Campus','main-campus','library','Laz Otti Memorial Library','Official library page identifies the central library opposite BUCODEL.','https://www.babcock.edu.ng/library','{}'::jsonb),
 ('Iperu Campus','iperu-campus','gate','Law & Security Studies Gate','Iperu campus arrival gate; keep separate from the main-campus map.','https://www.babcock.edu.ng/new-students-info','{}'::jsonb),
 ('Iperu Campus','iperu-campus','facility','Canopy 1 / Open Field','Official Iperu arrival point; exact pin requires campus confirmation.','https://www.babcock.edu.ng/new-students-info','{}'::jsonb),
 ('Iperu Campus','iperu-campus','facility','Christ Our Foundation','Official Iperu arrival and orientation location.','https://www.babcock.edu.ng/new-students-info','{}'::jsonb),
 ('Iperu Campus','iperu-campus','sports','Indoor Sports Facility','Official Iperu credential-verification location.','https://www.babcock.edu.ng/new-students-info','{}'::jsonb)
) AS s(campus_name,campus_slug,feature_type,name,description,source_url,metadata)
WHERE u.slug='babcock-university' AND NOT EXISTS (
 SELECT 1 FROM public.campus_map_features e WHERE e.university_id=u.id AND e.campus_slug=s.campus_slug AND lower(e.name)=lower(s.name)
);


-- Source migration: supabase/migrations/20261031115831_campus_map_public_read_policy_split.sql
DROP POLICY IF EXISTS campus_map_features_read_published ON public.campus_map_features;

-- Anonymous and signed-in users may read only published locations.
CREATE POLICY campus_map_features_read_published
  ON public.campus_map_features
  FOR SELECT TO anon, authenticated
  USING (is_published = true);

-- Only verified administrators can additionally read unpublished drafts for their own university.
CREATE POLICY campus_map_features_read_admin_drafts
  ON public.campus_map_features
  FOR SELECT TO authenticated
  USING (
    university_id = (SELECT private.current_campus_university_id())
    AND (SELECT private.current_campus_role()) = 'admin'
    AND (SELECT private.current_user_has_verified_campus_access())
  );


-- Source migration: supabase/migrations/20261031120234_campus_map_single_read_policy_and_audit_index.sql
CREATE OR REPLACE FUNCTION public.can_read_campus_map_drafts(p_university_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  -- Anonymous requests never enter the private membership helpers.
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN false;
  END IF;

  RETURN p_university_id = (SELECT private.current_campus_university_id())
    AND (SELECT private.current_campus_role()) = 'admin'
    AND (SELECT private.current_user_has_verified_campus_access());
END;
$function$;

REVOKE ALL ON FUNCTION public.can_read_campus_map_drafts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_campus_map_drafts(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS campus_map_features_read_admin_drafts ON public.campus_map_features;
DROP POLICY IF EXISTS campus_map_features_read_published ON public.campus_map_features;

-- One policy avoids overlapping permissive SELECT policies while retaining the same access boundary.
CREATE POLICY campus_map_features_read_published
  ON public.campus_map_features
  FOR SELECT TO anon, authenticated
  USING (is_published = true OR public.can_read_campus_map_drafts(university_id));

CREATE INDEX IF NOT EXISTS campus_map_features_verified_by_idx
  ON public.campus_map_features(verified_by)
  WHERE verified_by IS NOT NULL;


-- Source migration: supabase/migrations/20261031134221_campus_map_university_profiles_and_centres.sql
-- Multi-university campus map profiles, coverage tracking and verified campus-centre workflow.
-- Seeded from the active official NUC university directory already imported into Staging.
-- No building coordinates or boundaries are fabricated. Only Babcock's official campus locator is prefilled.

CREATE TABLE IF NOT EXISTS public.campus_map_campuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL REFERENCES public.campus_universities(id) ON DELETE CASCADE,
  campus_name text NOT NULL,
  campus_slug text NOT NULL,
  state text NOT NULL,
  location_hint text,
  official_website text,
  directory_source_url text NOT NULL DEFAULT 'https://enuc.nuc.edu.ng/nus',
  center_latitude double precision,
  center_longitude double precision,
  center_source_url text,
  center_status text NOT NULL DEFAULT 'missing'
    CHECK (center_status IN ('missing','candidate','official_locator','verified')),
  center_verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  center_verified_at timestamptz,
  boundary_geojson jsonb,
  boundary_source_url text,
  boundary_status text NOT NULL DEFAULT 'missing'
    CHECK (boundary_status IN ('missing','candidate','verified')),
  boundary_verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  boundary_verified_at timestamptz,
  building_data_provider text NOT NULL DEFAULT 'openfreemap-openmaptiles',
  building_coverage_status text NOT NULL DEFAULT 'unassessed'
    CHECK (building_coverage_status IN ('unassessed','none','partial','candidate','verified')),
  model_storage_path text,
  model_format text CHECK (model_format IS NULL OR model_format IN ('glb','gltf','3dtiles')),
  model_source_url text,
  model_attribution text,
  model_status text NOT NULL DEFAULT 'not_submitted'
    CHECK (model_status IN ('not_submitted','pending_review','approved','rejected')),
  is_active boolean NOT NULL DEFAULT true,
  model_verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  model_verified_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campus_map_campuses_unique_slug UNIQUE (university_id, campus_slug),
  CONSTRAINT campus_map_campuses_slug_format CHECK (campus_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT campus_map_campuses_name_length CHECK (char_length(btrim(campus_name)) BETWEEN 2 AND 120),
  CONSTRAINT campus_map_campuses_coordinate_pair CHECK ((center_latitude IS NULL) = (center_longitude IS NULL)),
  CONSTRAINT campus_map_campuses_coordinate_range CHECK (
    center_latitude IS NULL OR
    (center_latitude BETWEEN -90 AND 90 AND center_longitude BETWEEN -180 AND 180)
  ),
  CONSTRAINT campus_map_campuses_center_evidence CHECK (
    center_status = 'missing' OR
    (center_latitude IS NOT NULL AND center_longitude IS NOT NULL AND center_source_url ~ '^https://[^[:space:]]+$')
  ),
  CONSTRAINT campus_map_campuses_boundary_geojson_type CHECK (
    boundary_geojson IS NULL OR
    (jsonb_typeof(boundary_geojson) = 'object'
      AND boundary_geojson->>'type' IN ('Polygon','MultiPolygon'))
  ),
  CONSTRAINT campus_map_campuses_boundary_evidence CHECK (
    boundary_status = 'missing' OR
    (boundary_geojson IS NOT NULL AND boundary_source_url ~ '^https://[^[:space:]]+$')
  )
);

CREATE INDEX IF NOT EXISTS campus_map_campuses_university_idx
  ON public.campus_map_campuses(university_id, is_active) WHERE is_active;
CREATE INDEX IF NOT EXISTS campus_map_campuses_state_idx
  ON public.campus_map_campuses(state);

ALTER TABLE public.campus_map_campuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_map_campuses FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.campus_map_campuses FROM anon, authenticated;
GRANT SELECT ON public.campus_map_campuses TO authenticated;

DROP POLICY IF EXISTS campus_map_campuses_member_read ON public.campus_map_campuses;
CREATE POLICY campus_map_campuses_member_read
ON public.campus_map_campuses
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.campus_memberships cm
    WHERE cm.user_id = (SELECT auth.uid())
      AND cm.university_id = campus_map_campuses.university_id
      AND cm.membership_status = 'active'
  )
  OR (SELECT private.is_campusshield_owner_admin())
);

-- Provision one Main Campus profile for every active university in the NUC directory.
-- Coordinates stay empty until a reliable campus-level source is recorded.
INSERT INTO public.campus_map_campuses (
  university_id, campus_name, campus_slug, state, official_website,
  directory_source_url, center_latitude, center_longitude, center_source_url,
  center_status, metadata
)
SELECT
  u.id,
  'Main Campus',
  'main-campus',
  u.state,
  u.official_website,
  COALESCE(NULLIF(u.source_url,''), 'https://enuc.nuc.edu.ng/nus'),
  CASE WHEN u.slug = 'babcock-university' THEN 6.8910932 END,
  CASE WHEN u.slug = 'babcock-university' THEN 3.7191259 END,
  CASE WHEN u.slug = 'babcock-university' THEN 'https://babcock.edu.ng/contact' END,
  CASE WHEN u.slug = 'babcock-university' THEN 'official_locator' ELSE 'missing' END,
  jsonb_build_object(
    'directory_provider','National Universities Commission Nigerian University System',
    'directory_verified_at','2026-10-31',
    'regional_preview_only',true
  )
FROM public.campus_universities u
WHERE u.is_active = true
ON CONFLICT (university_id, campus_slug) DO NOTHING;

-- Babcock's Iperu site is a distinct campus, not a second university.
INSERT INTO public.campus_map_campuses (
  university_id, campus_name, campus_slug, state, official_website,
  directory_source_url, metadata
)
SELECT
  u.id, 'Iperu Campus', 'iperu-campus', u.state, u.official_website,
  COALESCE(NULLIF(u.source_url,''), 'https://enuc.nuc.edu.ng/nus'),
  jsonb_build_object('regional_preview_only',true,'campus_origin','existing-campus-directory')
FROM public.campus_universities u
WHERE u.slug = 'babcock-university' AND u.is_active = true
ON CONFLICT (university_id, campus_slug) DO NOTHING;

CREATE OR REPLACE FUNCTION private.manage_campus_map_campus_impl(
  p_campus_id uuid,
  p_campus_name text,
  p_campus_slug text,
  p_state text,
  p_location_hint text,
  p_center_latitude double precision,
  p_center_longitude double precision,
  p_center_source_url text,
  p_center_status text,
  p_boundary_geojson jsonb,
  p_boundary_source_url text,
  p_boundary_status text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_university_id uuid;
  v_id uuid;
  v_center_status text := COALESCE(p_center_status,'missing');
  v_boundary_status text := COALESCE(p_boundary_status,'missing');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in is required.'; END IF;

  SELECT cm.university_id INTO v_university_id
  FROM public.campus_memberships cm
  JOIN public.profiles p ON p.id=cm.user_id
  WHERE cm.user_id=v_uid
    AND cm.campus_role='admin'
    AND cm.membership_status='active'
    AND cm.verification_status='verified'
    AND p.role='admin'
    AND p.verification_status='verified'
  LIMIT 1;

  IF v_university_id IS NULL THEN
    RAISE EXCEPTION 'A verified campus administrator is required to update campus map setup.';
  END IF;
  IF char_length(btrim(COALESCE(p_campus_name,''))) NOT BETWEEN 2 AND 120
     OR COALESCE(p_campus_slug,'') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'Enter a valid campus name and identifier.';
  END IF;
  IF char_length(btrim(COALESCE(p_state,''))) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Choose a valid state.';
  END IF;
  IF (p_center_latitude IS NULL) <> (p_center_longitude IS NULL) THEN
    RAISE EXCEPTION 'Enter both centre coordinates, or leave both blank.';
  END IF;
  IF p_center_latitude IS NOT NULL AND
     (p_center_latitude NOT BETWEEN -90 AND 90 OR p_center_longitude NOT BETWEEN -180 AND 180) THEN
    RAISE EXCEPTION 'Campus centre coordinates are outside valid geographic ranges.';
  END IF;
  IF v_center_status NOT IN ('missing','candidate','official_locator','verified') THEN
    RAISE EXCEPTION 'Unsupported campus-centre status.';
  END IF;
  IF v_center_status <> 'missing' AND
     (p_center_latitude IS NULL OR COALESCE(p_center_source_url,'') !~ '^https://[^[:space:]]+$') THEN
    RAISE EXCEPTION 'A campus-centre candidate needs coordinates and its source URL.';
  END IF;
  IF p_center_source_url IS NOT NULL AND p_center_source_url !~ '^https://[^[:space:]]+$' THEN
    RAISE EXCEPTION 'Campus-centre source must be an HTTPS URL.';
  END IF;
  IF v_boundary_status NOT IN ('missing','candidate','verified') THEN
    RAISE EXCEPTION 'Unsupported campus-boundary status.';
  END IF;
  IF v_boundary_status <> 'missing' AND
     (p_boundary_geojson IS NULL OR jsonb_typeof(p_boundary_geojson) <> 'object'
      OR p_boundary_geojson->>'type' NOT IN ('Polygon','MultiPolygon')
      OR COALESCE(p_boundary_source_url,'') !~ '^https://[^[:space:]]+$') THEN
    RAISE EXCEPTION 'A campus boundary candidate needs a Polygon/MultiPolygon GeoJSON and its HTTPS source.';
  END IF;
  IF p_boundary_source_url IS NOT NULL AND p_boundary_source_url !~ '^https://[^[:space:]]+$' THEN
    RAISE EXCEPTION 'Campus-boundary source must be an HTTPS URL.';
  END IF;

  IF p_campus_id IS NOT NULL THEN
    UPDATE public.campus_map_campuses
    SET campus_name=btrim(p_campus_name),
        campus_slug=p_campus_slug,
        state=btrim(p_state),
        location_hint=NULLIF(btrim(COALESCE(p_location_hint,'')),''),
        center_latitude=p_center_latitude,
        center_longitude=p_center_longitude,
        center_source_url=p_center_source_url,
        center_status=v_center_status,
        center_verified_by=CASE WHEN v_center_status='verified' THEN v_uid ELSE NULL END,
        center_verified_at=CASE WHEN v_center_status='verified' THEN now() ELSE NULL END,
        boundary_geojson=p_boundary_geojson,
        boundary_source_url=p_boundary_source_url,
        boundary_status=v_boundary_status,
        boundary_verified_by=CASE WHEN v_boundary_status='verified' THEN v_uid ELSE NULL END,
        boundary_verified_at=CASE WHEN v_boundary_status='verified' THEN now() ELSE NULL END,
        updated_at=now()
    WHERE id=p_campus_id AND university_id=v_university_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'This campus profile does not belong to your university.'; END IF;
  ELSE
    INSERT INTO public.campus_map_campuses (
      university_id,campus_name,campus_slug,state,location_hint,
      center_latitude,center_longitude,center_source_url,center_status,
      center_verified_by,center_verified_at,boundary_geojson,boundary_source_url,
      boundary_status,boundary_verified_by,boundary_verified_at
    )
    VALUES (
      v_university_id,btrim(p_campus_name),p_campus_slug,btrim(p_state),
      NULLIF(btrim(COALESCE(p_location_hint,'')),''),
      p_center_latitude,p_center_longitude,p_center_source_url,v_center_status,
      CASE WHEN v_center_status='verified' THEN v_uid ELSE NULL END,
      CASE WHEN v_center_status='verified' THEN now() ELSE NULL END,
      p_boundary_geojson,p_boundary_source_url,v_boundary_status,
      CASE WHEN v_boundary_status='verified' THEN v_uid ELSE NULL END,
      CASE WHEN v_boundary_status='verified' THEN now() ELSE NULL END
    )
    ON CONFLICT (university_id,campus_slug)
    DO UPDATE SET
      campus_name=EXCLUDED.campus_name,
      state=EXCLUDED.state,
      location_hint=EXCLUDED.location_hint,
      center_latitude=EXCLUDED.center_latitude,
      center_longitude=EXCLUDED.center_longitude,
      center_source_url=EXCLUDED.center_source_url,
      center_status=EXCLUDED.center_status,
      center_verified_by=EXCLUDED.center_verified_by,
      center_verified_at=EXCLUDED.center_verified_at,
      boundary_geojson=EXCLUDED.boundary_geojson,
      boundary_source_url=EXCLUDED.boundary_source_url,
      boundary_status=EXCLUDED.boundary_status,
      boundary_verified_by=EXCLUDED.boundary_verified_by,
      boundary_verified_at=EXCLUDED.boundary_verified_at,
      updated_at=now()
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION private.manage_campus_map_campus_impl(
  uuid,text,text,text,text,double precision,double precision,text,text,jsonb,text,text
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.manage_campus_map_campus(
  p_campus_id uuid DEFAULT NULL,
  p_campus_name text DEFAULT 'Main Campus',
  p_campus_slug text DEFAULT 'main-campus',
  p_state text DEFAULT NULL,
  p_location_hint text DEFAULT NULL,
  p_center_latitude double precision DEFAULT NULL,
  p_center_longitude double precision DEFAULT NULL,
  p_center_source_url text DEFAULT NULL,
  p_center_status text DEFAULT 'missing',
  p_boundary_geojson jsonb DEFAULT NULL,
  p_boundary_source_url text DEFAULT NULL,
  p_boundary_status text DEFAULT 'missing'
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT private.manage_campus_map_campus_impl(
    p_campus_id,p_campus_name,p_campus_slug,p_state,p_location_hint,
    p_center_latitude,p_center_longitude,p_center_source_url,p_center_status,
    p_boundary_geojson,p_boundary_source_url,p_boundary_status
  );
$function$;

REVOKE ALL ON FUNCTION public.manage_campus_map_campus(
  uuid,text,text,text,text,double precision,double precision,text,text,jsonb,text,text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_campus_map_campus(
  uuid,text,text,text,text,double precision,double precision,text,text,jsonb,text,text
) TO authenticated;


-- Source migration: supabase/migrations/20261031134823_grant_verified_campus_map_profile_rpc.sql
-- Same permission grant as applied in Staging.
-- The target function validates the signed-in verified campus administrator internally.
GRANT EXECUTE ON FUNCTION private.manage_campus_map_campus_impl(uuid,text,text,text,text,double precision,double precision,text,text,jsonb,text,text) TO authenticated;


-- Source migration: supabase/migrations/20261031142127_campus_map_building_footprint_import_pipeline.sql
-- University-scoped building footprint import and review pipeline.
-- OSM footprints are imported as candidates and stay admin-only until local verification.
-- No imported geometry is published automatically.

-- Intentionally omitted Staging-only FCT state normalization; no existing directory rows are changed.

CREATE TABLE IF NOT EXISTS public.campus_map_buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL REFERENCES public.campus_universities(id) ON DELETE CASCADE,
  campus_id uuid NOT NULL REFERENCES public.campus_map_campuses(id) ON DELETE CASCADE,
  campus_slug text NOT NULL,
  source_provider text NOT NULL DEFAULT 'openstreetmap'
    CHECK (source_provider IN ('openstreetmap','overture','university_survey','manual')),
  source_feature_id text NOT NULL,
  name text,
  building_class text,
  geometry_geojson jsonb NOT NULL,
  center_latitude double precision NOT NULL,
  center_longitude double precision NOT NULL,
  height_m numeric,
  min_height_m numeric,
  levels integer,
  roof_shape text,
  roof_material text,
  roof_colour text,
  facade_material text,
  facade_colour text,
  source_url text NOT NULL,
  source_license text NOT NULL DEFAULT 'ODbL-1.0',
  verification_evidence_url text,
  verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending','verified','rejected')),
  is_published boolean NOT NULL DEFAULT false,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campus_map_buildings_unique_source
    UNIQUE (university_id,campus_id,source_provider,source_feature_id),
  CONSTRAINT campus_map_buildings_geometry_type
    CHECK (
      jsonb_typeof(geometry_geojson) = 'object'
      AND geometry_geojson->>'type' IN ('Polygon','MultiPolygon')
      AND jsonb_typeof(geometry_geojson->'coordinates') = 'array'
    ),
  CONSTRAINT campus_map_buildings_centre_pair
    CHECK (center_latitude BETWEEN -90 AND 90 AND center_longitude BETWEEN -180 AND 180),
  CONSTRAINT campus_map_buildings_height_range
    CHECK ((height_m IS NULL OR height_m BETWEEN 0.5 AND 300)
       AND (min_height_m IS NULL OR min_height_m BETWEEN 0 AND 300)
       AND (height_m IS NULL OR min_height_m IS NULL OR min_height_m < height_m)),
  CONSTRAINT campus_map_buildings_levels_range
    CHECK (levels IS NULL OR levels BETWEEN 1 AND 200),
  CONSTRAINT campus_map_buildings_name_length
    CHECK (name IS NULL OR char_length(btrim(name)) <= 180),
  CONSTRAINT campus_map_buildings_source_url
    CHECK (source_url ~ '^https://[^[:space:]]+$'),
  CONSTRAINT campus_map_buildings_evidence_url
    CHECK (verification_evidence_url IS NULL OR verification_evidence_url ~ '^https://[^[:space:]]+$'),
  CONSTRAINT campus_map_buildings_verified_evidence
    CHECK (
      verification_status <> 'verified'
      OR (verification_evidence_url IS NOT NULL AND verified_by IS NOT NULL AND verified_at IS NOT NULL)
    ),
  CONSTRAINT campus_map_buildings_publish_gate
    CHECK (
      NOT is_published
      OR (verification_status = 'verified' AND verification_evidence_url IS NOT NULL AND verified_by IS NOT NULL)
    ),
  CONSTRAINT campus_map_buildings_metadata_object
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS campus_map_buildings_university_campus_idx
  ON public.campus_map_buildings(university_id,campus_id,verification_status);
CREATE INDEX IF NOT EXISTS campus_map_buildings_published_idx
  ON public.campus_map_buildings(university_id,campus_id)
  WHERE is_published AND verification_status='verified';

ALTER TABLE public.campus_map_buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_map_buildings FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.campus_map_buildings FROM anon,authenticated;
GRANT SELECT ON public.campus_map_buildings TO anon,authenticated;

DROP POLICY IF EXISTS campus_map_buildings_scoped_read ON public.campus_map_buildings;
CREATE POLICY campus_map_buildings_scoped_read
ON public.campus_map_buildings
FOR SELECT TO anon,authenticated
USING (
  (is_published AND verification_status='verified')
  OR (SELECT public.can_read_campus_map_drafts(university_id))
);

CREATE OR REPLACE FUNCTION private.import_campus_map_building_candidates_impl(
  p_campus_id uuid,
  p_buildings jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_university_id uuid;
  v_record jsonb;
  v_geometry jsonb;
  v_source_id text;
  v_source_url text;
  v_lat double precision;
  v_lon double precision;
  v_height numeric;
  v_min_height numeric;
  v_levels integer;
  v_rows integer;
  v_imported integer := 0;
  v_received integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in is required.';
  END IF;

  SELECT c.university_id INTO v_university_id
  FROM public.campus_map_campuses c
  JOIN public.campus_memberships cm ON cm.university_id=c.university_id
  JOIN public.profiles p ON p.id=cm.user_id
  WHERE c.id=p_campus_id
    AND c.is_active=true
    AND cm.user_id=v_uid
    AND cm.campus_role='admin'
    AND cm.membership_status='active'
    AND cm.verification_status='verified'
    AND p.role='admin'
    AND p.verification_status='verified'
  LIMIT 1;

  IF v_university_id IS NULL THEN
    RAISE EXCEPTION 'A verified campus administrator for this university is required.';
  END IF;
  IF jsonb_typeof(p_buildings) <> 'array' THEN
    RAISE EXCEPTION 'Building import payload must be an array.';
  END IF;
  v_received := jsonb_array_length(p_buildings);
  IF v_received < 1 OR v_received > 300 THEN
    RAISE EXCEPTION 'Import between 1 and 300 building candidates per request.';
  END IF;

  FOR v_record IN SELECT value FROM jsonb_array_elements(p_buildings)
  LOOP
    v_source_id := btrim(COALESCE(v_record->>'source_feature_id',''));
    v_source_url := btrim(COALESCE(v_record->>'source_url',''));
    v_geometry := v_record->'geometry_geojson';
    v_lat := NULLIF(v_record->>'center_latitude','')::double precision;
    v_lon := NULLIF(v_record->>'center_longitude','')::double precision;
    v_height := NULLIF(v_record->>'height_m','')::numeric;
    v_min_height := NULLIF(v_record->>'min_height_m','')::numeric;
    v_levels := NULLIF(v_record->>'levels','')::integer;

    IF v_source_id !~ '^[0-9]{1,20}$'
       OR v_source_url <> 'https://www.openstreetmap.org/way/' || v_source_id THEN
      RAISE EXCEPTION 'Building import contains an invalid OpenStreetMap way identifier or source URL.';
    END IF;
    IF jsonb_typeof(v_geometry) <> 'object'
       OR v_geometry->>'type' <> 'Polygon'
       OR jsonb_typeof(v_geometry->'coordinates') <> 'array'
       OR jsonb_array_length(v_geometry->'coordinates') < 1 THEN
      RAISE EXCEPTION 'Building % must have a valid GeoJSON Polygon outline.', v_source_id;
    END IF;
    IF jsonb_typeof(v_geometry->'coordinates'->0) <> 'array'
       OR jsonb_array_length(v_geometry->'coordinates'->0) < 4
       OR jsonb_array_length(v_geometry->'coordinates'->0) > 2000 THEN
      RAISE EXCEPTION 'Building % has an invalid or excessively complex outer ring.', v_source_id;
    END IF;
    IF v_lat IS NULL OR v_lon IS NULL
       OR v_lat NOT BETWEEN -90 AND 90 OR v_lon NOT BETWEEN -180 AND 180 THEN
      RAISE EXCEPTION 'Building % has invalid centre coordinates.', v_source_id;
    END IF;
    IF v_height IS NOT NULL AND v_height NOT BETWEEN 0.5 AND 300 THEN
      RAISE EXCEPTION 'Building % has an invalid height.', v_source_id;
    END IF;
    IF v_min_height IS NOT NULL AND v_min_height NOT BETWEEN 0 AND 300 THEN
      RAISE EXCEPTION 'Building % has an invalid minimum height.', v_source_id;
    END IF;
    IF v_levels IS NOT NULL AND v_levels NOT BETWEEN 1 AND 200 THEN
      RAISE EXCEPTION 'Building % has an invalid floor count.', v_source_id;
    END IF;

    INSERT INTO public.campus_map_buildings (
      university_id,campus_id,campus_slug,source_provider,source_feature_id,
      name,building_class,geometry_geojson,center_latitude,center_longitude,
      height_m,min_height_m,levels,roof_shape,roof_material,roof_colour,
      facade_material,facade_colour,source_url,source_license,
      verification_status,is_published,metadata
    )
    SELECT
      v_university_id,c.id,c.campus_slug,'openstreetmap',v_source_id,
      NULLIF(btrim(COALESCE(v_record->>'name','')),''),
      NULLIF(btrim(COALESCE(v_record->>'building_class','')),''),
      v_geometry,v_lat,v_lon,v_height,v_min_height,v_levels,
      NULLIF(v_record->>'roof_shape',''),
      NULLIF(v_record->>'roof_material',''),
      NULLIF(v_record->>'roof_colour',''),
      NULLIF(v_record->>'facade_material',''),
      NULLIF(v_record->>'facade_colour',''),
      v_source_url,'ODbL-1.0','pending',false,
      jsonb_build_object(
        'source_tags',COALESCE(v_record->'source_tags','{}'::jsonb),
        'import_method','OpenStreetMap Overpass API',
        'height_method',COALESCE(v_record->>'height_method','unknown'),
        'imported_at',now()
      )
    FROM public.campus_map_campuses c
    WHERE c.id=p_campus_id AND c.university_id=v_university_id
    ON CONFLICT (university_id,campus_id,source_provider,source_feature_id)
    DO UPDATE SET
      name=EXCLUDED.name,
      building_class=EXCLUDED.building_class,
      geometry_geojson=EXCLUDED.geometry_geojson,
      center_latitude=EXCLUDED.center_latitude,
      center_longitude=EXCLUDED.center_longitude,
      height_m=EXCLUDED.height_m,
      min_height_m=EXCLUDED.min_height_m,
      levels=EXCLUDED.levels,
      roof_shape=EXCLUDED.roof_shape,
      roof_material=EXCLUDED.roof_material,
      roof_colour=EXCLUDED.roof_colour,
      facade_material=EXCLUDED.facade_material,
      facade_colour=EXCLUDED.facade_colour,
      source_url=EXCLUDED.source_url,
      metadata=EXCLUDED.metadata,
      updated_at=now()
    WHERE public.campus_map_buildings.verification_status='pending'
      AND public.campus_map_buildings.is_published=false;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_imported := v_imported + v_rows;
  END LOOP;

  UPDATE public.campus_map_campuses
  SET building_data_provider='openstreetmap-overpass',
      building_coverage_status=CASE
        WHEN building_coverage_status='verified' THEN 'verified'
        ELSE 'candidate'
      END,
      metadata=metadata || jsonb_build_object(
        'building_import_last_at',now(),
        'building_import_source','OpenStreetMap Overpass API',
        'building_import_received',v_received,
        'building_import_upserted',v_imported
      ),
      updated_at=now()
  WHERE id=p_campus_id AND university_id=v_university_id;

  RETURN jsonb_build_object(
    'received',v_received,
    'saved_or_refreshed',v_imported,
    'skipped_protected',v_received-v_imported,
    'verification_status','pending',
    'is_published',false
  );
END;
$function$;

REVOKE ALL ON FUNCTION private.import_campus_map_building_candidates_impl(uuid,jsonb)
FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.import_campus_map_building_candidates_impl(uuid,jsonb)
TO authenticated;

CREATE OR REPLACE FUNCTION public.import_campus_map_building_candidates(
  p_campus_id uuid,
  p_buildings jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT private.import_campus_map_building_candidates_impl(p_campus_id,p_buildings);
$function$;

REVOKE ALL ON FUNCTION public.import_campus_map_building_candidates(uuid,jsonb)
FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_campus_map_building_candidates(uuid,jsonb)
TO authenticated;

CREATE OR REPLACE FUNCTION private.review_campus_map_building_impl(
  p_building_id uuid,
  p_decision text,
  p_verification_evidence_url text,
  p_publish boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_university_id uuid;
  v_building public.campus_map_buildings%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in is required.';
  END IF;
  IF p_decision NOT IN ('verified','rejected') THEN
    RAISE EXCEPTION 'Choose verified or rejected.';
  END IF;
  IF p_publish AND p_decision <> 'verified' THEN
    RAISE EXCEPTION 'A rejected or unverified building cannot be published.';
  END IF;
  IF p_decision='verified'
     AND COALESCE(p_verification_evidence_url,'') !~ '^https://[^[:space:]]+$' THEN
    RAISE EXCEPTION 'A university-approved source for this exact building footprint is required.';
  END IF;

  SELECT cm.university_id INTO v_university_id
  FROM public.campus_memberships cm
  JOIN public.profiles p ON p.id=cm.user_id
  WHERE cm.user_id=v_uid
    AND cm.campus_role='admin'
    AND cm.membership_status='active'
    AND cm.verification_status='verified'
    AND p.role='admin'
    AND p.verification_status='verified'
  LIMIT 1;
  IF v_university_id IS NULL THEN
    RAISE EXCEPTION 'A verified campus administrator is required.';
  END IF;

  UPDATE public.campus_map_buildings b
  SET verification_status=p_decision,
      verification_evidence_url=CASE WHEN p_decision='verified' THEN p_verification_evidence_url ELSE NULL END,
      verified_by=CASE WHEN p_decision='verified' THEN v_uid ELSE NULL END,
      verified_at=CASE WHEN p_decision='verified' THEN now() ELSE NULL END,
      is_published=COALESCE(p_publish,false),
      updated_at=now()
  WHERE b.id=p_building_id
    AND b.university_id=v_university_id
  RETURNING b.* INTO v_building;
  IF v_building.id IS NULL THEN
    RAISE EXCEPTION 'This building candidate does not belong to your university.';
  END IF;

  RETURN jsonb_build_object(
    'id',v_building.id,
    'verification_status',v_building.verification_status,
    'is_published',v_building.is_published
  );
END;
$function$;

REVOKE ALL ON FUNCTION private.review_campus_map_building_impl(uuid,text,text,boolean)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.review_campus_map_building_impl(uuid,text,text,boolean)
TO authenticated;

CREATE OR REPLACE FUNCTION public.review_campus_map_building(
  p_building_id uuid,
  p_decision text,
  p_verification_evidence_url text DEFAULT NULL,
  p_publish boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT private.review_campus_map_building_impl(
    p_building_id,p_decision,p_verification_evidence_url,p_publish
  );
$function$;

REVOKE ALL ON FUNCTION public.review_campus_map_building(uuid,text,text,boolean)
FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_campus_map_building(uuid,text,text,boolean)
TO authenticated;


-- Source migration: supabase/migrations/20261031142749_harden_campus_building_geometry_review.sql
-- Harden imported building geometry validation and preserve honest coverage states.
-- Imported outlines remain pending/unpublished. A single verified building never marks an entire campus fully verified.

CREATE OR REPLACE FUNCTION private.import_campus_map_building_candidates_impl(
  p_campus_id uuid,
  p_buildings jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_university_id uuid;
  v_record jsonb;
  v_geometry jsonb;
  v_ring jsonb;
  v_point jsonb;
  v_first_point jsonb;
  v_last_point jsonb;
  v_point_count integer;
  v_source_id text;
  v_source_url text;
  v_lat double precision;
  v_lon double precision;
  v_point_lat double precision;
  v_point_lon double precision;
  v_height numeric;
  v_min_height numeric;
  v_levels integer;
  v_rows integer;
  v_imported integer := 0;
  v_received integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in is required.';
  END IF;

  SELECT c.university_id INTO v_university_id
  FROM public.campus_map_campuses c
  JOIN public.campus_memberships cm ON cm.university_id=c.university_id
  JOIN public.profiles p ON p.id=cm.user_id
  WHERE c.id=p_campus_id
    AND c.is_active=true
    AND cm.user_id=v_uid
    AND cm.campus_role='admin'
    AND cm.membership_status='active'
    AND cm.verification_status='verified'
    AND p.role='admin'
    AND p.verification_status='verified'
  LIMIT 1;

  IF v_university_id IS NULL THEN
    RAISE EXCEPTION 'A verified campus administrator for this university is required.';
  END IF;
  IF jsonb_typeof(p_buildings) <> 'array' THEN
    RAISE EXCEPTION 'Building import payload must be an array.';
  END IF;
  v_received := jsonb_array_length(p_buildings);
  IF v_received < 1 OR v_received > 300 THEN
    RAISE EXCEPTION 'Import between 1 and 300 building candidates per request.';
  END IF;

  FOR v_record IN SELECT value FROM jsonb_array_elements(p_buildings)
  LOOP
    v_source_id := btrim(COALESCE(v_record->>'source_feature_id',''));
    v_source_url := btrim(COALESCE(v_record->>'source_url',''));
    v_geometry := v_record->'geometry_geojson';
    v_lat := NULLIF(v_record->>'center_latitude','')::double precision;
    v_lon := NULLIF(v_record->>'center_longitude','')::double precision;
    v_height := NULLIF(v_record->>'height_m','')::numeric;
    v_min_height := NULLIF(v_record->>'min_height_m','')::numeric;
    v_levels := NULLIF(v_record->>'levels','')::integer;

    IF v_source_id !~ '^[0-9]{1,20}$'
       OR v_source_url <> 'https://www.openstreetmap.org/way/' || v_source_id THEN
      RAISE EXCEPTION 'Building import contains an invalid OpenStreetMap way identifier or source URL.';
    END IF;
    IF jsonb_typeof(v_geometry) <> 'object'
       OR v_geometry->>'type' <> 'Polygon'
       OR jsonb_typeof(v_geometry->'coordinates') <> 'array'
       OR jsonb_array_length(v_geometry->'coordinates') < 1
       OR jsonb_array_length(v_geometry->'coordinates') > 20 THEN
      RAISE EXCEPTION 'Building % must have a valid GeoJSON Polygon with 1–20 rings.', v_source_id;
    END IF;

    -- Validate every ring, closing coordinate and numeric lon/lat pair.
    FOR v_ring IN SELECT value FROM jsonb_array_elements(v_geometry->'coordinates')
    LOOP
      IF jsonb_typeof(v_ring) <> 'array' THEN
        RAISE EXCEPTION 'Building % contains a malformed polygon ring.', v_source_id;
      END IF;
      v_point_count := jsonb_array_length(v_ring);
      IF v_point_count < 4 OR v_point_count > 2000 THEN
        RAISE EXCEPTION 'Building % contains a ring with an invalid or excessive point count.', v_source_id;
      END IF;
      v_first_point := v_ring->0;
      v_last_point := v_ring->(v_point_count - 1);
      IF v_first_point <> v_last_point THEN
        RAISE EXCEPTION 'Building % has a polygon ring that is not closed.', v_source_id;
      END IF;
      FOR v_point IN SELECT value FROM jsonb_array_elements(v_ring)
      LOOP
        IF jsonb_typeof(v_point) <> 'array'
           OR jsonb_array_length(v_point) <> 2
           OR jsonb_typeof(v_point->0) <> 'number'
           OR jsonb_typeof(v_point->1) <> 'number' THEN
          RAISE EXCEPTION 'Building % contains a coordinate that is not a numeric longitude/latitude pair.', v_source_id;
        END IF;
        v_point_lon := (v_point->>0)::double precision;
        v_point_lat := (v_point->>1)::double precision;
        IF v_point_lon NOT BETWEEN -180 AND 180 OR v_point_lat NOT BETWEEN -90 AND 90 THEN
          RAISE EXCEPTION 'Building % contains a coordinate outside valid geographic ranges.', v_source_id;
        END IF;
      END LOOP;
    END LOOP;

    IF v_lat IS NULL OR v_lon IS NULL
       OR v_lat NOT BETWEEN -90 AND 90 OR v_lon NOT BETWEEN -180 AND 180 THEN
      RAISE EXCEPTION 'Building % has invalid centre coordinates.', v_source_id;
    END IF;
    IF v_height IS NOT NULL AND v_height NOT BETWEEN 0.5 AND 300 THEN
      RAISE EXCEPTION 'Building % has an invalid height.', v_source_id;
    END IF;
    IF v_min_height IS NOT NULL AND v_min_height NOT BETWEEN 0 AND 300 THEN
      RAISE EXCEPTION 'Building % has an invalid minimum height.', v_source_id;
    END IF;
    IF v_height IS NOT NULL AND v_min_height IS NOT NULL AND v_min_height >= v_height THEN
      RAISE EXCEPTION 'Building % minimum height must be below its total height.', v_source_id;
    END IF;
    IF v_levels IS NOT NULL AND v_levels NOT BETWEEN 1 AND 200 THEN
      RAISE EXCEPTION 'Building % has an invalid floor count.', v_source_id;
    END IF;
    IF char_length(btrim(COALESCE(v_record->>'name',''))) > 180
       OR char_length(btrim(COALESCE(v_record->>'building_class',''))) > 80 THEN
      RAISE EXCEPTION 'Building % has a name or building class that is too long.', v_source_id;
    END IF;

    INSERT INTO public.campus_map_buildings (
      university_id,campus_id,campus_slug,source_provider,source_feature_id,
      name,building_class,geometry_geojson,center_latitude,center_longitude,
      height_m,min_height_m,levels,roof_shape,roof_material,roof_colour,
      facade_material,facade_colour,source_url,source_license,
      verification_status,is_published,metadata
    )
    SELECT
      v_university_id,c.id,c.campus_slug,'openstreetmap',v_source_id,
      NULLIF(btrim(COALESCE(v_record->>'name','')),''),
      NULLIF(btrim(COALESCE(v_record->>'building_class','')),''),
      v_geometry,v_lat,v_lon,v_height,v_min_height,v_levels,
      NULLIF(v_record->>'roof_shape',''),
      NULLIF(v_record->>'roof_material',''),
      NULLIF(v_record->>'roof_colour',''),
      NULLIF(v_record->>'facade_material',''),
      NULLIF(v_record->>'facade_colour',''),
      v_source_url,'ODbL-1.0','pending',false,
      jsonb_build_object(
        'source_tags',COALESCE(v_record->'source_tags','{}'::jsonb),
        'import_method','OpenStreetMap Overpass API',
        'height_method',COALESCE(v_record->>'height_method','unknown'),
        'imported_at',now()
      )
    FROM public.campus_map_campuses c
    WHERE c.id=p_campus_id AND c.university_id=v_university_id
    ON CONFLICT (university_id,campus_id,source_provider,source_feature_id)
    DO UPDATE SET
      name=EXCLUDED.name,
      building_class=EXCLUDED.building_class,
      geometry_geojson=EXCLUDED.geometry_geojson,
      center_latitude=EXCLUDED.center_latitude,
      center_longitude=EXCLUDED.center_longitude,
      height_m=EXCLUDED.height_m,
      min_height_m=EXCLUDED.min_height_m,
      levels=EXCLUDED.levels,
      roof_shape=EXCLUDED.roof_shape,
      roof_material=EXCLUDED.roof_material,
      roof_colour=EXCLUDED.roof_colour,
      facade_material=EXCLUDED.facade_material,
      facade_colour=EXCLUDED.facade_colour,
      source_url=EXCLUDED.source_url,
      metadata=EXCLUDED.metadata,
      updated_at=now()
    WHERE public.campus_map_buildings.verification_status='pending'
      AND public.campus_map_buildings.is_published=false;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_imported := v_imported + v_rows;
  END LOOP;

  UPDATE public.campus_map_campuses
  SET building_data_provider='openstreetmap-overpass',
      building_coverage_status=CASE
        WHEN building_coverage_status='verified' THEN 'verified'
        ELSE 'candidate'
      END,
      metadata=metadata || jsonb_build_object(
        'building_import_last_at',now(),
        'building_import_source','OpenStreetMap Overpass API',
        'building_import_received',v_received,
        'building_import_upserted',v_imported
      ),
      updated_at=now()
  WHERE id=p_campus_id AND university_id=v_university_id;

  RETURN jsonb_build_object(
    'received',v_received,
    'saved_or_refreshed',v_imported,
    'skipped_protected',v_received-v_imported,
    'verification_status','pending',
    'is_published',false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.review_campus_map_building_impl(
  p_building_id uuid,
  p_decision text,
  p_verification_evidence_url text,
  p_publish boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_university_id uuid;
  v_building public.campus_map_buildings%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in is required.';
  END IF;
  IF p_decision NOT IN ('verified','rejected') THEN
    RAISE EXCEPTION 'Choose verified or rejected.';
  END IF;
  IF p_publish AND p_decision <> 'verified' THEN
    RAISE EXCEPTION 'A rejected or unverified building cannot be published.';
  END IF;
  IF p_decision='verified'
     AND COALESCE(p_verification_evidence_url,'') !~ '^https://[^[:space:]]+$' THEN
    RAISE EXCEPTION 'A university-approved source for this exact building footprint is required.';
  END IF;

  SELECT cm.university_id INTO v_university_id
  FROM public.campus_memberships cm
  JOIN public.profiles p ON p.id=cm.user_id
  WHERE cm.user_id=v_uid
    AND cm.campus_role='admin'
    AND cm.membership_status='active'
    AND cm.verification_status='verified'
    AND p.role='admin'
    AND p.verification_status='verified'
  LIMIT 1;
  IF v_university_id IS NULL THEN
    RAISE EXCEPTION 'A verified campus administrator is required.';
  END IF;

  UPDATE public.campus_map_buildings b
  SET verification_status=p_decision,
      verification_evidence_url=CASE WHEN p_decision='verified' THEN p_verification_evidence_url ELSE NULL END,
      verified_by=CASE WHEN p_decision='verified' THEN v_uid ELSE NULL END,
      verified_at=CASE WHEN p_decision='verified' THEN now() ELSE NULL END,
      is_published=COALESCE(p_publish,false),
      updated_at=now()
  WHERE b.id=p_building_id
    AND b.university_id=v_university_id
  RETURNING b.* INTO v_building;
  IF v_building.id IS NULL THEN
    RAISE EXCEPTION 'This building candidate does not belong to your university.';
  END IF;

  -- A verified footprint is a partial coverage improvement, never proof that the whole campus is mapped.
  IF p_decision='verified' THEN
    UPDATE public.campus_map_campuses
    SET building_coverage_status=CASE
          WHEN building_coverage_status IN ('unassessed','none','candidate') THEN 'partial'
          ELSE building_coverage_status
        END,
        metadata=metadata || jsonb_build_object(
          'last_building_verified_at',now(),
          'last_building_verifier',v_uid
        ),
        updated_at=now()
    WHERE id=v_building.campus_id
      AND university_id=v_university_id;
  END IF;

  RETURN jsonb_build_object(
    'id',v_building.id,
    'verification_status',v_building.verification_status,
    'is_published',v_building.is_published
  );
END;
$function$;


-- Source migration: supabase/migrations/20261031142958_guard_empty_building_import_payload.sql
-- Reject null/non-array imports at the public invoker wrapper before entering the privileged implementation.
CREATE OR REPLACE FUNCTION public.import_campus_map_building_candidates(
  p_campus_id uuid,
  p_buildings jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
BEGIN
  IF p_campus_id IS NULL THEN
    RAISE EXCEPTION 'Choose a campus profile before importing building footprints.';
  END IF;
  IF p_buildings IS NULL OR jsonb_typeof(p_buildings) <> 'array' THEN
    RAISE EXCEPTION 'Building import payload must be a JSON array.';
  END IF;
  RETURN private.import_campus_map_building_candidates_impl(p_campus_id,p_buildings);
END;
$function$;

REVOKE ALL ON FUNCTION public.import_campus_map_building_candidates(uuid,jsonb)
FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_campus_map_building_candidates(uuid,jsonb)
TO authenticated;


-- Source migration: supabase/migrations/20261031182424_campus_building_import_verified_centre_guard.sql
-- Building-footprint discovery must be anchored to a verified campus-centre point.
-- The official Babcock contact-page locator is useful for map orientation only;
-- it is not a surveyed centre and must not be used to anchor an import circle.

ALTER FUNCTION private.import_campus_map_building_candidates_impl(uuid,jsonb)
  RENAME TO import_campus_map_building_candidates_legacy;

REVOKE ALL ON FUNCTION private.import_campus_map_building_candidates_legacy(uuid,jsonb)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.import_campus_map_building_candidates_impl(
  p_campus_id uuid,
  p_buildings jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_admin_university_id uuid;
BEGIN
  IF p_campus_id IS NULL THEN
    RAISE EXCEPTION 'Choose a campus profile before importing building footprints.';
  END IF;

  -- Check administrator membership before checking centre state, avoiding
  -- campus-profile status disclosure to unrelated authenticated users.
  SELECT c.university_id INTO v_admin_university_id
  FROM public.campus_map_campuses c
  JOIN public.campus_memberships cm ON cm.university_id = c.university_id
  JOIN public.profiles p ON p.id = cm.user_id
  WHERE c.id = p_campus_id
    AND cm.user_id = (SELECT auth.uid())
    AND cm.campus_role = 'admin'
    AND cm.membership_status = 'active'
    AND cm.verification_status = 'verified'
    AND p.role = 'admin'
    AND p.verification_status = 'verified'
  LIMIT 1;

  IF v_admin_university_id IS NULL THEN
    RAISE EXCEPTION 'A verified campus administrator for this university is required.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.campus_map_campuses c
    WHERE c.id = p_campus_id
      AND c.university_id = v_admin_university_id
      AND c.center_status = 'verified'
      AND c.center_latitude IS NOT NULL
      AND c.center_longitude IS NOT NULL
      AND c.center_source_url ~ '^https://'
  ) THEN
    RAISE EXCEPTION 'A verified campus-centre point is required. Confirm the exact centre against an approved campus plan or on-campus survey, then save the campus profile before importing building candidates.';
  END IF;

  RETURN private.import_campus_map_building_candidates_legacy(
    p_campus_id,
    p_buildings
  );
END;
$function$;

REVOKE ALL ON FUNCTION private.import_campus_map_building_candidates_impl(uuid,jsonb)
  FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.import_campus_map_building_candidates_impl(uuid,jsonb)
  TO authenticated;

-- Rebind the public invoker wrapper to the new guarded implementation.
CREATE OR REPLACE FUNCTION public.import_campus_map_building_candidates(
  p_campus_id uuid,
  p_buildings jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT private.import_campus_map_building_candidates_impl(p_campus_id,p_buildings);
$function$;

REVOKE ALL ON FUNCTION public.import_campus_map_building_candidates(uuid,jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_campus_map_building_candidates(uuid,jsonb)
  TO authenticated;


-- Source migration: supabase/migrations/20261031182609_campus_map_admin_fk_indexes.sql
-- Cover CampusMap foreign keys with dedicated indexes for joins and parent-row maintenance.
CREATE INDEX IF NOT EXISTS campus_map_buildings_campus_id_idx
  ON public.campus_map_buildings (campus_id);

CREATE INDEX IF NOT EXISTS campus_map_buildings_verified_by_idx
  ON public.campus_map_buildings (verified_by);

CREATE INDEX IF NOT EXISTS campus_map_campuses_boundary_verified_by_idx
  ON public.campus_map_campuses (boundary_verified_by);

CREATE INDEX IF NOT EXISTS campus_map_campuses_center_verified_by_idx
  ON public.campus_map_campuses (center_verified_by);

CREATE INDEX IF NOT EXISTS campus_map_campuses_model_verified_by_idx
  ON public.campus_map_campuses (model_verified_by);


-- Source migration: supabase/migrations/20261104004500_campus_map_passports_and_verified_entrance_details.sql
-- CampusMap passports and verified entrance/accessibility details.
-- Staging-first: uses existing campus_map_features.metadata, current RLS, and verified-campus-admin workflow.

alter table public.campus_map_features
  drop constraint if exists campus_map_features_feature_type_check;
alter table public.campus_map_features
  add constraint campus_map_features_feature_type_check check (
    feature_type = any (array[
      'building','lecture_hall','hostel','library','cafeteria','medical','security',
      'gate','parking','sports','facility','assembly_point','accessible_entry',
      'emergency_point','entrance'
    ]::text[])
  );

-- Replace the old public wrapper and private implementation so the new metadata
-- is written only through the same verified campus-admin authorization check.
drop function if exists public.manage_campus_map_feature(
  uuid,text,text,text,text,text,double precision,double precision,text,boolean,boolean
);
drop function if exists private.manage_campus_map_feature_impl(
  uuid,text,text,text,text,text,double precision,double precision,text,boolean,boolean
);

create function private.manage_campus_map_feature_impl(
  p_feature_id uuid,
  p_campus_name text,
  p_campus_slug text,
  p_feature_type text,
  p_name text,
  p_description text,
  p_latitude double precision,
  p_longitude double precision,
  p_source_url text,
  p_mark_verified boolean,
  p_publish boolean,
  p_metadata jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_university_id uuid;
  v_id uuid;
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_parent_id uuid;
  v_item jsonb;
  v_parent_is_published boolean;
begin
  if v_uid is null then raise exception 'Sign in is required.'; end if;

  select cm.university_id into v_university_id
  from public.campus_memberships cm
  join public.profiles p on p.id = cm.user_id
  where cm.user_id = v_uid
    and cm.campus_role = 'admin'
    and cm.membership_status = 'active'
    and cm.verification_status = 'verified'
    and p.role = 'admin'
    and p.verification_status = 'verified'
  limit 1;

  if v_university_id is null then
    raise exception 'A verified campus administrator is required to manage map locations.';
  end if;

  if char_length(btrim(coalesce(p_campus_name,''))) not between 2 and 120
     or coalesce(p_campus_slug,'') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Choose a valid campus name and campus identifier.';
  end if;
  if char_length(btrim(coalesce(p_name,''))) not between 2 and 180 then
    raise exception 'Location name must be between 2 and 180 characters.';
  end if;
  if coalesce(p_feature_type,'') not in (
    'building','lecture_hall','hostel','library','cafeteria','medical','security',
    'gate','parking','sports','facility','assembly_point','accessible_entry',
    'emergency_point','entrance'
  ) then
    raise exception 'Choose a supported campus location category.';
  end if;
  if (p_latitude is null) <> (p_longitude is null) then
    raise exception 'Enter both latitude and longitude, or leave both blank.';
  end if;
  if p_latitude is not null and (
    p_latitude not between -90 and 90 or p_longitude not between -180 and 180
  ) then
    raise exception 'Coordinates are outside valid geographic ranges.';
  end if;
  if p_source_url is not null and p_source_url !~ '^https://[^[:space:]]+$' then
    raise exception 'Evidence source must be an HTTPS URL.';
  end if;
  if coalesce(p_mark_verified,false) and (p_latitude is null or p_source_url is null) then
    raise exception 'To verify a map point, provide coordinates and an HTTPS evidence source.';
  end if;
  if coalesce(p_publish,false) and not coalesce(p_mark_verified,false) then
    raise exception 'Verify the location before publishing it to students.';
  end if;

  if jsonb_typeof(v_metadata) <> 'object' then
    raise exception 'Campus Passport details must be a JSON object.';
  end if;
  if (v_metadata - array[
    'building_code','opening_hours','floor_count','facilities',
    'accessibility_features','accessibility_notes','building_feature_id',
    'entry_type','contact_label','contact_url','emergency_phone','verified_service_note'
  ]::text[]) <> '{}'::jsonb then
    raise exception 'Campus Passport contains an unsupported detail field.';
  end if;

  if v_metadata ? 'building_code' and (
    jsonb_typeof(v_metadata->'building_code') <> 'string'
    or char_length(v_metadata->>'building_code') > 40
  ) then raise exception 'Building code must be plain text up to 40 characters.'; end if;
  if v_metadata ? 'opening_hours' and (
    jsonb_typeof(v_metadata->'opening_hours') <> 'string'
    or char_length(v_metadata->>'opening_hours') > 200
  ) then raise exception 'Opening hours must be plain text up to 200 characters.'; end if;
  if v_metadata ? 'floor_count' and (
    jsonb_typeof(v_metadata->'floor_count') <> 'number'
    or (v_metadata->>'floor_count') !~ '^[0-9]{1,3}$'
    or (v_metadata->>'floor_count')::integer > 100
  ) then raise exception 'Floor count must be a whole number from 0 to 100.'; end if;
  if v_metadata ? 'accessibility_notes' and (
    jsonb_typeof(v_metadata->'accessibility_notes') <> 'string'
    or char_length(v_metadata->>'accessibility_notes') > 500
  ) then raise exception 'Accessibility notes must be plain text up to 500 characters.'; end if;
  if v_metadata ? 'verified_service_note' and (
    jsonb_typeof(v_metadata->'verified_service_note') <> 'string'
    or char_length(v_metadata->>'verified_service_note') > 300
  ) then raise exception 'Service note must be plain text up to 300 characters.'; end if;
  if v_metadata ? 'contact_label' and (
    jsonb_typeof(v_metadata->'contact_label') <> 'string'
    or char_length(v_metadata->>'contact_label') > 60
  ) then raise exception 'Contact label must be plain text up to 60 characters.'; end if;
  if v_metadata ? 'contact_url' and (
    jsonb_typeof(v_metadata->'contact_url') <> 'string'
    or (v_metadata->>'contact_url') !~ '^https://[^[:space:]]+$'
  ) then raise exception 'Contact link must be a valid HTTPS URL.'; end if;
  if v_metadata ? 'emergency_phone' and (
    jsonb_typeof(v_metadata->'emergency_phone') <> 'string'
    or (v_metadata->>'emergency_phone') !~ '^[+0-9() .-]{5,30}$'
  ) then raise exception 'Emergency contact must be a valid public phone number.'; end if;
  if v_metadata ? 'entry_type' and (
    jsonb_typeof(v_metadata->'entry_type') <> 'string'
    or v_metadata->>'entry_type' not in ('main','accessible','service','emergency')
  ) then raise exception 'Choose a supported entrance type.'; end if;

  if v_metadata ? 'facilities' then
    if jsonb_typeof(v_metadata->'facilities') <> 'array'
       or jsonb_array_length(v_metadata->'facilities') > 15 then
      raise exception 'Facilities must be a list of up to 15 items.';
    end if;
    for v_item in select value from jsonb_array_elements(v_metadata->'facilities') as t(value) loop
      if jsonb_typeof(v_item) <> 'string' or char_length(v_item #>> '{}') not between 1 and 60 then
        raise exception 'Each facility must be plain text between 1 and 60 characters.';
      end if;
    end loop;
  end if;

  if v_metadata ? 'accessibility_features' then
    if jsonb_typeof(v_metadata->'accessibility_features') <> 'array'
       or jsonb_array_length(v_metadata->'accessibility_features') > 8 then
      raise exception 'Accessibility features must be a list of up to 8 items.';
    end if;
    for v_item in select value from jsonb_array_elements(v_metadata->'accessibility_features') as t(value) loop
      if jsonb_typeof(v_item) <> 'string'
         or v_item #>> '{}' not in (
           'step_free_entry','ramp','lift','accessible_restroom',
           'tactile_path','accessible_parking','hearing_support'
         ) then
        raise exception 'Choose only supported accessibility features.';
      end if;
    end loop;
  end if;

  if v_metadata ? 'building_feature_id' then
    if jsonb_typeof(v_metadata->'building_feature_id') <> 'string'
       or (v_metadata->>'building_feature_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'The related building reference is invalid.';
    end if;
    v_parent_id := (v_metadata->>'building_feature_id')::uuid;
    select f.is_published and f.verification_status = 'verified'
      into v_parent_is_published
    from public.campus_map_features f
    where f.id = v_parent_id
      and f.university_id = v_university_id
      and f.campus_slug = p_campus_slug
      and f.feature_type in ('building','lecture_hall','hostel','library','facility');
    if not found then
      raise exception 'The entrance must be linked to a building in this university and campus.';
    end if;
    if coalesce(p_publish,false) and not coalesce(v_parent_is_published,false) then
      raise exception 'Publish the verified building before publishing its entrance.';
    end if;
  elsif coalesce(p_publish,false) and p_feature_type in ('entrance','accessible_entry') then
    raise exception 'Link this entrance to a verified campus building before publishing it.';
  end if;

  if p_feature_type = 'entrance' and coalesce(p_publish,false)
     and coalesce(v_metadata->>'entry_type','') not in ('main','service','emergency') then
    raise exception 'Choose whether this is a main, service or emergency entrance before publishing.';
  end if;
  if p_feature_type = 'accessible_entry' and coalesce(p_publish,false)
     and coalesce(v_metadata->>'entry_type','') <> 'accessible' then
    raise exception 'Mark this point as an accessible entrance before publishing it.';
  end if;

  if p_feature_id is not null then
    update public.campus_map_features
    set campus_name = btrim(p_campus_name),
        campus_slug = p_campus_slug,
        feature_type = p_feature_type,
        name = btrim(p_name),
        description = nullif(btrim(coalesce(p_description,'')),''),
        latitude = p_latitude,
        longitude = p_longitude,
        source_url = p_source_url,
        verification_status = case when coalesce(p_mark_verified,false) then 'verified' else 'pending' end,
        verified_by = case when coalesce(p_mark_verified,false) then v_uid else null end,
        verified_at = case when coalesce(p_mark_verified,false) then now() else null end,
        is_published = coalesce(p_publish,false),
        metadata = case when p_metadata is null then metadata else v_metadata end,
        updated_at = now()
    where id = p_feature_id and university_id = v_university_id
    returning id into v_id;
    if v_id is null then raise exception 'This map location does not belong to your university.'; end if;
  else
    insert into public.campus_map_features(
      university_id,campus_name,campus_slug,feature_type,name,description,latitude,longitude,
      source_url,verification_status,verified_by,verified_at,is_published,metadata
    ) values (
      v_university_id,btrim(p_campus_name),p_campus_slug,p_feature_type,btrim(p_name),
      nullif(btrim(coalesce(p_description,'')),''),p_latitude,p_longitude,p_source_url,
      case when coalesce(p_mark_verified,false) then 'verified' else 'pending' end,
      case when coalesce(p_mark_verified,false) then v_uid else null end,
      case when coalesce(p_mark_verified,false) then now() else null end,
      coalesce(p_publish,false),v_metadata
    ) returning id into v_id;
  end if;

  return v_id;
end;
$function$;

revoke all on function private.manage_campus_map_feature_impl(
  uuid,text,text,text,text,text,double precision,double precision,text,boolean,boolean,jsonb
) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.manage_campus_map_feature_impl(
  uuid,text,text,text,text,text,double precision,double precision,text,boolean,boolean,jsonb
) to authenticated;

create function public.manage_campus_map_feature(
  p_feature_id uuid default null,
  p_campus_name text default 'Main Campus',
  p_campus_slug text default 'main-campus',
  p_feature_type text default 'building',
  p_name text default null,
  p_description text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_source_url text default null,
  p_mark_verified boolean default false,
  p_publish boolean default false,
  p_metadata jsonb default null
) returns uuid
language sql
security invoker
set search_path = ''
as $wrapper$
  select private.manage_campus_map_feature_impl(
    p_feature_id,p_campus_name,p_campus_slug,p_feature_type,p_name,p_description,
    p_latitude,p_longitude,p_source_url,p_mark_verified,p_publish,p_metadata
  );
$wrapper$;

revoke all on function public.manage_campus_map_feature(
  uuid,text,text,text,text,text,double precision,double precision,text,boolean,boolean,jsonb
) from public, anon;
grant execute on function public.manage_campus_map_feature(
  uuid,text,text,text,text,text,double precision,double precision,text,boolean,boolean,jsonb
) to authenticated;


-- Source migration: supabase/migrations/20261104004700_campus_map_passport_system_metadata_merge.sql
-- Preserve existing system/provenance metadata when campus admins update Passport details.

create function private.manage_campus_map_feature_with_metadata_impl(
  p_feature_id uuid,
  p_campus_name text,
  p_campus_slug text,
  p_feature_type text,
  p_name text,
  p_description text,
  p_latitude double precision,
  p_longitude double precision,
  p_source_url text,
  p_mark_verified boolean,
  p_publish boolean,
  p_metadata jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_university_id uuid;
  v_existing_metadata jsonb := '{}'::jsonb;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in is required.'; end if;

  select cm.university_id into v_university_id
  from public.campus_memberships cm
  join public.profiles p on p.id=cm.user_id
  where cm.user_id=v_uid
    and cm.campus_role='admin'
    and cm.membership_status='active'
    and cm.verification_status='verified'
    and p.role='admin'
    and p.verification_status='verified'
  limit 1;

  if v_university_id is null then
    raise exception 'A verified campus administrator is required to manage map locations.';
  end if;

  if p_feature_id is not null then
    select f.metadata into v_existing_metadata
    from public.campus_map_features f
    where f.id=p_feature_id and f.university_id=v_university_id;
    if not found then
      raise exception 'This map location does not belong to your university.';
    end if;
  end if;

  v_id := private.manage_campus_map_feature_impl(
    p_feature_id,p_campus_name,p_campus_slug,p_feature_type,p_name,p_description,
    p_latitude,p_longitude,p_source_url,p_mark_verified,p_publish,p_metadata
  );

  -- NULL metadata means a legacy client is editing a location-only field:
  -- preserve every Passport and provenance field exactly as stored.
  if p_metadata is not null then
    update public.campus_map_features
    set metadata = (
      coalesce(v_existing_metadata,'{}'::jsonb)
      - array[
        'building_code','opening_hours','floor_count','facilities',
        'accessibility_features','accessibility_notes','building_feature_id',
        'entry_type','contact_label','contact_url','emergency_phone','verified_service_note'
      ]::text[]
    ) || p_metadata,
    updated_at = now()
    where id=v_id and university_id=v_university_id;
    if not found then
      raise exception 'The saved map location could not be reconciled with its Passport details.';
    end if;
  end if;

  return v_id;
end;
$function$;

revoke all on function private.manage_campus_map_feature_with_metadata_impl(
  uuid,text,text,text,text,text,double precision,double precision,text,boolean,boolean,jsonb
) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.manage_campus_map_feature_with_metadata_impl(
  uuid,text,text,text,text,text,double precision,double precision,text,boolean,boolean,jsonb
) to authenticated;

drop function public.manage_campus_map_feature(
  uuid,text,text,text,text,text,double precision,double precision,text,boolean,boolean,jsonb
);

create function public.manage_campus_map_feature(
  p_feature_id uuid default null,
  p_campus_name text default 'Main Campus',
  p_campus_slug text default 'main-campus',
  p_feature_type text default 'building',
  p_name text default null,
  p_description text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_source_url text default null,
  p_mark_verified boolean default false,
  p_publish boolean default false,
  p_metadata jsonb default null
) returns uuid
language sql
security invoker
set search_path = ''
as $wrapper$
  select private.manage_campus_map_feature_with_metadata_impl(
    p_feature_id,p_campus_name,p_campus_slug,p_feature_type,p_name,p_description,
    p_latitude,p_longitude,p_source_url,p_mark_verified,p_publish,p_metadata
  );
$wrapper$;

revoke all on function public.manage_campus_map_feature(
  uuid,text,text,text,text,text,double precision,double precision,text,boolean,boolean,jsonb
) from public,anon;
grant execute on function public.manage_campus_map_feature(
  uuid,text,text,text,text,text,double precision,double precision,text,boolean,boolean,jsonb
) to authenticated;


-- Source migration: supabase/migrations/20261104005000_campus_map_passport_metadata_null_compatibility.sql
-- Preserve Passport and provenance metadata for older clients that omit p_metadata.

create or replace function private.manage_campus_map_feature_with_metadata_impl(
  p_feature_id uuid,
  p_campus_name text,
  p_campus_slug text,
  p_feature_type text,
  p_name text,
  p_description text,
  p_latitude double precision,
  p_longitude double precision,
  p_source_url text,
  p_mark_verified boolean,
  p_publish boolean,
  p_metadata jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_university_id uuid;
  v_existing_metadata jsonb := '{}'::jsonb;
  v_safe_passport_metadata jsonb := '{}'::jsonb;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in is required.'; end if;

  select cm.university_id into v_university_id
  from public.campus_memberships cm
  join public.profiles p on p.id=cm.user_id
  where cm.user_id=v_uid
    and cm.campus_role='admin'
    and cm.membership_status='active'
    and cm.verification_status='verified'
    and p.role='admin'
    and p.verification_status='verified'
  limit 1;

  if v_university_id is null then
    raise exception 'A verified campus administrator is required to manage map locations.';
  end if;

  if p_feature_id is not null then
    select f.metadata into v_existing_metadata
    from public.campus_map_features f
    where f.id=p_feature_id and f.university_id=v_university_id;
    if not found then
      raise exception 'This map location does not belong to your university.';
    end if;
  end if;

  if p_metadata is null then
    select coalesce(jsonb_object_agg(kv.key,kv.value),'{}'::jsonb)
      into v_safe_passport_metadata
    from jsonb_each(coalesce(v_existing_metadata,'{}'::jsonb)) as kv(key,value)
    where kv.key = any(array[
      'building_code','opening_hours','floor_count','facilities',
      'accessibility_features','accessibility_notes','building_feature_id',
      'entry_type','contact_label','contact_url','emergency_phone','verified_service_note'
    ]::text[]);
  else
    v_safe_passport_metadata := p_metadata;
  end if;

  v_id := private.manage_campus_map_feature_impl(
    p_feature_id,p_campus_name,p_campus_slug,p_feature_type,p_name,p_description,
    p_latitude,p_longitude,p_source_url,p_mark_verified,p_publish,v_safe_passport_metadata
  );

  update public.campus_map_features
  set metadata = (
    coalesce(v_existing_metadata,'{}'::jsonb)
    - array[
      'building_code','opening_hours','floor_count','facilities',
      'accessibility_features','accessibility_notes','building_feature_id',
      'entry_type','contact_label','contact_url','emergency_phone','verified_service_note'
    ]::text[]
  ) || coalesce(v_safe_passport_metadata,'{}'::jsonb),
  updated_at = now()
  where id=v_id and university_id=v_university_id;

  if not found then
    raise exception 'The saved map location could not be reconciled with its Passport details.';
  end if;

  return v_id;
end;
$function$;

revoke all on function private.manage_campus_map_feature_with_metadata_impl(
  uuid,text,text,text,text,text,double precision,double precision,text,boolean,boolean,jsonb
) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.manage_campus_map_feature_with_metadata_impl(
  uuid,text,text,text,text,text,double precision,double precision,text,boolean,boolean,jsonb
) to authenticated;


-- Source migration: supabase/migrations/20261104005500_campus_map_building_parent_no_self_reference.sql
-- A map feature cannot be linked to itself as its own parent building.

do $guard$
begin
  if exists (
    select 1 from public.campus_map_features
    where metadata->>'building_feature_id' = id::text
  ) then
    raise exception 'Existing CampusMap rows contain a self-referencing building parent; review them before applying this constraint.';
  end if;
end;
$guard$;

alter table public.campus_map_features
  drop constraint if exists campus_map_feature_parent_not_self;
alter table public.campus_map_features
  add constraint campus_map_feature_parent_not_self
  check (
    metadata->>'building_feature_id' is null
    or metadata->>'building_feature_id' <> id::text
  );


commit;
