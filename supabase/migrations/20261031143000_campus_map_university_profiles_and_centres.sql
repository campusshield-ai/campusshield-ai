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
