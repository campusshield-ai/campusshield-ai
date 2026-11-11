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
