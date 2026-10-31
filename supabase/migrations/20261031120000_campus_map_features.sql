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
  ADD CONSTRAINT campus_map_features_campus_slug_check CHECK (campus_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*
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
),
  DROP CONSTRAINT IF EXISTS campus_map_features_campus_name_check,
  ADD CONSTRAINT campus_map_features_campus_name_check CHECK (char_length(btrim(campus_name)) BETWEEN 2 AND 120),
  DROP CONSTRAINT IF EXISTS campus_map_features_feature_type_check,
  ADD CONSTRAINT campus_map_features_feature_type_check CHECK (feature_type IN ('building','lecture_hall','hostel','library','cafeteria','medical','security','gate','parking','sports','facility','assembly_point','accessible_entry','emergency_point'));

CREATE INDEX IF NOT EXISTS campus_map_features_university_campus_published_idx ON public.campus_map_features(university_id,campus_slug,is_published,feature_type);
CREATE INDEX IF NOT EXISTS campus_map_features_university_verification_idx ON public.campus_map_features(university_id,verification_status,updated_at DESC);

ALTER TABLE public.campus_map_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_map_features FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS campus_map_features_read_published ON public.campus_map_features;
CREATE POLICY campus_map_features_read_published ON public.campus_map_features FOR SELECT TO anon,authenticated
USING (
  is_published = true OR (
    university_id = (SELECT cm.university_id FROM public.campus_memberships cm WHERE cm.user_id=(SELECT auth.uid()) AND cm.campus_role='admin' AND cm.membership_status='active' AND cm.verification_status='verified')
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=(SELECT auth.uid()) AND p.role='admin' AND p.verification_status='verified')
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
 ('Main Campus','main-campus','medical','Babcock University Teaching Hospital','Official hospital listing; administrator must confirm the exact campus entrance pin.','https://buth.babcock.edu.ng/emergency-services/','{}'::jsonb),
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
