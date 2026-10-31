-- CampusMap: reusable, university-scoped map feature data.
-- This migration is additive. It does not alter incidents, profiles, memberships, or production.
CREATE TABLE IF NOT EXISTS public.campus_map_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL REFERENCES public.campus_universities(id) ON DELETE CASCADE,
  feature_type text NOT NULL CHECK (feature_type IN (
    'building','lecture_hall','hostel','library','cafeteria','medical','security',
    'gate','parking','sports','facility','assembly_point','accessible_entry'
  )),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 180),
  description text,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  is_published boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campus_map_features_university_published_idx
  ON public.campus_map_features (university_id, is_published, feature_type);

ALTER TABLE public.campus_map_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_map_features FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campus_map_features_read_published ON public.campus_map_features;
CREATE POLICY campus_map_features_read_published
  ON public.campus_map_features
  FOR SELECT TO anon, authenticated
  USING (is_published = true);

-- Browser roles are deliberately read-only in this first release.
-- Publishing/editing will be added through a verified campus-admin RPC after
-- the existing campus-admin authorization contract is reviewed and tested.
REVOKE ALL ON public.campus_map_features FROM anon, authenticated;
GRANT SELECT ON public.campus_map_features TO anon, authenticated;
