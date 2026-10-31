-- Private GLB model submission workflow for university campus 3D geometry.
-- Files stay private and pending review; this migration does not expose or render unreviewed models.
-- Bucket size is capped at 25 MB to remain below the Supabase Free plan's 50 MB global ceiling.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'campus-map-models',
  'campus-map-models',
  false,
  26214400,
  ARRAY['model/gltf-binary','application/octet-stream']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 26214400,
  allowed_mime_types = ARRAY['model/gltf-binary','application/octet-stream']::text[];

DROP POLICY IF EXISTS campus_map_model_admin_upload ON storage.objects;
CREATE POLICY campus_map_model_admin_upload
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'campus-map-models'
  AND name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.glb$'
  AND COALESCE(metadata->>'mimetype','') IN ('model/gltf-binary','application/octet-stream')
  AND EXISTS (
    SELECT 1
    FROM public.campus_map_campuses c
    JOIN public.campus_memberships cm ON cm.university_id = c.university_id
    JOIN public.profiles p ON p.id = cm.user_id
    WHERE c.id::text = (storage.foldername(name))[2]
      AND c.university_id::text = (storage.foldername(name))[1]
      AND cm.user_id = (SELECT auth.uid())
      AND cm.campus_role = 'admin'
      AND cm.membership_status = 'active'
      AND cm.verification_status = 'verified'
      AND p.role = 'admin'
      AND p.verification_status = 'verified'
  )
);

DROP POLICY IF EXISTS campus_map_model_admin_delete ON storage.objects;
CREATE POLICY campus_map_model_admin_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'campus-map-models'
  AND EXISTS (
    SELECT 1
    FROM public.campus_map_campuses c
    JOIN public.campus_memberships cm ON cm.university_id = c.university_id
    JOIN public.profiles p ON p.id = cm.user_id
    WHERE c.id::text = (storage.foldername(name))[2]
      AND c.university_id::text = (storage.foldername(name))[1]
      AND cm.user_id = (SELECT auth.uid())
      AND cm.campus_role = 'admin'
      AND cm.membership_status = 'active'
      AND cm.verification_status = 'verified'
      AND p.role = 'admin'
      AND p.verification_status = 'verified'
  )
);

DROP POLICY IF EXISTS campus_map_model_read_admin_or_approved_member ON storage.objects;
CREATE POLICY campus_map_model_read_admin_or_approved_member
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'campus-map-models'
  AND EXISTS (
    SELECT 1
    FROM public.campus_map_campuses c
    JOIN public.campus_memberships cm ON cm.university_id = c.university_id
    JOIN public.profiles p ON p.id = cm.user_id
    WHERE c.id::text = (storage.foldername(name))[2]
      AND c.university_id::text = (storage.foldername(name))[1]
      AND cm.user_id = (SELECT auth.uid())
      AND cm.membership_status = 'active'
      AND cm.verification_status = 'verified'
      AND p.verification_status = 'verified'
      AND (
        (cm.campus_role = 'admin' AND p.role = 'admin')
        OR c.model_status = 'approved'
      )
  )
);

CREATE OR REPLACE FUNCTION private.submit_campus_3d_model_impl(
  p_campus_id uuid,
  p_model_storage_path text,
  p_model_attribution text
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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in is required.';
  END IF;

  SELECT cm.university_id INTO v_university_id
  FROM public.campus_memberships cm
  JOIN public.profiles p ON p.id = cm.user_id
  WHERE cm.user_id = v_uid
    AND cm.campus_role = 'admin'
    AND cm.membership_status = 'active'
    AND cm.verification_status = 'verified'
    AND p.role = 'admin'
    AND p.verification_status = 'verified'
  LIMIT 1;

  IF v_university_id IS NULL THEN
    RAISE EXCEPTION 'A verified campus administrator is required to submit a 3D model.';
  END IF;

  IF p_campus_id IS NULL OR p_model_storage_path IS NULL
     OR p_model_storage_path !~ ('^' || v_university_id::text || '/' || p_campus_id::text || '/[0-9a-f-]{36}\.glb$') THEN
    RAISE EXCEPTION 'The model file path is invalid or belongs to another campus.';
  END IF;

  IF char_length(btrim(COALESCE(p_model_attribution,''))) NOT BETWEEN 8 AND 500 THEN
    RAISE EXCEPTION 'Provide the building model source and required attribution (8–500 characters).';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects o
    JOIN public.campus_map_campuses c ON c.id = p_campus_id
    WHERE o.bucket_id = 'campus-map-models'
      AND o.name = p_model_storage_path
      AND c.university_id = v_university_id
  ) THEN
    RAISE EXCEPTION 'The private GLB file was not found in this campus model bucket.';
  END IF;

  UPDATE public.campus_map_campuses
  SET model_storage_path = p_model_storage_path,
      model_format = 'glb',
      model_source_url = NULL,
      model_attribution = btrim(p_model_attribution),
      model_status = 'pending_review',
      model_verified_by = NULL,
      model_verified_at = NULL,
      updated_at = now()
  WHERE id = p_campus_id
    AND university_id = v_university_id
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'This campus profile does not belong to your university.';
  END IF;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION private.submit_campus_3d_model_impl(uuid,text,text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.submit_campus_3d_model_impl(uuid,text,text)
TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_campus_3d_model(
  p_campus_id uuid,
  p_model_storage_path text,
  p_model_attribution text
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT private.submit_campus_3d_model_impl(
    p_campus_id,
    p_model_storage_path,
    p_model_attribution
  );
$function$;

REVOKE ALL ON FUNCTION public.submit_campus_3d_model(uuid,text,text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_campus_3d_model(uuid,text,text)
TO authenticated;
