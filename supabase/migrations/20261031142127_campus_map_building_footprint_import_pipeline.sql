-- University-scoped building footprint import and review pipeline.
-- OSM footprints are imported as candidates and stay admin-only until local verification.
-- No imported geometry is published automatically.

UPDATE public.campus_universities
SET state = 'FCT Abuja',
    updated_at = now()
WHERE lower(btrim(state)) = 'fct';

UPDATE public.campus_map_campuses
SET state = 'FCT Abuja',
    updated_at = now()
WHERE lower(btrim(state)) = 'fct';

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
