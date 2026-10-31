-- Building-footprint discovery must be anchored to a verified campus-centre point.
-- The official Babcock contact-page locator is useful for map orientation only;
-- it is not a surveyed centre and must not be used to anchor an import circle.

ALTER FUNCTION private.import_campus_map_building_candidates_impl(uuid,jsonb)
  RENAME TO import_campus_map_building_candidates_impl_unverified_centre_legacy;

REVOKE ALL ON FUNCTION private.import_campus_map_building_candidates_impl_unverified_centre_legacy(uuid,jsonb)
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
BEGIN
  IF p_campus_id IS NULL THEN
    RAISE EXCEPTION 'Choose a campus profile before importing building footprints.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.campus_map_campuses c
    WHERE c.id = p_campus_id
      AND c.center_status = 'verified'
      AND c.center_latitude IS NOT NULL
      AND c.center_longitude IS NOT NULL
      AND c.center_source_url ~ '^https://[^[:space:]]+$'
  ) THEN
    RAISE EXCEPTION 'A verified campus-centre point is required. Confirm the exact centre against an approved campus plan or on-campus survey, then save the campus profile before importing building candidates.';
  END IF;

  RETURN private.import_campus_map_building_candidates_impl_unverified_centre_legacy(
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
