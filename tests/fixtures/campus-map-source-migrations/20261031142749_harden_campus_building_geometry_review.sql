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
