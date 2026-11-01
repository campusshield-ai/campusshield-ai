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
