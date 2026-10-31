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
